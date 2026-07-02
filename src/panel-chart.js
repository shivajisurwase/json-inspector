// ─── Chart ────────────────────────────────────────────────────────────────────

const chartCollapsed = new Set();

const CHART = {
  colW:    140,   // px per depth level
  rowH:    26,    // px between sibling rows (tighter)
  r:       5,     // node circle radius (smaller dots)
  padX:    24,    // left/right padding
  padY:    18,    // top/bottom padding
  labelGap: 8,   // gap between circle edge and label text
  maxLabel: 18,  // chars before truncation
  labelW:  130,  // reserved px for rightmost column labels
};

/**
 * Convert a JSON value into a recursive { name, path, isLeaf, children[] } tree.
 * path is dot-separated and used as the collapse/expand key.
 */
function buildStateTree(obj, name, path = '') {
  const nodePath = path ? `${path}.${name}` : name;
  // Primitive / null — leaf
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return { name, path: nodePath, isLeaf: true, valueType: typeof obj, rawValue: obj, children: [] };
  }
  // Array
  if (Array.isArray(obj)) {
    if (!obj.length) return { name, path: nodePath, isLeaf: true, valueType: 'array', rawValue: '[]', children: [] };
    return { name, path: nodePath, isLeaf: false, children: obj.slice(0, 20).map((v, i) => buildStateTree(v, `[${i}]`, nodePath)) };
  }
  // Plain object
  const entries = Object.entries(obj);
  if (!entries.length) return { name, path: nodePath, isLeaf: true, valueType: 'object', rawValue: '{}', children: [] };
  return { name, path: nodePath, isLeaf: false, children: entries.map(([k, v]) => buildStateTree(v, k, nodePath)) };
}

/**
 * Assign .col, .row and .collapsed to every node.
 * Collapsed branch nodes take one row slot; their children are not laid out.
 */
function layoutTree(node, depth, counter) {
  node.col = depth;
  node.collapsed = chartCollapsed.has(node.path);
  if (!node.children.length || node.collapsed) {
    node.row = counter.n++;
  } else {
    for (const child of node.children) layoutTree(child, depth + 1, counter);
    node.row =
      (node.children[0].row + node.children[node.children.length - 1].row) / 2;
  }
}

/** Walk only visible (non-collapsed) nodes — used for SVG bounds. */
function walkTreeVisible(node, fn) {
  fn(node);
  if (!node.collapsed) node.children.forEach(c => walkTreeVisible(c, fn));
}

/** Return the label as-is — full key names, no truncation. */
function truncLabel(s) {
  return s;
}

/** Return [displayString, cssTypeSuffix] for a leaf value — full value, no truncation. */
function formatLeafValue(v, type) {
  if (v === null || v === undefined) return ['null', 'null'];
  if (type === 'array' || type === 'object') return [String(v), 'dim'];
  if (type === 'boolean') return [String(v), 'bool'];
  if (type === 'number') return [String(v), 'num'];
  if (type === 'function') return ['ƒ()', 'dim'];
  if (type === 'string') return [`"${v}"`, 'str'];
  return [String(v), 'dim'];
}

/**
 * Main chart renderer — builds SVG tree and injects into #chart-content.
 */
