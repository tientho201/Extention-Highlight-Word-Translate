/**
 * popup.js — Popup Settings UI (Limn Word Translate)
 *
 * Responsibilities:
 *  - Manage 2 mutually exclusive translation modes: Auto Translate vs Shortcut Translate.
 *  - Interactive shortcut recorder supporting both normal combos (Alt+T, Ctrl+Q)
 *    and modifier-only combos (Ctrl+Alt, Ctrl+Win, Ctrl+Shift, Alt+Shift).
 *  - Quick preset buttons for instant 1-click shortcut assignment.
 *  - Persist all configuration to chrome.storage.local.
 */

'use strict';

const DEFAULT_SHORTCUT = {
  isModifierOnly: false,
  altKey: true,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  code: 'KeyT',
  key: 'T',
  label: 'Alt+T',
};

const PRESET_MAP = {
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

// ── DOM elements ──────────────────────────────────────────

const toggleAuto          = document.getElementById('toggle-auto');
const toggleShortcut      = document.getElementById('toggle-shortcut');
const shortcutRecorder    = document.getElementById('shortcut-recorder');
const shortcutDisplay     = document.getElementById('shortcut-display');
const shortcutHint        = document.getElementById('shortcut-hint');
const shortcutRecordingMsg= document.getElementById('shortcut-recording-msg');
const btnResetShortcut    = document.getElementById('btn-reset-shortcut');
const selectEl            = document.getElementById('lang-select');
const ocrKeyInput         = document.getElementById('ocr-api-key');
const ocrKeyHint          = document.getElementById('ocr-key-hint');
const badgeEl             = document.getElementById('status-badge');
const statusTxt           = document.getElementById('status-text');
const footerTip           = document.getElementById('footer-tip');
const presetChips         = document.querySelectorAll('.preset-chip');

let currentMode     = 'auto'; // 'auto' | 'shortcut' | 'off'
let currentShortcut = DEFAULT_SHORTCUT;
let isRecording     = false;
let ocrHintTimeout  = null;

// Temp tracker for modifier keys while recording
let heldModifiers = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

// ── Initialize & Load State ───────────────────────────────

chrome.storage.local.get(['translateMode', 'enabled', 'customShortcut', 'targetLang', 'ocrApiKey'], data => {
  if (data.translateMode) {
    currentMode = data.translateMode;
  } else if (data.enabled === false) {
    currentMode = 'off';
  } else {
    currentMode = 'auto';
  }

  currentShortcut = data.customShortcut ?? DEFAULT_SHORTCUT;
  selectEl.value   = data.targetLang ?? 'vi';
  if (data.ocrApiKey) {
    ocrKeyInput.value = data.ocrApiKey;
  }

  if (isMac) {
    presetChips.forEach(chip => {
      const presetName = chip.dataset.preset;
      const parts = presetName.split('+');
      chip.innerHTML = parts.map(p => `<kbd>${formatKeyLabel(p.trim())}</kbd>`).join('+');
    });
  }

  updateToggles(currentMode);
  renderShortcut(currentShortcut);
  updateBadge(currentMode, currentShortcut);
});

// ── Mode Toggle Handlers (Mutually Exclusive) ─────────────

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
  updateBadge(mode, currentShortcut);
}

function updateToggles(mode) {
  toggleAuto.checked     = (mode === 'auto');
  toggleShortcut.checked = (mode === 'shortcut');
}

const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent || navigator.platform);

function formatKeyLabel(name) {
  if (!isMac) return name;
  const map = {
    'Win': 'Cmd ⌘',
    'Alt': 'Option ⌥',
    'Ctrl': 'Ctrl ⌃',
    'Shift': 'Shift ⇧',
  };
  return map[name] ?? name;
}

// ── Badge & UI Text Updates ───────────────────────────────

