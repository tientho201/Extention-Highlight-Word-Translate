'use strict';

/**
 * crop.js — Screenshot OCR Crop Tool  (Limn Word Translate)
 *
 * Lifecycle
 * ─────────
 *  1. Load screenshot PNG/JPEG from chrome.storage.session (RAM only).
 *  2. Delete from session storage IMMEDIATELY after reading → free RAM.
 *  3. Decode into ImageBitmap; draw onto a full-screen canvas at the
 *     screenshot's native (physical-pixel) resolution.
 *  4. User drags a selection rectangle → release → crop → OCR → translate.
 *  5. Show result in a floating tooltip; ESC / close-button / shortcut → close.
 *
 * DPR handling
 * ────────────
 * The canvas internal size = screenshot physical pixels (bgBitmap.width/height).
 * The canvas CSS size      = window.innerWidth/innerHeight (logical pixels).
 * scaleX = bgBitmap.width  / window.innerWidth   (physical px per CSS px)
 * scaleY = bgBitmap.height / window.innerHeight
 * All mouse coordinates (clientX/Y) are in CSS px; we multiply by scaleX/Y
 * to get the exact physical-pixel coordinates for the crop.
 * This is identical to the technique in background.js cropImage() and works
 * correctly at 100 %, 125 %, 150 %, 200 % Windows scaling and on Retina.
 */

// ── SVG icons (defined before first use in template literals) ─────────────

const SVG_COPY = [
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"',
  ' stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">',
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>',
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
  '</svg>',
].join('');

const SVG_CHECK = [
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"',
  ' stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
  '<polyline points="20 6 9 17 4 12"></polyline>',
  '</svg>',
].join('');

// ── OCR API ───────────────────────────────────────────────────────────────

const DEFAULT_OCR_API_KEY = 'K86041711488957';
let ocrApiKey = DEFAULT_OCR_API_KEY;

// ── DOM references ────────────────────────────────────────────────────────

const canvas = document.getElementById('crop-canvas');
const ctx    = canvas.getContext('2d');
const hintEl = document.getElementById('hint');
const ttEl   = document.getElementById('result-tt');

// ── State ─────────────────────────────────────────────────────────────────

let bgBitmap        = null;  // Original screenshot as ImageBitmap (clean, no overlay)
let scaleX          = 1;     // Physical pixels per CSS pixel — horizontal
let scaleY          = 1;     // Physical pixels per CSS pixel — vertical
let isDragging      = false;
let startX          = 0;
let startY          = 0;
let pendingCopyText = '';    // Text ready to copy from the latest result
let targetLang      = 'vi'; // Loaded from chrome.storage.local on init

// ── Initialise ────────────────────────────────────────────────────────────

(async function init() {
  // Load user settings and screenshot in parallel
  const [settings, session] = await Promise.all([
    chrome.storage.local.get(['targetLang', 'ocrApiKey']),
    chrome.storage.session.get('limn_ocr_screenshot'),
  ]);

  targetLang = settings.targetLang ?? 'vi';
  ocrApiKey  = settings.ocrApiKey?.trim() || DEFAULT_OCR_API_KEY;
  const dataUrl = session.limn_ocr_screenshot;

  if (!dataUrl) {
    hintEl.textContent =
      'Lỗi: Không tìm thấy ảnh chụp màn hình. Hãy thử lại (Alt+Shift+S).';
    return;
  }

  // Delete from session storage immediately to free memory
  chrome.storage.session.remove('limn_ocr_screenshot');

  // Decode screenshot → ImageBitmap
  const blob = await (await fetch(dataUrl)).blob();
  bgBitmap = await createImageBitmap(blob);

  // Size the canvas
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  canvas.width  = bgBitmap.width;   // physical pixels
  canvas.height = bgBitmap.height;  // physical pixels

  // Measure the true DPR as seen by captureVisibleTab on this platform
  scaleX = bgBitmap.width  / window.innerWidth;
  scaleY = bgBitmap.height / window.innerHeight;

  // Initial render: screenshot + dark veil, no selection yet
  renderOverlay(null);

  // Bind mouse events for rubber-band selection
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove, { passive: true });
  canvas.addEventListener('mouseup',   onMouseUp);

  // Handle window resize dynamically
  window.addEventListener('resize', () => {
    if (!bgBitmap) return;
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    scaleX = bgBitmap.width  / window.innerWidth;
    scaleY = bgBitmap.height / window.innerHeight;
    renderOverlay(null);
  });

  // Event delegation on tooltip — avoids inline onclick (blocked by MV3 CSP)
  ttEl.addEventListener('mousedown', e => {
    if (e.target.closest('.tt-close')) {
      e.stopPropagation();
      hideTooltip();
      renderOverlay(null);
    }
    if (e.target.closest('.tt-copy')) {
      e.stopPropagation();
      doCopy();
    }
  });
}());

