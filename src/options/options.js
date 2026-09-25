// Draw on Web — options page logic
// Reads/writes settings via chrome.storage.sync using the same shape as the
// content-script storage wrapper. Autosaves on every change.

const ALL_TOOLS = ['select', 'pen', 'highlighter', 'line', 'rect', 'ellipse', 'arrow', 'text', 'counter', 'eraser', 'rectFill', 'ellipseFill'];
const DEFAULT_HIDDEN = new Set(['rectFill', 'ellipseFill']);

const DEFAULT_SETTINGS = {
  accentColor: '#f97316',
  defaultColor: '#ef4444',
  defaultThickness: 4,
  defaultOpacity: 1,
  defaultTool: 'pen',
  textFont: 'mono',
  inputMode: 'auto',
  defaultPosition: 'tc',
  theme: 'auto',
  toolbarColor: '',
  toolbarRadius: 'rounded',
  toolbarSize: 'regular',
  showSizeSlider: true,
  smoothing: 0.3,
  exportMode: 'viewport',
  autoRestore: false,
  toolVisibility: ALL_TOOLS.reduce((m, t) => (m[t] = !DEFAULT_HIDDEN.has(t), m), {}),
  toolOrder: ALL_TOOLS.slice(),
  palette: ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#14b8a6',
            '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#111827']
};

// Keep in sync with FONT_STACKS in src/content/storage.js.
const FONT_STACKS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "Cascadia Code", "Segoe UI Mono", Consolas, "Liberation Mono", monospace',
  rounded: '"Segoe UI Rounded", ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif',
  hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", "Chalkboard SE", cursive'
};
const FONT_LABELS = {
  sans: 'Sans-serif',
  serif: 'Serif',
  mono: 'Monospace (default)',
  rounded: 'Rounded',
  hand: 'Handwritten'
};

// Platform-aware modifier label so shortcuts read ⌘ on macOS, Ctrl elsewhere.
const IS_MAC = /mac|iphone|ipad|ipod/i.test(
  (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || ''
);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

const TOOL_LABELS = {
  select: 'Select', pen: 'Pen', highlighter: 'Highlighter', line: 'Line', rect: 'Rectangle',
  ellipse: 'Ellipse', arrow: 'Arrow', text: 'Text', counter: 'Number stamp', eraser: 'Eraser',
  rectFill: 'Filled rectangle', ellipseFill: 'Filled ellipse'
};

const TOOL_ICONS = {
  select: '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
  pen: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  line: '<line x1="20" y1="4" x2="4" y2="20"/>',
  rect: '<rect x="3" y="4" width="18" height="16" rx="2"/>',
  ellipse: '<circle cx="12" cy="12" r="9"/>',
  arrow: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  rectFill: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" stroke="none"/>',
  ellipseFill: '<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>',
  counter: '<circle cx="12" cy="12" r="9"/><path d="M11 9.5 12.5 8.5V16"/><path d="M11 16h3"/>'
};

function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' + TOOL_ICONS[name] + '</svg>';
}

let settings = { ...DEFAULT_SETTINGS };

const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.sync.get('settings');
  settings = mergeSettings(stored.settings);
  lastWritten = JSON.stringify(settings); // baseline so no-op saves are skipped
  render();
}

function mergeSettings(stored) {
  const s = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  s.toolVisibility = { ...DEFAULT_SETTINGS.toolVisibility, ...(stored?.toolVisibility || {}) };
  s.toolOrder = Array.isArray(stored?.toolOrder) && stored.toolOrder.length
    ? stored.toolOrder.filter((t) => ALL_TOOLS.includes(t))
    : DEFAULT_SETTINGS.toolOrder.slice();
  for (const t of ALL_TOOLS) if (!s.toolOrder.includes(t)) s.toolOrder.push(t);
  return s;
}

let savedTimer = null;
let writeTimer = null;
let lastWritten = null;
// Debounce writes: chrome.storage.sync caps writes (~120/min). Slider/color
// `input` events fire rapidly, so we coalesce them into a single write shortly
// after the user stops changing things, and skip writes that change nothing.
function save() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(commitSave, 700);
}

