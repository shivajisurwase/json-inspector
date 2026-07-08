/**
 * panel-tree.js — Tree tab: DevTools-style property search/filter and
 * the JSON tree DOM builder. Depends on panel-core.js ($, state).
 */

// ─── State property search ────────────────────────────────────────────────────
/**
 * DevTools-style filter: a node "matches" if its own key or primitive value
 * contains the query. Ancestors of a match are shown collapsed to a one-line
 * `{ k: v, ... }` / `[ ..., ... ]` summary instead of being hidden, and the
 * matching row itself is shown expanded with the matched substring highlighted.
 */
function primitiveMatches(val, q) {
  if (val === null || val === undefined) return 'null'.includes(q);
  return String(val).toLowerCase().includes(q);
}

/** Returns true if this key/value pair itself is a direct match (not via descendants). */
function isDirectMatch(key, val, q) {
  if (key !== undefined && String(key).toLowerCase().includes(q)) return true;
  if (val === null || typeof val !== 'object') return primitiveMatches(val, q);
  return false;
}

/** Returns true if `node` or anything inside it matches `q`. */
function subtreeHasMatch(node, q) {
  if (node === null || typeof node !== 'object') return primitiveMatches(node, q);
  const entries = Array.isArray(node) ? node.map((v, i) => [i, v]) : Object.entries(node);
  return entries.some(([k, v]) => isDirectMatch(k, v, q) || subtreeHasMatch(v, q));
}

/** One-line `{ k: v, k2: v2, ... }` / `[ v, v2, ... ]` summary of a node's direct children. */
function summarizeInline(node) {
  const short = (v) => {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return `"${v.length > 24 ? v.slice(0, 24) + '…' : v}"`;
    if (typeof v === 'object') return Array.isArray(v) ? '[…]' : '{…}';
    return String(v);
  };
  if (Array.isArray(node)) {
    const parts = node.slice(0, 4).map(short);
    if (node.length > 4) parts.push('…');
    return `[ ${parts.join(', ')} ]`;
  }
  const keys = Object.keys(node);
  const parts = keys.slice(0, 4).map(k => `${k}: ${short(node[k])}`);
  if (keys.length > 4) parts.push('…');
  return `{ ${parts.join(', ')} }`;
}

function itemCountLabel(v) {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length;
  return `${n} item${n === 1 ? '' : 's'}`;
}

function jtArrowIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('points', '5,3 19,12 5,21');
  svg.appendChild(poly);
  return svg;
}

// Above this many entries, a level renders in batches with a "Show more" row
// instead of all at once — keeps a 10,000-item array from creating 10,000
// live DOM rows the instant its parent is expanded.
const JT_BATCH_SIZE = 200;

/**
 * Build the tree DOM. Without `query`, renders everything normally, fully
 * expanded. With `query`, only rows that match (or contain a match) are
 * shown: a non-matching ancestor collapses to a one-line summary, and
 * matching rows are shown expanded with the matched substring highlighted.
 *
 * Children are built eagerly (so the tree opens fully expanded, like
 * before) — the JT_BATCH_SIZE cap below is what keeps a huge array/object
 * from creating tens of thousands of DOM rows at once, not laziness.
 */
function buildJsonTree(obj, depth = 0, query = null) {
  const ul = document.createElement('ul');
  ul.className = 'json-tree';

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'jt-row';
    row.appendChild(renderPrimitive(obj, query));
    li.appendChild(row);
    ul.appendChild(li);
    return ul;
  }

  const entries = Array.isArray(obj)
    ? obj.map((v, i) => [i, v])
    : Object.entries(obj);

  appendJsonTreeBatch(ul, entries, 0, depth, query);
  return ul;
}

