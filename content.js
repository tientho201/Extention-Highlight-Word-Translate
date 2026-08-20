/**
 * content.js — Content Script  (Limn Word Translate)
 *
 * Handles 2 unified response types from background.js:
 *   • SEARCH_RESULT  → show all dictionary entries (pinyin + definitions list)
 *   • TRANSLATE_RESULT → show single translated sentence
 *
 * Tooltip features:
 *   • Skeleton loader while waiting
 *   • Draggable (mousedown on header → drag to reposition)
 *   • Pinyin / ruby annotations for Chinese
 *   • Two-level cache (L1: page Map, L2: SW Map)
 */

// ============================================================
// State
// ============================================================

const L1_CACHE    = new Map();
const MAX_L1_SIZE = 200;

let isEnabled        = false;
let targetLang       = "vi";
let tooltip          = null;
let pendingRequestId = 0;

// Drag state (tooltip repositioning)
let isDragging   = false;
let dragOffsetX  = 0;
let dragOffsetY  = 0;

// Text ready to be copied (set after each result render)
let currentCopyText = "";

// OCR state — true while the user is rubber-band selecting a screen region
let ocrDragging  = false;

// ============================================================
// Init — load settings
// ============================================================

chrome.storage.local.get(["enabled", "targetLang"], data => {
  isEnabled  = data.enabled    ?? false;
  targetLang = data.targetLang ?? "vi";
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.enabled   !== undefined) isEnabled  = changes.enabled.newValue;
  if (changes.targetLang !== undefined) targetLang = changes.targetLang.newValue;
});

// ============================================================
// Helpers
// ============================================================

function isChinese(lang) {
  return lang === "zh" || lang === "zh-CN" || lang === "zh-TW" || lang === "zh-HK";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Renderers
// ============================================================

/**
 * Render a SEARCH_RESULT: main translation + dictionary entries grouped by POS.
 */
function renderSearchResult(entries, translated, phonetic, detectedLang) {
  if (!entries?.length && !translated) return "<p class='limn-error'>Không tìm thấy kết quả.</p>";

  let html = "";

  // 1. Main translation prominent at the top
  if (translated) {
    html += `<div class="limn-main-trans">${escHtml(translated)}</div>`;
  }

  // 2. Dictionary entries grouped by Part-of-Speech
  if (entries?.length) {
    const hasPosOrMultiple = entries.some(e => e.pos || (e.definitions && e.definitions.length > 0));

    if (hasPosOrMultiple) {
      html += `<div class="limn-dict-container">`;
      html += entries.map(entry => {
        const posHtml = entry.pos
          ? `<span class="limn-pos-badge">${escHtml(entry.pos)}</span>`
          : "";

        const defs = entry.definitions || [];
        // If definitions only has 1 item identical to main translation and no pos, skip
        if (defs.length === 1 && defs[0] === translated && !entry.pos) {
          return "";
        }

        const defsHtml = defs.length > 1
          ? `<ol class="limn-defs">${defs.map(d => `<li>${escHtml(d)}</li>`).join("")}</ol>`
          : (defs.length === 1 ? `<div class="limn-single-def">${escHtml(defs[0])}</div>` : "");

        return `<div class="limn-entry">${posHtml}${defsHtml}</div>`;
      }).filter(Boolean).join("");
      html += `</div>`;
    }
  }

  // 3. Pinyin / Phonetic for Chinese
  const pinyin = phonetic ?? null;
  if (pinyin && isChinese(detectedLang)) {
    html += `
      <div class="limn-pinyin-section">
        <span class="limn-pinyin-label">Phiên âm:</span>
        <span class="limn-pinyin-value">${escHtml(pinyin)}</span>
      </div>`;
  }

  return html;
}

/**
 * Build ruby-annotated HTML for Chinese text + pinyin.
 * Falls back to subtitle line when char/syllable counts don't match.
 */
function buildRubyHtml(chineseText, pinyinStr) {
  const chars     = [...chineseText];
  const syllables = pinyinStr.trim().split(/\s+/);

  if (syllables.length > 0 && Math.abs(chars.length - syllables.length) <= 2) {
    let html = "";
    let pi   = 0;
    for (const char of chars) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}]/u.test(char)) {
        html += `<ruby>${escHtml(char)}<rt>${escHtml(syllables[pi++] ?? "")}</rt></ruby>`;
      } else {
        html += escHtml(char);
      }
    }
    return html;
  }
  return (
    `<span class="limn-zh">${escHtml(chineseText)}</span>` +
    `<span class="limn-pinyin-sub">${escHtml(pinyinStr)}</span>`
  );
}