function commitSave() {
  const snapshot = JSON.stringify(settings);
  if (snapshot === lastWritten) return;             // nothing actually changed
  lastWritten = snapshot;
  // Callback form (NOT the promise form): errors surface via runtime.lastError,
  // which we read here, so a quota rejection can never become an
  // "Uncaught (in promise)". We just check lastError and move on.
  try {
    chrome.storage.sync.set({ settings }, () => {
      if (chrome.runtime.lastError) {
        lastWritten = null; // allow a retry on the next change
        console.warn('[Draw on Web] Settings save deferred:', chrome.runtime.lastError.message);
        return;
      }
      const tag = $('savedTag');
      if (!tag) return;
      tag.hidden = false;
      tag.style.opacity = '1';
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { tag.style.opacity = '0'; }, 1200);
    });
  } catch (e) {
    lastWritten = null;
    console.warn('[Draw on Web] Settings save failed:', e && e.message);
  }
}

// Safety net: swallow any stray storage promise rejection so it can never show
// up as an uncaught error in the console.
window.addEventListener('unhandledrejection', (ev) => {
  const msg = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason || '');
  if (/quota|storage/i.test(msg)) {
    ev.preventDefault();
    console.warn('[Draw on Web] Ignored storage error:', msg);
  }
});

function applyAccentToPage() {
  document.documentElement.style.setProperty('--accent', settings.accentColor);
}

// ---- render everything from `settings` ----
function render() {
  applyAccentToPage();
  renderToolList();
  renderDefaultTool();
  renderTextFont();
  renderPalette();
  $('defaultThickness').value = settings.defaultThickness;
  $('thicknessVal').textContent = settings.defaultThickness;
  const opPct = Math.round((settings.defaultOpacity ?? 1) * 100);
  $('defaultOpacity').value = opPct;
  $('opacityVal').textContent = opPct;
  $('defaultPosition').value = settings.defaultPosition;
  $('inputMode').value = settings.inputMode || 'auto';
  $('autoRestore').checked = settings.autoRestore;
  $('accentColor').value = settings.accentColor;
  renderTheme();
  renderSmoothing();
  renderExportMode();
  renderToolbarStyle();
  renderToolbarPreview();
  renderShortcuts();
}

function renderToolbarStyle() {
  document.querySelectorAll('#toolbarSize button').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === (settings.toolbarSize || 'regular'));
  });
  document.querySelectorAll('#toolbarRadius button').forEach((b) => {
    b.classList.toggle('active', b.dataset.radius === (settings.toolbarRadius || 'rounded'));
  });
  $('showSizeSlider').checked = settings.showSizeSlider !== false;
  const useCustom = !!settings.toolbarColor;
  $('toolbarColorOn').checked = useCustom;
  $('toolbarColor').value = /^#[0-9a-f]{6}$/i.test(settings.toolbarColor) ? settings.toolbarColor : '#1a1a20';
  $('toolbarColor').disabled = !useCustom;
}

// A small live preview of the bar so users see size / shape / colour instantly.
function renderToolbarPreview() {
  const bar = $('tbPreview');
  if (!bar) return;
  const SIZES = {
    compact: { btn: 26, icon: 15, pad: '4px 5px', gap: 2, radius: 0 },
    regular: { btn: 32, icon: 18, pad: '5px 6px', gap: 3, radius: 0 },
    large: { btn: 38, icon: 21, pad: '7px 8px', gap: 4, radius: 0 }
  };
  const RADII = { sharp: 8, rounded: 15, pill: 26 };
  const BTN_RADII = { sharp: '6px', rounded: '9px', pill: '50%' };
  const sz = SIZES[settings.toolbarSize] || SIZES.regular;
  const rad = RADII[settings.toolbarRadius] ?? 15;
  bar.style.setProperty('--tb-btn', sz.btn + 'px');
  bar.style.setProperty('--tb-icon', sz.icon + 'px');
  bar.style.setProperty('--tb-gap', sz.gap + 'px');
  bar.style.setProperty('--tb-btn-radius', BTN_RADII[settings.toolbarRadius] || BTN_RADII.rounded);
  bar.style.padding = sz.pad;
  bar.style.borderRadius = rad + 'px';
  if (settings.toolbarColor) {
    const dark = isDarkColor(settings.toolbarColor);
    bar.style.background = settings.toolbarColor;
    bar.style.color = dark ? '#f5f5f7' : '#1c1c1f';
    bar.style.borderColor = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)';
  } else {
    bar.style.background = '';
    bar.style.color = '';
    bar.style.borderColor = '';
  }
}

