import { useEffect, useState } from 'react';
import { Pause, Play, X, Maximize2 } from 'lucide-react';
import { subscribeFocusBg, emitFocusBgCommand, FocusBgState } from '@/utils/focusBackgroundState';

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
};

export const FocusBackgroundBar = () => {
  const [state, setState] = useState<FocusBgState>({ active: false, running: false });
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeFocusBg(setState), []);
  useEffect(() => {
    if (!state.active || !state.running) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.active, state.running]);

  if (!state.active) return null;

  const remaining = state.running && state.endAt
    ? Math.max(0, Math.floor((state.endAt - Date.now()) / 1000))
    : state.remainingSec ?? 0;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2 rounded-full bg-foreground/95 text-background shadow-lg px-3 py-1.5 backdrop-blur"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
      role="status"
    >
      <button
        onClick={() => emitFocusBgCommand('toggle')}
        className="h-6 w-6 grid place-items-center rounded-full bg-background/20 hover:bg-background/30"
        aria-label={state.running ? 'Pause' : 'Resume'}
      >
        {state.running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </button>
      <button
        onClick={() => emitFocusBgCommand('open')}
        className="text-xs font-medium tabular-nums px-1 flex items-center gap-1.5"
        aria-label="Reopen focus"
        title={state.taskTitle}
      >
        <Maximize2 className="h-3 w-3 opacity-70" />
        Focus {fmt(remaining)}
      </button>
      <button
        onClick={() => emitFocusBgCommand('stop')}
        className="h-6 w-6 grid place-items-center rounded-full bg-background/20 hover:bg-background/30"
        aria-label="Stop focus"
      >
        <X className="h-3 w-3" />
      </button>
      <span className="sr-only">{tick}</span>
    </div>
  );
};
