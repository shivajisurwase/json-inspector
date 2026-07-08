// ─── Event Listeners (Raw JSON editor, toolbar buttons, search, tabs) ──────────
// Syntax highlight + gutter repaint is rAF-throttled so a burst of keystrokes
// (or a large paste) only pays for one repaint per animation frame instead of
// one per keystroke — the native textarea itself is never blocked by this.
const updateHighlightThrottled = rafThrottle(updateHighlight);

$rawInput.addEventListener('input', (e) => {
  state.raw = e.target.value;
  tryParseQuiet(state.raw);
  updateHighlightThrottled();
  showBlockHighlight(state.raw, null);
  refreshStatusDebounced();
  updateExportButtonMode();
});

$rawEditorScroll.addEventListener('scroll', syncEditorScroll);

// Double-click directly on a {, }, [ or ] : draw a persistent band over the
// whole enclosing block, from its opening brace line through its closing
// brace line (VS Code-style bracket-scope highlight). Double-clicking
// anything else (a key, value, etc.) is left as a normal word-select.
$rawInput.addEventListener('dblclick', () => {
  const text = $rawInput.value;
  const pos = $rawInput.selectionStart;
  const isBracket = (ch) => ch === '{' || ch === '}' || ch === '[' || ch === ']';
  let bracketOffset = -1;
  if (isBracket(text[pos])) bracketOffset = pos;
  else if (isBracket(text[pos - 1])) bracketOffset = pos - 1;

  if (bracketOffset === -1) {
    showBlockHighlight(text, null);
    return;
  }
  const range = findEnclosingBlockRange(text, bracketOffset);
  showBlockHighlight(text, range);
});

// Any plain click (not part of the double-click) dismisses the band.
$rawInput.addEventListener('click', () => {
  showBlockHighlight($rawInput.value, null);
});

$('#btn-clear').addEventListener('click', () => {
  $rawInput.value = '';
  state.raw = '';
  tryParse('');
  updateHighlight();
  showBlockHighlight(state.raw, null);
  renderStateView();
  updateExportButtonMode();
});

$('#btn-format').addEventListener('click', () => {
  tryParse($rawInput.value);
  if (state.parsed === undefined) return;
  const pretty = JSON.stringify(state.parsed, null, 2);
  $rawInput.value = pretty;
  state.raw = pretty;
  updateHighlight();
  showBlockHighlight(state.raw, null);
  renderStateView();
  updateExportButtonMode();
});

// The download/export button doubles as an upload button when the Raw JSON
// editor is empty — exporting nothing is a dead action, so give that click
// somewhere useful to go instead.
const $btnExport = $('#btn-export');
const $iconExportDownload = $('#icon-export-download');
const $iconExportUpload = $('#icon-export-upload');
const $fileUploadInput = $('#file-upload-input');

function updateExportButtonMode() {
  const isEmpty = !state.raw.trim();
  $btnExport.title = isEmpty ? 'Upload JSON file' : 'Export JSON as file';
  $iconExportDownload.classList.toggle('hidden', isEmpty);
  $iconExportUpload.classList.toggle('hidden', !isEmpty);
}

$btnExport.addEventListener('click', () => {
  if (!state.raw.trim()) {
    $fileUploadInput.click();
    return;
  }
  if (state.parsed === undefined) return;
  const blob = new Blob([JSON.stringify(state.parsed, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `json-viewer-${Date.now()}.json`;
  a.click();
});

$fileUploadInput.addEventListener('change', () => {
  const file = $fileUploadInput.files[0];
  $fileUploadInput.value = ''; // allow re-selecting the same file later
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    $rawInput.value = text;
    state.raw = text;
    tryParse(text);
    updateHighlight();
    showBlockHighlight(state.raw, null);
    renderStateView();
    updateExportButtonMode();
  };
  reader.readAsText(file);
});

$('#btn-copy-raw').addEventListener('click', (e) => {
  copyToClipboard($rawInput.value, e.currentTarget);
});

$('#btn-copy-tree').addEventListener('click', (e) => {
  const text = state.parsed !== undefined ? JSON.stringify(state.parsed, null, 2) : '';
  copyToClipboard(text, e.currentTarget);
});

$('#btn-copy-chart').addEventListener('click', (e) => {
  const text = state.parsed !== undefined ? JSON.stringify(state.parsed, null, 2) : '';
  copyToClipboard(text, e.currentTarget);
});

// Filtering re-walks the whole tree to find matches, so debounce it — otherwise
// every keystroke in a large document re-runs a full subtree scan + rebuild.
const renderStateViewDebounced = debounce(renderStateView, 150);
$search.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  if (state.activeTab === 'state') renderStateViewDebounced();
});

