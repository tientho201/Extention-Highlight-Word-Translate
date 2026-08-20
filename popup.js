/**
 * popup.js — Popup Settings UI (Limn Word Translate)
 *
 * Responsibilities:
 *  - Manage 2 mutually exclusive translation modes: Auto Translate vs Shortcut Translate.
 *  - Interactive shortcut recorders for 3 features:
 *      1. Text Selection Translate (default: Alt+T / Option+T)
 *      2. Screen OCR Overlay       (default: Ctrl+Shift+X / Cmd+Shift+X)
 *      3. Screenshot OCR Full Tab  (default: Alt+Shift+S / Option+Shift+S)
 *  - macOS / Windows native modifier handling & keycode extraction.
 *  - Duplicate / Conflict validation:
 *      If a shortcut conflicts with an already assigned shortcut, display a red error message
 *      and automatically revert to the feature's default shortcut.
 *  - Quick preset buttons for instant 1-click shortcut assignment.
 *  - 1-click direct action buttons to trigger OCR immediately.
 *  - OCR API Key management.
 *  - Persist all configuration to chrome.storage.local.
 */

'use strict';

// ── OS Detection ──────────────────────────────────────────

const isMac = /Mac/i.test(navigator.platform || '') ||
              /Mac/i.test(navigator.userAgent || '') ||
              /Mac/i.test(navigator.userAgentData?.platform || '');

function formatKeyLabel(name) {
  if (!isMac) return name;
  const map = {
    'Win': 'Cmd ⌘',
    'Meta': 'Cmd ⌘',
    'Cmd': 'Cmd ⌘',
    'Alt': 'Option ⌥',
    'Option': 'Option ⌥',
    'Ctrl': 'Ctrl ⌃',
    'Control': 'Ctrl ⌃',
    'Shift': 'Shift ⇧',
  };
  return map[name] ?? name;
}

function getModifierParts(held) {
  const parts = [];
  if (isMac) {
    if (held.metaKey)  parts.push('Cmd');
    if (held.altKey)   parts.push('Option');
    if (held.ctrlKey)  parts.push('Ctrl');
    if (held.shiftKey) parts.push('Shift');
  } else {
    if (held.ctrlKey)  parts.push('Ctrl');
    if (held.altKey)   parts.push('Alt');
    if (held.shiftKey) parts.push('Shift');
    if (held.metaKey)  parts.push('Win');
  }
  return parts;
}

// ── Default Shortcut Definitions ──────────────────────────

const DEFAULTS = {
  text: {
    isModifierOnly: false,
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    code: 'KeyT',
    key: 'T',
    label: isMac ? 'Option+T' : 'Alt+T',
  },
  ocrOverlay: {
    isModifierOnly: false,
    altKey: false,
    ctrlKey: isMac ? false : true,
    shiftKey: true,
    metaKey: isMac ? true : false,
    code: 'KeyX',
    key: 'X',
    label: isMac ? 'Cmd+Shift+X' : 'Ctrl+Shift+X',
  },
  ocrScreenshot: {
    isModifierOnly: false,
    altKey: true,
    ctrlKey: false,
    shiftKey: true,
    metaKey: false,
    code: 'KeyS',
    key: 'S',
    label: isMac ? 'Option+Shift+S' : 'Alt+Shift+S',
  },
};

const STORAGE_KEYS = {
  text: 'customShortcut',
  ocrOverlay: 'ocrOverlayShortcut',
  ocrScreenshot: 'ocrScreenshotShortcut',
};

const FEATURE_NAMES = {
  text: 'Dịch văn bản',
  ocrOverlay: 'Screen OCR',
  ocrScreenshot: 'Screenshot OCR',
};

