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

/**
 * Build the tree DOM. Without `query`, renders everything normally.
 * With `query`, only rows that match (or contain a match) are shown: a
 * non-matching ancestor collapses to a one-line summary, and matching
 * rows are shown expanded with the matched substring highlighted.
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

  entries.forEach(([k, v]) => {
    const isObj = v !== null && typeof v === 'object';

    if (query) {
      const directMatch = isDirectMatch(k, v, query);
      const descendantMatch = isObj && !directMatch && subtreeHasMatch(v, query);
      if (!directMatch && !descendantMatch) return; // no match anywhere in this branch — skip entirely

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
        return;
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

      const children = buildJsonTree(v, depth + 1, query);
      children.className = 'jt-children json-tree';
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        children.classList.toggle('hidden');
      });
      li.appendChild(row);
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
  });

  return ul;
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