// ── Canvas rendering ──────────────────────────────────────────────────────

/**
 * Repaint the entire canvas.
 *
 *  ① Draw the screenshot at full physical resolution (clean, no overlay).
 *  ② Lay a dark semi-transparent veil over everything.
 *  ③ If `sel` is provided: re-draw the ORIGINAL screenshot pixels for just
 *     the selected region — this restores full brightness.
 *  ④ Accent border + corner handles + dimension badge around the selection.
 *
 * @param {{ x, y, w, h }|null} sel  Selection rect in CSS (logical) pixels.
 */
function renderOverlay(sel) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ① Screenshot at full physical resolution
  ctx.drawImage(bgBitmap, 0, 0);

  // ② Dark veil over the whole canvas
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!sel || sel.w < 2 || sel.h < 2) return;

  // Convert CSS px → physical px for all drawing operations
  const px = sel.x * scaleX;
  const py = sel.y * scaleY;
  const pw = sel.w * scaleX;
  const ph = sel.h * scaleY;

  // ③ Restore the original (un-dimmed) screenshot pixels inside the selection.
  ctx.drawImage(bgBitmap, px, py, pw, ph, px, py, pw, ph);

  // ④ Accent border
  ctx.strokeStyle = '#89b4fa';
  ctx.lineWidth   = 2 * scaleX;
  ctx.strokeRect(px + scaleX, py + scaleY, pw - 2 * scaleX, ph - 2 * scaleY);

  // Corner handles (7 × 7 logical px squares, scaled to physical)
  const hs = 7 * scaleX;
  ctx.fillStyle = '#89b4fa';
  for (const [cx, cy] of [
    [px,      py     ], [px + pw, py     ],
    [px,      py + ph], [px + pw, py + ph],
  ]) {
    ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
  }

  // Dimension badge (show logical CSS px)
  const lbl  = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
  const lblY = py > 22 * scaleY ? py - 6 * scaleY : py + ph + 16 * scaleY;
  ctx.font      = `bold ${Math.round(11 * scaleX)}px system-ui, sans-serif`;
  ctx.fillStyle = '#89b4fa';
  ctx.fillText(lbl, px + 4 * scaleX, lblY);
}

// ── Mouse handlers ────────────────────────────────────────────────────────

function onMouseDown(e) {
  e.preventDefault();
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  hideTooltip();
}

function onMouseMove(e) {
  if (!isDragging) return;
  renderOverlay(normRect(startX, startY, e.clientX, e.clientY));
}

async function onMouseUp(e) {
  if (!isDragging) return;
  isDragging = false;

  const sel = normRect(startX, startY, e.clientX, e.clientY);
  if (sel.w < 8 || sel.h < 8) return; // too small — silently ignore

  await runOCR(sel, e.clientX, e.clientY);
}