/**
 * Render a TRANSLATE_RESULT: one sentence, optional pinyin.
 */
function renderTranslateResult(translated, phonetic, targetPinyin, detectedLang) {
  let html = "";

  // Chinese target → ruby annotations over the translated text
  if (isChinese(targetLang) && targetPinyin) {
    html += `<p class="limn-text limn-ruby-block">${buildRubyHtml(translated, targetPinyin)}</p>`;
  } else {
    html += `<p class="limn-text">${escHtml(translated)}</p>`;
  }

  // Pinyin of Chinese source (below the translation)
  const pinyin = phonetic ?? null;
  if (pinyin && isChinese(detectedLang)) {
    html += `
      <div class="limn-pinyin-section">
        <span class="limn-pinyin-label">Phiên âm:</span>
        <span class="limn-pinyin-value">${escHtml(pinyin)}</span>
      </div>`;
  }

  return html;
}

// ============================================================
// Clipboard helper
// ============================================================

/**
 * Copy `text` to the clipboard using the best available method.
 *
 * Priority:
 *  1. navigator.clipboard.writeText()  — modern, async, works on HTTPS
 *  2. document.execCommand("copy")     — legacy fallback, works on HTTP /
 *     pages with a strict CSP that blocks the Clipboard API
 *
 * On success: the #limn-copy button shows a green ✓ for 1.5 s.
 * On failure: the button briefly shows a red ✕ so the user knows it failed.
 */
function writeToClipboard(text) {
  const ICON_COPY =
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>` +
    `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  const ICON_OK =
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
    `<polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const ICON_FAIL =
    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
    `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  function flashBtn(success) {
    const btn = document.getElementById("limn-copy");
    if (!btn) return;
    if (success) {
      btn.classList.add("limn-copy--done");
      btn.innerHTML = ICON_OK;
    } else {
      btn.classList.add("limn-copy--fail");
      btn.innerHTML = ICON_FAIL;
    }
    setTimeout(() => {
      btn.classList.remove("limn-copy--done", "limn-copy--fail");
      btn.innerHTML = ICON_COPY;
    }, 1500);
  }

  // ── Method 1: Clipboard API (preferred) ──────────────────────────────────
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => flashBtn(true))
      .catch(() => execCommandFallback(text, flashBtn));
    return;
  }

  // ── Method 2: execCommand fallback ───────────────────────────────────────
  execCommandFallback(text, flashBtn);
}

function execCommandFallback(text, flashBtn) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Place off-screen so it doesn't flash visually
    ta.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
    (document.body ?? document.documentElement).appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    flashBtn(ok);
  } catch {
    flashBtn(false);
  }
}

// State
let ignoreNextMouseUp = false;
let mouseDownPos = { x: 0, y: 0 };
let wasTooltipVisibleOnMouseDown = false;