function isDarkColor(hex) {
  if (!hex) return true;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return true;
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) < 0.5;
}

function renderSmoothing() {
  const cur = String(settings.smoothing ?? 0.3);
  document.querySelectorAll('#smoothing button').forEach((b) => {
    b.classList.toggle('active', b.dataset.sm === cur);
  });
}

function renderExportMode() {
  const cur = settings.exportMode || 'viewport';
  document.querySelectorAll('#exportMode button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === cur);
  });
}

const SHORTCUTS = [
  [`${MOD}+Shift+D`, 'Toggle Draw on Web'],
  ['P / H', 'Pen / Highlighter'],
  ['L / R / O', 'Line / Rectangle / Ellipse'],
  ['A / T / N', 'Arrow / Text / Number stamp'],
  ['S / E', 'Select / Eraser'],
  ['C', 'Cursor mode (use the site)'],
  [`${MOD}+Z / ${MOD}+Shift+Z`, 'Undo / Redo'],
  ['Delete', 'Delete selection'],
  ['Shift', 'Hold while drawing: square / circle / 45°'],
  ['Esc', 'Cancel, deselect, or exit']
];
function renderShortcuts() {
  const list = $('shortcuts');
  if (!list || list.childElementCount) return;
  for (const [keys, action] of SHORTCUTS) {
    const li = document.createElement('li');
    const kbds = keys.split(' ').map((k) => k === '/' ? '/' : `<kbd>${k}</kbd>`).join(' ');
    li.innerHTML = `<span class="sc-keys">${kbds}</span><span class="sc-act">${action}</span>`;
    list.appendChild(li);
  }
}

function renderToolList() {
  const list = $('toolList');
  list.innerHTML = '';
  for (const id of settings.toolOrder) {
    const li = document.createElement('li');
    li.className = 'tool-item';
    li.draggable = true;
    li.dataset.tool = id;
    li.innerHTML =
      `<span class="grip" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg></span>` +
      `<span class="icon">${icon(id)}</span>` +
      `<span class="name">${TOOL_LABELS[id]}</span>` +
      `<input type="checkbox" ${settings.toolVisibility[id] !== false ? 'checked' : ''} aria-label="Show ${TOOL_LABELS[id]}" />`;
    li.querySelector('input').addEventListener('change', (e) => {
      settings.toolVisibility[id] = e.target.checked;
      save();
    });
    wireDrag(li);
    list.appendChild(li);
  }
}

// Drag-and-drop reorder.
let dragEl = null;
function wireDrag(li) {
  li.addEventListener('dragstart', () => { dragEl = li; li.classList.add('dragging'); });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    document.querySelectorAll('.tool-item').forEach((n) => n.classList.remove('drag-over'));
    commitOrder();
  });
  li.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragEl || dragEl === li) return;
    const list = li.parentNode;
    const rect = li.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    list.insertBefore(dragEl, after ? li.nextSibling : li);
  });
}
function commitOrder() {
  settings.toolOrder = [...document.querySelectorAll('.tool-item')].map((li) => li.dataset.tool);
  save();
}

function renderDefaultTool() {
  const sel = $('defaultTool');
  sel.innerHTML = '';
  for (const id of ALL_TOOLS) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = TOOL_LABELS[id];
    sel.appendChild(opt);
  }
  sel.value = settings.defaultTool;
}

function renderTextFont() {
  const sel = $('textFont');
  if (!sel) return;
  sel.innerHTML = '';
  for (const id of Object.keys(FONT_LABELS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = FONT_LABELS[id];
    opt.style.fontFamily = FONT_STACKS[id];   // preview each option in its own font
    sel.appendChild(opt);
  }
  const cur = FONT_STACKS[settings.textFont] ? settings.textFont : 'sans';
  sel.value = cur;
  sel.style.fontFamily = FONT_STACKS[cur];     // show the current choice in its font
}

function renderPalette() {
  const wrap = $('palette');
  wrap.innerHTML = '';
  for (const hex of settings.palette) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (hex.toLowerCase() === settings.defaultColor.toLowerCase() ? ' active' : '');
    b.style.background = hex;
    b.title = hex;
    b.addEventListener('click', () => {
      settings.defaultColor = hex;
      renderPalette();
      $('customColor').value = hex;
      save();
    });
    wrap.appendChild(b);
  }
  $('customColor').value = /^#[0-9a-f]{6}$/i.test(settings.defaultColor) ? settings.defaultColor : '#000000';
}

