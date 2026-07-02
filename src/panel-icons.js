// ─── Icons & Copy-to-clipboard ─────────────────────────────────────────────────

// ── SVG DOM builders (no innerHTML — AMO safe) ───────────────────────────────
const _SVG = 'http://www.w3.org/2000/svg';

function _mkSvg(w, h, fill, sw, children) {
  const s = document.createElementNS(_SVG, 'svg');
  s.setAttribute('width', String(w));   s.setAttribute('height', String(h));
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', fill);
  if (sw) {
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', String(sw));
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  }
  children.forEach(([tag, attrs]) => {
    const el = document.createElementNS(_SVG, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    s.appendChild(el);
  });
  return s;
}

function iconCopy() {
  return _mkSvg(14, 14, 'none', 2, [
    ['rect',  { x:'9', y:'9', width:'13', height:'13', rx:'2' }],
    ['path',  { d:'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }],
  ]);
}
function iconCheck() {
  return _mkSvg(14, 14, 'none', 2.5, [
    ['polyline', { points:'20 6 9 17 4 12' }],
  ]);
}
function iconPlay() {
  return _mkSvg(12, 12, 'currentColor', null, [
    ['polygon', { points:'5 3 19 12 5 21 5 3' }],
  ]);
}
function iconPause() {
  return _mkSvg(12, 12, 'currentColor', null, [
    ['rect', { x:'6',  y:'5', width:'4', height:'14' }],
    ['rect', { x:'14', y:'5', width:'4', height:'14' }],
  ]);
}
function iconReset() {
  return _mkSvg(12, 12, 'none', 2, [
    ['polyline', { points:'1 4 1 10 7 10' }],
    ['path',     { d:'M3.51 15a9 9 0 1 0 .49-3.5' }],
  ]);
}
function iconLap() {
  return _mkSvg(12, 12, 'none', 2, [
    ['path', { d:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' }],
    ['line', { x1:'4', y1:'22', x2:'4', y2:'15' }],
  ]);
}

let _copyToastTimer = null;

function _setBtnIcon(btn, svgNode) {
  const label = btn.querySelector('span');
  btn.textContent = ''; // clears children safely
  btn.appendChild(svgNode);
  if (label) btn.appendChild(label);
}

/** Show the "copied" toast and, if a button triggered the copy, flash its icon/border green. */
function showCopyToast(btn) {
  const toast = document.getElementById('copy-toast');
  if (btn) {
    _setBtnIcon(btn, iconCheck());
    btn.classList.add('btn-copy-success');
  }
  toast.classList.add('visible');
  clearTimeout(_copyToastTimer);
  _copyToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    if (btn) {
      _setBtnIcon(btn, iconCopy());
      btn.classList.remove('btn-copy-success');
    }
  }, 2000);
}

/** Copy `text` to the clipboard, flashing `btn` (if given) to confirm success. */
function copyToClipboard(text, btn) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showCopyToast(btn))
      .catch(() => fallbackCopy(text, btn));
  } else {
    fallbackCopy(text, btn);
  }
}

function fallbackCopy(text, btn) {
  // execCommand fallback for restricted contexts
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopyToast(btn);
  } catch (_) {
    console.warn('[JSON Inspector] Copy failed');
  }
}