function getTooltip() {
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.id = "limn-translate-tooltip";
  tooltip.setAttribute("role", "tooltip");

  tooltip.innerHTML = `
    <div class="limn-header" id="limn-header">
      <div class="limn-header-left">
        <span class="limn-drag-handle" title="Kéo để di chuyển">⠿</span>
        <span class="limn-lang-badge" id="limn-lang-badge"></span>
      </div>
      <div class="limn-header-right">
        <button class="limn-copy" id="limn-copy" aria-label="Sao chép" title="Sao chép kết quả dịch">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="limn-close" id="limn-close" aria-label="Close">&#x2715;</button>
      </div>
    </div>
    <div class="limn-body" id="limn-body">
      <div class="limn-skeleton">
        <div class="limn-skeleton-line"></div>
        <div class="limn-skeleton-line limn-skeleton-line--short"></div>
      </div>
    </div>`;

  (document.body ?? document.documentElement).appendChild(tooltip);

  // Close button — dismiss and clear text selection to prevent immediate re-trigger
  const closeBtn = document.getElementById("limn-close");
  const onClose = e => {
    e.stopPropagation();
    e.preventDefault();
    ignoreNextMouseUp = true;
    hideTooltip(true);
    setTimeout(() => { ignoreNextMouseUp = false; }, 250);
  };
  closeBtn.addEventListener("mousedown", onClose);
  closeBtn.addEventListener("mouseup", onClose);
  closeBtn.addEventListener("click", onClose);

  // Copy button
  document.getElementById("limn-copy").addEventListener("mousedown", e => {
    e.stopPropagation();
    e.preventDefault();
    if (!currentCopyText) return;
    writeToClipboard(currentCopyText);
  });

  // ── Drag logic ──────────────────────────────────────────
  const header = document.getElementById("limn-header");

  header.addEventListener("mousedown", e => {
    if (e.target.closest("#limn-close") || e.target.closest("#limn-copy")) return;
    isDragging  = true;
    dragOffsetX = e.clientX - tooltip.getBoundingClientRect().left;
    dragOffsetY = e.clientY - tooltip.getBoundingClientRect().top;
    tooltip.classList.add("limn-dragging");
    e.preventDefault(); // prevent text selection while dragging
  });

  return tooltip;
}

function showLoading(x, y) {
  const tt    = getTooltip();
  const body  = document.getElementById("limn-body");
  const badge = document.getElementById("limn-lang-badge");

  body.innerHTML = `
    <div class="limn-skeleton">
      <div class="limn-skeleton-line"></div>
      <div class="limn-skeleton-line limn-skeleton-line--short"></div>
    </div>`;
  badge.textContent = "";
  currentCopyText = "";

  // Only auto-position if not currently pinned by user
  if (!tooltip.dataset.pinned) {
    positionTooltip(tt, x, y);
  }

  tt.classList.remove("limn-hidden");
  tt.classList.add("limn-visible");
}

function showResult(response) {
  const tt = document.getElementById("limn-translate-tooltip");
  if (!tt || tt.classList.contains("limn-hidden")) return;

  const body  = document.getElementById("limn-body");
  const badge = document.getElementById("limn-lang-badge");

  const dl = response.detectedLang ?? "?";
  badge.textContent = dl !== targetLang ? `${dl} → ${targetLang}` : targetLang;

  // Choose badge color based on API type
  badge.dataset.apitype = response.apiType ?? "";

  if (response.type === "SEARCH_RESULT") {
    body.innerHTML = renderSearchResult(
      response.entries,
      response.translated ?? "",
      response.phonetic ?? response.sourcePinyin ?? null,
      response.detectedLang ?? "auto",
    );
    // Build copy text: main translation + all definitions
    const lines = [];
    if (response.translated) lines.push(response.translated);
    for (const entry of (response.entries ?? [])) {
      const posPrefix = entry.pos ? `[${entry.pos}] ` : "";
      for (const def of (entry.definitions ?? [])) {
        if (def !== response.translated) lines.push(posPrefix + def);
      }
    }
    currentCopyText = lines.join("\n");
  } else {
    body.innerHTML = renderTranslateResult(
      response.translated ?? "",
      response.phonetic   ?? response.sourcePinyin ?? null,
      response.targetPinyin ?? null,
      response.detectedLang ?? "auto",
    );
    currentCopyText = response.translated ?? "";
  }
}

