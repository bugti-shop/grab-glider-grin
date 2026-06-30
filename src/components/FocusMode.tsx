import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreHorizontal, X, ShieldAlert, Timer as TimerIcon, Maximize2, Music2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { addPomodoroSession } from '@/utils/pomodoroStorage';
import bgMountain from '@/assets/focus/focus-mountain.jpg';
import bgForest from '@/assets/focus/focus-forest.jpg';
import bgOcean from '@/assets/focus/focus-ocean.jpg';
import bgAlpine from '@/assets/focus/focus-alpine.jpg';

interface FocusModeProps {
  open: boolean;
  onClose: () => void;
  taskId?: string;
  taskTitle?: string;
  onComplete?: () => void;
}

const BACKGROUNDS = [bgMountain, bgAlpine, bgForest, bgOcean];

const DURATION_OPTIONS = [15, 25, 30, 45, 60, 90, 120];

// Soft white-noise generator (looped)
const useWhiteNoise = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const start = useCallback(() => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      if (!ctxRef.current) ctxRef.current = new AC();
      const ctx = ctxRef.current!;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      src.connect(gain).connect(ctx.destination);
      src.start();
      srcRef.current = src;
      gainRef.current = gain;
    } catch {}
  }, []);

  const stop = useCallback(() => {
    try {
      srcRef.current?.stop();
      srcRef.current?.disconnect();
      gainRef.current?.disconnect();
      srcRef.current = null;
      gainRef.current = null;
    } catch {}
  }, []);

  useEffect(() => () => { stop(); try { ctxRef.current?.close(); } catch {} }, [stop]);

  return { start, stop };
};

