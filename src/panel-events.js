// ─── Event Listeners (Raw JSON editor, toolbar buttons, search, tabs) ──────────
$rawInput.addEventListener('input', (e) => {
  state.raw = e.target.value;
  tryParse(state.raw);
  updateHighlight();
  showBlockHighlight(state.raw, null);
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
});

$('#btn-export').addEventListener('click', () => {
  if (state.parsed === undefined) return;
  const blob = new Blob([JSON.stringify(state.parsed, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `json-viewer-${Date.now()}.json`;
  a.click();
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

$search.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  if (state.activeTab === 'state') renderStateView();
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderStateView();
  });
});