function showError(message) {
  const tt = document.getElementById("limn-translate-tooltip");
  if (!tt || tt.classList.contains("limn-hidden")) return;
  document.getElementById("limn-body").innerHTML =
    `<p class="limn-error">${escHtml(message)}</p>`;
}

function hideTooltip(clearSelection = false) {
  if (!tooltip) return;
  tooltip.classList.remove("limn-visible");
  tooltip.classList.add("limn-hidden");
  tooltip.dataset.pinned = ""; // reset pin on hide
  if (clearSelection) {
    try {
      window.getSelection()?.removeAllRanges();
    } catch (_) {}
  }
}

function positionTooltip(tt, x, y) {
  const MARGIN  = 12;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const vw      = document.documentElement.clientWidth;
  const vh      = document.documentElement.clientHeight;
  const ttW     = tt.offsetWidth  || 340;
  const ttH     = tt.offsetHeight || 100;

  let left = x + scrollX;
  let top  = y + scrollY + MARGIN;

  if (left + ttW + MARGIN > scrollX + vw) left = Math.max(scrollX + MARGIN, x + scrollX - ttW);
  if (top  + ttH + MARGIN > scrollY + vh) top  = Math.max(scrollY + MARGIN, y + scrollY - ttH - MARGIN);

  tt.style.left = `${left}px`;
  tt.style.top  = `${top}px`;
}

// ============================================================
// Cache helpers
// ============================================================

function l1Set(key, value) {
  if (L1_CACHE.size >= MAX_L1_SIZE) L1_CACHE.delete(L1_CACHE.keys().next().value);
  L1_CACHE.set(key, value);
}

// ============================================================
// Core translation flow
// ============================================================

function handleTranslation(text, mouseX, mouseY) {
  const myRequestId = ++pendingRequestId;
  const cacheKey    = `${targetLang}::${text}`;

  showLoading(mouseX, mouseY);

  // L1 cache hit
  if (L1_CACHE.has(cacheKey)) {
    showResult(L1_CACHE.get(cacheKey));
    return;
  }

  // L2 + network via background SW
  chrome.runtime.sendMessage({ type: "TRANSLATE", text, targetLang }, response => {
    if (myRequestId !== pendingRequestId) return; // stale request

    if (chrome.runtime.lastError || !response) {
      showError("Lỗi kết nối tiện ích. Thử tải lại trang.");
      return;
    }
    if (!response.ok) {
      showError(`Lỗi dịch: ${response.error ?? "unknown"}`);
      return;
    }

    l1Set(cacheKey, response);
    showResult(response);
  });
}

// ============================================================
// Global mouse events — drag + selection
// ============================================================

// Move tooltip while dragging
document.addEventListener("mousemove", e => {
  if (!isDragging || !tooltip) return;
  const x = e.clientX - dragOffsetX + window.scrollX;
  const y = e.clientY - dragOffsetY + window.scrollY;
  tooltip.style.left = `${x}px`;
  tooltip.style.top  = `${y}px`;
  tooltip.dataset.pinned = "1"; // user has manually positioned it
}, { passive: true });

