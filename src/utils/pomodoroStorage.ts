// Lightweight Pomodoro session tracking (localStorage based).
// Records every completed focus session so we can show stats per task and per day.

export interface PomodoroSession {
  id: string;
  taskId?: string;
  type: 'focus' | 'break';
  startedAt: number;     // ms epoch
  completedAt: number;   // ms epoch
  durationSec: number;   // actual duration that elapsed
}

export interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number; // every N focus sessions
  soundEnabled: boolean;
}

const SESSIONS_KEY = 'pomodoro:sessions';
const SETTINGS_KEY = 'pomodoro:settings';

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  soundEnabled: true,
};

export const loadPomodoroSettings = (): PomodoroSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_POMODORO_SETTINGS;
    return { ...DEFAULT_POMODORO_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_POMODORO_SETTINGS;
  }
};

export const savePomodoroSettings = (s: PomodoroSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
};

export const loadPomodoroSessions = (): PomodoroSession[] => {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

export const addPomodoroSession = (s: Omit<PomodoroSession, 'id'>): PomodoroSession => {
  const session: PomodoroSession = { ...s, id: `pomo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  const all = loadPomodoroSessions();
  all.push(session);
  // keep last 1000 to bound storage
  const trimmed = all.length > 1000 ? all.slice(-1000) : all;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
  } catch {}
  window.dispatchEvent(new CustomEvent('pomodoro:session', { detail: session }));
  return session;
};

const isSameDay = (a: number, b: number) => {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
};

export interface PomodoroStats {
  todayFocusedSec: number;
  todayPomodoros: number;
  taskPomodoros: number;
  taskFocusedSec: number;
}

export const getPomodoroStats = (taskId?: string): PomodoroStats => {
  const sessions = loadPomodoroSessions();
  const now = Date.now();
  let todayFocusedSec = 0;
  let todayPomodoros = 0;
  let taskPomodoros = 0;
  let taskFocusedSec = 0;
  for (const s of sessions) {
    if (s.type !== 'focus') continue;
    if (isSameDay(s.completedAt, now)) {
      todayFocusedSec += s.durationSec;
      todayPomodoros += 1;
    }
    if (taskId && s.taskId === taskId) {
      taskPomodoros += 1;
      taskFocusedSec += s.durationSec;
    }
  }
  return { todayFocusedSec, todayPomodoros, taskPomodoros, taskFocusedSec };
};

export const formatPomodoroDuration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
