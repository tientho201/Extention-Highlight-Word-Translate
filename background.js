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

  // Strip wrapping punctuation for single words before checking
  const clean = trimmed.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  // Rule 1 — contains sentence-ending punctuation or newlines (except clean single words)
  const sentencePunctuationRe = /[。？！\n\r.?!;]/;
  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length > 2) return "TRANSLATE";
  if (words.length > 1 && sentencePunctuationRe.test(trimmed)) return "TRANSLATE";

  // Rule 3 — for CJK without spaces, > 4 characters is likely a phrase/sentence
  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/.test(clean);
  if (hasCJK && words.length === 1 && [...clean].length > 4) return "TRANSLATE";

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
  // If text is a single word with punctuation (e.g. "apple.", "(word)"), query cleaned word for dict
  const cleanText = text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const queryText = (cleanText.length > 0 && !cleanText.includes(" ")) ? cleanText : text;

  const url =
    `${GOOGLE_TRANSLATE_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(queryText)}`;

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

// ── Screenshot capture ────────────────────────────────────────

/**
 * Capture the visible area of a window as a PNG / JPEG data URL.
 * Requires the "tabs" / "activeTab" permission in manifest.json.
 *
 * @param   {number|null} windowId
 * @returns {Promise<string>} data URL
 */
function captureTab(windowId = null) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, dataUrl => {
      if (chrome.runtime.lastError || !dataUrl) {
        // Fallback to high quality JPEG
        chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 95 }, jpegUrl => {
          if (chrome.runtime.lastError || !jpegUrl) {
            reject(new Error(chrome.runtime.lastError?.message ?? "Không thể chụp ảnh màn hình."));
          } else {
            resolve(jpegUrl);
          }
        });
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
 * scaling level. Pre-multiplying client coordinates by devicePixelRatio
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
 * @param {string}  dataUrl          - PNG/JPEG data URL returned by captureVisibleTab
 * @param {{ x:number, y:number, w:number, h:number }} logicalRect
 *   Selection rectangle in CSS (logical) pixels as reported by clientX/clientY.
 * @param {{ cssW:number, cssH:number }} viewport
 *   CSS dimensions of the browser's inner viewport at capture time.
 * @returns {Promise<string>} Cropped image as "data:image/png;base64,…"
 */
async function cropImage(dataUrl, logicalRect, viewport) {
  // ── 1. Decode the screenshot ──────────────────────────────────────────────
  const blob   = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  // ── 2. Measure the TRUE capture scale ────────────────────────────────────
  const scaleX = bitmap.width  / viewport.cssW;
  const scaleY = bitmap.height / viewport.cssH;

  console.log(
    `[Limn OCR] screenshot ${bitmap.width}×${bitmap.height}px | ` +
    `viewport ${viewport.cssW}×${viewport.cssH}css | ` +
    `scale ${scaleX.toFixed(4)}×${scaleY.toFixed(4)}`
  );

  // ── 3. Convert logical rect → physical rect ───────────────────────────────
  const px = Math.max(0, Math.round(logicalRect.x * scaleX));
  const py = Math.max(0, Math.round(logicalRect.y * scaleY));
  const pw = Math.min(Math.round(logicalRect.w * scaleX), bitmap.width  - px);
  const ph = Math.min(Math.round(logicalRect.h * scaleY), bitmap.height - py);

  if (pw <= 0 || ph <= 0) {
    throw new Error(`Kích thước vùng chọn không hợp lệ (${pw}×${ph})`);
  }

  // ── 4. Crop with OffscreenCanvas ──────────────────────────────────────────
  const canvas = new OffscreenCanvas(pw, ph);
  canvas.getContext("2d").drawImage(bitmap, px, py, pw, ph, 0, 0, pw, ph);

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  const buffer      = await croppedBlob.arrayBuffer();

  // ── 5. Encode to Base64 (chunked btoa) ────────────────────────────────────
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }

  return "data:image/png;base64," + btoa(binary);
}

// ── OCR.space API ─────────────────────────────────────────────

const OCR_API_KEY = "K86041711488957";

/**
 * Submit a cropped image to OCR.space for one specific language model.
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
  form.append("OCREngine",             "2"); // Engine 2 = best CJK & modern OCR support
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

  return json.ParsedResults?.[0]?.ParsedText?.trim() || null;
}

/**
 * Build an ordered list of OCR language candidates to try.
 *
 * @param   {string} htmlLang   Value of document.documentElement.lang
 * @returns {string[]}          Ordered unique OCR.space language codes
 */
function buildOCRCandidates(htmlLang) {
  const primary = pageLangToOCRCode(htmlLang);
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
 *
 * @param {number|null} windowId
 * @param {{ x, y, w, h }} logicalRect  Selection in CSS (logical) pixels
 * @param {{ cssW, cssH }} viewport      CSS inner-viewport size at capture time
 * @param {string} targetLang
 * @param {string} pageLang             HTML lang attribute of the source page
 */
async function handleOCRTranslate(windowId, logicalRect, viewport, targetLang, pageLang) {
  const screenshot = await captureTab(windowId);
  const cropped    = await cropImage(screenshot, logicalRect, viewport);

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

  // Route through translation router
  const translation = await route(ocrText, targetLang);

  return { ocrText, ...translation };
}

// ============================================================
// ④ Unified Message handler
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  // Handle standard text translation
  if (message.type === "TRANSLATE") {
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
  }

  // Handle in-page OCR translation
  if (message.type === "OCR_TRANSLATE") {
    const { rect, viewport, targetLang, pageLang } = message;
    const windowId = sender.tab?.windowId ?? null;
    const vp = viewport ?? { cssW: 1920, cssH: 1080 };

    (async () => {
      try {
        const result = await handleOCRTranslate(windowId, rect, vp, targetLang, pageLang);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        console.error("[Limn OCR]", err);
        sendResponse({ ok: false, error: err.message });
      }
    })();

    return true; // keep message channel open for async sendResponse
  }

  return false;
});

// ============================================================
// ⑨  Alt+Shift+S — Full-tab Screenshot → crop.html
// ============================================================

chrome.commands.onCommand.addListener(async command => {
  if (command !== "ocr-screenshot") return;

  try {
    let dataUrl = await captureTab(null);

    // Save to session storage (RAM only — crop.js deletes it right after reading)
    try {
      await chrome.storage.session.set({ limn_ocr_screenshot: dataUrl });
    } catch (storageErr) {
      // If PNG exceeded storage quota (10MB on 4K), fallback to JPEG
      console.warn("[Limn] Session storage quota hit, retrying with JPEG format...");
      dataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 95 }, jpegUrl => {
          if (chrome.runtime.lastError || !jpegUrl) {
            reject(new Error(chrome.runtime.lastError?.message ?? "JPEG fallback failed"));
          } else {
            resolve(jpegUrl);
          }
        });
      });
      await chrome.storage.session.set({ limn_ocr_screenshot: dataUrl });
    }

    // Open the crop tool as a new tab
    chrome.tabs.create({ url: chrome.runtime.getURL("crop.html") });
  } catch (err) {
    console.error("[Limn] Alt+Shift+S capture failed:", err.message);
  }
});
