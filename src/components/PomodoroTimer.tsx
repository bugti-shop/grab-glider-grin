import { useEffect, useRef, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Play, Pause, RotateCcw, SkipForward, Timer, Coffee, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PomodoroSettings,
  loadPomodoroSettings,
  savePomodoroSettings,
  addPomodoroSession,
  getPomodoroStats,
  formatPomodoroDuration,
} from '@/utils/pomodoroStorage';
import { toast } from 'sonner';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface PomodoroTimerProps {
  open: boolean;
  onClose: () => void;
  taskId?: string;
  taskTitle?: string;
}

type Phase = 'focus' | 'break' | 'longBreak';

const phaseLabel: Record<Phase, string> = {
  focus: 'Focus',
  break: 'Short Break',
  longBreak: 'Long Break',
};

const playBeep = () => {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    o.type = 'sine';
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    o.stop(ctx.currentTime + 1.3);
    setTimeout(() => ctx.close(), 1500);
  } catch {}
};

const notify = (title: string, body: string) => {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {}
};

export const PomodoroTimer = ({ open, onClose, taskId, taskTitle }: PomodoroTimerProps) => {
  const { isPro, requireProFeature } = useSubscription();
  // Gate Pomodoro to Pro. Trigger paywall and close on open for free users.
  useEffect(() => {
    if (open && !isPro) {
      requireProFeature('pomodoro');
      onClose();
    }
  }, [open, isPro, requireProFeature, onClose]);
  const [settings, setSettings] = useState<PomodoroSettings>(loadPomodoroSettings());
  const [phase, setPhase] = useState<Phase>('focus');
  const [remaining, setRemaining] = useState<number>(loadPomodoroSettings().focusMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [stats, setStats] = useState(() => getPomodoroStats(taskId));
  const phaseStartRef = useRef<number | null>(null);
  const phaseDurationRef = useRef<number>(remaining);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refreshStats = useCallback(() => setStats(getPomodoroStats(taskId)), [taskId]);

  const phaseDurationSec = useCallback((p: Phase, s: PomodoroSettings) => {
    if (p === 'focus') return s.focusMinutes * 60;
    if (p === 'longBreak') return s.longBreakMinutes * 60;
    return s.breakMinutes * 60;
  }, []);

  // Reset timer when phase or settings change (only when not running)
  useEffect(() => {
    if (!isRunning) {
      const d = phaseDurationSec(phase, settings);
      setRemaining(d);
      phaseDurationRef.current = d;
    }
  }, [phase, settings, isRunning, phaseDurationSec]);

  // Ask for notification permission on open
  useEffect(() => {
    if (open && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    if (open) refreshStats();
  }, [open, refreshStats]);

  const completePhase = useCallback(() => {
    const elapsed = phaseDurationRef.current;
    if (phase === 'focus') {
      addPomodoroSession({
        taskId,
        type: 'focus',
        startedAt: phaseStartRef.current ?? Date.now() - elapsed * 1000,
        completedAt: Date.now(),
        durationSec: elapsed,
      });
      const nextCount = completedFocus + 1;
      setCompletedFocus(nextCount);
      const isLong = settings.longBreakEvery > 0 && nextCount % settings.longBreakEvery === 0;
      const nextPhase: Phase = isLong ? 'longBreak' : 'break';
      if (settings.soundEnabled) playBeep();
      notify('Focus complete 🎯', `Time for a ${isLong ? 'long ' : ''}break`);
      toast.success(`Pomodoro complete! Take a ${isLong ? 'long ' : ''}break.`);
      setPhase(nextPhase);
    } else {
      addPomodoroSession({
        taskId,
        type: 'break',
        startedAt: phaseStartRef.current ?? Date.now() - elapsed * 1000,
        completedAt: Date.now(),
        durationSec: elapsed,
      });
      if (settings.soundEnabled) playBeep();
      notify('Break over ☕', 'Back to focus!');
      toast.success('Break over — back to focus!');
      setPhase('focus');
    }
    setIsRunning(false);
    phaseStartRef.current = null;
    refreshStats();
  }, [phase, taskId, completedFocus, settings, refreshStats]);

  // Tick
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          // schedule complete outside of setState
          setTimeout(completePhase, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, completePhase]);

  const start = () => {
    if (phaseStartRef.current == null) phaseStartRef.current = Date.now();
    setIsRunning(true);
  };
  const pause = () => setIsRunning(false);
  const reset = () => {
    setIsRunning(false);
    phaseStartRef.current = null;
    const d = phaseDurationSec(phase, settings);
    setRemaining(d);
    phaseDurationRef.current = d;
  };
  const skip = () => {
    setIsRunning(false);
    phaseStartRef.current = null;
    setPhase(phase === 'focus' ? 'break' : 'focus');
  };

  const updateSetting = <K extends keyof PomodoroSettings>(k: K, v: PomodoroSettings[K]) => {
    const next = { ...settings, [k]: v };
    setSettings(next);
    savePomodoroSettings(next);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  const totalForPhase = phaseDurationRef.current || 1;
  const progress = Math.min(1, Math.max(0, 1 - remaining / totalForPhase));
  const ringSize = 220;
  const stroke = 12;
  const r = (ringSize - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl p-0">
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Pomodoro Timer
          </SheetTitle>
          {taskTitle && (
            <p className="text-sm text-muted-foreground truncate">{taskTitle}</p>
          )}
        </SheetHeader>

        <div className="px-5 pb-6 space-y-6">
          {/* Phase tabs */}
          <div className="flex gap-2 p-1 bg-muted rounded-xl">
            {(['focus', 'break', 'longBreak'] as Phase[]).map(p => (
              <button
                key={p}
                onClick={() => { if (!isRunning) setPhase(p); }}
                disabled={isRunning}
                className={cn(
                  'flex-1 py-2 text-xs font-medium rounded-lg transition-colors',
                  phase === p ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  isRunning && 'opacity-60 cursor-not-allowed'
                )}
              >
                {phaseLabel[p]}
              </button>
            ))}
          </div>

          {/* Timer ring */}
          <div className="flex items-center justify-center">
            <div className="relative" style={{ width: ringSize, height: ringSize }}>
              <svg width={ringSize} height={ringSize} className="-rotate-90">
                <circle cx={ringSize / 2} cy={ringSize / 2} r={r}
                  stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
                <circle cx={ringSize / 2} cy={ringSize / 2} r={r}
                  stroke={phase === 'focus' ? 'hsl(var(--primary))' : 'hsl(var(--accent-foreground))'}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - progress)}
                  style={{ transition: 'stroke-dashoffset 0.3s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-mono text-5xl font-semibold tabular-nums">{mm}:{ss}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  {phase === 'focus' ? <Flame className="h-3 w-3" /> : <Coffee className="h-3 w-3" />}
                  {phaseLabel[phase]}
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" onClick={reset} aria-label="Reset">
              <RotateCcw className="h-4 w-4" />
            </Button>
            {isRunning ? (
              <Button size="lg" onClick={pause} className="min-w-[140px]">
                <Pause className="h-5 w-5 mr-2" /> Pause
              </Button>
            ) : (
              <Button size="lg" onClick={start} className="min-w-[140px]">
                <Play className="h-5 w-5 mr-2" /> Start
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={skip} aria-label="Skip">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Today focused</div>
              <div className="text-lg font-semibold">{formatPomodoroDuration(stats.todayFocusedSec)}</div>
              <div className="text-xs text-muted-foreground">{stats.todayPomodoros} pomodoros</div>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">This task</div>
              <div className="text-lg font-semibold">{stats.taskPomodoros} pomodoros</div>
              <div className="text-xs text-muted-foreground">{formatPomodoroDuration(stats.taskFocusedSec)} focused</div>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-3 border-t pt-4">
            <div className="text-sm font-medium">Custom durations (minutes)</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-muted-foreground">
                Focus
                <Input
                  type="number"
                  min={1}
                  max={180}
                  value={settings.focusMinutes}
                  onChange={(e) => updateSetting('focusMinutes', Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                  className="mt-1"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Short break
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.breakMinutes}
                  onChange={(e) => updateSetting('breakMinutes', Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  className="mt-1"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Long break
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.longBreakMinutes}
                  onChange={(e) => updateSetting('longBreakMinutes', Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  className="mt-1"
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Long break every</div>
                <div className="text-xs text-muted-foreground">After N focus sessions</div>
              </div>
              <Input
                type="number"
                min={2}
                max={10}
                value={settings.longBreakEvery}
                onChange={(e) => updateSetting('longBreakEvery', Math.max(2, Math.min(10, Number(e.target.value) || 4)))}
                className="w-20"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Sound on complete</div>
              <Switch
                checked={settings.soundEnabled}
                onCheckedChange={(v) => updateSetting('soundEnabled', v)}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
