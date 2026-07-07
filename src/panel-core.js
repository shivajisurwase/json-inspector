/**
 * panel-core.js — runs inside the DevTools panel iframe.
 * Shared state, DOM refs, Raw JSON editor (syntax highlighting, gutter,
 * parsing/stats), and view switching between tabs.
 */

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  raw: '',           // last-parsed raw JSON text
  parsed: undefined,  // parsed JSON value, or undefined if invalid/empty
  activeTab: 'raw',
  searchQuery: '',
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $rawEditor    = $('#raw-editor');
const $rawInput      = $('#raw-input');
const $rawHighlight  = $('#raw-highlight code');
const $rawGutterInner= $('#raw-gutter-inner');
const $rawEditorScroll = $('#raw-editor-scroll');
const $rawBlockHighlight = $('#raw-block-highlight');
const $stateContent= $('#state-content');
const $parseError  = $('#parse-error');
const $search      = $('#search');

// ─── Syntax highlighting (Raw JSON editor) ───────────────────────────────────
const JSON_TOKEN_RE = /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;

/** Build a DocumentFragment of highlighted JSON tokens — no innerHTML (AMO safe). */
function highlightJson(text) {
  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  JSON_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = JSON_TOKEN_RE.exec(text))) {
    const match = m[0];
    if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
    let cls = 'hl-num';
    if (/^"/.test(match)) {
      cls = /:\s*$/.test(match) ? 'hl-key' : 'hl-str';
    } else if (/true|false/.test(match)) {
      cls = 'hl-bool';
    } else if (/null/.test(match)) {
      cls = 'hl-null';
    }
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = match;
    frag.appendChild(span);
    lastIndex = m.index + match.length;
  }
  if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  return frag;
}

function updateGutter(text) {
  const lineCount = text.length ? text.split('\n').length : 1;
  const lines = [];
  for (let i = 1; i <= lineCount; i++) lines.push(i);
  $rawGutterInner.textContent = lines.join('\n');
}

function updateHighlight() {
  const text = $rawInput.value;
  $rawHighlight.replaceChildren(highlightJson(text));
  updateGutter(text);
  // Grow the (invisible) textarea to fit its content so the highlight layer,
  // textarea, and gutter all scroll together as one unit inside #raw-editor-scroll.
  $rawInput.style.height = 'auto';
  $rawInput.style.height = `${$rawInput.scrollHeight}px`;
}

function syncEditorScroll() {
  $rawGutterInner.style.transform = `translateY(${-$rawEditorScroll.scrollTop}px)`;
}

/**
 * Given raw JSON text and a cursor offset, find the { }/[ ] block enclosing
 * that position and return a selection range expanded to full lines, so the
 * opening/closing brace lines are included — like VS Code's block select.
 * Returns null if the cursor isn't inside any object/array.
 */
function findEnclosingBlockRange(text, offset) {
  const stack = [];
  let inString = false;
  let escaped = false;
  let openIndex = -1;
  let closeIndex = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(i);
    } else if (ch === '}' || ch === ']') {
      const start = stack.pop();
      if (start === undefined) continue;
      if (start <= offset && offset <= i && (openIndex === -1 || start > openIndex)) {
        openIndex = start;
        closeIndex = i;
      }
    }
  }

  if (openIndex === -1) return null;

  const lineStart = text.lastIndexOf('\n', openIndex) + 1;
  const nextNewline = text.indexOf('\n', closeIndex);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;

  return { start: lineStart, end: lineEnd };
}

// Must match #raw-highlight/#raw-input's line-height and top padding in panel-tree.css.
const RAW_LINE_HEIGHT = 20;
const RAW_PADDING_TOP = 12;

/** Draw a persistent band over the lines spanned by [start, end), or hide it. */
function showBlockHighlight(text, range) {
  if (!range) {
    $rawBlockHighlight.classList.add('hidden');
    return;
  }
  const firstLine = text.slice(0, range.start).split('\n').length - 1;
  const lineCount = text.slice(range.start, range.end).split('\n').length;

  $rawBlockHighlight.style.top = `${RAW_PADDING_TOP + firstLine * RAW_LINE_HEIGHT}px`;
  $rawBlockHighlight.style.height = `${lineCount * RAW_LINE_HEIGHT}px`;
  $rawBlockHighlight.classList.remove('hidden');
}

// ─── Parsing ──────────────────────────────────────────────────────────────────
function tryParse(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    state.parsed = undefined;
    showStatus(null);
    return;
  }
  try {
    state.parsed = JSON.parse(trimmed);
    showStatus({ ok: true, stats: computeJsonStats(state.parsed, trimmed) });
  } catch (err) {
    state.parsed = undefined;
    showStatus({ ok: false, message: err.message });
  }
}

