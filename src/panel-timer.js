// ─── Timer ────────────────────────────────────────────────────────────────────

const timerState = {
  startTime:       0,     // Date.now() snapshot when last started
  elapsed:         0,     // accumulated ms (saved on pause)
  isRunning:       false,
  intervalId:      null,
  laps:            [],    // { num, split, total }
  lapBase:         0,     // elapsed at the start of current lap
};

function timerFormatMs(ms) {
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10); // centiseconds (2 digits)
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

function timerCurrentMs() {
  return timerState.isRunning
    ? Date.now() - timerState.startTime
    : timerState.elapsed;
}

function timerTick() {
  const el = document.getElementById('timer-display');
  if (el) el.textContent = timerFormatMs(timerCurrentMs());
}

function timerSyncButtons() {
  const btnSS  = document.getElementById('timer-btn-ss');
  const btnLap = document.getElementById('timer-btn-lap');
  if (!btnSS) return;

  const ssLabel = document.createElement('span');
  if (timerState.isRunning) {
    ssLabel.textContent = 'Stop';
    btnSS.textContent = '';
    btnSS.appendChild(iconPause());
    btnSS.appendChild(ssLabel);
    btnSS.className = 'timer-btn timer-btn-stop';
    btnLap.disabled = false;
  } else {
    ssLabel.textContent = timerState.elapsed > 0 ? 'Resume' : 'Start';
    btnSS.textContent = '';
    btnSS.appendChild(iconPlay());
    btnSS.appendChild(ssLabel);
    btnSS.className = 'timer-btn timer-btn-start';
    btnLap.disabled = true;
  }
}

function timerStart() {
  timerState.startTime = Date.now() - timerState.elapsed;
  timerState.isRunning = true;
  timerState.intervalId = setInterval(timerTick, 47);
  timerTick();
  timerSyncButtons();
}

function timerStop() {
  timerState.elapsed = timerCurrentMs();
  timerState.isRunning = false;
  clearInterval(timerState.intervalId);
  timerTick();
  timerSyncButtons();
}

function timerReset() {
  clearInterval(timerState.intervalId);
  Object.assign(timerState, { startTime:0, elapsed:0, isRunning:false, intervalId:null, laps:[], lapBase:0 });
  timerTick();
  timerSyncButtons();
  timerRenderLaps();
}

function timerLap() {
  if (!timerState.isRunning) return;
  const total = timerCurrentMs();
  const split = total - timerState.lapBase;
  timerState.laps.push({ num: timerState.laps.length + 1, split, total });
  timerState.lapBase = total;
  timerRenderLaps();
}

function timerRenderLaps() {
  const list = document.getElementById('timer-laps');
  if (!list) return;

  if (!timerState.laps.length) {
    const empty = document.createElement('div');
    empty.className = 'timer-no-laps';
    empty.textContent = 'No laps yet — press Lap while running';
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren();
  const header = document.createElement('div');
  header.className = 'timer-lap-header';
  ['#', 'Split', 'Total'].forEach(label => {
    const span = document.createElement('span');
    span.textContent = label;
    header.appendChild(span);
  });
  list.appendChild(header);

  // Newest lap on top
  [...timerState.laps].reverse().forEach((lap, idx) => {
    const row = document.createElement('div');
    const isLatest = idx === 0;
    row.className = 'timer-lap-row' + (isLatest ? ' timer-lap-latest' : '');
    const numEl = document.createElement('span');
    numEl.className = 'timer-lap-num';
    numEl.textContent = `Lap ${lap.num}`;
    const splitEl = document.createElement('span');
    splitEl.className = 'timer-lap-split';
    splitEl.textContent = `+${timerFormatMs(lap.split)}`;
    const totalEl = document.createElement('span');
    totalEl.className = 'timer-lap-total';
    totalEl.textContent = timerFormatMs(lap.total);
    row.appendChild(numEl);
    row.appendChild(splitEl);
    row.appendChild(totalEl);
    list.appendChild(row);
  });
}

function renderTimer() {
  const $c = document.getElementById('timer-content');

  // Build DOM only once — subsequent calls just sync state
  if ($c.dataset.built) {
    timerTick();
    timerSyncButtons();
    timerRenderLaps();
    return;
  }
  $c.dataset.built = '1';

  // Build entire timer DOM with createElement — no innerHTML (AMO safe)
  const wrap = document.createElement('div');
  wrap.className = 'timer-wrap';

  // Display
  const dispWrap = document.createElement('div');
  dispWrap.className = 'timer-display-wrap';
  const labelEl = document.createElement('div');
  labelEl.className = 'timer-label';
  labelEl.textContent = 'ELAPSED';
  const dispEl = document.createElement('div');
  dispEl.id = 'timer-display';
  dispEl.className = 'timer-display';
  dispEl.textContent = '00:00.00';
  dispWrap.appendChild(labelEl);
  dispWrap.appendChild(dispEl);

  // Controls
  const controls = document.createElement('div');
  controls.className = 'timer-controls';

  const btnSS = document.createElement('button');
  btnSS.id = 'timer-btn-ss';
  btnSS.className = 'timer-btn timer-btn-start';
  btnSS.appendChild(iconPlay());
  const ssSpan = document.createElement('span'); ssSpan.textContent = 'Start';
  btnSS.appendChild(ssSpan);

  const btnReset = document.createElement('button');
  btnReset.id = 'timer-btn-reset';
  btnReset.className = 'timer-btn timer-btn-reset';
  btnReset.appendChild(iconReset());
  const resetSpan = document.createElement('span'); resetSpan.textContent = 'Reset';
  btnReset.appendChild(resetSpan);

  const btnLap = document.createElement('button');
  btnLap.id = 'timer-btn-lap';
  btnLap.className = 'timer-btn timer-btn-lap';
  btnLap.disabled = true;
  btnLap.appendChild(iconLap());
  const lapSpan = document.createElement('span'); lapSpan.textContent = 'Lap';
  btnLap.appendChild(lapSpan);

  controls.appendChild(btnSS);
  controls.appendChild(btnReset);
  controls.appendChild(btnLap);

  // Laps list
  const lapsEl = document.createElement('div');
  lapsEl.id = 'timer-laps';
  lapsEl.className = 'timer-laps';

  wrap.appendChild(dispWrap);
  wrap.appendChild(controls);
  wrap.appendChild(lapsEl);
  $c.appendChild(wrap);

  btnSS.addEventListener('click', () => {
    timerState.isRunning ? timerStop() : timerStart();
  });
  btnReset.addEventListener('click', timerReset);
  btnLap.addEventListener('click', timerLap);

  timerTick();
  timerSyncButtons();
  timerRenderLaps();
}