// Stop drag on mouseup anywhere or trigger translation
document.addEventListener("mouseup", e => {
  if (isDragging) {
    isDragging = false;
    tooltip?.classList.remove("limn-dragging");
    return; // don't trigger translation on drag-release
  }

  if (ignoreNextMouseUp) {
    ignoreNextMouseUp = false;
    return;
  }

  // OCR rubber-band in progress
  if (ocrDragging) return;

  if (!isEnabled) return;
  if (tooltip && tooltip.contains(e.target)) return;

  const selection = window.getSelection();
  // If selection starts inside tooltip, skip
  if (tooltip && tooltip.contains(selection?.anchorNode)) return;

  const text = selection?.toString().trim();

  if (!text || text.length < 1) {
    hideTooltip();
    return;
  }

  // If tooltip was open before mouse down and user merely clicked outside
  // to dismiss / deselect (mouse travel < 5px), dismiss and clear selection.
  const moveDist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
  if (wasTooltipVisibleOnMouseDown && moveDist < 5) {
    wasTooltipVisibleOnMouseDown = false;
    hideTooltip(true);
    return;
  }
  wasTooltipVisibleOnMouseDown = false;

  handleTranslation(text, e.clientX, e.clientY);

}, { capture: true });

// Hide on click outside & record mouse down state
document.addEventListener("mousedown", e => {
  mouseDownPos = { x: e.clientX, y: e.clientY };

  if (!tooltip) return;
  if (tooltip.contains(e.target)) return;

  const isVisible = tooltip.classList.contains("limn-visible");
  wasTooltipVisibleOnMouseDown = isVisible;

  if (!isDragging && isVisible) {
    hideTooltip();
  }
}, { capture: true });

document.addEventListener("scroll", () => { hideTooltip(); }, { passive: true });

// ============================================================
// OCR Capture Feature  (Ctrl+Shift+X)
// ============================================================

/** References to the active OCR overlay elements (null when inactive). */
let ocrOverlay = null;
let ocrCanvas  = null;
let ocrCtx     = null;
let ocrStartX  = 0;
let ocrStartY  = 0;

// ── Overlay lifecycle ────────────────────────────────────────

function activateOCRCapture() {
  if (ocrOverlay) return; // already active

  // Outer overlay — full-screen fixed container
  ocrOverlay = document.createElement("div");
  ocrOverlay.id = "limn-ocr-overlay";

  // Canvas — draws the dimming veil + selection rectangle
  ocrCanvas       = document.createElement("canvas");
  ocrCanvas.id    = "limn-ocr-canvas";
  ocrCanvas.width  = window.innerWidth;
  ocrCanvas.height = window.innerHeight;
  ocrCtx = ocrCanvas.getContext("2d");

  // Hint bar at the top
  const hint = document.createElement("div");
  hint.id = "limn-ocr-hint";
  hint.innerHTML =
    "Kéo để chọn vùng dịch &nbsp;·&nbsp; " +
    "<kbd>Ctrl+Shift+X</kbd> hoặc <kbd>ESC</kbd> để huỷ";

  ocrOverlay.append(ocrCanvas, hint);
  (document.body ?? document.documentElement).appendChild(ocrOverlay);

  // Render initial dark veil (no selection yet)
  drawOverlayFrame(null);

  ocrOverlay.addEventListener("mousedown", ocrOnMouseDown, { capture: true });
  ocrOverlay.addEventListener("mousemove", ocrOnMouseMove, { passive: true });
  ocrOverlay.addEventListener("mouseup",   ocrOnMouseUp,   { capture: true });
}

function deactivateOCRCapture() {
  if (!ocrOverlay) return;
  ocrOverlay.removeEventListener("mousedown", ocrOnMouseDown, { capture: true });
  ocrOverlay.removeEventListener("mousemove", ocrOnMouseMove);
  ocrOverlay.removeEventListener("mouseup",   ocrOnMouseUp,   { capture: true });
  ocrOverlay.remove();
  ocrOverlay = null;
  ocrCanvas  = null;
  ocrCtx     = null;
  ocrDragging = false;
}

// ── Canvas drawing ────────────────────────────────────────────

/**
 * Repaint the OCR overlay canvas.
 *
 * Strategy:
 *  1. Fill the whole canvas with a semi-transparent dark veil.
 *  2. Use `destination-out` compositing to punch a transparent "spotlight"
 *     window into the selected region — the page shows through.
 *  3. Draw a crisp accent border + corner handles + size badge on top.
 *
 * @param {{ x, y, w, h }|null} sel  Current selection, or null for no selection.
 */