export const FocusMode = ({ open, onClose, taskId, taskTitle, onComplete }: FocusModeProps) => {
  const [durationMin, setDurationMin] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [strict, setStrict] = useState(false);
  const [whiteNoise, setWhiteNoise] = useState(false);
  const [showDurations, setShowDurations] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const startRef = useRef<number | null>(null);
  const bg = useMemo(() => BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)], [open]);
  const noise = useWhiteNoise();

  // Reset when opening
  useEffect(() => {
    if (open) {
      setRemaining(durationMin * 60);
      setRunning(false);
      setStrict(false);
      setWhiteNoise(false);
      startRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Apply duration changes when not running
  useEffect(() => {
    if (!running) setRemaining(durationMin * 60);
  }, [durationMin, running]);

  // Tick
  useEffect(() => {
    if (!open || !running) return;
    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(id);
          setRunning(false);
          try {
            addPomodoroSession({
              taskId, type: 'focus',
              startedAt: startRef.current ?? Date.now() - durationMin * 60 * 1000,
              completedAt: Date.now(),
              durationSec: durationMin * 60,
            });
          } catch {}
          noise.stop();
          toast.success('Focus session complete 🎯');
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [open, running, durationMin, taskId, onComplete, noise]);

  // White noise toggle
  useEffect(() => {
    if (whiteNoise && running) noise.start();
    else noise.stop();
  }, [whiteNoise, running, noise]);

  // Fullscreen toggle helper
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  }, []);

  if (!open) return null;

  const total = durationMin * 60;
  const progress = 1 - remaining / total; // 0..1
  const hh = Math.floor(remaining / 3600);
  const mm = Math.floor((remaining % 3600) / 60);
  const ss = remaining % 60;
  const timeStr = hh > 0
    ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const handleAction = () => {
    if (remaining === 0) {
      setRemaining(durationMin * 60);
      return;
    }
    if (running) {
      setRunning(false);
    } else {
      if (startRef.current == null) startRef.current = Date.now();
      setRunning(true);
    }
  };

  const actionLabel = remaining === 0 ? 'Restart' : running ? 'Pause' : (startRef.current ? 'Resume' : 'Start');

  const attemptClose = () => {
    if (strict && running) { setConfirmExit(true); return; }
    noise.stop();
    onClose();
  };

  // Ring geometry
  const size = 280;
  const stroke = 4;
  const r = (size - stroke) / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const ticks = 90;
  const filled = Math.round(ticks * progress);

  const content = (
    <div className="fixed inset-0 z-[100] text-white" role="dialog" aria-modal="true">
      {/* Background */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: `url(${bg})` }}
      />
      <div className="absolute inset-0 bg-black/35" />

      {/* Content */}
      <div className="relative h-full w-full flex flex-col" style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4">
          <button
            onClick={attemptClose}
            className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10"
            aria-label="Close"
          >
            <ChevronDown className="h-6 w-6" />
          </button>
          <button
            onClick={() => setShowMenu(v => !v)}
            className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10"
            aria-label="More"
          >
            <MoreHorizontal className="h-6 w-6" />
          </button>
        </div>

        {/* Task chip */}
        {taskTitle && (
          <div className="px-4 mt-1">
            <div className="flex items-center gap-3 bg-white/95 text-foreground rounded-2xl px-3 py-2.5 shadow-lg">
              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/60 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{taskTitle}</div>
              </div>
              <button
                onClick={attemptClose}
                className="h-7 w-7 grid place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Timer */}
        <div className="flex-1 flex flex-col items-center justify-center select-none">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90 absolute inset-0">
              {Array.from({ length: ticks }).map((_, i) => {
                const angle = (i / ticks) * Math.PI * 2;
                const x1 = cx + Math.cos(angle) * (r - 14);
                const y1 = cy + Math.sin(angle) * (r - 14);
                const x2 = cx + Math.cos(angle) * r;
                const y2 = cy + Math.sin(angle) * r;
                const isActive = i < filled;
                const isHead = i === filled - 1 || (filled === 0 && i === 0);
                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={isHead && progress > 0 ? '#ff4d4f' : 'rgba(255,255,255,0.55)'}
                    strokeWidth={isHead && progress > 0 ? 4 : 2}
                    strokeLinecap="round"
                    opacity={isActive ? 0.95 : 0.35}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => !running && setShowDurations(true)}
                className="font-light tabular-nums text-white"
                style={{ fontSize: hh > 0 ? 56 : 68, letterSpacing: 1 }}
              >
                {timeStr}
              </button>
            </div>
          </div>
          {!running && remaining === durationMin * 60 && (
            <button
              onClick={() => setShowDurations(true)}
              className="mt-3 text-xs uppercase tracking-widest text-white/70 hover:text-white"
            >
              {durationMin} min · tap to change
            </button>
          )}
        </div>

        {/* Action button */}
        <div className="flex items-center justify-center mb-8">
          <button
            onClick={handleAction}
            className="px-12 py-3 rounded-full border border-white/80 text-white text-lg font-medium hover:bg-white/10 transition active:scale-95"
          >
            {actionLabel}
          </button>
        </div>

        {/* Bottom options */}
        <div className="grid grid-cols-4 gap-1 px-4">
          <OptionButton
            icon={<ShieldAlert className="h-6 w-6" />}
            label="Strict Mode"
            active={strict}
            onClick={() => { setStrict(v => !v); toast.message(strict ? 'Strict mode off' : 'Strict mode on — exiting requires confirmation'); }}
          />
          <OptionButton
            icon={<TimerIcon className="h-6 w-6" />}
            label="Timer Mode"
            onClick={() => setShowDurations(true)}
          />
          <OptionButton
            icon={<Maximize2 className="h-6 w-6" />}
            label="Full Screen"
            onClick={toggleFullscreen}
          />
          <OptionButton
            icon={<Music2 className="h-6 w-6" />}
            label="White Noise"
            active={whiteNoise}
            onClick={() => setWhiteNoise(v => !v)}
          />
        </div>
      </div>

      {/* Duration picker */}
      {showDurations && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-end z-10" onClick={() => setShowDurations(false)}>
          <div
            className="w-full bg-background text-foreground rounded-t-3xl p-5 space-y-2 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Set duration</h3>
              <button onClick={() => setShowDurations(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => { setDurationMin(m); setShowDurations(false); }}
                  className={cn(
                    'rounded-xl py-3 text-sm font-medium border transition-colors',
                    durationMin === m
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted border-transparent hover:bg-muted/70'
                  )}
                >
                  {m >= 60 ? `${m / 60}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`}
                </button>
              ))}
            </div>
            <div className="pt-2">
              <label className="text-xs text-muted-foreground">Custom minutes</label>
              <input
                type="number"
                min={1}
                max={480}
                value={durationMin}
                onChange={e => setDurationMin(Math.max(1, Math.min(480, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-xl bg-muted px-3 py-3 text-base outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* More menu */}
      {showMenu && (
        <div className="absolute top-14 right-4 z-10 min-w-[180px] rounded-xl bg-background text-foreground border shadow-lg overflow-hidden">
          <MenuRow label={strict ? 'Disable Strict Mode' : 'Enable Strict Mode'} icon={<ShieldAlert className="h-4 w-4" />} onClick={() => { setStrict(v => !v); setShowMenu(false); }} />
          <MenuRow label="Change Duration" icon={<TimerIcon className="h-4 w-4" />} onClick={() => { setShowDurations(true); setShowMenu(false); }} />
          <MenuRow label="Toggle Full Screen" icon={<Maximize2 className="h-4 w-4" />} onClick={() => { toggleFullscreen(); setShowMenu(false); }} />
          <MenuRow label={whiteNoise ? 'Stop White Noise' : 'Play White Noise'} icon={<Music2 className="h-4 w-4" />} onClick={() => { setWhiteNoise(v => !v); setShowMenu(false); }} />
          {onComplete && (
            <MenuRow label="Mark Task Done" icon={<Check className="h-4 w-4" />} onClick={() => { onComplete(); setShowMenu(false); }} />
          )}
        </div>
      )}

      {/* Strict mode exit confirm */}
      {confirmExit && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 px-6">
          <div className="bg-background text-foreground rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="text-base font-semibold">Exit Strict Focus?</h3>
            <p className="text-sm text-muted-foreground">You enabled Strict Mode. Exiting now will end your focus session early.</p>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setConfirmExit(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-muted">Stay</button>
              <button onClick={() => { setConfirmExit(false); noise.stop(); onClose(); }} className="px-4 py-2 rounded-lg text-sm bg-destructive text-destructive-foreground">Exit anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

const OptionButton = ({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl transition-colors',
      active ? 'text-white bg-white/15' : 'text-white/85 hover:bg-white/10'
    )}
  >
    {icon}
    <span className="text-xs font-medium">{label}</span>
  </button>
);

const MenuRow = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted text-left">
    {icon}
    <span>{label}</span>
  </button>
);
