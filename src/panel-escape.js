// ─── Escape / Stringify ─────────────────────────────────────────────────────────

const $escapeInput       = document.getElementById('escape-input');
const $escapeHighlightIn = document.querySelector('#escape-highlight-in code');
const $escapeGutterIn    = document.querySelector('#escape-gutter-in .diff-gutter-inner');
const $escapeScrollIn    = document.getElementById('escape-scroll-in');
const $escapeHighlightOut= document.querySelector('#escape-highlight-out code');
const $escapeGutterOut   = document.querySelector('#escape-gutter-out .diff-gutter-inner');

// Gutters only need rebuilding when the line count actually changes — most
// keystrokes don't add/remove a line — mirroring updateGutter() in panel-core.js.
const _escapeGutterLineCounts = new WeakMap();
function updateEscapeGutter(gutterEl, text) {
  const lineCount = countLines(text);
  if (_escapeGutterLineCounts.get(gutterEl) === lineCount) return;
  _escapeGutterLineCounts.set(gutterEl, lineCount);
  const lines = new Array(lineCount);
  for (let i = 0; i < lineCount; i++) lines[i] = i + 1;
  gutterEl.textContent = lines.join('\n');
}

// Same incremental (line-diffed) highlighter as the Raw JSON/Diff editors —
// re-tokenizing and rebuilding the whole textarea on every keystroke is what
// made this tab hang on large input; only changed lines are rebuilt now.
const updateEscapeHighlightIn = createIncrementalHighlighter($escapeHighlightIn);

function updateEscapeInput() {
  const text = $escapeInput.value;
  updateEscapeHighlightIn(text);
  updateEscapeGutter($escapeGutterIn, text);
  $escapeInput.style.height = 'auto';
  $escapeInput.style.height = `${$escapeInput.scrollHeight}px`;
}

// rAF-throttled so a burst of keystrokes or a large paste repaints at most
// once per animation frame instead of once per keystroke.
const updateEscapeInputThrottled = rafThrottle(updateEscapeInput);

let escapeOutputText = '';

function setEscapeOutput(text) {
  escapeOutputText = text;
  $escapeHighlightOut.textContent = text;
  updateEscapeGutter($escapeGutterOut, text);
}

$escapeInput.addEventListener('input', () => {
  updateEscapeInputThrottled();
  updateEscapeRunLabel();
  document.getElementById('escape-editor-in').classList.remove('is-invalid');
  document.getElementById('escape-error-in').classList.add('hidden');
});

$escapeScrollIn.addEventListener('scroll', () => {
  $escapeGutterIn.style.transform = `translateY(${-$escapeScrollIn.scrollTop}px)`;
});

document.getElementById('escape-scroll-out').addEventListener('scroll', function () {
  $escapeGutterOut.style.transform = `translateY(${-this.scrollTop}px)`;
});

/** True if `text` looks like a JSON string literal — starts/ends with a quote. */
function looksLikeEscapedString(text) {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"');
}

const $escapeRunBtn = $('#btn-escape-run');

/** Swap the run button's label to match what it'll actually do to the current input. */
function updateEscapeRunLabel() {
  $escapeRunBtn.textContent = looksLikeEscapedString($escapeInput.value) ? 'Parse JSON' : 'Stringify JSON';
}

$escapeRunBtn.addEventListener('click', () => {
  const raw = $escapeInput.value.trim();
  const $editorIn = document.getElementById('escape-editor-in');
  const $errorIn = document.getElementById('escape-error-in');

  if (!raw) {
    $editorIn.classList.add('is-invalid');
    $errorIn.classList.remove('hidden');
    setEscapeOutput('');
    return;
  }
  $editorIn.classList.remove('is-invalid');
  $errorIn.classList.add('hidden');

  if (looksLikeEscapedString(raw)) {
    // Input looks like an escaped JSON string literal — unescape it back to JSON.
    try {
      const unescaped = JSON.parse(raw);
      if (typeof unescaped !== 'string') throw new Error('not a string literal');
      try {
        setEscapeOutput(JSON.stringify(JSON.parse(unescaped), null, 2));
      } catch {
        setEscapeOutput(unescaped); // valid string, but not JSON inside — show as-is
      }
      return;
    } catch (_) {
      // Fall through to treating it as plain JSON to stringify instead.
    }
  }

  // Default: treat input as JSON and escape/stringify it.
  try {
    const parsed = JSON.parse(raw);
    setEscapeOutput(JSON.stringify(JSON.stringify(parsed)));
  } catch (err) {
    $editorIn.classList.add('is-invalid');
    $errorIn.textContent = `Invalid JSON — ${err.message}`;
    $errorIn.classList.remove('hidden');
    setEscapeOutput('');
  }
});

$('#btn-escape-clear').addEventListener('click', () => {
  $escapeInput.value = '';
  updateEscapeInput();
  updateEscapeRunLabel();
  setEscapeOutput('');
  document.getElementById('escape-editor-in').classList.remove('is-invalid');
  document.getElementById('escape-error-in').classList.add('hidden');
});

$('#btn-copy-escape-in').addEventListener('click', (e) => {
  copyToClipboard($escapeInput.value, e.currentTarget);
});
$('#btn-copy-escape-out').addEventListener('click', (e) => {
  copyToClipboard(escapeOutputText, e.currentTarget);
});

updateEscapeInput();
updateEscapeRunLabel();
setEscapeOutput('');