document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
    // renderStateView() shows a "Loading…" placeholder immediately and defers
    // any expensive rebuild (e.g. a large Tree) to the next frame itself, so
    // the tab switch always paints right away instead of looking stuck.
    renderStateView();
    closeTabOverflowMenu();
  });
});

// ─── Responsive tab overflow: move tabs that don't fit into a "More" menu ──────
const $stateTabs = document.getElementById('state-tabs');
const $tabOverflow = document.getElementById('tab-overflow');
const $tabOverflowBtn = document.getElementById('tab-overflow-btn');
const $tabOverflowMenu = document.getElementById('tab-overflow-menu');
// Fixed left-to-right order of the real tabs, independent of where each one
// currently lives (inline in the bar, or moved into the overflow menu).
const _allTabBtns = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));

function closeTabOverflowMenu() {
  $tabOverflowMenu.classList.add('hidden');
}

function openTabOverflowMenu() {
  // Anchor the (fixed-position) menu under the "More" button — computed here
  // rather than in CSS since the menu lives outside #state-tabs now.
  const rect = $tabOverflowBtn.getBoundingClientRect();
  $tabOverflowMenu.style.top = `${rect.bottom}px`;
  $tabOverflowMenu.style.left = 'auto';
  $tabOverflowMenu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
  $tabOverflowMenu.classList.remove('hidden');
}

$tabOverflowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if ($tabOverflowMenu.classList.contains('hidden')) openTabOverflowMenu();
  else closeTabOverflowMenu();
});

document.addEventListener('click', (e) => {
  // The menu is rendered as a sibling of #tab-overflow (not nested inside it)
  // so its fixed positioning isn't clipped by #state-tabs — check both.
  if (!$tabOverflow.contains(e.target) && !$tabOverflowMenu.contains(e.target)) {
    closeTabOverflowMenu();
  }
});

/** Move every tab back inline, then push back-to-front any that don't fit into the menu. */
function layoutTabOverflow() {
  $tabOverflow.classList.add('hidden');
  _allTabBtns.forEach(btn => $stateTabs.insertBefore(btn, $tabOverflow));

  // Available width excludes the overflow control itself; reserve its width
  // up front so adding it back later never itself causes another overflow.
  const containerWidth = $stateTabs.clientWidth;
  const overflowBtnWidth = $tabOverflowBtn.offsetWidth || 34;

  let used = 0;
  let firstOverflowIndex = -1;
  for (let i = 0; i < _allTabBtns.length; i++) {
    used += _allTabBtns[i].offsetWidth;
    const budget = i < _allTabBtns.length - 1 ? containerWidth - overflowBtnWidth : containerWidth;
    if (used > budget) { firstOverflowIndex = i; break; }
  }

  if (firstOverflowIndex === -1) return; // everything fits, nothing to move

  $tabOverflow.classList.remove('hidden');
  $tabOverflowMenu.replaceChildren();
  for (let i = firstOverflowIndex; i < _allTabBtns.length; i++) {
    $tabOverflowMenu.appendChild(_allTabBtns[i]);
  }
}

const layoutTabOverflowThrottled = rafThrottle(layoutTabOverflow);
new ResizeObserver(layoutTabOverflowThrottled).observe($stateTabs);
layoutTabOverflow();
