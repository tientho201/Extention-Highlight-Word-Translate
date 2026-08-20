/**
 * background.js — Service Worker  (Limn Word Translate)
 *
 * ┌──────────────────────────────────────────────────────┐
 * │              Google Translate API Router             │
 * │                                                      │
 * │  text ──► detectApiType()                            │
 * │               │                                      │
 * │         ┌─────┴──────┐                              │
 * │      "SEARCH"    "TRANSLATE"                         │
 * │         │             │                              │
 * │   Dict / Word    Sentence / Full                     │
 * │   (Google GTX)   (Google GTX)                        │
 * │         │             │                              │
 * │         └─────┬───────┘                              │
 * │          sendResponse({ ok, type, data })            │
 * └──────────────────────────────────────────────────────┘
 */

// ============================================================
// Constants
// ============================================================

const GOOGLE_TRANSLATE_BASE = "https://translate.googleapis.com/translate_a/single";

// ============================================================
// Cache
// ============================================================

const translationCache = new Map();
const MAX_CACHE_SIZE   = 500;

function evictIfNeeded() {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    translationCache.delete(translationCache.keys().next().value);
  }
}

// ============================================================
// ① detectApiType — Smart Router
// ============================================================

/**
 * Analyse the selected text and decide which mode to use.
 *
 * Rules:
 *  1. Contains sentence-ending punctuation or line breaks → "TRANSLATE"
 *  2. More than 2 words (space-separated) → "TRANSLATE"
 *  3. CJK text with length > 4 characters → "TRANSLATE"
 *  4. Single word or short phrase (1-2 words) → "SEARCH" (Dictionary mode)
 *
 * @param {string} text
 * @returns {"SEARCH"|"TRANSLATE"}
 */
function detectApiType(text) {
  const trimmed = text.trim();

  // Rule 1 — contains sentence-ending punctuation or newlines
  const sentencePunctuationRe = /[。？！\n\r.?!;]/;
  if (sentencePunctuationRe.test(trimmed)) return "TRANSLATE";

  // Rule 2 — count words by whitespace
  const words = trimmed.split(/\s+/);
  if (words.length > 2) return "TRANSLATE";

  // Rule 3 — for CJK without spaces, > 4 characters is likely a phrase/sentence
  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/.test(trimmed);
  if (hasCJK && words.length === 1 && [...trimmed].length > 4) return "TRANSLATE";

  // Rule 4 — 1-2 words or short CJK term → dictionary mode
  return "SEARCH";
}

// ============================================================
// ② Google Translate helpers
// ============================================================

function isChinese(lang) {
  return lang === "zh" || lang === "zh-CN" || lang === "zh-TW" || lang === "zh-HK";
}

