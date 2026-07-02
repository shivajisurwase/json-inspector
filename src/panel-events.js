// ─── Event Listeners (Raw JSON editor, toolbar buttons, search, tabs) ──────────
$rawInput.addEventListener('input', (e) => {
  state.raw = e.target.value;
  tryParse(state.raw);
  updateHighlight();
});

$rawEditorScroll.addEventListener('scroll', syncEditorScroll);

$('#btn-clear').addEventListener('click', () => {
  $rawInput.value = '';
  state.raw = '';
  tryParse('');
  updateHighlight();
  renderStateView();
});

$('#btn-format').addEventListener('click', () => {
  tryParse($rawInput.value);
  if (state.parsed === undefined) return;
  const pretty = JSON.stringify(state.parsed, null, 2);
  $rawInput.value = pretty;
  state.raw = pretty;
  updateHighlight();
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