/** Walk a parsed JSON value and collect size/shape stats for the status bar. */
function computeJsonStats(value, rawText) {
  let keys = 0, objects = 0, arrays = 0, maxDepth = 0;

  function walk(v, depth) {
    if (depth > maxDepth) maxDepth = depth;
    if (Array.isArray(v)) {
      arrays++;
      v.forEach(child => walk(child, depth + 1));
    } else if (v !== null && typeof v === 'object') {
      objects++;
      const ks = Object.keys(v);
      keys += ks.length;
      ks.forEach(k => walk(v[k], depth + 1));
    }
  }
  walk(value, 0);

  return {
    bytes: new Blob([rawText]).size,
    keys,
    depth: maxDepth,
    objects,
    arrays,
  };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Render the Raw JSON status bar: null hides it, otherwise shows valid/invalid state. */
function showStatus(result) {
  $parseError.replaceChildren();
  if (!result) {
    $parseError.classList.add('hidden');
    return;
  }

  $parseError.classList.remove('hidden');
  $parseError.classList.toggle('is-valid', result.ok);
  $parseError.classList.toggle('is-invalid', !result.ok);

  const icon = document.createElement('span');
  icon.className = 'status-icon';
  icon.textContent = result.ok ? '✓' : '✕';

  const label = document.createElement('span');
  label.className = 'status-label';

  if (result.ok) {
    const { bytes, keys, depth, objects, arrays } = result.stats;
    label.textContent = 'Valid JSON';
    const details = document.createElement('span');
    details.className = 'status-details';
    details.textContent =
      `${formatBytes(bytes)} • ${keys} key${keys === 1 ? '' : 's'} • depth ${depth}` +
      ` • ${objects} object${objects === 1 ? '' : 's'} • ${arrays} array${arrays === 1 ? '' : 's'}`;
    $parseError.append(icon, label, details);
  } else {
    label.textContent = `Invalid JSON — ${result.message}`;
    $parseError.append(icon, label);
  }
}

// ─── View switching ─────────────────────────────────────────────────────────────
function renderStateView() {
  const $treeWrap = document.getElementById('tree-view-wrap');
  const $chartWrap = document.getElementById('chart-view-wrap');
  const $timer = document.getElementById('timer-content');
  const $repair = document.getElementById('repair-content');
  const $diff = document.getElementById('diff-content');
  const $escape = document.getElementById('escape-content');

  // The filter box only applies to the Tree tab — hide it everywhere else.
  $search.classList.toggle('hidden', state.activeTab !== 'state');

  $rawEditor.classList.add('hidden');
  $treeWrap.classList.add('hidden');
  $chartWrap.classList.add('hidden');
  $timer.classList.add('hidden');
  $repair.classList.add('hidden');
  $diff.classList.add('hidden');
  $escape.classList.add('hidden');

  if (state.activeTab === 'raw') {
    $rawEditor.classList.remove('hidden');
    updateHighlight();
    return;
  }

  if (state.activeTab === 'chart') {
    $chartWrap.classList.remove('hidden');
    renderChart();
    return;
  }

  if (state.activeTab === 'timer') {
    $timer.classList.remove('hidden');
    renderTimer();
    return;
  }

  if (state.activeTab === 'repair') {
    $repair.classList.remove('hidden');
    return;
  }

  if (state.activeTab === 'diff') {
    $diff.classList.remove('hidden');
    return;
  }

  if (state.activeTab === 'escape') {
    $escape.classList.remove('hidden');
    return;
  }

  // Tree tab
  $treeWrap.classList.remove('hidden');
  $stateContent.textContent = '';

  if (state.parsed === undefined) {
    const hint = document.createElement('span');
    hint.style.color = 'var(--text3)';
    hint.textContent = state.raw.trim() ? 'Fix the JSON in the Raw JSON tab to see the tree' : 'Paste JSON in the Raw JSON tab to get started';
    $stateContent.appendChild(hint);
    return;
  }

  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    if (!subtreeHasMatch(state.parsed, q)) {
      const empty = document.createElement('div');
      empty.className = 'diff-empty';
      empty.textContent = `No properties match "${state.searchQuery.trim()}"`;
      $stateContent.appendChild(empty);
    } else {
      $stateContent.appendChild(buildJsonTree(state.parsed, 0, q));
    }
  } else {
    $stateContent.appendChild(buildJsonTree(state.parsed));
  }
}