const PRESET_MAP = isMac ? {
  'Control+Option': {
    isModifierOnly: true,
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    code: null,
    key: null,
    label: 'Control+Option',
  },
  'Cmd+Option': {
    isModifierOnly: true,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    metaKey: true,
    code: null,
    key: null,
    label: 'Cmd+Option',
  },
  'Option+T': {
    isModifierOnly: false,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    code: 'KeyT',
    key: 'T',
    label: 'Option+T',
  },
  'Control+Q': {
    isModifierOnly: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    code: 'KeyQ',
    key: 'Q',
    label: 'Control+Q',
  },
} : {
  'Ctrl+Alt': {
    isModifierOnly: true,
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    code: null,
    key: null,
    label: 'Ctrl+Alt',
  },
  'Ctrl+Win': {
    isModifierOnly: true,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: true,
    code: null,
    key: null,
    label: 'Ctrl+Win',
  },
  'Alt+T': {
    isModifierOnly: false,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    code: 'KeyT',
    key: 'T',
    label: 'Alt+T',
  },
  'Ctrl+Q': {
    isModifierOnly: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    code: 'KeyQ',
    key: 'Q',
    label: 'Ctrl+Q',
  },
};

// ── State ─────────────────────────────────────────────────

const shortcuts = {
  text: { ...DEFAULTS.text },
  ocrOverlay: { ...DEFAULTS.ocrOverlay },
  ocrScreenshot: { ...DEFAULTS.ocrScreenshot },
};

let currentMode            = 'auto'; // 'auto' | 'shortcut' | 'off'
let activeRecordingTarget  = null;   // 'text' | 'ocrOverlay' | 'ocrScreenshot' | null
let heldModifiers          = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
let msgTimeouts            = {};
let ocrHintTimeout         = null;

// ── DOM Elements ──────────────────────────────────────────

const toggleAuto          = document.getElementById('toggle-auto');
const toggleShortcut      = document.getElementById('toggle-shortcut');
const selectEl            = document.getElementById('lang-select');
const ocrKeyInput         = document.getElementById('ocr-api-key');
const ocrKeyHint          = document.getElementById('ocr-key-hint');
const badgeEl             = document.getElementById('status-badge');
const statusTxt           = document.getElementById('status-text');
const footerTip           = document.getElementById('footer-tip');
const presetChips         = document.querySelectorAll('.preset-chip');
const recorders           = document.querySelectorAll('.shortcut-recorder');
const resetBtns           = document.querySelectorAll('.btn-text[data-reset]');
const btnTriggerOverlay   = document.getElementById('btn-trigger-ocr-overlay');
const btnTriggerScreenshot= document.getElementById('btn-trigger-ocr-screenshot');

// ── Shortcut Equality & Conflict Checking ─────────────────

function areShortcutsEqual(s1, s2) {
  if (!s1 || !s2) return false;
  if (Boolean(s1.altKey)   !== Boolean(s2.altKey))   return false;
  if (Boolean(s1.ctrlKey)  !== Boolean(s2.ctrlKey))  return false;
  if (Boolean(s1.shiftKey) !== Boolean(s2.shiftKey)) return false;
  if (Boolean(s1.metaKey)  !== Boolean(s2.metaKey))  return false;

  if (s1.isModifierOnly || s2.isModifierOnly) {
    return Boolean(s1.isModifierOnly) === Boolean(s2.isModifierOnly);
  }

  if (s1.code && s2.code && s1.code === s2.code) return true;
  if (s1.key && s2.key && s1.key.toUpperCase() === s2.key.toUpperCase()) return true;
  return false;
}

function findConflictingTarget(target, newShortcut) {
  const otherTargets = ['text', 'ocrOverlay', 'ocrScreenshot'].filter(t => t !== target);
  for (const other of otherTargets) {
    if (areShortcutsEqual(newShortcut, shortcuts[other])) {
      return other;
    }
  }
  return null;
}

// ── Initialize & Load State ───────────────────────────────

