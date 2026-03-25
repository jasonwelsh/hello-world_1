/**
 * hello_world_1 — Core Timer Engine
 * Countdown logic, phase sequencing, session tracking
 */

// ── Constants ──────────────────────────────────────────────────────────────

const PHASE = {
  FOCUS:       "focus",
  SHORT_BREAK: "short_break",
  LONG_BREAK:  "long_break",
};

const PHASE_LABEL = {
  [PHASE.FOCUS]:       "Focus",
  [PHASE.SHORT_BREAK]: "Short Break",
  [PHASE.LONG_BREAK]:  "Long Break",
};

const STORAGE_KEY_STATE    = "hw1_timer_state";
const STORAGE_KEY_SETTINGS = "hw1_timer_settings";

// ── Default Settings ───────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  focusMinutes:       25,
  shortBreakMinutes:  5,
  longBreakMinutes:   15,
  sessionsBeforeLong: 4,
};

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  // Timer
  phase:             PHASE.FOCUS,
  secondsLeft:       DEFAULT_SETTINGS.focusMinutes * 60,
  totalSeconds:      DEFAULT_SETTINGS.focusMinutes * 60,
  isRunning:         false,
  intervalId:        null,

  // Session tracking
  completedSessions: 0,   // focus sessions completed today
  sessionDate:       null, // date string for day-rollover reset

  // Settings (mirrors DEFAULT_SETTINGS, overridden by localStorage)
  settings: { ...DEFAULT_SETTINGS },
};

// ── Persistence ────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (_) {}
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.settings));
}

function loadSessionState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const today = new Date().toDateString();
    // Reset session count on day rollover
    state.completedSessions = saved.date === today ? (saved.completedSessions || 0) : 0;
    state.sessionDate = today;
  } catch (_) {}
}

function saveSessionState() {
  localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({
    completedSessions: state.completedSessions,
    date:              new Date().toDateString(),
  }));
}

// ── Phase Sequencing ───────────────────────────────────────────────────────

/**
 * Determine the next phase after the current one completes.
 * Focus → break (short or long depending on session count).
 * Break → Focus.
 */
function nextPhase() {
  if (state.phase === PHASE.FOCUS) {
    state.completedSessions++;
    saveSessionState();
    const isLong = state.completedSessions % state.settings.sessionsBeforeLong === 0;
    return isLong ? PHASE.LONG_BREAK : PHASE.SHORT_BREAK;
  }
  return PHASE.FOCUS;
}

function durationForPhase(phase) {
  switch (phase) {
    case PHASE.FOCUS:       return state.settings.focusMinutes       * 60;
    case PHASE.SHORT_BREAK: return state.settings.shortBreakMinutes  * 60;
    case PHASE.LONG_BREAK:  return state.settings.longBreakMinutes   * 60;
  }
}

function transitionToPhase(phase) {
  state.phase       = phase;
  state.secondsLeft = durationForPhase(phase);
  state.totalSeconds = state.secondsLeft;
}

// ── Audio ──────────────────────────────────────────────────────────────────

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      const t    = ctx.currentTime + i * 0.22;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.06);
      gain.gain.linearRampToValueAtTime(0,    t + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch (_) {}
}

// ── Countdown Engine ───────────────────────────────────────────────────────

function tick() {
  if (state.secondsLeft <= 0) {
    stopTimer();
    playChime();
    const next = nextPhase();
    transitionToPhase(next);
    render();
    return;
  }
  state.secondsLeft--;
  render();
}

function startTimer() {
  if (state.isRunning) return;
  state.isRunning  = true;
  state.intervalId = setInterval(tick, 1000);
  render();
}

function pauseTimer() {
  if (!state.isRunning) return;
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.isRunning  = false;
  render();
}

function stopTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.isRunning  = false;
}

function resetTimer() {
  stopTimer();
  state.secondsLeft  = durationForPhase(state.phase);
  state.totalSeconds = state.secondsLeft;
  render();
}