function extractRomanization(data) {
  if (!Array.isArray(data?.[0])) return null;
  const parts = data[0].filter(Boolean).map(c => c[3] ?? "").filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/**
 * Perform translation and dictionary lookup via Google Translate.
 *
 * @param {string} text
 * @param {string} targetLang
 */
async function googleTranslate(text, targetLang) {
  const url =
    `${GOOGLE_TRANSLATE_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);

  const data = await res.json();
  const translated = (data[0] || [])
    .filter(Boolean)
    .map(c => c[0] ?? "")
    .join("");

  const detectedLang = data[2] ?? "auto";
  const sourcePinyin = isChinese(detectedLang) ? extractRomanization(data) : null;

  // Extract full dictionary definitions if available (data[1])
  let dictEntries = [];
  if (Array.isArray(data[1]) && data[1].length > 0) {
    dictEntries = data[1].map(dictBlock => {
      const pos = dictBlock[0] || ""; // Part of speech (e.g. "danh từ", "động từ", "noun")
      const terms = Array.isArray(dictBlock[1]) ? dictBlock[1] : [];
      return {
        pos,
        pinyin: sourcePinyin ?? "",
        definitions: terms,
      };
    }).filter(e => e.definitions.length > 0);
  }

  return { translated, detectedLang, sourcePinyin, dictEntries };
}

async function fetchPinyinOnly(text, lang) {
  const sl = lang === "zh-TW" ? "zh-TW" : "zh-CN";
  const url =
    `${GOOGLE_TRANSLATE_BASE}?client=gtx&sl=${sl}&tl=${sl}` +
    `&dt=t&dt=rm&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  return extractRomanization(await res.json());
}

// ============================================================
// ③ Main router
// ============================================================

/**
 * Route the request to Google Translate.
 * Returns a unified response object for content.js and crop.js.
 */
async function route(text, targetLang) {
  const apiType = detectApiType(text);
  const g = await googleTranslate(text, targetLang);

  // If dictionary data exists OR mode is SEARCH, return dictionary result
  const hasDict = g.dictEntries && g.dictEntries.length > 0;

  if (hasDict || apiType === "SEARCH") {
    const entries = hasDict
      ? g.dictEntries
      : [{ pos: "", pinyin: g.sourcePinyin ?? "", definitions: [g.translated] }];

    return {
      ok:           true,
      apiType:      "SEARCH",
      type:         "SEARCH_RESULT",
      translated:   g.translated,
      pinyin:       g.sourcePinyin ?? "",
      phonetic:     g.sourcePinyin,
      sourcePinyin: g.sourcePinyin,
      entries,
      detectedLang: g.detectedLang,
    };
  }

  // ── TRANSLATE mode (Sentence/Phrase translation) ─────────
  const targetPinyin = isChinese(targetLang)
    ? await fetchPinyinOnly(g.translated, targetLang)
    : null;

  return {
    ok:           true,
    apiType:      "TRANSLATE",
    type:         "TRANSLATE_RESULT",
    translated:   g.translated,
    phonetic:     g.sourcePinyin,
    sourcePinyin: g.sourcePinyin,
    targetPinyin,
    detectedLang: g.detectedLang,
  };
}

// ============================================================
// ④ Message handler
// ============================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "TRANSLATE") return false;

  const { text, targetLang } = message;
  const cacheKey = `${targetLang}::${text}`;

  if (translationCache.has(cacheKey)) {
    sendResponse({ ok: true, fromCache: true, ...translationCache.get(cacheKey) });
    return false;
  }

  route(text, targetLang)
    .then(result => {
      evictIfNeeded();
      translationCache.set(cacheKey, result);
      sendResponse({ ok: true, fromCache: false, ...result });
    })
    .catch(err => {
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep channel open for async response
});

// ============================================================
// ⑧  OCR Capture & Translate
// ============================================================

// ── Language mapping ─────────────────────────────────────────

/**
 * Map an HTML `lang` attribute value to an OCR.space language code.
 * Engine 2 (Tesseract) is used — supported codes listed at ocr.space/OCRAPI.
 * Falls back to "eng" for unmapped languages (Latin-script recognition works
 * reasonably well with "eng" even for unknown languages).
 */
function pageLangToOCRCode(htmlLang) {
  const root = (htmlLang ?? "").toLowerCase().split("-")[0];
  const MAP = {
    zh: "chs", ja: "jpn", ko: "kor",
    ar: "ara", ru: "rus", fr: "fre",
    de: "ger", es: "spa", pt: "por",
    it: "ita", nl: "dut", pl: "pol",
    tr: "tur", hi: "hin", th: "tha",
  };
  return MAP[root] ?? "eng";
}

/**
 * Regex-based language sniffing for the OCR output text.
 *
 * @param   {string} text
 * @returns {"zh"|"ja"|"ko"|"other"}
 */
function detectTextLang(text) {
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return "zh";
  if (/[\u3040-\u30ff]/.test(text))               return "ja";
  if (/[\uac00-\ud7af]/.test(text))               return "ko";
  return "other";
}

// ── Screenshot capture ────────────────────────────────────────

/**
 * Capture the visible area of a tab as a PNG data URL.
 * Requires the "tabs" permission in manifest.json.
 *
 * @param   {number} tabId
 * @returns {Promise<string>} PNG data URL
 */
function captureTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, dataUrl => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

// ── Image crop via OffscreenCanvas ────────────────────────────

/**
 * Crop a rectangular region from a full-page screenshot.
 *
 * DPR-safe design
 * ───────────────
 * chrome.tabs.captureVisibleTab() may return an image whose pixel dimensions
 * differ from (CSS viewport × window.devicePixelRatio) depending on the OS
 * scaling level.  Pre-multiplying client coordinates by devicePixelRatio
 * therefore produces wrong results on e.g. Windows 125 % / 150 %.
 *
 * Instead we derive the TRUE capture scale by comparing the screenshot's
 * actual pixel dimensions with the CSS viewport dimensions reported by the
 * content script:
 *
 *   scaleX = bitmap.width  / viewport.cssW   ← horizontal physical-per-CSS
 *   scaleY = bitmap.height / viewport.cssH   ← vertical   physical-per-CSS
 *
 * We then multiply the logical (CSS-pixel) selection rectangle by these
 * measured scales to obtain the exact crop coordinates in the screenshot.
 * This works correctly at every Windows DPI level and on Retina displays.
 *
 * @param {string}  dataUrl          - PNG data URL returned by captureVisibleTab
 * @param {{ x:number, y:number, w:number, h:number }} logicalRect
 *   Selection rectangle in CSS (logical) pixels as reported by clientX/clientY.
 * @param {{ cssW:number, cssH:number }} viewport
 *   CSS dimensions of the browser's inner viewport at capture time.
 * @returns {Promise<string>} Cropped image as "data:image/png;base64,…"
 */
async function cropImage(dataUrl, logicalRect, viewport) {
  // ── 1. Decode the screenshot ──────────────────────────────────────────────
  // fetch() + createImageBitmap() are both supported in MV3 service workers.
  const blob   = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  // ── 2. Measure the TRUE capture scale ────────────────────────────────────
  // Do NOT use window.devicePixelRatio — it reflects the content script's
  // environment, not the actual pixels in the screenshot.
  // Dividing screenshot dimensions by CSS viewport dimensions gives us the
  // real scale that captureVisibleTab used on this particular platform.
  const scaleX = bitmap.width  / viewport.cssW;  // e.g. 1.0, 1.25, 1.5, 2.0
  const scaleY = bitmap.height / viewport.cssH;

  console.log(
    `[Limn OCR] screenshot ${bitmap.width}×${bitmap.height}px | ` +
    `viewport ${viewport.cssW}×${viewport.cssH}css | ` +
    `scale ${scaleX.toFixed(4)}×${scaleY.toFixed(4)}`
  );

  // ── 3. Convert logical rect → physical rect ───────────────────────────────
  // Multiply every CSS-pixel coordinate by the measured scale.
  const px = Math.max(0, Math.round(logicalRect.x * scaleX));
  const py = Math.max(0, Math.round(logicalRect.y * scaleY));
  // Clamp width/height so the crop never exceeds the screenshot boundaries.
  const pw = Math.min(Math.round(logicalRect.w * scaleX), bitmap.width  - px);
  const ph = Math.min(Math.round(logicalRect.h * scaleY), bitmap.height - py);

  if (pw <= 0 || ph <= 0) {
    throw new Error(`Kích thước vùng chọn không hợp lệ (${pw}×${ph})`);
  }

  // ── 4. Crop with OffscreenCanvas ──────────────────────────────────────────
  // OffscreenCanvas is available in MV3 service workers (no DOM required).
  const canvas = new OffscreenCanvas(pw, ph);
  canvas.getContext("2d").drawImage(bitmap, px, py, pw, ph, 0, 0, pw, ph);

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  const buffer      = await croppedBlob.arrayBuffer();

  // ── 5. Encode to Base64 (chunked btoa) ────────────────────────────────────
  // Processing 8 kB at a time avoids call-stack overflow for large crops.
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }

  return "data:image/png;base64," + btoa(binary);
}

