// Draw on Web — background service worker (Manifest V3)
// Responsibilities for Phase 1:
//   - Toggle draw mode when the toolbar icon is clicked.
//   - Toggle draw mode when the keyboard command fires (Ctrl/Cmd+Shift+D).
//   - Robustly reach the content script, injecting it on demand for tabs
//     that were already open before the extension was installed/reloaded.

const CONTENT_FILES = [
  'src/content/storage.js',
  'src/content/canvas-manager.js',
  'src/content/drawing-engine.js',
  'src/content/toolbar.js',
  'src/content/content.js'
];
const CONTENT_CSS = ['src/content/content.css'];

// Pages we can inject into. http(s) always; file:// works when the user has
// enabled "Allow access to file URLs" for the extension (we fail quietly if
// not). Chrome system pages (chrome://, the Web Store) can never be injected.
function isInjectablePage(url) {
  if (!url) return false;
  return /^(https?|file):\/\//i.test(url);
}

async function toggleDrawMode(tab) {
  if (!tab || tab.id == null) return;
  if (!isInjectablePage(tab.url)) {
    // e.g. chrome://, chrome web store, view-source:, file:// (not requested)
    return;
  }

  const tabId = tab.id;
  try {
    // Fast path: content script already present, just tell it to toggle.
    await chrome.tabs.sendMessage(tabId, { type: 'DP_TOGGLE' });
  } catch (_e) {
    // Content script not yet in this tab (tab predates install, or after an
    // extension reload). Inject it, then toggle.
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_CSS });
      await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
      await chrome.tabs.sendMessage(tabId, { type: 'DP_TOGGLE' });
    } catch (err) {
      console.warn('[Draw on Web] Could not activate on this tab:', err?.message || err);
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  toggleDrawMode(tab);
});

// Screenshot export: the content script hides its own UI, then asks us to grab
// the visible tab (annotations are part of the page, so they're captured too).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'DP_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (msg && msg.type === 'DP_CAPTURE') {
    const windowId = sender.tab?.windowId;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // keep the message channel open for the async response
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-draw-mode') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggleDrawMode(tab);
});