function renderChart() {
  const $c = document.getElementById('chart-content');
  $c.replaceChildren();

  if (state.parsed === undefined) {
    const msg = document.createElement('div');
    msg.className = 'diff-empty';
    msg.textContent = state.raw.trim() ? 'Fix the JSON in the Raw JSON tab to see the chart' : 'Paste JSON in the Raw JSON tab to get started';
    $c.appendChild(msg);
    return;
  }

  const tree = buildStateTree(state.parsed, 'root');
  const counter = { n: 0 };
  layoutTree(tree, 0, counter);

  // Measure bounds — only visible (non-collapsed) nodes contribute
  let maxCol = 0, maxRow = 0;
  walkTreeVisible(tree, n => {
    if (n.col > maxCol) maxCol = n.col;
    if (n.row > maxRow) maxRow = n.row;
  });

  // Initial SVG dimensions — width is corrected below once labels are measured,
  // since values are shown in full (no truncation) and can be arbitrarily long.
  let svgW = CHART.padX * 2 + (maxCol + 1) * CHART.colW + CHART.labelW;
  const svgH = CHART.padY * 2 + (maxRow + 1) * CHART.rowH;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width',  String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.style.display  = 'block';
  svg.style.overflow = 'visible';

  // Add <defs> for glow filters
  const defs = document.createElementNS(NS, 'defs');
  ['branch', 'leaf'].forEach(kind => {
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', `glow-${kind}`);
    filter.setAttribute('x', '-50%'); filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%'); filter.setAttribute('height', '200%');
    const fe = document.createElementNS(NS, 'feGaussianBlur');
    fe.setAttribute('stdDeviation', '2.5');
    fe.setAttribute('result', 'blur');
    filter.appendChild(fe);
    const feMerge = document.createElementNS(NS, 'feMerge');
    ['blur', 'SourceGraphic'].forEach(inp => {
      const n = document.createElementNS(NS, 'feMergeNode');
      if (inp !== 'SourceGraphic') n.setAttribute('in', inp);
      feMerge.appendChild(n);
    });
    filter.appendChild(feMerge);
    defs.appendChild(filter);
  });
  svg.appendChild(defs);

  // Edge layer (behind nodes)
  const gEdges = document.createElementNS(NS, 'g');
  gEdges.setAttribute('class', 'chart-edges');
  svg.appendChild(gEdges);

  // Node layer
  const gNodes = document.createElementNS(NS, 'g');
  gNodes.setAttribute('class', 'chart-nodes');
  svg.appendChild(gNodes);

  // Pixel helpers
  const px = col => CHART.padX + col * CHART.colW;
  const py = row => CHART.padY + row * CHART.rowH;

  function draw(node) {
    const cx = px(node.col);
    const cy = py(node.row);
    const isBranch  = node.children.length > 0;
    const collapsed = node.collapsed;

    // ── Edges to children (only when expanded) ───────────────────────────────
    if (!collapsed) {
      for (const child of node.children) {
        const cx2 = px(child.col);
        const cy2 = py(child.row);
        const mx  = (cx + cx2) / 2;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute(
          'd',
          `M${cx + CHART.r},${cy} C${mx},${cy} ${mx},${cy2} ${cx2 - CHART.r},${cy2}`
        );
        path.setAttribute('class', 'chart-edge');
        gEdges.appendChild(path);
      }
    }

    // ── Clickable <g> wrapper for branch nodes ───────────────────────────────
    const g = document.createElementNS(NS, 'g');
    if (isBranch) {
      g.style.cursor = 'pointer';
      g.setAttribute('class', 'chart-node-group');
      g.addEventListener('click', () => {
        if (chartCollapsed.has(node.path)) chartCollapsed.delete(node.path);
        else chartCollapsed.add(node.path);
        renderChart();
      });
    }

    // ── Circle ───────────────────────────────────────────────────────────────
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r',  String(CHART.r));
    let circleClass = isBranch ? 'chart-node-branch' : 'chart-node-leaf';
    if (collapsed) circleClass += ' chart-node-collapsed';
    circle.setAttribute('class', circleClass);
    circle.setAttribute('filter', `url(#glow-${isBranch ? 'branch' : 'leaf'})`);
    g.appendChild(circle);

    // ── Label ────────────────────────────────────────────────────────────────
    const lx = cx + CHART.r + CHART.labelGap;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(lx));
    text.setAttribute('y', String(cy));
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'chart-label');

    if (isBranch) {
      // Arrow indicator ▸ (collapsed) or ▾ (expanded)
      const arrow = document.createElementNS(NS, 'tspan');
      arrow.setAttribute('class', 'chart-arrow');
      arrow.textContent = collapsed ? '▸ ' : '▾ ';
      text.appendChild(arrow);

      const nameSpan = document.createElementNS(NS, 'tspan');
      nameSpan.textContent = truncLabel(node.name);
      text.appendChild(nameSpan);

      // Show hidden child count when collapsed
      if (collapsed) {
        const countSpan = document.createElementNS(NS, 'tspan');
        countSpan.setAttribute('class', 'chart-val chart-val-dim');
        countSpan.textContent = `  +${node.children.length}`;
        text.appendChild(countSpan);
      }
    } else {
      // Leaf: key name + inline value
      text.textContent = truncLabel(node.name);
      const [valStr, cls] = formatLeafValue(node.rawValue, node.valueType);
      const tspan = document.createElementNS(NS, 'tspan');
      tspan.setAttribute('class', `chart-val chart-val-${cls}`);
      tspan.textContent = `  ${valStr}`;
      text.appendChild(tspan);
    }

    g.appendChild(text);
    gNodes.appendChild(g);

    // Recurse only into visible (expanded) children
    if (!collapsed) {
      for (const child of node.children) draw(child);
    }
  }

  draw(tree);
  $c.appendChild(svg);

  // Widen the SVG to fit the longest label now that it's measurable in the DOM —
  // values are shown in full, so their rendered width can exceed the initial estimate.
  let maxRight = 0;
  gNodes.querySelectorAll('text.chart-label').forEach(t => {
    const x = parseFloat(t.getAttribute('x')) || 0;
    maxRight = Math.max(maxRight, x + t.getComputedTextLength());
  });
  const neededW = maxRight + CHART.padX;
  if (neededW > svgW) {
    svgW = neededW;
    svg.setAttribute('width', String(svgW));
  }
}