// ── OCR.space API ─────────────────────────────────────────────

/**
 * OCR.space API key — replace with your own free key from https://ocr.space/ocrapi/freekey
 * Hardcoded here so it works immediately on browser startup without any configuration.
 */
const OCR_API_KEY = "K86041711488957";

/**
 * Submit a cropped image to OCR.space for one specific language model.
 *
 * Returns the trimmed text, or `null` when the API returns no text
 * (so the caller can retry with a different language without catching).
 * Only throws for hard errors (HTTP failure, API error flag).
 *
 * @param {string} base64Image  "data:image/png;base64,…" string
 * @param {string} language     OCR.space language code (e.g. "eng", "chs")
 * @returns {Promise<string|null>} Trimmed text, or null if nothing recognised
 */
async function fetchOCR(base64Image, language) {
  const form = new FormData();
  form.append("base64Image",           base64Image);
  form.append("language",              language);
  form.append("detectOrientation",     "true");
  form.append("scale",                 "true");
  form.append("OCREngine",             "2"); // Engine 2 = best CJK support
  form.append("isCreateSearchablePDF", "false");
  form.append("isTable",               "false");

  const res = await fetch("https://api.ocr.space/parse/image", {
    method:  "POST",
    headers: { apikey: OCR_API_KEY },
    body:    form,
  });

  if (!res.ok) throw new Error(`OCR HTTP ${res.status}`);

  const json = await res.json();

  if (json.IsErroredOnProcessing) {
    const msg = (Array.isArray(json.ErrorMessage) ? json.ErrorMessage[0] : json.ErrorMessage)
              ?? json.ErrorDetails
              ?? "OCR processing failed";
    throw new Error(msg);
  }

  // Return null (not throw) when text is empty — caller will try next language
  return json.ParsedResults?.[0]?.ParsedText?.trim() || null;
}