/** Append entries[start:start+JT_BATCH_SIZE] to `ul`, with a "Show more" row if more remain. */
function appendJsonTreeBatch(ul, entries, start, depth, query) {
  const end = query ? entries.length : Math.min(start + JT_BATCH_SIZE, entries.length);

  for (let idx = start; idx < end; idx++) {
    const [k, v] = entries[idx];
    const isObj = v !== null && typeof v === 'object';

    if (query) {
      const directMatch = isDirectMatch(k, v, query);
      const descendantMatch = isObj && !directMatch && subtreeHasMatch(v, query);
      if (!directMatch && !descendantMatch) continue; // no match anywhere in this branch — skip entirely

      if (isObj && !directMatch && descendantMatch) {
        // Ancestor doesn't match itself but contains a match — show as a
        // one-line, non-interactive summary, then drill into the matches below.
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'jt-row jt-summary-row';
        const spacer = document.createElement('span');
        spacer.className = 'jt-arrow';
        row.appendChild(spacer);
        row.appendChild(createKeyLabel(k, query));
        const summary = document.createElement('span');
        summary.className = 'jt-summary';
        summary.textContent = summarizeInline(v);
        row.appendChild(summary);
        li.appendChild(row);

        const children = buildJsonTree(v, depth + 1, query);
        children.className = 'jt-children json-tree';
        li.appendChild(children);
        ul.appendChild(li);
        continue;
      }
    }

    const li = document.createElement('li');

    if (isObj) {
      const row = document.createElement('div');
      row.className = 'jt-row';

      const header = document.createElement('span');
      header.className = 'jt-collapsible';

      const arrow = document.createElement('span');
      arrow.className = 'jt-arrow';
      arrow.appendChild(jtArrowIcon());
      header.appendChild(arrow);

      header.appendChild(createKeyLabel(k, query));

      const brace = document.createElement('span');
      brace.className = 'jt-brace';
      brace.textContent = Array.isArray(v) ? '[' : '{';
      header.appendChild(brace);

      const count = document.createElement('span');
      count.className = 'jt-count';
      count.textContent = itemCountLabel(v);
      header.appendChild(count);

      row.appendChild(header);
      li.appendChild(row);

      const children = buildJsonTree(v, depth + 1, query);
      children.className = 'jt-children json-tree';
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        children.classList.toggle('hidden');
      });
      li.appendChild(children);
    } else {
      const row = document.createElement('div');
      row.className = 'jt-row';
      const spacer = document.createElement('span');
      spacer.className = 'jt-arrow';
      row.appendChild(spacer);
      row.appendChild(createKeyLabel(k, query));
      row.appendChild(renderPrimitive(v, query));
      li.appendChild(row);
    }
    ul.appendChild(li);
  }

  if (end < entries.length) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jt-show-more';
    const remaining = entries.length - end;
    btn.textContent = `Show ${Math.min(JT_BATCH_SIZE, remaining)} more (${remaining} left)…`;
    btn.addEventListener('click', () => {
      li.remove();
      appendJsonTreeBatch(ul, entries, end, depth, query);
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

/** Wrap the substring of `text` matching `query` (case-insensitive) in a highlight span. */
function appendHighlighted(el, text, query) {
  if (!query) { el.appendChild(document.createTextNode(text)); return; }
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) { el.appendChild(document.createTextNode(text)); return; }
  el.appendChild(document.createTextNode(text.slice(0, idx)));
  const mark = document.createElement('mark');
  mark.className = 'jt-highlight';
  mark.textContent = text.slice(idx, idx + query.length);
  el.appendChild(mark);
  el.appendChild(document.createTextNode(text.slice(idx + query.length)));
}

function renderPrimitive(v, query = null) {
  const span = document.createElement('span');
  if (typeof v === 'string') { span.className = 'jt-str'; appendHighlighted(span, `"${v}"`, query); }
  else if (typeof v === 'number') { span.className = 'jt-num'; appendHighlighted(span, String(v), query); }
  else if (typeof v === 'boolean') { span.className = 'jt-bool'; appendHighlighted(span, String(v), query); }
  else if (v === null) { span.className = 'jt-null'; appendHighlighted(span, 'null', query); }
  else { span.className = 'jt-null'; appendHighlighted(span, String(v), query); }
  return span;
}

function createKeyLabel(k, query = null) {
  const frag = document.createDocumentFragment();
  const key = document.createElement('span');
  key.className = 'jt-key';
  appendHighlighted(key, String(k), query);
  const sep = document.createElement('span');
  sep.className = 'jt-brace';
  sep.textContent = ': ';
  frag.append(key, sep);
  return frag;
}
