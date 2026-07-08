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

// ─── Timing helpers ────────────────────────────────────────────────────────────
/** Delay calling `fn` until `ms` have passed with no further calls. */
function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Collapse calls within the same animation frame into one trailing call. */
function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
}

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

/** Count newlines directly instead of allocating a full split() array. */
function countLines(text) {
  if (!text) return 1;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

let _lastGutterLineCount = -1;
function updateGutter(text) {
  const lineCount = countLines(text);
  if (lineCount === _lastGutterLineCount) return; // most keystrokes don't change the line count
  _lastGutterLineCount = lineCount;
  const lines = new Array(lineCount);
  for (let i = 0; i < lineCount; i++) lines[i] = i + 1;
  $rawGutterInner.textContent = lines.join('\n');
}

// ─── Incremental highlight (one <div> per line, only changed lines rebuilt) ───
// Re-tokenizing and rebuilding the *whole* document on every keystroke doesn't
// scale — at a few thousand lines it can't finish inside a frame budget even
// throttled to one repaint per frame. Since a keystroke almost always only
// changes one line (or inserts/deletes a contiguous run of lines), each
// highlighter diffs the new text's lines against what's already on screen and
// patches just those, instead of rebuilding the whole document.
function highlightLine(text) {
  const div = document.createElement('div');
  div.className = 'hl-line';
  div.appendChild(highlightJson(text));
  return div;
}

/** Create an independent incremental highlighter writing into `container`. */
function createIncrementalHighlighter(container) {
  let lineEls = [];   // one <div class="hl-line"> per line currently rendered
  let lineTexts = []; // parallel array of each line's source text, kept in sync with lineEls

  function update(text) {
    const lines = text.split('\n');

    if (lineEls.length === 0) {
      // First render (or after a full reset) — build every line once.
      const frag = document.createDocumentFragment();
      lineEls = lines.map((line) => {
        const div = highlightLine(line);
        frag.appendChild(div);
        return div;
      });
      lineTexts = lines.slice();
      container.replaceChildren(frag);
      return;
    }

    const old = lineEls;
    const oldLineText = lineTexts;

    // Matching prefix/suffix of unchanged lines bounds the edited region — a
    // single keystroke leaves everything outside that region untouched.
    let start = 0;
    const maxStart = Math.min(old.length, lines.length);
    while (start < maxStart && oldLineText[start] === lines[start]) start++;

    let oldEnd = old.length;
    let newEnd = lines.length;
    while (oldEnd > start && newEnd > start && oldLineText[oldEnd - 1] === lines[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    const replacement = document.createDocumentFragment();
    const newEls = [];
    for (let i = start; i < newEnd; i++) {
      const div = highlightLine(lines[i]);
      replacement.appendChild(div);
      newEls.push(div);
    }

    const toRemove = old.slice(start, oldEnd);
    if (toRemove.length) {
      const anchor = toRemove[0];
      anchor.before(replacement);
      toRemove.forEach(el => el.remove());
    } else if (start < old.length) {
      old[start].before(replacement);
    } else {
      container.appendChild(replacement);
    }

    lineEls = old.slice(0, start).concat(newEls, old.slice(oldEnd));
    lineTexts = oldLineText.slice(0, start).concat(lines.slice(start, newEnd), oldLineText.slice(oldEnd));
  }

  return update;
}

const updateRawHighlight = createIncrementalHighlighter($rawHighlight);

function updateHighlight() {
  const text = $rawInput.value;
  updateRawHighlight(text);
  updateGutter(text);
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
/**
 * Parse `text` into `state.parsed` and refresh the status bar. `state.parsed`
 * must always be current (Tree/Chart/etc. read it immediately), so parsing
 * itself never gets debounced — only the more expensive stats walk below does.
 */
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

/** Same as tryParse, but skips the stats walk/status render (still sets state.parsed). */
function tryParseQuiet(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    state.parsed = undefined;
    return;
  }
  try {
    state.parsed = JSON.parse(trimmed);
  } catch (err) {
    state.parsed = undefined;
  }
}

/** Recompute and render the status bar for the current state.raw/state.parsed. */
function refreshStatus() {
  const trimmed = state.raw.trim();
  if (!trimmed) { showStatus(null); return; }
  if (state.parsed === undefined) {
    try {
      JSON.parse(trimmed);
    } catch (err) {
      showStatus({ ok: false, message: err.message });
      return;
    }
  }
  showStatus({ ok: true, stats: computeJsonStats(state.parsed, trimmed) });
}

const refreshStatusDebounced = debounce(refreshStatus, 200);

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
// Bumped on every Tree render request so a stale rAF callback (from a tab
// switch or search edit that's since been superseded) can no-op instead of
// clobbering a newer render.
let _treeRenderToken = 0;

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

  if (state.parsed === undefined) {
    $stateContent.textContent = '';
    const hint = document.createElement('span');
    hint.style.color = 'var(--text3)';
    hint.textContent = state.raw.trim() ? 'Fix the JSON in the Raw JSON tab to see the tree' : 'Paste JSON in the Raw JSON tab to get started';
    $stateContent.appendChild(hint);
    return;
  }

  // Building the tree can take a moment on a large document — show a loading
  // placeholder immediately, then build on the next frame so the browser gets
  // to paint that placeholder first instead of the UI looking frozen.
  $stateContent.textContent = '';
  const loading = document.createElement('div');
  loading.className = 'diff-empty';
  loading.textContent = 'Loading…';
  $stateContent.appendChild(loading);

  const renderToken = ++_treeRenderToken;
  requestAnimationFrame(() => {
    if (renderToken !== _treeRenderToken) return; // a newer render superseded this one

    const q = state.searchQuery.trim().toLowerCase();
    $stateContent.textContent = '';
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
  });
}