/**
 * Build an ordered list of OCR language candidates to try.
 *
 * Strategy:
 *  1. Use the language derived from the page's HTML lang attribute.
 *  2. Append CJK fallbacks (chs, cht, jpn, kor) — because this extension is
 *     primarily used for CJK→Vietnamese translation and many CJK pages omit
 *     or mis-set their lang attribute (e.g. lang="" or lang="en").
 *  3. Append "eng" as the last-resort Latin fallback.
 *  Duplicates are removed while preserving order.
 *
 * @param   {string} htmlLang   Value of document.documentElement.lang
 * @returns {string[]}          Ordered unique OCR.space language codes
 */
function buildOCRCandidates(htmlLang) {
  const primary = pageLangToOCRCode(htmlLang);
  // CJK fallbacks cover the most common use-case (Chinese sites without proper lang)
  const fallbacks = ["chs", "cht", "jpn", "kor", "eng"];
  const seen = new Set();
  const candidates = [];
  for (const code of [primary, ...fallbacks]) {
    if (!seen.has(code)) { seen.add(code); candidates.push(code); }
  }
  return candidates;
}

// ── Full pipeline ─────────────────────────────────────────────

/**
 * End-to-end OCR + translate pipeline:
 *  1. Capture the visible tab as a PNG screenshot.
 *  2. Crop to the user-selected rectangle (DPR-safe via measured scale).
 *  3. Send the crop to OCR.space.
 *  4. Route the extracted text through the existing translate router.
 *
 * @param {number} tabId
 * @param {{ x, y, w, h }} logicalRect  Selection in CSS (logical) pixels
 * @param {{ cssW, cssH }} viewport      CSS inner-viewport size at capture time
 * @param {string} targetLang
 * @param {string} pageLang             HTML lang attribute of the source page
 */
async function handleOCRTranslate(tabId, logicalRect, viewport, targetLang, pageLang) {
  const screenshot = await captureTab(tabId);
  const cropped    = await cropImage(screenshot, logicalRect, viewport);

  // ── OCR with language fallback chain ─────────────────────────────────────
  // Many CJK pages omit or mis-set the HTML lang attribute (e.g. lang="en").
  // We try candidates in order and stop at the first non-empty result.
  // Extra API calls are made ONLY when earlier candidates return nothing.
  const candidates = buildOCRCandidates(pageLang);
  let ocrText = null;
  let usedLang = null;

  for (const lang of candidates) {
    console.log(`[Limn OCR] trying lang="${lang}"…`);
    ocrText = await fetchOCR(cropped, lang);
    if (ocrText) { usedLang = lang; break; }
  }

  if (!ocrText) {
    throw new Error("Không nhận dạng được văn bản trong vùng đã chọn.");
  }

  console.log(`[Limn OCR] recognised (lang=${usedLang}): "${ocrText.slice(0, 80)}"`);

  // Reuse the existing smart router (Google Translate, with cache)
  const translation = await route(ocrText, targetLang);

  return { ocrText, ...translation };
}

// ── Message handler for OCR_TRANSLATE ────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "OCR_TRANSLATE") return false;

  const { rect, viewport, targetLang, pageLang } = message;
  const tabId = sender.tab?.id;

  if (!tabId) {
    sendResponse({ ok: false, error: "Cannot capture: no tab ID." });
    return false;
  }

  // Fallback viewport: if an older content script didn't send viewport we
  // use a safe 1920×1080 guess — cropImage will still clamp to bitmap bounds.
  const vp = viewport ?? { cssW: 1920, cssH: 1080 };

  (async () => {
    try {
      const result = await handleOCRTranslate(tabId, rect, vp, targetLang, pageLang);
      sendResponse({ ok: true, ...result });
    } catch (err) {
      console.error("[Limn OCR]", err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true; // keep message channel open for async sendResponse
});

// ============================================================
// ⑨  Alt+Shift+S — Full-tab Screenshot → crop.html
// ============================================================

/**
 * When the user presses Alt+Shift+S:
 *  1. Capture the visible tab as a PNG *before* opening the crop page
 *     (so we screenshot the user's page, not crop.html).
 *  2. Store the PNG in chrome.storage.session — RAM only, never written to
 *     disk, auto-purged when the browser closes.
 *  3. Open crop.html in a new tab; it will read and immediately delete the
 *     stored screenshot, then let the user drag a selection for OCR.
 */
chrome.commands.onCommand.addListener(async command => {
  if (command !== "ocr-screenshot") return;

  try {
    // Reuse the existing captureTab helper (captures current window's active tab)
    const dataUrl = await captureTab(null);

    // Write to session storage (RAM only — crop.js deletes it right after reading)
    await chrome.storage.session.set({ limn_ocr_screenshot: dataUrl });

    // Open the crop tool as a new tab
    chrome.tabs.create({ url: chrome.runtime.getURL("crop.html") });
  } catch (err) {
    console.error("[Limn] Alt+Shift+S capture failed:", err.message);
  }
});
