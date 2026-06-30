// Lightweight pub/sub for showing a global "Focus running in background" pill.
// FocusMode publishes; a top-of-app bar subscribes.

export interface FocusBgState {
  active: boolean;
  taskTitle?: string;
  endAt?: number;           // ms epoch (when running)
  remainingSec?: number;    // when paused
  running: boolean;
}

let state: FocusBgState = { active: false, running: false };
const listeners = new Set<(s: FocusBgState) => void>();

export const getFocusBgState = () => state;

export const setFocusBgState = (next: Partial<FocusBgState>) => {
  state = { ...state, ...next };
  for (const l of listeners) {
    try { l(state); } catch {}
  }
};

export const clearFocusBgState = () => setFocusBgState({ active: false, endAt: undefined, remainingSec: undefined, running: false, taskTitle: undefined });

export const subscribeFocusBg = (cb: (s: FocusBgState) => void) => {
  listeners.add(cb);
  cb(state);
  return () => { listeners.delete(cb); };
};

// Request handlers — FocusMode listens to these to reopen / control from the bar.
type Cmd = 'open' | 'toggle' | 'stop';
const cmdListeners = new Set<(c: Cmd) => void>();
export const emitFocusBgCommand = (c: Cmd) => { for (const l of cmdListeners) try { l(c); } catch {} };
export const onFocusBgCommand = (cb: (c: Cmd) => void) => { cmdListeners.add(cb); return () => { cmdListeners.delete(cb); }; };
