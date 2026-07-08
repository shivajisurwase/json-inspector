// ─── Find & Replace (Raw JSON editor) ───────────────────────────────────────
// Operates directly on $rawInput.value using the native textarea selection
// (same approach as the bracket-block-select feature) — no separate editor
// state to keep in sync, and Ctrl+F/Enter/Esc feel native since they drive
// the real textarea's selection/scroll.

const $findBar         = document.getElementById('find-replace-bar');
const $findInput       = document.getElementById('find-input');
const $findMatchCount  = document.getElementById('find-match-count');
const $findCaseSensitive = document.getElementById('find-case-sensitive');
const $replaceInput    = document.getElementById('replace-input');
const $btnFindPrev     = document.getElementById('btn-find-prev');
const $btnFindNext     = document.getElementById('btn-find-next');
const $btnFindClose    = document.getElementById('btn-find-close');
const $btnReplaceOne   = document.getElementById('btn-replace-one');
const $btnReplaceAll   = document.getElementById('btn-replace-all');

let findMatches = [];   // array of {start, end} offsets into $rawInput.value
let findActiveIndex = -1;

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Recompute match offsets for the current find text/options against the current textarea value. */
function recomputeFindMatches() {
  const query = $findInput.value;
  findMatches = [];
  findActiveIndex = -1;

  if (!query) {
    updateFindUi();
    return;
  }

  const flags = $findCaseSensitive.checked ? 'g' : 'gi';
  const re = new RegExp(escapeRegExp(query), flags);
  const text = $rawInput.value;
  let m;
  while ((m = re.exec(text))) {
    findMatches.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++; // guard against zero-length matches looping forever
  }

  if (findMatches.length) findActiveIndex = 0;
  updateFindUi();
}

/** Select the currently-active match in the textarea and scroll it into view. */
function selectActiveMatch() {
  if (findActiveIndex === -1 || !findMatches[findActiveIndex]) return;
  const { start, end } = findMatches[findActiveIndex];
  $rawInput.focus();
  $rawInput.setSelectionRange(start, end);

  // scrollIntoView isn't available on a text range inside a textarea, so
  // approximate it using the same line-height math as the block-highlight band.
  const before = $rawInput.value.slice(0, start);
  const line = before.split('\n').length - 1;
  const target = RAW_PADDING_TOP + line * RAW_LINE_HEIGHT;
  const viewTop = $rawEditorScroll.scrollTop;
  const viewBottom = viewTop + $rawEditorScroll.clientHeight;
  if (target < viewTop || target > viewBottom - RAW_LINE_HEIGHT) {
    $rawEditorScroll.scrollTop = Math.max(0, target - $rawEditorScroll.clientHeight / 2);
  }
}

function updateFindUi() {
  $findInput.classList.toggle('no-match', !!$findInput.value && findMatches.length === 0);
  $findMatchCount.textContent = !$findInput.value
    ? ''
    : findMatches.length
      ? `${findActiveIndex + 1}/${findMatches.length}`
      : 'No results';
}

function findNext() {
  if (!findMatches.length) return;
  findActiveIndex = (findActiveIndex + 1) % findMatches.length;
  updateFindUi();
  selectActiveMatch();
}

function findPrev() {
  if (!findMatches.length) return;
  findActiveIndex = (findActiveIndex - 1 + findMatches.length) % findMatches.length;
  updateFindUi();
  selectActiveMatch();
}

/** Push a new value into the textarea through the same pipeline every other editor action uses. */
function applyRawTextChange(text) {
  $rawInput.value = text;
  state.raw = text;
  tryParse(text);
  updateHighlight();
  showBlockHighlight(state.raw, null);
  renderStateView();
  updateExportButtonMode();
}

function replaceOne() {
  if (findActiveIndex === -1 || !findMatches[findActiveIndex]) return;
  const { start, end } = findMatches[findActiveIndex];
  const text = $rawInput.value;
  const next = text.slice(0, start) + $replaceInput.value + text.slice(end);
  applyRawTextChange(next);
  recomputeFindMatches();
  // Resume from the same offset so replacing repeatedly steps through matches in order.
  if (findMatches.length) {
    findActiveIndex = findMatches.findIndex(m => m.start >= start);
    if (findActiveIndex === -1) findActiveIndex = 0;
    updateFindUi();
    selectActiveMatch();
  }
}

function replaceAll() {
  if (!findMatches.length) return;
  const query = $findInput.value;
  const flags = $findCaseSensitive.checked ? 'g' : 'gi';
  const re = new RegExp(escapeRegExp(query), flags);
  const next = $rawInput.value.replace(re, $replaceInput.value);
  applyRawTextChange(next);
  recomputeFindMatches();
}

function openFindBar() {
  if (state.activeTab !== 'raw') return;
  $findBar.classList.remove('hidden');
  const selected = $rawInput.value.slice($rawInput.selectionStart, $rawInput.selectionEnd);
  if (selected) $findInput.value = selected;
  $findInput.focus();
  $findInput.select();
  recomputeFindMatches();
  if (findMatches.length) selectActiveMatch();
}

function closeFindBar() {
  $findBar.classList.add('hidden');
}

$btnFindClose.addEventListener('click', closeFindBar);

document.addEventListener('keydown', (e) => {
  const isFindShortcut = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f';
  if (isFindShortcut && state.activeTab === 'raw' && document.activeElement !== $search) {
    e.preventDefault();
    openFindBar();
    return;
  }
  if (e.key === 'Escape' && !$findBar.classList.contains('hidden')) {
    closeFindBar();
  }
});

$findInput.addEventListener('input', () => {
  recomputeFindMatches();
  if (findMatches.length) selectActiveMatch();
});

$findCaseSensitive.addEventListener('change', () => {
  recomputeFindMatches();
  if (findMatches.length) selectActiveMatch();
});

$findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) findPrev(); else findNext();
  } else if (e.key === 'Escape') {
    closeFindBar();
  }
});

$replaceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    replaceOne();
  } else if (e.key === 'Escape') {
    closeFindBar();
  }
});

$btnFindNext.addEventListener('click', findNext);
$btnFindPrev.addEventListener('click', findPrev);
$btnReplaceOne.addEventListener('click', replaceOne);
$btnReplaceAll.addEventListener('click', replaceAll);

// If the user types directly in the editor while Find is open, matches would
// go stale against the new text — recompute (debounced) so counts stay honest.
const recomputeFindMatchesDebounced = debounce(() => {
  if (!$findBar.classList.contains('hidden')) recomputeFindMatches();
}, 200);
$rawInput.addEventListener('input', recomputeFindMatchesDebounced);