function renderTheme() {
  document.querySelectorAll('#theme button').forEach((b) => {
    b.classList.toggle('active', b.dataset.theme === settings.theme);
  });
}

// ---- wire static controls ----
function wireControls() {
  $('defaultTool').addEventListener('change', (e) => { settings.defaultTool = e.target.value; save(); });

  $('textFont').addEventListener('change', (e) => {
    settings.textFont = e.target.value;
    renderTextFont();
    save();
  });

  $('defaultThickness').addEventListener('input', (e) => {
    settings.defaultThickness = Number(e.target.value);
    $('thicknessVal').textContent = e.target.value;
    save();
  });

  $('defaultOpacity').addEventListener('input', (e) => {
    settings.defaultOpacity = Number(e.target.value) / 100;
    $('opacityVal').textContent = e.target.value;
    save();
  });

  $('customColor').addEventListener('input', (e) => {
    settings.defaultColor = e.target.value;
    renderPalette();
    save();
  });

  $('defaultPosition').addEventListener('change', (e) => { settings.defaultPosition = e.target.value; save(); });

  $('inputMode').addEventListener('change', (e) => { settings.inputMode = e.target.value; save(); });

  $('autoRestore').addEventListener('change', (e) => { settings.autoRestore = e.target.checked; save(); });

  $('accentColor').addEventListener('input', (e) => {
    settings.accentColor = e.target.value;
    applyAccentToPage();
    save();
  });

  document.querySelectorAll('#theme button').forEach((b) => {
    b.addEventListener('click', () => { settings.theme = b.dataset.theme; renderTheme(); save(); });
  });

  document.querySelectorAll('#smoothing button').forEach((b) => {
    b.addEventListener('click', () => { settings.smoothing = Number(b.dataset.sm); renderSmoothing(); save(); });
  });

  document.querySelectorAll('#toolbarSize button').forEach((b) => {
    b.addEventListener('click', () => { settings.toolbarSize = b.dataset.size; renderToolbarStyle(); renderToolbarPreview(); save(); });
  });

  document.querySelectorAll('#toolbarRadius button').forEach((b) => {
    b.addEventListener('click', () => { settings.toolbarRadius = b.dataset.radius; renderToolbarStyle(); renderToolbarPreview(); save(); });
  });

  $('showSizeSlider').addEventListener('change', (e) => { settings.showSizeSlider = e.target.checked; save(); });

  document.querySelectorAll('#exportMode button').forEach((b) => {
    b.addEventListener('click', () => { settings.exportMode = b.dataset.mode; renderExportMode(); save(); });
  });

  $('toolbarColorOn').addEventListener('change', (e) => {
    settings.toolbarColor = e.target.checked ? ($('toolbarColor').value || '#1a1a20') : '';
    renderToolbarStyle();
    renderToolbarPreview();
    save();
  });
  $('toolbarColor').addEventListener('input', (e) => {
    if (!$('toolbarColorOn').checked) return;
    settings.toolbarColor = e.target.value;
    renderToolbarPreview();
    save();
  });

  $('clearDrawingsBtn').addEventListener('click', () => {
    if (!confirm('Delete every annotation Draw on Web has saved on this device? This cannot be undone.')) return;
    try {
      chrome.storage.local.remove('drawings', () => {
        void chrome.runtime.lastError; // swallow if unavailable
        const btn = $('clearDrawingsBtn');
        const label = btn.textContent;
        btn.textContent = 'Cleared';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 1500);
      });
    } catch (_e) { /* ignore */ }
  });

  $('resetBtn').addEventListener('click', async () => {
    if (!confirm('Reset all Draw on Web settings to defaults?')) return;
    settings = { ...DEFAULT_SETTINGS, toolVisibility: { ...DEFAULT_SETTINGS.toolVisibility }, toolOrder: DEFAULT_SETTINGS.toolOrder.slice(), palette: DEFAULT_SETTINGS.palette.slice() };
    save();
    render();
  });
}

wireControls();
load();