function toggleTimer() {
  state.isRunning ? pauseTimer() : startTimer();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function progressPercent() {
  if (state.totalSeconds === 0) return 0;
  return (state.secondsLeft / state.totalSeconds) * 100;
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
  const $ = (id) => document.getElementById(id);

  // Timer display
  const display = $("timer-display");
  if (display) display.textContent = formatTime(state.secondsLeft);

  // Phase label
  const label = $("phase-label");
  if (label) label.textContent = PHASE_LABEL[state.phase];

  // Progress bar
  const bar = $("progress-bar");
  if (bar) bar.style.width = progressPercent() + "%";

  // Start/Pause button
  const startBtn = $("start-btn");
  if (startBtn) startBtn.textContent = state.isRunning ? "Pause" : "Start";

  // Running state on card
  const card = $("timer-card");
  if (card) card.classList.toggle("running", state.isRunning);

  // Body phase class
  document.body.dataset.phase = state.phase;

  // Session dots
  renderSessionDots();

  // Browser title
  document.title = `${formatTime(state.secondsLeft)} — ${PHASE_LABEL[state.phase]}`;
}

function renderSessionDots() {
  const container = document.getElementById("session-dots");
  if (!container) return;

  const cap   = state.settings.sessionsBeforeLong;
  const done  = state.completedSessions % cap;

  // Rebuild only when dot count changes
  if (container.children.length !== cap) {
    container.innerHTML = "";
    for (let i = 0; i < cap; i++) {
      const dot = document.createElement("span");
      dot.className = "session-dot";
      container.appendChild(dot);
    }
  }

  Array.from(container.children).forEach((dot, i) => {
    dot.classList.toggle("filled", i < done);
  });

  const countEl = document.getElementById("session-count");
  if (countEl) countEl.textContent = `${done} / ${cap}`;
}

// ── Settings Panel ─────────────────────────────────────────────────────────

function applySettingsFromForm() {
  const get = (id, fallback) => parseInt(document.getElementById(id)?.value) || fallback;
  state.settings.focusMinutes       = get("set-focus",    DEFAULT_SETTINGS.focusMinutes);
  state.settings.shortBreakMinutes  = get("set-short",    DEFAULT_SETTINGS.shortBreakMinutes);
  state.settings.longBreakMinutes   = get("set-long",     DEFAULT_SETTINGS.longBreakMinutes);
  state.settings.sessionsBeforeLong = get("set-sessions", DEFAULT_SETTINGS.sessionsBeforeLong);
  saveSettings();

  // Live-update timer only when not running and in focus phase
  if (!state.isRunning && state.phase === PHASE.FOCUS) {
    state.secondsLeft  = state.settings.focusMinutes * 60;
    state.totalSeconds = state.secondsLeft;
  }
  render();
}

function populateSettingsForm() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  set("set-focus",    state.settings.focusMinutes);
  set("set-short",    state.settings.shortBreakMinutes);
  set("set-long",     state.settings.longBreakMinutes);
  set("set-sessions", state.settings.sessionsBeforeLong);
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  loadSettings();
  loadSessionState();

  // Set initial timer from (possibly loaded) settings
  state.secondsLeft  = state.settings.focusMinutes * 60;
  state.totalSeconds = state.secondsLeft;

  // Bind controls
  document.getElementById("start-btn")?.addEventListener("click", toggleTimer);
  document.getElementById("reset-btn")?.addEventListener("click", resetTimer);
  document.getElementById("settings-toggle")?.addEventListener("click", () => {
    document.getElementById("settings-panel")?.classList.toggle("open");
  });

  // Settings inputs
  document.querySelectorAll(".settings-panel input[type='number']").forEach((inp) => {
    inp.addEventListener("change", applySettingsFromForm);
  });

  // Keyboard shortcut: Space = toggle timer
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    toggleTimer();
  });

  populateSettingsForm();
  render();
}

document.addEventListener("DOMContentLoaded", init);