chrome.storage.local.get([
  'translateMode', 'enabled', 'targetLang', 'ocrApiKey',
  'customShortcut', 'ocrOverlayShortcut', 'ocrScreenshotShortcut',
], data => {
  if (data.translateMode) {
    currentMode = data.translateMode;
  } else if (data.enabled === false) {
    currentMode = 'off';
  } else {
    currentMode = 'auto';
  }

  shortcuts.text          = data.customShortcut         ?? { ...DEFAULTS.text };
  shortcuts.ocrOverlay    = data.ocrOverlayShortcut    ?? { ...DEFAULTS.ocrOverlay };
  shortcuts.ocrScreenshot = data.ocrScreenshotShortcut ?? { ...DEFAULTS.ocrScreenshot };

  selectEl.value = data.targetLang ?? 'vi';
  if (data.ocrApiKey) ocrKeyInput.value = data.ocrApiKey;

  // Setup presets for the current OS
  const presetKeys = Object.keys(PRESET_MAP);
  presetChips.forEach((chip, idx) => {
    if (presetKeys[idx]) {
      const pKey = presetKeys[idx];
      chip.dataset.preset = pKey;
      const parts = pKey.split('+');
      chip.innerHTML = parts.map(p => `<kbd>${formatKeyLabel(p.trim())}</kbd>`).join('+');
    }
  });

  updateToggles(currentMode);
  renderAllShortcuts();
  updateBadge(currentMode, shortcuts.text);
});

// ── Mode Toggle Handlers ──────────────────────────────────

toggleAuto.addEventListener('change', () => {
  if (toggleAuto.checked) {
    currentMode = 'auto';
    toggleShortcut.checked = false;
  } else {
    currentMode = 'off';
  }
  saveMode(currentMode);
});

toggleShortcut.addEventListener('change', () => {
  if (toggleShortcut.checked) {
    currentMode = 'shortcut';
    toggleAuto.checked = false;
  } else {
    currentMode = 'off';
  }
  saveMode(currentMode);
});

function saveMode(mode) {
  chrome.storage.local.set({
    translateMode: mode,
    enabled: mode !== 'off',
  });
  updateBadge(mode, shortcuts.text);
}

function updateToggles(mode) {
  toggleAuto.checked     = (mode === 'auto');
  toggleShortcut.checked = (mode === 'shortcut');
}

// ── Badge & UI Text Updates ───────────────────────────────

function updateBadge(mode, shortcut) {
  badgeEl.classList.remove('active-auto', 'active-shortcut');

  const displayLabel = shortcut?.label
    ? shortcut.label.split('+').map(p => formatKeyLabel(p.trim())).join('+')
    : DEFAULTS.text.label;

  if (mode === 'auto') {
    badgeEl.classList.add('active-auto');
    statusTxt.textContent = 'Chế độ: Tự động dịch khi thả chuột';
    footerTip.textContent = 'Bôi đen chữ bất kỳ → Popup dịch hiện ngay lập tức';
  } else if (mode === 'shortcut') {
    badgeEl.classList.add('active-shortcut');
    statusTxt.textContent = `Chế độ: Dịch bằng phím tắt [${displayLabel}]`;
    footerTip.textContent = `Bôi đen chữ rồi bấm [${displayLabel}] để hiện popup`;
  } else {
    statusTxt.textContent = 'Đã tắt tính năng dịch bôi đen';
    footerTip.textContent = 'Bật một trong 2 chế độ ở trên để kích hoạt dịch';
  }
}

// ── Shortcut Display & Rendering ──────────────────────────

function getElementSuffix(target) {
  if (target === 'text') return 'text';
  if (target === 'ocrOverlay') return 'ocr-overlay';
  return 'ocr-screenshot';
}

function renderShortcutDisplay(target, shortcut) {
  const suffix = getElementSuffix(target);
  const displayEl = document.getElementById(`display-${suffix}`);
  if (!displayEl) return;

  const label = shortcut?.label || DEFAULTS[target].label;
  const parts = label.split('+');
  displayEl.innerHTML = parts.map(p => `<kbd>${formatKeyLabel(p.trim())}</kbd>`).join('<span>+</span>');
}

