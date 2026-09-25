// Draw on Web — storage wrapper
// Thin promise-based helpers over chrome.storage.
//   * chrome.storage.sync  -> user settings (follow the user across installs)
//   * chrome.storage.local -> device state: toolbar position, per-URL drawings
//
// Loaded as a classic content script, so everything hangs off a single global.

(function () {
  'use strict';
  if (window.__DrawingPenStorage) return;

  // Text-tool font choices. Keys are stored in settings; the resolved CSS stack
  // is stamped onto each text stroke so a drawing keeps its font even if the
  // setting later changes. Stacks lean on locally available fonts + generic
  // fallbacks — nothing is downloaded, so text renders instantly and offline.
  const FONT_STACKS = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    mono: 'ui-monospace, "Cascadia Code", "Segoe UI Mono", Consolas, "Liberation Mono", monospace',
    rounded: '"Segoe UI Rounded", ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif',
    hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", "Chalkboard SE", cursive'
  };

  // Master list of tools (id + default visibility + default order).
  const ALL_TOOLS = ['select', 'pen', 'highlighter', 'line', 'rect', 'ellipse', 'arrow', 'text', 'counter', 'eraser', 'rectFill', 'ellipseFill'];
  // Tools present but hidden from the toolbar by default (enable in Settings).
  const DEFAULT_HIDDEN = new Set(['rectFill', 'ellipseFill']);

  const DEFAULT_SETTINGS = {
    accentColor: '#f97316',
    defaultColor: '#ef4444',
    defaultThickness: 4,
    defaultOpacity: 1,
    defaultTool: 'pen',
    textFont: 'sans',         // font family key for the text tool (see FONT_STACKS)
    defaultPosition: 'tc',    // 'tc' | 'tr' | 'tl' | 'bc' | 'br' | 'bl'
    theme: 'auto',            // 'auto' | 'light' | 'dark'
    toolbarColor: '',         // '' = follow theme; else a custom bar background
    toolbarRadius: 'rounded', // 'sharp' | 'rounded' | 'pill'
    toolbarSize: 'regular',   // 'compact' | 'regular' | 'large'
    showSizeSlider: true,     // show the inline thickness slider on the bar
    smoothing: 0.3,           // freehand smoothing strength: 0 (off) → 0.7 (high).
                              // Velocity-adaptive, so it de-jitters slow strokes
                              // without lagging fast ones; 'Low' feels snappiest.
    exportMode: 'viewport',   // 'viewport' (screenshot) | 'full' (whole-page ink)
    autoRestore: false,       // reload saved drawings when revisiting a URL
    toolVisibility: ALL_TOOLS.reduce((m, t) => (m[t] = !DEFAULT_HIDDEN.has(t), m), {}),
    toolOrder: ALL_TOOLS.slice(),
    palette: [
      '#ef4444', '#f59e0b', '#facc15', '#22c55e', '#14b8a6',
      '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#111827'
    ]
  };

  // Keep an annotation store from growing forever: cap how many URLs we retain.
  const MAX_SAVED_URLS = 200;
  const DRAWINGS_KEY = 'drawings';

  // Normalise a URL for use as a storage key (drop hash; keep query + path).
  function urlKey(href = location.href) {
    try {
      const u = new URL(href);
      u.hash = '';
      return u.href;
    } catch (_e) {
      return href;
    }
  }

  const Storage = {
    ALL_TOOLS,
    FONT_STACKS,
    DEFAULT_SETTINGS,

    // ---- sync (user settings) --------------------------------------------
    async getSettings() {
      try {
        const stored = await chrome.storage.sync.get('settings');
        return this._mergeSettings(stored.settings);
      } catch (_e) {
        return this._clone(DEFAULT_SETTINGS);
      }
    },

    async setSettings(patch) {
      const current = await this.getSettings();
      const next = { ...current, ...patch };
      try {
        await chrome.storage.sync.set({ settings: next });
      } catch (_e) { /* quota / unavailable — ignore */ }
      return next;
    },

    async resetSettings() {
      try {
        await chrome.storage.sync.set({ settings: this._clone(DEFAULT_SETTINGS) });
      } catch (_e) { /* ignore */ }
      return this._clone(DEFAULT_SETTINGS);
    },

    onSettingsChanged(callback) {
      const listener = (changes, area) => {
        if (area === 'sync' && changes.settings) {
          callback(this._mergeSettings(changes.settings.newValue));
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },

    _mergeSettings(stored) {
      const merged = { ...this._clone(DEFAULT_SETTINGS), ...(stored || {}) };
      // Deep-merge the nested objects so new tools added in an update still work.
      merged.toolVisibility = { ...DEFAULT_SETTINGS.toolVisibility, ...(stored?.toolVisibility || {}) };
      merged.toolOrder = Array.isArray(stored?.toolOrder) && stored.toolOrder.length
        ? stored.toolOrder.filter((t) => ALL_TOOLS.includes(t))
        : DEFAULT_SETTINGS.toolOrder.slice();
      // Ensure any tool missing from a stored order is appended.
      for (const t of ALL_TOOLS) if (!merged.toolOrder.includes(t)) merged.toolOrder.push(t);
      return merged;
    },

    _clone(obj) { return JSON.parse(JSON.stringify(obj)); },

    // ---- local: toolbar position -----------------------------------------
    async getToolbarState() {
      return (await this.getLocal('toolbarState', null)) || {};
    },
    async setToolbarState(patch) {
      const cur = await this.getToolbarState();
      await this.setLocal('toolbarState', { ...cur, ...patch });
    },

    // ---- local: per-URL drawings -----------------------------------------
    async loadDrawing(href) {
      const all = await this.getLocal(DRAWINGS_KEY, {});
      const entry = all[urlKey(href)];
      return entry ? entry.strokes : null;
    },

    async saveDrawing(href, strokes) {
      const all = await this.getLocal(DRAWINGS_KEY, {});
      const key = urlKey(href);
      if (!strokes || !strokes.length) {
        delete all[key];
      } else {
        all[key] = { strokes, savedAt: Date.now() };
        // Evict oldest entries if we exceed the cap.
        const keys = Object.keys(all);
        if (keys.length > MAX_SAVED_URLS) {
          keys.sort((a, b) => (all[a].savedAt || 0) - (all[b].savedAt || 0));
          for (const k of keys.slice(0, keys.length - MAX_SAVED_URLS)) delete all[k];
        }
      }
      await this.setLocal(DRAWINGS_KEY, all);
    },

    // ---- generic local helpers -------------------------------------------
    async getLocal(key, fallback = null) {
      try {
        const stored = await chrome.storage.local.get(key);
        return key in stored ? stored[key] : fallback;
      } catch (_e) {
        return fallback;
      }
    },
    async setLocal(key, value) {
      try {
        await chrome.storage.local.set({ [key]: value });
      } catch (_e) { /* ignore */ }
    },

    urlKey
  };

  window.__DrawingPenStorage = Storage;
})();