/** Normalise two drag endpoints into a {x, y, w, h} rect (CSS px). */
function normRect(x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

// ── OCR + Translate pipeline ──────────────────────────────────────────────

async function runOCR(sel, mx, my) {
  showLoading(mx, my);

  try {
    // ── 1. Crop the CLEAN screenshot (bgBitmap, no overlay) ────────────────
    const px = Math.max(0, Math.round(sel.x * scaleX));
    const py = Math.max(0, Math.round(sel.y * scaleY));
    const pw = Math.min(Math.round(sel.w * scaleX), canvas.width  - px);
    const ph = Math.min(Math.round(sel.h * scaleY), canvas.height - py);

    if (pw <= 0 || ph <= 0) throw new Error('Vùng chọn không hợp lệ.');

    // OffscreenCanvas: available in extension pages, no DOM/layout cost
    const offscreen = new OffscreenCanvas(pw, ph);
    offscreen.getContext('2d').drawImage(bgBitmap, px, py, pw, ph, 0, 0, pw, ph);
    const blob = await offscreen.convertToBlob({ type: 'image/png' });

    // Encode to Base64 in 8 kB chunks (prevents call-stack overflow)
    const buf   = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64Image = 'data:image/png;base64,' + btoa(bin);

    // ── 2. OCR with intelligent language fallback ──────────────────────────
    const ocrText = await ocrWithFallback(base64Image);
    if (!ocrText) throw new Error('Không nhận dạng được văn bản trong vùng đã chọn.');

    // ── 3. Translate via background.js (Google Translate + cache) ──────────
    const resp = await chrome.runtime.sendMessage({
      type: 'TRANSLATE',
      text: ocrText,
      targetLang,
    });

    if (!resp?.ok) throw new Error(resp?.error ?? 'Lỗi dịch không xác định.');

    showResult(ocrText, resp, mx, my);

  } catch (err) {
    showError(err.message, mx, my);
  }
}

// ── OCR helpers ───────────────────────────────────────────────────────────

/**
 * Try OCR language candidates intelligently.
 * Prioritizes Latin/English when appropriate to avoid noisy CJK output on English text.
 */
async function ocrWithFallback(base64Image) {
  const isCJK = text => /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/.test(text);

  // 1. Try 'eng' first for Latin text recognition
  const engText = await fetchOCR(base64Image, 'eng');
  if (engText && !isCJK(engText)) {
    const latinWords = (engText.match(/[a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9]+/g) || []).length;
    if (latinWords > 0) {
      return engText;
    }
  }

  // 2. Try CJK languages in order
  for (const lang of ['chs', 'cht', 'jpn', 'kor']) {
    const text = await fetchOCR(base64Image, lang);
    if (text && isCJK(text)) return text;
    if (text && !engText) return text;
  }

  return engText || null;
}

/**
 * Call OCR.space for one language.
 * Returns the trimmed text, or null if nothing was recognised.
 */
async function fetchOCR(base64Image, language) {
  const form = new FormData();
  form.append('base64Image',           base64Image);
  form.append('language',              language);
  form.append('detectOrientation',     'true');
  form.append('scale',                 'true');
  form.append('OCREngine',             '2');  // Engine 2 = Tesseract, best CJK
  form.append('isCreateSearchablePDF', 'false');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method:  'POST',
    headers: { apikey: ocrApiKey },
    body:    form,
  });

  if (!res.ok) throw new Error(`OCR HTTP ${res.status}`);

  const json = await res.json();

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage[0]
      : (json.ErrorMessage ?? json.ErrorDetails ?? 'OCR error');
    throw new Error(msg);
  }

  return json.ParsedResults?.[0]?.ParsedText?.trim() || null;
}

// ── Tooltip UI ────────────────────────────────────────────────────────────

/** HTML-escape a string for safe insertion into innerHTML. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Position the tooltip near the mouse, keeping it within the viewport. */
function positionTooltip(mx, my) {
  const M  = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = ttEl.offsetWidth  || 340;
  const th = ttEl.offsetHeight || 100;
  let left = mx, top = my + M;
  if (left + tw + M > vw) left = Math.max(M, mx - tw);
  if (top  + th + M > vh) top  = Math.max(M, my - th - M);
  ttEl.style.left = left + 'px';
  ttEl.style.top  = top  + 'px';
}

function showLoading(mx, my) {
  pendingCopyText = '';
  ttEl.innerHTML = `
    <div class="tt-hdr">
      <div class="tt-hdr-l"><span class="tt-badge">OCR</span></div>
      <div class="tt-hdr-r">
        <button class="tt-btn tt-copy" disabled>${SVG_COPY}</button>
        <button class="tt-btn tt-close">&#x2715;</button>
      </div>
    </div>
    <div class="tt-body">
      <div class="tt-skel">
        <div class="tt-skel-l"></div>
        <div class="tt-skel-l short"></div>
      </div>
    </div>`;
  ttEl.style.display = 'block';
  positionTooltip(mx, my);
}