function renderAllShortcuts() {
  renderShortcutDisplay('text', shortcuts.text);
  renderShortcutDisplay('ocrOverlay', shortcuts.ocrOverlay);
  renderShortcutDisplay('ocrScreenshot', shortcuts.ocrScreenshot);
}

// ── Preset Chips (for Text translation) ───────────────────

presetChips.forEach(chip => {
  chip.addEventListener('click', e => {
    e.stopPropagation();
    const presetName = chip.dataset.preset;
    if (PRESET_MAP[presetName]) {
      stopRecording();
      const newShortcut = PRESET_MAP[presetName];
      applyOrValidateShortcut('text', newShortcut);
    }
  });
});

// ── Shortcut Recorders (Generic for all 3 targets) ────────

recorders.forEach(rec => {
  rec.addEventListener('click', e => {
    e.stopPropagation();
    const target = rec.dataset.recorder;
    if (activeRecordingTarget === target) {
      stopRecording();
    } else {
      startRecording(target);
    }
  });
});

resetBtns.forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const target = btn.dataset.reset;
    stopRecording();
    const def = { ...DEFAULTS[target] };
    shortcuts[target] = def;
    const storeKey = STORAGE_KEYS[target];
    chrome.storage.local.set({ [storeKey]: def });
    renderShortcutDisplay(target, def);
    if (target === 'text') updateBadge(currentMode, def);
    showStatusMessage(target, 'success', `✓ Đã khôi phục về mặc định [${def.label}]`);
  });
});

function showStatusMessage(target, type, text) {
  const suffix = getElementSuffix(target);
  const msgEl = document.getElementById(`msg-${suffix}`);
  if (!msgEl) return;

  if (msgTimeouts[target]) clearTimeout(msgTimeouts[target]);

  msgEl.className = `shortcut-recording-msg ${type}`;
  msgEl.innerHTML = text;

  msgTimeouts[target] = setTimeout(() => {
    msgEl.className = 'shortcut-recording-msg';
    msgEl.innerHTML = `Đang lắng nghe... Nhấn tổ hợp phím hoặc <strong>ESC</strong> để huỷ.`;
  }, 3500);
}

function startRecording(target) {
  stopRecording();
  activeRecordingTarget = target;
  heldModifiers = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

  const suffix = getElementSuffix(target);
  const recEl = document.querySelector(`.shortcut-recorder[data-recorder="${target}"]`);
  const msgEl = document.getElementById(`msg-${suffix}`);
  const hintEl = document.getElementById(`hint-${target}`);
  const displayEl = document.getElementById(`display-${suffix}`);

  if (recEl) recEl.classList.add('recording');
  if (msgEl) {
    if (msgTimeouts[target]) clearTimeout(msgTimeouts[target]);
    msgEl.className = 'shortcut-recording-msg active';
    msgEl.innerHTML = 'Đang lắng nghe... Nhấn tổ hợp phím hoặc <strong>ESC</strong> để huỷ.';
  }
  if (hintEl) hintEl.textContent = 'Đang chờ phím...';
  if (displayEl) displayEl.innerHTML = '<span style="color: var(--purple); font-weight: 600;">Nhấn tổ hợp phím</span>';
}

function stopRecording() {
  if (!activeRecordingTarget) return;
  const target = activeRecordingTarget;
  activeRecordingTarget = null;

  const suffix = getElementSuffix(target);
  const recEl = document.querySelector(`.shortcut-recorder[data-recorder="${target}"]`);
  const hintEl = document.getElementById(`hint-${target}`);

  if (recEl) recEl.classList.remove('recording');
  if (hintEl) hintEl.textContent = 'Bấm để đổi';

  renderShortcutDisplay(target, shortcuts[target]);
}