function updateBadge(mode, shortcut) {
  badgeEl.classList.remove('active-auto', 'active-shortcut');

  const displayLabel = shortcut.label
    ? shortcut.label.split('+').map(p => formatKeyLabel(p.trim())).join('+')
    : (isMac ? 'Option ⌥+T' : 'Alt+T');

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

function renderShortcut(shortcut) {
  const parts = shortcut.label ? shortcut.label.split('+') : ['Alt', 'T'];
  shortcutDisplay.innerHTML = parts.map(p => `<kbd>${formatKeyLabel(p.trim())}</kbd>`).join('<span>+</span>');
}

// ── Preset Chips ──────────────────────────────────────────

presetChips.forEach(chip => {
  chip.addEventListener('click', e => {
    e.stopPropagation();
    const presetName = chip.dataset.preset;
    if (PRESET_MAP[presetName]) {
      stopRecording();
      const newShortcut = PRESET_MAP[presetName];
      currentShortcut = newShortcut;
      chrome.storage.local.set({ customShortcut: newShortcut });
      renderShortcut(newShortcut);
      updateBadge(currentMode, newShortcut);
    }
  });
});

// ── Shortcut Recording Logic ──────────────────────────────

shortcutRecorder.addEventListener('click', () => {
  if (!isRecording) {
    startRecording();
  }
});

btnResetShortcut.addEventListener('click', e => {
  e.stopPropagation();
  stopRecording();
  currentShortcut = DEFAULT_SHORTCUT;
  chrome.storage.local.set({ customShortcut: DEFAULT_SHORTCUT });
  renderShortcut(DEFAULT_SHORTCUT);
  updateBadge(currentMode, DEFAULT_SHORTCUT);
});

function startRecording() {
  isRecording = true;
  heldModifiers = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  shortcutRecorder.classList.add('recording');
  shortcutRecordingMsg.classList.add('active');
  shortcutHint.textContent = 'Đang chờ phím...';
  shortcutDisplay.innerHTML = '<span style="color: var(--purple); font-weight: 600;">Nhấn tổ hợp phím</span>';
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  shortcutRecorder.classList.remove('recording');
  shortcutRecordingMsg.classList.remove('active');
  shortcutHint.textContent = 'Bấm để đổi phím';
  renderShortcut(currentShortcut);
}

function saveRecordedShortcut(shortcut) {
  currentShortcut = shortcut;
  chrome.storage.local.set({ customShortcut: shortcut });
  stopRecording();
  updateBadge(currentMode, currentShortcut);
}

document.addEventListener('keydown', e => {
  if (!isRecording) return;

  e.preventDefault();
  e.stopPropagation();

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

  const modParts = [];
  if (heldModifiers.ctrlKey)  modParts.push('Ctrl');
  if (heldModifiers.altKey)   modParts.push('Alt');
  if (heldModifiers.shiftKey) modParts.push('Shift');
  if (heldModifiers.metaKey)  modParts.push('Win');

  if (isModifierOnly) {
    // If 2 or more modifiers are pressed together (e.g. Ctrl + Alt or Ctrl + Win),
    // show them in the display
    if (modParts.length >= 2) {
      shortcutDisplay.innerHTML = modParts.map(p => `<kbd>${p}</kbd>`).join('<span>+</span>');
      shortcutHint.textContent = 'Thả phím để lưu hoặc bấm thêm chữ...';
    } else {
      shortcutDisplay.innerHTML = modParts.map(p => `<kbd>${p}</kbd>`).join('<span>+</span>') + '<span>+...</span>';
    }
    return;
  }

  // Non-modifier key pressed with modifier(s) or Function keys
  const hasModifier = modParts.length > 0;
  const isFunctionKey = /^F[1-9]|F1[0-2]$/.test(e.key);

  if (!hasModifier && !isFunctionKey) {
    shortcutHint.textContent = 'Cần phím bổ trợ (Alt/Ctrl/Shift)!';
    return;
  }

  let keyName = e.key.toUpperCase();
  if (e.code.startsWith('Key'))   keyName = e.code.slice(3);
  if (e.code.startsWith('Digit')) keyName = e.code.slice(5);
  if (e.code === 'Space')         keyName = 'Space';

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

  saveRecordedShortcut(newShortcut);
});

// Handle keyup to capture modifier-only combos when released
document.addEventListener('keyup', e => {
  if (!isRecording) return;

  const isModifierOnly = ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key);
  if (!isModifierOnly) return;

  const modParts = [];
  if (heldModifiers.ctrlKey)  modParts.push('Ctrl');
  if (heldModifiers.altKey)   modParts.push('Alt');
  if (heldModifiers.shiftKey) modParts.push('Shift');
  if (heldModifiers.metaKey)  modParts.push('Win');

  // If user pressed 2+ modifiers (e.g. Ctrl + Alt or Ctrl + Win) and released them
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
    saveRecordedShortcut(newShortcut);
  }
});

// Click outside stops recording
document.addEventListener('click', e => {
  if (isRecording && !shortcutRecorder.contains(e.target) && e.target !== btnResetShortcut) {
    stopRecording();
  }
});

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
