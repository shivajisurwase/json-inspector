// ─── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Wire up a line-numbered, syntax-highlighted textarea overlay — the same
 * gutter/highlight/auto-grow technique used by the Raw JSON editor, factored
 * out so the Diff tab's two panes can each get one without duplicating it.
 */
function createMiniEditor(suffix) {
  const input = document.getElementById(`diff-input-${suffix}`);
  const highlight = document.querySelector(`#diff-highlight-${suffix} code`);
  const gutterInner = document.querySelector(`#diff-gutter-${suffix} .diff-gutter-inner`);
  const scroll = document.getElementById(`diff-scroll-${suffix}`);

  function update() {
    const text = input.value;
    highlight.replaceChildren(highlightJson(text));
    const lineCount = text.length ? text.split('\n').length : 1;
    const lines = [];
    for (let i = 1; i <= lineCount; i++) lines.push(i);
    gutterInner.textContent = lines.join('\n');
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  function syncScroll() {
    gutterInner.style.transform = `translateY(${-scroll.scrollTop}px)`;
  }

  input.addEventListener('input', update);
  scroll.addEventListener('scroll', syncScroll);

  return { input, update };
}

const diffEditorA = createMiniEditor('a');
const diffEditorB = createMiniEditor('b');

/**
 * Flatten a JSON value into a Map of dot/bracket path -> primitive-or-marker.
 * Objects/arrays are recursed into; only leaf values are compared directly,
 * so reordered keys or differing whitespace never register as a change.
 */
function flattenJson(value, path, out) {
  if (value === null || typeof value !== 'object') {
    out.set(path, value);
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) { out.set(path, '[]'); return; }
    value.forEach((v, i) => flattenJson(v, `${path}[${i}]`, out));
    return;
  }
  const keys = Object.keys(value);
  if (!keys.length) { out.set(path, '{}'); return; }
  keys.forEach(k => flattenJson(value[k], path ? `${path}.${k}` : k, out));
}

/** Structural diff: compares two parsed JSON values path-by-path. */
function diffJson(a, b) {
  const flatA = new Map(); flattenJson(a, '', flatA);
  const flatB = new Map(); flattenJson(b, '', flatB);

  const allPaths = new Set([...flatA.keys(), ...flatB.keys()]);
  const rows = []; // { path, status: 'same'|'added'|'removed'|'changed', from, to }

  for (const path of allPaths) {
    const inA = flatA.has(path);
    const inB = flatB.has(path);
    if (inA && !inB) rows.push({ path, status: 'removed', from: flatA.get(path) });
    else if (!inA && inB) rows.push({ path, status: 'added', to: flatB.get(path) });
    else {
      const va = flatA.get(path), vb = flatB.get(path);
      if (JSON.stringify(va) !== JSON.stringify(vb)) rows.push({ path, status: 'changed', from: va, to: vb });
    }
  }

  rows.sort((r1, r2) => r1.path.localeCompare(r2.path, undefined, { numeric: true }));
  return rows;
}

function diffValueLabel(v) {
  if (v === undefined) return '';
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

function renderDiffResult(rows) {
  const $result = document.getElementById('diff-result');
  const $body = document.getElementById('diff-result-body');
  const $summary = document.getElementById('diff-summary');
  $body.replaceChildren();

  let added = 0, removed = 0;

  if (!rows.length) {
    $result.classList.remove('hidden');
    const same = document.createElement('div');
    same.className = 'diff-row diff-row-same';
    same.textContent = 'No differences — the two JSON values are structurally identical.';
    $body.appendChild(same);
    $summary.replaceChildren();
    return;
  }

  rows.forEach(row => {
    if (row.status === 'changed') {
      const from = document.createElement('div');
      from.className = 'diff-row diff-row-removed';
      from.textContent = `${row.path}: ${diffValueLabel(row.from)}`;
      const to = document.createElement('div');
      to.className = 'diff-row diff-row-added';
      to.textContent = `${row.path}: ${diffValueLabel(row.to)}`;
      $body.append(from, to);
      removed++; added++;
    } else if (row.status === 'removed') {
      const el = document.createElement('div');
      el.className = 'diff-row diff-row-removed';
      el.textContent = `${row.path}: ${diffValueLabel(row.from)}`;
      $body.appendChild(el);
      removed++;
    } else if (row.status === 'added') {
      const el = document.createElement('div');
      el.className = 'diff-row diff-row-added';
      el.textContent = `${row.path}: ${diffValueLabel(row.to)}`;
      $body.appendChild(el);
      added++;
    }
  });

  $result.classList.remove('hidden');
  $summary.replaceChildren();
  const plus = document.createElement('span');
  plus.className = 'diff-count diff-count-added';
  plus.textContent = `+${added}`;
  const minus = document.createElement('span');
  minus.className = 'diff-count diff-count-removed';
  minus.textContent = `-${removed}`;
  $summary.append(plus, ' / ', minus);
}

/** Toggle the red border + "required" message under a Diff pane. */
function setDiffFieldInvalid(suffix, invalid) {
  document.getElementById(`diff-editor-${suffix}`).classList.toggle('is-invalid', invalid);
  document.getElementById(`diff-error-${suffix}`).classList.toggle('hidden', !invalid);
}

// Clear the required-field state for a pane as soon as the user types in it.
diffEditorA.input.addEventListener('input', () => setDiffFieldInvalid('a', false));
diffEditorB.input.addEventListener('input', () => setDiffFieldInvalid('b', false));

$('#btn-diff-compare').addEventListener('click', () => {
  const rawA = diffEditorA.input.value.trim();
  const rawB = diffEditorB.input.value.trim();

  const aMissing = !rawA;
  const bMissing = !rawB;
  setDiffFieldInvalid('a', aMissing);
  setDiffFieldInvalid('b', bMissing);
  if (aMissing || bMissing) return;

  let a, b;
  try { a = JSON.parse(rawA); }
  catch (err) { renderDiffError('Original JSON', err.message); return; }
  try { b = JSON.parse(rawB); }
  catch (err) { renderDiffError('Modified JSON', err.message); return; }

  renderDiffResult(diffJson(a, b));
});

function renderDiffError(which, message) {
  const $result = document.getElementById('diff-result');
  const $body = document.getElementById('diff-result-body');
  const $summary = document.getElementById('diff-summary');
  $result.classList.remove('hidden');
  $body.replaceChildren();
  const err = document.createElement('div');
  err.className = 'diff-row diff-row-error';
  err.textContent = `${which} is invalid — ${message}`;
  $body.appendChild(err);
  $summary.replaceChildren();
}

$('#btn-diff-clear').addEventListener('click', () => {
  diffEditorA.input.value = '';
  diffEditorB.input.value = '';
  diffEditorA.update();
  diffEditorB.update();
  setDiffFieldInvalid('a', false);
  setDiffFieldInvalid('b', false);
  document.getElementById('diff-result').classList.add('hidden');
  document.getElementById('diff-summary').replaceChildren();
});

$('#btn-copy-diff-a').addEventListener('click', (e) => {
  copyToClipboard(diffEditorA.input.value, e.currentTarget);
});
$('#btn-copy-diff-b').addEventListener('click', (e) => {
  copyToClipboard(diffEditorB.input.value, e.currentTarget);
});

diffEditorA.update();
diffEditorB.update();