function drawOverlayFrame(sel) {
  if (!ocrCtx) return;
  const cw = ocrCanvas.width;
  const ch = ocrCanvas.height;

  ocrCtx.clearRect(0, 0, cw, ch);

  // ① Dark veil over the entire screen
  ocrCtx.fillStyle = "rgba(0, 0, 0, 0.52)";
  ocrCtx.fillRect(0, 0, cw, ch);

  if (!sel || sel.w < 2 || sel.h < 2) return;

  // ② Transparent spotlight window (shows real page through canvas)
  ocrCtx.save();
  ocrCtx.globalCompositeOperation = "destination-out";
  ocrCtx.fillStyle = "rgba(0,0,0,1)";
  ocrCtx.fillRect(sel.x, sel.y, sel.w, sel.h);
  ocrCtx.restore();

  // ③ Accent border around the selection
  ocrCtx.strokeStyle = "#89b4fa";
  ocrCtx.lineWidth   = 2;
  ocrCtx.strokeRect(sel.x + 1, sel.y + 1, sel.w - 2, sel.h - 2);

  // ④ Corner handles (6 × 6 px filled squares)
  const hs = 7;
  ocrCtx.fillStyle = "#89b4fa";
  for (const [cx, cy] of [
    [sel.x,          sel.y         ],
    [sel.x + sel.w,  sel.y         ],
    [sel.x,          sel.y + sel.h ],
    [sel.x + sel.w,  sel.y + sel.h ],
  ]) {
    ocrCtx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
  }

  // ⑤ Dimension badge
  const label  = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
  const labelY = sel.y > 22 ? sel.y - 6 : sel.y + sel.h + 14;
  ocrCtx.font      = "bold 11px system-ui, -apple-system, sans-serif";
  ocrCtx.fillStyle = "#89b4fa";
  ocrCtx.fillText(label, sel.x + 4, labelY);
}

// ── OCR overlay mouse handlers ────────────────────────────────

function ocrOnMouseDown(e) {
  e.preventDefault();
  e.stopPropagation();
  ocrDragging = true;
  ocrStartX   = e.clientX;
  ocrStartY   = e.clientY;
}

function ocrOnMouseMove(e) {
  if (!ocrDragging) return;
  const x = Math.min(ocrStartX, e.clientX);
  const y = Math.min(ocrStartY, e.clientY);
  drawOverlayFrame({
    x, y,
    w: Math.abs(e.clientX - ocrStartX),
    h: Math.abs(e.clientY - ocrStartY),
  });
}

function ocrOnMouseUp(e) {
  if (!ocrDragging) return;
  e.preventDefault();
  e.stopPropagation();

  ocrDragging = false; // clear flag BEFORE deactivate so the guard in mouseup fires correctly

  const x = Math.min(ocrStartX, e.clientX);
  const y = Math.min(ocrStartY, e.clientY);
  const w = Math.abs(e.clientX - ocrStartX);
  const h = Math.abs(e.clientY - ocrStartY);

  deactivateOCRCapture();

  if (w < 8 || h < 8) return; // selection too small — silently abort

  // Show loading skeleton immediately at mouse-release position
  showLoading(e.clientX, e.clientY);

  const myReqId = ++pendingRequestId;

  // ── DPR-safe coordinate strategy ──────────────────────────────────────────
  // We do NOT pre-multiply by devicePixelRatio here.
  // Instead we send the RAW logical (CSS-pixel) coordinates together with the
  // current CSS viewport dimensions.  background.js will capture the screenshot
  // and derive the TRUE scale by measuring
  //   actualScale = bitmap.width / viewport.cssW
  // then apply that scale to the logical rect.  This handles every Windows
  // scaling level (100 %, 125 %, 150 %, 175 %, 200 %) and Retina displays
  // correctly, even when captureVisibleTab returns at a scale different from
  // window.devicePixelRatio.
  chrome.runtime.sendMessage({
    type:     "OCR_TRANSLATE",
    // Logical (CSS) pixel rectangle — background.js will scale it
    rect:     { x, y, w, h },
    // Viewport size lets background.js compute the true capture scale
    viewport: { cssW: window.innerWidth, cssH: window.innerHeight },
    targetLang,
    pageLang: document.documentElement.lang || "",
  }, response => {
    if (myReqId !== pendingRequestId) return; // stale — newer action fired

    if (chrome.runtime.lastError || !response) {
      showError("OCR lỗi kết nối. Thử lại.");
      return;
    }
    if (!response.ok) {
      showError(`OCR thất bại: ${response.error ?? "unknown"}`);
      return;
    }

    showOCRResult(response.ocrText, response);
  });
}

