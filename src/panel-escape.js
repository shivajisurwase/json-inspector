// ─── Escape / Stringify ─────────────────────────────────────────────────────────

const $escapeInput       = document.getElementById('escape-input');
const $escapeHighlightIn = document.querySelector('#escape-highlight-in code');
const $escapeGutterIn    = document.querySelector('#escape-gutter-in .diff-gutter-inner');
const $escapeScrollIn    = document.getElementById('escape-scroll-in');
const $escapeHighlightOut= document.querySelector('#escape-highlight-out code');
const $escapeGutterOut   = document.querySelector('#escape-gutter-out .diff-gutter-inner');

function updateEscapeGutter(gutterEl, text) {
  const lineCount = text.length ? text.split('\n').length : 1;
  const lines = [];
  for (let i = 1; i <= lineCount; i++) lines.push(i);
  gutterEl.textContent = lines.join('\n');
}

function updateEscapeInput() {
  const text = $escapeInput.value;
  $escapeHighlightIn.replaceChildren(highlightJson(text));
  updateEscapeGutter($escapeGutterIn, text);
  $escapeInput.style.height = 'auto';
  $escapeInput.style.height = `${$escapeInput.scrollHeight}px`;
}

let escapeOutputText = '';

function setEscapeOutput(text) {
  escapeOutputText = text;
  $escapeHighlightOut.textContent = text;
  updateEscapeGutter($escapeGutterOut, text);
}

$escapeInput.addEventListener('input', () => {
  updateEscapeInput();
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

$('#btn-escape-run').addEventListener('click', () => {
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
setEscapeOutput('');
