// ─── JSON Path Finder ────────────────────────────────────────────────────────
// Resolves a simple dot/bracket path (e.g. $.users[0].name, data.items[2].id,
// $['odd key'].value) against the parsed JSON from the Raw JSON tab. Supports:
//   - optional leading $ (with or without a following dot)
//   - dot property access: a.b.c
//   - bracket array index: a[0], a[0][1]
//   - bracket quoted key (handles dots/spaces in the key itself): a['b.c'], a["key with spaces"]
// Does not support wildcards (*), recursive descent (..), slices, or filters.

const $pathInput      = document.getElementById('path-input');
const $btnPathFind    = document.getElementById('btn-path-find');
const $btnPathCopy    = document.getElementById('btn-path-copy');
const $pathError      = document.getElementById('path-error');
const $pathResultWrap = document.getElementById('path-result-wrap');
const $pathResult     = document.querySelector('#path-result code');

/**
 * Tokenize a path string into a list of property-access steps.
 * Throws with a human-readable message on malformed syntax.
 */
function parseJsonPath(path) {
  let s = path.trim();
  if (!s) throw new Error('Enter a path to look up.');

  // A leading $ refers to the document root; optional dot right after it.
  if (s[0] === '$') s = s.slice(1);
  if (s[0] === '.') s = s.slice(1);

  const steps = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (ch === '.') {
      i++;
      continue;
    }

    if (ch === '[') {
      const close = s.indexOf(']', i);
      if (close === -1) throw new Error(`Missing closing "]" in path near position ${i}.`);
      const inner = s.slice(i + 1, close).trim();

      if (
        (inner.startsWith("'") && inner.endsWith("'") && inner.length >= 2) ||
        (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2)
      ) {
        steps.push({ type: 'key', value: inner.slice(1, -1) });
      } else if (/^-?\d+$/.test(inner)) {
        steps.push({ type: 'index', value: parseInt(inner, 10) });
      } else if (inner === '') {
        throw new Error('Empty [] in path — expected an index or a quoted key.');
      } else {
        throw new Error(`Unsupported bracket segment "[${inner}]" — use [0] for an index or ['key'] for a key.`);
      }
      i = close + 1;
      continue;
    }

    // Bare identifier segment, up to the next . or [
    let j = i;
    while (j < s.length && s[j] !== '.' && s[j] !== '[') j++;
    const segment = s.slice(i, j);
    if (!segment) throw new Error(`Unexpected character "${ch}" in path.`);
    steps.push({ type: 'key', value: segment });
    i = j;
  }

  if (!steps.length) throw new Error('Enter a path to look up, e.g. $.users[0].name');
  return steps;
}

/** Walk `steps` against `root`, returning the resolved value or throwing on a missing/invalid segment. */
function resolveJsonPath(root, steps) {
  let cur = root;
  let traversed = '$';

  for (const step of steps) {
    if (cur === null || cur === undefined) {
      throw new Error(`${traversed} is ${cur === null ? 'null' : 'undefined'} — cannot read "${step.value}" from it.`);
    }

    if (step.type === 'index') {
      if (!Array.isArray(cur)) {
        throw new Error(`${traversed} is not an array — cannot use [${step.value}] on it.`);
      }
      const idx = step.value < 0 ? cur.length + step.value : step.value;
      if (idx < 0 || idx >= cur.length) {
        throw new Error(`Index [${step.value}] is out of range for ${traversed} (length ${cur.length}).`);
      }
      cur = cur[idx];
      traversed += `[${step.value}]`;
    } else {
      if (typeof cur !== 'object' || Array.isArray(cur)) {
        throw new Error(`${traversed} is not an object — cannot read property "${step.value}" from it.`);
      }
      if (!Object.prototype.hasOwnProperty.call(cur, step.value)) {
        throw new Error(`Property "${step.value}" does not exist on ${traversed}.`);
      }
      cur = cur[step.value];
      traversed += /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(step.value) ? `.${step.value}` : `['${step.value}']`;
    }
  }

  return cur;
}

let lastFoundValue;
let hasLastFoundValue = false;

function showPathError(message) {
  $pathError.textContent = message;
  $pathError.classList.remove('hidden');
  $pathResultWrap.classList.add('hidden');
  $pathInput.classList.add('no-match');
  $btnPathCopy.disabled = true;
  hasLastFoundValue = false;
}

function showPathResult(value) {
  $pathError.classList.add('hidden');
  $pathInput.classList.remove('no-match');

  const isPrimitive = value === null || typeof value !== 'object';
  $pathResult.textContent = isPrimitive ? formatPrimitive(value) : JSON.stringify(value, null, 2);
  $pathResultWrap.classList.remove('hidden');

  lastFoundValue = value;
  hasLastFoundValue = true;
  $btnPathCopy.disabled = false;
}

function formatPrimitive(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  return String(v);
}

function runPathFind() {
  if (state.parsed === undefined) {
    showPathError('No valid JSON to search — paste JSON in the Raw JSON tab first.');
    return;
  }
  try {
    const steps = parseJsonPath($pathInput.value);
    const value = resolveJsonPath(state.parsed, steps);
    showPathResult(value);
  } catch (err) {
    showPathError(err.message);
  }
}

$btnPathFind.addEventListener('click', runPathFind);

$pathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runPathFind();
  }
});

// Live evaluation as you type, debounced so a fast typist isn't re-parsing
// and re-walking the tree on every single keystroke. The Find button and
// Enter key (above) still work too, resolving immediately with no delay.
const runPathFindDebounced = debounce(runPathFind, 150);
$pathInput.addEventListener('input', () => {
  if (!$pathInput.value.trim()) {
    $pathError.classList.add('hidden');
    $pathResultWrap.classList.add('hidden');
    $pathInput.classList.remove('no-match');
    $btnPathCopy.disabled = true;
    hasLastFoundValue = false;
    return;
  }
  runPathFindDebounced();
});

$btnPathCopy.addEventListener('click', (e) => {
  if (!hasLastFoundValue) return;
  const text = typeof lastFoundValue === 'object' && lastFoundValue !== null
    ? JSON.stringify(lastFoundValue, null, 2)
    : formatPrimitive(lastFoundValue);
  copyToClipboard(text, e.currentTarget);
});