function showResult(ocrText, resp, mx, my) {
  const dl         = resp.detectedLang ?? '?';
  const badgeLabel = dl !== targetLang ? `${dl} → ${targetLang}` : targetLang;

  // Build body HTML
  let bodyHtml = `
    <div class="tt-ocr-src">
      <span class="tt-ocr-lbl">OCR</span>
      <span class="tt-ocr-txt">${esc(ocrText)}</span>
    </div>`;

  if (resp.type === 'SEARCH_RESULT') {
    bodyHtml += renderSearch(resp.entries ?? [], resp.translated ?? '', resp.phonetic ?? resp.sourcePinyin ?? null, resp.detectedLang ?? 'auto');
    const lines = [];
    if (resp.translated) lines.push(resp.translated);
    for (const entry of (resp.entries ?? [])) {
      const posPrefix = entry.pos ? `[${entry.pos}] ` : '';
      for (const def of (entry.definitions ?? [])) {
        if (def !== resp.translated) lines.push(posPrefix + def);
      }
    }
    pendingCopyText = ocrText + '\n' + lines.join('\n');
  } else {
    const translated = resp.translated ?? '';
    bodyHtml += `<p class="tt-text">${esc(translated)}</p>`;
    if (resp.phonetic) {
      bodyHtml += `
        <div class="tt-pinyin">
          <span class="tt-pinyin-lbl">Phiên âm:</span>
          <span class="tt-pinyin-val">${esc(resp.phonetic)}</span>
        </div>`;
    }
    pendingCopyText = ocrText + '\n' + translated;
  }

  ttEl.innerHTML = `
    <div class="tt-hdr">
      <div class="tt-hdr-l"><span class="tt-badge">${esc(badgeLabel)}</span></div>
      <div class="tt-hdr-r">
        <button class="tt-btn tt-copy" title="Sao chép">${SVG_COPY}</button>
        <button class="tt-btn tt-close">&#x2715;</button>
      </div>
    </div>
    <div class="tt-body">${bodyHtml}</div>`;
  ttEl.style.display = 'block';
  positionTooltip(mx, my);
}

function renderSearch(entries, translated, phonetic, detectedLang) {
  let html = '';

  if (translated) {
    html += `<div class="tt-main-trans">${esc(translated)}</div>`;
  }

  if (entries && entries.length > 0) {
    const hasPosOrMultiple = entries.some(e => e.pos || (e.definitions && e.definitions.length > 0));
    if (hasPosOrMultiple) {
      html += `<div class="tt-dict-box">`;
      html += entries.map(entry => {
        const posHtml = entry.pos
          ? `<span class="tt-pos-badge">${esc(entry.pos)}</span>`
          : '';
        const defs = entry.definitions || [];
        if (defs.length === 1 && defs[0] === translated && !entry.pos) {
          return '';
        }
        const defsHtml = defs.length > 1
          ? `<ol class="tt-defs">${defs.map(d => `<li>${esc(d)}</li>`).join('')}</ol>`
          : (defs.length === 1 ? `<div class="tt-single-def">${esc(defs[0])}</div>` : '');
        return `<div class="tt-entry">${posHtml}${defsHtml}</div>`;
      }).filter(Boolean).join('');
      html += `</div>`;
    }
  }

  if (phonetic && (detectedLang === 'zh' || detectedLang === 'zh-CN' || detectedLang === 'zh-TW')) {
    html += `
      <div class="tt-pinyin">
        <span class="tt-pinyin-lbl">Phiên âm:</span>
        <span class="tt-pinyin-val">${esc(phonetic)}</span>
      </div>`;
  }

  return html;
}

function showError(msg, mx, my) {
  pendingCopyText = '';
  ttEl.innerHTML = `
    <div class="tt-hdr">
      <div class="tt-hdr-l"><span class="tt-badge err">Lỗi</span></div>
      <div class="tt-hdr-r">
        <button class="tt-btn tt-close">&#x2715;</button>
      </div>
    </div>
    <div class="tt-body"><p class="tt-err">${esc(msg)}</p></div>`;
  ttEl.style.display = 'block';
  positionTooltip(mx, my);
}

function hideTooltip() {
  ttEl.style.display = 'none';
  pendingCopyText    = '';
}

// ── Copy to clipboard ─────────────────────────────────────────────────────

function doCopy() {
  if (!pendingCopyText) return;

  const btn = ttEl.querySelector('.tt-copy');

  const onSuccess = () => {
    if (!btn) return;
    btn.classList.add('copied');
    btn.innerHTML = SVG_CHECK;
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = SVG_COPY; }, 1500);
  };

  const execFallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = pendingCopyText;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (ok) onSuccess();
    } catch (_) {}
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(pendingCopyText).then(onSuccess).catch(execFallback);
  } else {
    execFallback();
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  // ESC — close the tab instantly, freeing all memory
  if (e.key === 'Escape') { e.preventDefault(); window.close(); }

  // Alt+Shift+S — same shortcut re-pressed while crop.html is open → close
  if (e.altKey && e.shiftKey && e.code === 'KeyS') { e.preventDefault(); window.close(); }
});
