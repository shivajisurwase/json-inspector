// ─── Repair JSON ──────────────────────────────────────────────────────────────
const $repairInput   = $('#repair-input');
const $repairOutput  = $('#repair-output code');
const $repairCharCount = $('#repair-char-count');
const $repairStatus  = $('#repair-status');
const $repairLog     = $('#repair-log');
const $repairLogList = $('#repair-log-list');

/**
 * Attempt to fix common "almost JSON" mistakes, tracking a human-readable
 * log of what was changed. Order matters — comments/quotes are normalized
 * before structural fixes (commas, truncation) run.
 */
function repairJson(text) {
  const fixes = [];
  let s = text;

  // 1. Strip // and /* */ comments
  const withoutLineComments = s.replace(/("(\\.|[^"\\])*")|\/\/.*$/gm, (m, str) => str !== undefined ? str : '');
  const withoutBlockComments = withoutLineComments.replace(/("(\\.|[^"\\])*")|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
  if (withoutBlockComments !== s) fixes.push('Removed comments');
  s = withoutBlockComments;

  // 2. Convert single-quoted strings to double-quoted
  const singleQuoted = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, inner) => `"${inner.replace(/"/g, '\\"')}"`);
  if (singleQuoted !== s) fixes.push('Converted single quotes to double quotes');
  s = singleQuoted;

  // 3. Quote unquoted object keys: { key: 1 } → { "key": 1 }
  const quotedKeys = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  if (quotedKeys !== s) fixes.push('Added quotes to unquoted keys');
  s = quotedKeys;

  // 4. Remove trailing commas: {"a":1,} / [1,2,] → {"a":1} / [1,2]
  const noTrailingCommas = s.replace(/,(\s*[}\]])/g, '$1');
  if (noTrailingCommas !== s) fixes.push('Removed trailing commas');
  s = noTrailingCommas;

  // 5. Insert missing commas between adjacent values: "a":1 "b":2 → "a":1, "b":2
  const withCommas = s.replace(/("(?:\\.|[^"\\])*"|\d|true|false|null|\]|\})(\s+)(")/g, (m, a, ws, b) => {
    if (ws.includes('\n')) return `${a},${ws}${b}`;
    return `${a},${ws}${b}`;
  });
  if (withCommas !== s) fixes.push('Added missing commas');
  s = withCommas;

  // 6. Close unterminated/truncated structures by balancing brackets & quotes
  s = s.trimEnd();
  const openQuotes = (s.match(/(?:^|[^\\])"/g) || []).length;
  if (openQuotes % 2 !== 0) {
    s += '"';
    fixes.push('Closed an unterminated string');
  }
  s = s.replace(/,\s*$/, ''); // trailing comma left dangling by truncation
  const stack = [];
  for (const ch of s) {
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (stack.length) {
    s += stack.reverse().map(ch => (ch === '{' ? '}' : ']')).join('');
    fixes.push('Closed truncated braces/brackets');
  }

  return { text: s, fixes };
}

function updateRepairCharCount() {
  $repairCharCount.textContent = `${$repairInput.value.length} chars`;
}

function renderRepairLog(fixes) {
  $repairLogList.replaceChildren();
  if (!fixes.length) {
    $repairLog.classList.add('hidden');
    return;
  }
  $repairLog.classList.remove('hidden');
  fixes.forEach(f => {
    const li = document.createElement('li');
    li.textContent = f;
    $repairLogList.appendChild(li);
  });
}

function setRepairStatus(kind, message) {
  $repairStatus.className = kind ? kind : '';
  $repairStatus.textContent = message || '';
}

/** Toggle the red border + "required" message under the Broken JSON pane. */
function setRepairInputInvalid(invalid) {
  document.getElementById('repair-editor-wrap-input').classList.toggle('is-invalid', invalid);
  document.getElementById('repair-error-input').classList.toggle('hidden', !invalid);
}

$repairInput.addEventListener('input', () => {
  updateRepairCharCount();
  setRepairInputInvalid(false);
});

$('#btn-repair').addEventListener('click', () => {
  const raw = $repairInput.value;
  if (!raw.trim()) {
    setRepairInputInvalid(true);
    setRepairStatus('', '');
    $repairOutput.textContent = '';
    renderRepairLog([]);
    return;
  }
  setRepairInputInvalid(false);

  const { text: repaired, fixes } = repairJson(raw);

  try {
    const parsed = JSON.parse(repaired);
    const pretty = JSON.stringify(parsed, null, 2);
    $repairOutput.replaceChildren(highlightJson(pretty));
    setRepairStatus('success', fixes.length ? 'Repair successful!' : 'Already valid JSON');
    renderRepairLog(fixes);
  } catch (err) {
    $repairOutput.textContent = '';
    setRepairStatus('error', `Could not repair — ${err.message}`);
    renderRepairLog(fixes);
  }
});

$('#repair-copy-input').addEventListener('click', (e) => {
  copyToClipboard($repairInput.value, e.currentTarget);
});

$('#repair-copy-output').addEventListener('click', (e) => {
  copyToClipboard($repairOutput.textContent, e.currentTarget);
});

updateRepairCharCount();