// ── OCR result renderer ───────────────────────────────────────

/**
 * Render the OCR source text + its translation inside the tooltip.
 * Layout:
 *   ┌─ [OCR] Extracted text ──────────────────────────────┐
 *   │  Translation / dictionary result                     │
 *   │  Phiên âm (if Chinese)                               │
 *   └──────────────────────────────────────────────────────┘
 *
 * @param {string} ocrText   Raw text extracted by OCR
 * @param {object} response  Full response from background.js route()
 */
function showOCRResult(ocrText, response) {
  const tt = document.getElementById("limn-translate-tooltip");
  if (!tt || tt.classList.contains("limn-hidden")) return;

  const body  = document.getElementById("limn-body");
  const badge = document.getElementById("limn-lang-badge");

  const dl = response.detectedLang ?? "?";
  badge.textContent    = dl !== targetLang ? `${dl} → ${targetLang}` : targetLang;
  badge.dataset.apitype = "OCR";

  const transHtml = response.type === "SEARCH_RESULT"
    ? renderSearchResult(
        response.entries,
        response.translated ?? "",
        response.phonetic ?? response.sourcePinyin ?? null,
        response.detectedLang ?? "auto",
      )
    : renderTranslateResult(
        response.translated    ?? "",
        response.phonetic      ?? response.sourcePinyin ?? null,
        response.targetPinyin  ?? null,
        response.detectedLang  ?? "auto",
      );

  body.innerHTML =
    `<div class="limn-ocr-source">` +
      `<span class="limn-ocr-label">OCR</span>` +
      `<span class="limn-ocr-text">${escHtml(ocrText)}</span>` +
    `</div>` +
    transHtml;

  // Build copy text: OCR source + translation
  const translated = response.translated ?? "";
  if (response.type === "SEARCH_RESULT") {
    const lines = [];
    if (response.translated) lines.push(response.translated);
    for (const entry of (response.entries ?? [])) {
      const posPrefix = entry.pos ? `[${entry.pos}] ` : "";
      for (const def of (entry.definitions ?? [])) {
        if (def !== response.translated) lines.push(posPrefix + def);
      }
    }
    currentCopyText = (ocrText ? ocrText + "\n" : "") + lines.join("\n");
  } else {
    currentCopyText = (ocrText ? ocrText + "\n" : "") + translated;
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────

document.addEventListener("keydown", e => {
  // Ctrl + Shift + X  →  toggle OCR capture overlay
  if (e.ctrlKey && e.shiftKey && e.code === "KeyX") {
    e.preventDefault();
    e.stopPropagation();
    if (ocrOverlay) {
      deactivateOCRCapture();
    } else if (isEnabled) {
      activateOCRCapture();
    }
    return;
  }

  // Escape  →  dismiss OCR overlay (or dismiss tooltip)
  if (e.key === "Escape") {
    if (ocrOverlay) {
      e.preventDefault();
      e.stopPropagation();
      deactivateOCRCapture();
    } else {
      hideTooltip();
    }
  }
}, { capture: true });