function applyOrValidateShortcut(target, newShortcut) {
  const conflict = findConflictingTarget(target, newShortcut);

  if (conflict) {
    // Conflict detected: Revert to default and display RED error message
    const defaultShortcut = { ...DEFAULTS[target] };
    shortcuts[target] = defaultShortcut;
    const storeKey = STORAGE_KEYS[target];
    chrome.storage.local.set({ [storeKey]: defaultShortcut });

    stopRecording();
    renderShortcutDisplay(target, defaultShortcut);
    if (target === 'text') updateBadge(currentMode, defaultShortcut);

    const conflictName = FEATURE_NAMES[conflict] || conflict;
    showStatusMessage(
      target,
      'error',
      `⚠️ Trùng phím với <strong>${conflictName}</strong> (${shortcuts[conflict].label})! Tự động khôi phục về [${defaultShortcut.label}].`
    );
  } else {
    // Success: Save new shortcut
    shortcuts[target] = newShortcut;
    const storeKey = STORAGE_KEYS[target];
    chrome.storage.local.set({ [storeKey]: newShortcut });

    stopRecording();
    renderShortcutDisplay(target, newShortcut);
    if (target === 'text') updateBadge(currentMode, newShortcut);

    showStatusMessage(target, 'success', `✓ Đã lưu phím tắt mới: [${newShortcut.label}]`);
  }
}

// ── Global Keyboard Event Listeners for Recording ─────────

document.addEventListener('keydown', e => {
  if (!activeRecordingTarget) return;

  e.preventDefault();
  e.stopPropagation();

  const target = activeRecordingTarget;

  // Escape cancels recording
  if (e.key === 'Escape') {
    stopRecording();
    return;
  }

  // Track modifiers
  heldModifiers = {
    ctrlKey:  e.ctrlKey  || e.key === 'Control',
    altKey:   e.altKey   || e.key === 'Alt',
    shiftKey: e.shiftKey || e.key === 'Shift',
    metaKey:  e.metaKey  || e.key === 'Meta' || e.key === 'OS',
  };

  const isModifierOnly = ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key);
  const modParts = getModifierParts(heldModifiers);

  const suffix = getElementSuffix(target);
  const displayEl = document.getElementById(`display-${suffix}`);
  const hintEl = document.getElementById(`hint-${target}`);

  if (isModifierOnly) {
    if (modParts.length >= 2) {
      if (displayEl) displayEl.innerHTML = modParts.map(p => `<kbd>${formatKeyLabel(p)}</kbd>`).join('<span>+</span>');
      if (hintEl) hintEl.textContent = 'Thả phím để lưu hoặc bấm thêm chữ...';
    } else {
      if (displayEl) displayEl.innerHTML = modParts.map(p => `<kbd>${formatKeyLabel(p)}</kbd>`).join('<span>+</span>') + '<span>+...</span>';
    }
    return;
  }

  // Non-modifier key pressed with modifier(s) or Function keys
  const hasModifier = modParts.length > 0;
  const isFunctionKey = /^F[1-9]|F1[0-2]$/.test(e.key);

  if (!hasModifier && !isFunctionKey) {
    if (hintEl) hintEl.textContent = 'Cần phím bổ trợ (Alt/Ctrl/Shift/Cmd)!';
    return;
  }

  // Extract letter/key name safely on both Mac (Option+Key) and Windows
  let keyName = e.key.toUpperCase();
  if (e.code.startsWith('Key'))   keyName = e.code.slice(3).toUpperCase();
  else if (e.code.startsWith('Digit')) keyName = e.code.slice(5);
  else if (e.code.startsWith('Numpad')) keyName = 'Num' + e.code.slice(6);
  else if (e.code === 'Space')    keyName = 'Space';

  modParts.push(keyName);
  const label = modParts.join('+');

  const newShortcut = {
    isModifierOnly: false,
    altKey:   heldModifiers.altKey,
    ctrlKey:  heldModifiers.ctrlKey,
    shiftKey: heldModifiers.shiftKey,
    metaKey:  heldModifiers.metaKey,
    code:     e.code,
    key:      keyName,
    label,
  };

  applyOrValidateShortcut(target, newShortcut);
});

