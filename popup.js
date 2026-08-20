/**
 * popup.js
 *
 * Responsibilities:
 *  - Read persisted settings from chrome.storage.local on open.
 *  - Write changes to chrome.storage.local on every user interaction.
 *  - Keep the status badge in sync with the toggle state.
 *
 * No debounce is needed here — storage writes are rare and cheap.
 */

const toggleEl  = document.getElementById("toggle-enabled");
const selectEl  = document.getElementById("lang-select");
const badgeEl   = document.getElementById("status-badge");
const statusTxt = document.getElementById("status-text");

// ---------------------------------------------------------------------------
// Load persisted state
// ---------------------------------------------------------------------------

chrome.storage.local.get(["enabled", "targetLang"], (data) => {
  toggleEl.checked = data.enabled    ?? false;
  selectEl.value   = data.targetLang ?? "vi";
  updateBadge(toggleEl.checked);
});

// ---------------------------------------------------------------------------
// Persist on change
// ---------------------------------------------------------------------------

toggleEl.addEventListener("change", () => {
  const enabled = toggleEl.checked;
  chrome.storage.local.set({ enabled });
  updateBadge(enabled);
});

selectEl.addEventListener("change", () => {
  chrome.storage.local.set({ targetLang: selectEl.value });
});

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function updateBadge(enabled) {
  if (enabled) {
    badgeEl.classList.add("active");
    statusTxt.textContent = "Active — select text or Ctrl+Shift+X";
  } else {
    badgeEl.classList.remove("active");
    statusTxt.textContent = "Disabled — toggle on to activate";
  }
}