document.addEventListener('keyup', e => {
  if (!activeRecordingTarget) return;

  const isModifierOnly = ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key);
  if (!isModifierOnly) return;

  const target = activeRecordingTarget;
  const modParts = getModifierParts(heldModifiers);

  if (modParts.length >= 2) {
    const label = modParts.join('+');
    const newShortcut = {
      isModifierOnly: true,
      altKey:   heldModifiers.altKey,
      ctrlKey:  heldModifiers.ctrlKey,
      shiftKey: heldModifiers.shiftKey,
      metaKey:  heldModifiers.metaKey,
      code:     null,
      key:      null,
      label,
    };
    applyOrValidateShortcut(target, newShortcut);
  }
});

// Click outside stops recording
document.addEventListener('click', e => {
  if (activeRecordingTarget && !e.target.closest('.shortcut-recorder') && !e.target.closest('.btn-text')) {
    stopRecording();
  }
});

// ── Direct 1-Click Action Buttons ─────────────────────────

if (btnTriggerOverlay) {
  btnTriggerOverlay.addEventListener('click', async e => {
    e.stopPropagation();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_OCR_OVERLAY' });
        } catch (_) {
          // Fallback: inject content script on the fly if not already loaded
          try {
            await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            await new Promise(r => setTimeout(r, 80));
            await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_OCR_OVERLAY' });
          } catch (injErr) {
            console.warn('Script injection failed:', injErr);
          }
        }
      }
    } catch (err) {
      console.error('Trigger OCR overlay failed:', err);
    } finally {
      setTimeout(() => window.close(), 60);
    }
  });
}

if (btnTriggerScreenshot) {
  btnTriggerScreenshot.addEventListener('click', async e => {
    e.stopPropagation();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const windowId = tab.windowId ?? null;
      let dataUrl = await new Promise((resolve, reject) => {
        const hasWin = typeof windowId === 'number' && windowId >= 0;
        const capture = (opts, cb) => hasWin ? chrome.tabs.captureVisibleTab(windowId, opts, cb) : chrome.tabs.captureVisibleTab(opts, cb);
        capture({ format: 'png' }, url => {
          if (chrome.runtime.lastError || !url) {
            capture({ format: 'jpeg', quality: 95 }, jUrl => {
              if (chrome.runtime.lastError || !jUrl) reject(new Error(chrome.runtime.lastError?.message));
              else resolve(jUrl);
            });
          } else resolve(url);
        });
      });

      await chrome.storage.session.set({ limn_ocr_screenshot: dataUrl });
      chrome.tabs.create({ url: chrome.runtime.getURL('crop.html') });
      window.close();
    } catch (err) {
      console.error('Screenshot OCR failed:', err);
    }
  });
}

// ── Language Selector ─────────────────────────────────────

selectEl.addEventListener('change', () => {
  chrome.storage.local.set({ targetLang: selectEl.value });
});

// ── OCR API Key Input ─────────────────────────────────────

ocrKeyInput.addEventListener('input', () => {
  const key = ocrKeyInput.value.trim();
  chrome.storage.local.set({ ocrApiKey: key });

  ocrKeyHint.textContent = key ? '✓ Đã lưu API Key riêng thành công!' : 'Đã xoá key riêng (sử dụng key mặc định)';
  ocrKeyHint.classList.add('saved');
  clearTimeout(ocrHintTimeout);
  ocrHintTimeout = setTimeout(() => {
    ocrKeyHint.textContent = 'Dùng key riêng để có 500 lượt OCR/ngày không lo nghẽn';
    ocrKeyHint.classList.remove('saved');
  }, 2500);
});
