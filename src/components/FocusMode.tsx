import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreHorizontal, X, ShieldAlert, Timer as TimerIcon, Maximize2, Music2, Check, Volume2, VolumeX, Bell, BellOff, ArrowDownToLine, Play, Pause, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { addPomodoroSession } from '@/utils/pomodoroStorage';
import { addNotification } from '@/utils/notificationStore';
import { sendWebNotification, requestNotificationPermission } from '@/utils/webNotifications';
import { setFocusBgState, clearFocusBgState, onFocusBgCommand } from '@/utils/focusBackgroundState';
import { showFocusOngoing, hideFocusOngoing, onFocusQuickControl } from '@/utils/focusPersistentNotification';
import { SoundLibrary } from '@/components/focus/SoundLibrary';
import { FocusFlipClock } from '@/components/focus/FocusFlipClock';
import { findTrack, FocusTrack } from '@/components/focus/FocusSounds';
import bgMountain from '@/assets/focus/focus-mountain.jpg';
import bgForest from '@/assets/focus/focus-forest.jpg';
import bgOcean from '@/assets/focus/focus-ocean.jpg';
import bgAlpine from '@/assets/focus/focus-alpine.jpg';

const fmtMMSS = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}h ${m}m`
    : m > 0
    ? `${m}m ${r}s`
    : `${r}s`;
};

const notifyFocus = (
  enabled: boolean,
  kind: 'start' | 'complete' | 'pause' | 'ended_away',
  opts: { taskTitle?: string; durationMin?: number; remainingSec?: number; elapsedSec?: number } = {}
) => {
  if (!enabled) return;
  const taskBit = opts.taskTitle ? ` · ${opts.taskTitle}` : '';
  let title = '';
  let body = '';
  let type: 'reminder' | 'achievement' | 'system' = 'system';
  switch (kind) {
    case 'start':
      title = '🎯 Focus started';
      body = `${opts.durationMin ?? ''} min session in progress${taskBit}`;
      type = 'reminder';
      break;
    case 'complete':
      title = '✅ Focus complete';
      body = `Great work! ${opts.durationMin ?? ''} min done${taskBit}`;
      type = 'achievement';
      break;
    case 'pause':
      title = '⏸ Focus paused';
      body = `${fmtMMSS(opts.remainingSec ?? 0)} remaining${taskBit}`;
      type = 'reminder';
      break;
    case 'ended_away':
      title = '🏁 Focus ended';
      body = `Session ended while you were away — ${fmtMMSS(opts.elapsedSec ?? 0)} focused${taskBit}`;
      type = 'achievement';
      break;
  }
  try { void addNotification({ type, title, message: body, icon: 'timer', actionPath: '/todo/today' }); } catch {}
  try { sendWebNotification(title, { body, tag: `focus-${kind}` }); } catch {}
};

interface FocusModeProps {
  open: boolean;
  onClose: () => void;
  taskId?: string;
  taskTitle?: string;
  onComplete?: () => void;
}

const BACKGROUNDS = [bgMountain, bgAlpine, bgForest, bgOcean];
const DURATION_OPTIONS = [15, 25, 30, 45, 60, 90, 120];

// ---- Persistence -----------------------------------------------------------
const PREFS_KEY = 'focus:prefs:v1';
const SESSION_KEY = 'focus:session:v1';

interface FocusPrefs {
  durationMin: number;
  strict: boolean;
  whiteNoise: boolean;
  whiteNoiseVolume: number; // 0..1
  whiteNoiseMuted: boolean;
  fullScreen: boolean;
  notifications: boolean;
  soundTrackId: string | null; // selected track from SoundLibrary, null = synth white noise
}

const DEFAULT_PREFS: FocusPrefs = {
  durationMin: 25,
  strict: false,
  whiteNoise: false,
  whiteNoiseVolume: 0.4,
  whiteNoiseMuted: false,
  fullScreen: false,
  notifications: true,
  soundTrackId: null,
};

const loadPrefs = (): FocusPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return DEFAULT_PREFS; }
};
const savePrefs = (p: FocusPrefs) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
};

interface ActiveSession {
  taskId?: string;
  taskTitle?: string;
  durationMin: number;
  startedAt: number;       // first start of the session
  endAt?: number;          // when running, epoch ms it will hit zero
  remainingSec?: number;   // when paused
  accumulatedSec: number;  // total focused time across run/pause cycles
  lastEventAt: number;
}

const loadSession = (): ActiveSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActiveSession;
    // expire if older than 24h with no progress
    if (Date.now() - s.lastEventAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
};
const writeSession = (s: ActiveSession | null) => {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
};

// ---- Focus audio: either an HTML <audio> URL or synthesized white noise ----
const useFocusAudio = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    try { srcRef.current?.stop(); srcRef.current?.disconnect(); gainRef.current?.disconnect(); } catch {}
    srcRef.current = null;
    gainRef.current = null;
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch {}
      audioRef.current = null;
    }
  }, []);

  const startSynth = useCallback((volume: number) => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      if (!ctxRef.current) ctxRef.current = new AC();
      const ctx = ctxRef.current!;
      if (srcRef.current) return;
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
      gain.gain.value = Math.max(0, Math.min(1, volume));
      src.connect(gain).connect(ctx.destination);
      src.start();
      srcRef.current = src;
      gainRef.current = gain;
    } catch {}
  }, []);

  const startUrl = useCallback((url: string, volume: number) => {
    try {
      const a = new Audio();
      a.src = url;
      a.loop = true;
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
      a.volume = Math.max(0, Math.min(1, volume));
      // Anti-interrupt: if playback ends unexpectedly (some browsers ignore loop
      // near track end, or network stalls) restart from 0. On error, reload the
      // source. Keeps ambient sound gapless even during long sessions.
      a.addEventListener('ended', () => {
        try { a.currentTime = 0; void a.play(); } catch {}
      });
      a.addEventListener('pause', () => {
        // Only auto-resume if we didn't intentionally stop (element still mounted)
        if (audioRef.current === a && !a.ended) {
          setTimeout(() => { try { void a.play(); } catch {} }, 250);
        }
      });
      a.addEventListener('error', () => {
        try { a.src = url; a.load(); void a.play(); } catch {}
      });
      a.addEventListener('stalled', () => { try { void a.play(); } catch {} });
      a.play().catch(() => { toast.message('Audio blocked — tap Play again'); });
      audioRef.current = a;
    } catch {}
  }, []);

  const start = useCallback((track: FocusTrack | null, volume: number) => {
    stop();
    if (track) startUrl(track.url, volume);
    else startSynth(volume);
  }, [stop, startSynth, startUrl]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (gainRef.current) { try { gainRef.current.gain.value = clamped; } catch {} }
    if (audioRef.current) { try { audioRef.current.volume = clamped; } catch {} }
  }, []);

  const isRunning = useCallback(() => !!srcRef.current || !!audioRef.current, []);

  useEffect(() => () => { stop(); try { ctxRef.current?.close(); } catch {} }, [stop]);

  return { start, stop, setVolume, isRunning };
};

// ---- Component -------------------------------------------------------------
export const FocusMode = ({ open, onClose, taskId, taskTitle, onComplete }: FocusModeProps) => {
  const [prefs, setPrefs] = useState<FocusPrefs>(() => loadPrefs());
  const [remaining, setRemaining] = useState(prefs.durationMin * 60);
  const [running, setRunning] = useState(false);
  const [showDurations, setShowDurations] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showSoundLib, setShowSoundLib] = useState(false);
  const [showBackgroundPrompt, setShowBackgroundPrompt] = useState(false);
  const [backgrounded, setBackgrounded] = useState(false);

  const sessionRef = useRef<ActiveSession | null>(null);
  const bg = useMemo(() => BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)], [open]);
  const noise = useFocusAudio();
  const currentTrack = prefs.soundTrackId ? findTrack(prefs.soundTrackId) ?? null : null;

  const updatePrefs = useCallback((patch: Partial<FocusPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  // ---- Restore on open ----------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const existing = loadSession();
    if (existing) {
      sessionRef.current = existing;
      const dur = existing.durationMin;
      if (existing.endAt) {
        const remain = Math.max(0, Math.floor((existing.endAt - Date.now()) / 1000));
        if (remain > 0) {
          setRemaining(remain);
          setRunning(true);
          updatePrefs({ durationMin: dur });
          // restart noise if it was on
          if (prefs.whiteNoise && !prefs.whiteNoiseMuted) {
            noise.start(currentTrack, prefs.whiteNoiseVolume);
          }
          toast.message('Resumed your focus session');
          return;
        }
        // Session would have completed while we were away — log it
        const elapsedAway = Math.max(0, dur * 60 - (existing.accumulatedSec ?? 0));
        try {
          addPomodoroSession({
            taskId: existing.taskId, type: 'focus',
            startedAt: existing.startedAt,
            completedAt: existing.endAt,
            durationSec: dur * 60,
          });
        } catch {}
        notifyFocus(prefs.notifications, 'ended_away', {
          taskTitle: existing.taskTitle,
          elapsedSec: dur * 60,
        });
        void elapsedAway;
        writeSession(null);
        sessionRef.current = null;
        setRemaining(dur * 60);
        setRunning(false);
      } else if (typeof existing.remainingSec === 'number') {
        setRemaining(existing.remainingSec);
        setRunning(false);
        updatePrefs({ durationMin: dur });
      } else {
        setRemaining(dur * 60);
        setRunning(false);
      }
    } else {
      setRemaining(prefs.durationMin * 60);
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Update remaining when duration changes (only when not running and no session in progress)
  useEffect(() => {
    if (!running && !sessionRef.current) setRemaining(prefs.durationMin * 60);
  }, [prefs.durationMin, running]);

  // ---- Tick ---------------------------------------------------------------
  useEffect(() => {
    if (!open || !running) return;
    const id = setInterval(() => {
      const s = sessionRef.current;
      if (!s || !s.endAt) return;
      const remain = Math.max(0, Math.floor((s.endAt - Date.now()) / 1000));
      setRemaining(remain);
      if (remain <= 0) {
        clearInterval(id);
        completeSession();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, running]);

  // ---- Audio side effects ------------------------------------------------
  useEffect(() => {
    if (prefs.whiteNoise && running && !prefs.whiteNoiseMuted) {
      noise.start(currentTrack, prefs.whiteNoiseVolume);
    } else {
      noise.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.whiteNoise, prefs.whiteNoiseMuted, running, prefs.soundTrackId]);

  useEffect(() => {
    if (noise.isRunning()) noise.setVolume(prefs.whiteNoiseMuted ? 0 : prefs.whiteNoiseVolume);
  }, [prefs.whiteNoiseVolume, prefs.whiteNoiseMuted, noise]);

  // ---- Lifecycle: start / pause / resume / complete -----------------------
  const startSession = () => {
    const now = Date.now();
    const dur = prefs.durationMin * 60;
    const s: ActiveSession = {
      taskId, taskTitle,
      durationMin: prefs.durationMin,
      startedAt: now,
      endAt: now + dur * 1000,
      accumulatedSec: 0,
      lastEventAt: now,
    };
    sessionRef.current = s;
    writeSession(s);
    setRemaining(dur);
    setRunning(true);
    if (prefs.notifications) {
      void requestNotificationPermission();
      notifyFocus(true, 'start', { taskTitle, durationMin: prefs.durationMin });
    }
  };

  const resumeSession = () => {
    const s = sessionRef.current;
    if (!s) { startSession(); return; }
    const now = Date.now();
    const remainAtResume = (s.remainingSec ?? remaining);
    s.endAt = now + remainAtResume * 1000;
    s.remainingSec = undefined;
    s.lastEventAt = now;
    writeSession(s);
    setRemaining(remainAtResume);
    setRunning(true);
  };

  const pauseSession = () => {
    const s = sessionRef.current;
    if (!s || !s.endAt) return;
    const now = Date.now();
    const remain = Math.max(0, Math.floor((s.endAt - now) / 1000));
    const elapsed = (prefs.durationMin * 60) - remain - s.accumulatedSec;
    if (elapsed > 0) {
      // log a partial-focus segment so stats reflect real time spent
      try {
        addPomodoroSession({
          taskId: s.taskId, type: 'focus',
          startedAt: now - elapsed * 1000,
          completedAt: now,
          durationSec: elapsed,
        });
      } catch {}
      s.accumulatedSec += elapsed;
    }
    s.remainingSec = remain;
    s.endAt = undefined;
    s.lastEventAt = now;
    writeSession(s);
    setRemaining(remain);
    setRunning(false);
    notifyFocus(prefs.notifications, 'pause', { taskTitle: s.taskTitle, remainingSec: remain });
  };

  const completeSession = useCallback(() => {
    const s = sessionRef.current;
    const completedTaskTitle = s?.taskTitle;
    const completedDurationMin = s?.durationMin ?? prefs.durationMin;
    if (s) {
      const now = Date.now();
      const totalSec = prefs.durationMin * 60;
      const elapsed = Math.max(0, totalSec - s.accumulatedSec);
      if (elapsed > 0) {
        try {
          addPomodoroSession({
            taskId: s.taskId, type: 'focus',
            startedAt: now - elapsed * 1000,
            completedAt: now,
            durationSec: elapsed,
          });
        } catch {}
      }
    }
    sessionRef.current = null;
    writeSession(null);
    setRunning(false);
    setRemaining(0);
    noise.stop();
    void hideFocusOngoing();
    toast.success('Focus session complete 🎯');
    notifyFocus(prefs.notifications, 'complete', { taskTitle: completedTaskTitle, durationMin: completedDurationMin });
    onComplete?.();
  }, [prefs.durationMin, prefs.notifications, noise, onComplete]);

  const discardSession = (logPartial: boolean) => {
    if (logPartial) {
      const s = sessionRef.current;
      if (s && s.endAt) {
        const now = Date.now();
        const remain = Math.max(0, Math.floor((s.endAt - now) / 1000));
        const elapsed = (prefs.durationMin * 60) - remain - s.accumulatedSec;
        if (elapsed > 0) {
          try {
            addPomodoroSession({
              taskId: s.taskId, type: 'focus',
              startedAt: now - elapsed * 1000,
              completedAt: now,
              durationSec: elapsed,
            });
          } catch {}
        }
      }
    }
    sessionRef.current = null;
    writeSession(null);
    setRunning(false);
    setRemaining(prefs.durationMin * 60);
    noise.stop();
    void hideFocusOngoing();
  };

  // ---- Fullscreen ---------------------------------------------------------
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        try { await (screen.orientation as any)?.lock?.('landscape'); } catch {}
        updatePrefs({ fullScreen: true });
      } else {
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        await document.exitFullscreen();
        updatePrefs({ fullScreen: false });
      }
    } catch {}
  }, [updatePrefs]);

  // Apply saved fullscreen preference on open
  useEffect(() => {
    if (open && prefs.fullScreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        try { (screen.orientation as any)?.lock?.('landscape'); } catch {}
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- Background mode bridge: publish state, listen for bar commands ---
  // The native foreground service is kept alive for the ENTIRE session
  // (not only when the user picks "Run in Background") so the timer + sound
  // survive closing the sheet, changing dashboards, or the app being killed.
  useEffect(() => {
    if (!open) return;
    const sessionActive = running || !!sessionRef.current;
    const active = backgrounded && sessionActive;
    setFocusBgState({
      active,
      running,
      taskTitle: sessionRef.current?.taskTitle,
      endAt: sessionRef.current?.endAt,
      remainingSec: sessionRef.current?.remainingSec ?? remaining,
    });
    if (!backgrounded) clearFocusBgState();

    if (sessionActive) {
      void showFocusOngoing({
        taskTitle: sessionRef.current?.taskTitle,
        remainingSec: remaining,
        endAtMs: sessionRef.current?.endAt,
        running,
        soundUrl: prefs.whiteNoise && !prefs.whiteNoiseMuted && currentTrack ? currentTrack.url : undefined,
        soundVolume: prefs.whiteNoiseMuted ? 0 : prefs.whiteNoiseVolume,
      });
    } else {
      void hideFocusOngoing();
    }
  }, [open, backgrounded, running, remaining, prefs.whiteNoise, prefs.whiteNoiseMuted, prefs.whiteNoiseVolume, prefs.soundTrackId, currentTrack]);

  // Refresh the ongoing notification every 15s so remaining time stays fresh
  // even while the sheet is open, without flooding the notification system.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      void showFocusOngoing({
        taskTitle: sessionRef.current?.taskTitle,
        remainingSec: sessionRef.current?.endAt
          ? Math.max(0, Math.floor((sessionRef.current.endAt - Date.now()) / 1000))
          : remaining,
        endAtMs: sessionRef.current?.endAt,
        running: true,
        soundUrl: prefs.whiteNoise && !prefs.whiteNoiseMuted && currentTrack ? currentTrack.url : undefined,
        soundVolume: prefs.whiteNoiseMuted ? 0 : prefs.whiteNoiseVolume,
      });
    }, 15000);
    return () => clearInterval(id);
  }, [running, prefs.whiteNoise, prefs.whiteNoiseMuted, prefs.whiteNoiseVolume, currentTrack]);


  useEffect(() => {
    return onFocusBgCommand((cmd) => {
      if (cmd === 'open') setBackgrounded(false);
      else if (cmd === 'toggle') { if (running) pauseSession(); else resumeSession(); }
      else if (cmd === 'stop') { discardSession(true); clearFocusBgState(); setBackgrounded(false); onClose(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // ---- Quick controls tapped from the persistent notification ------------
  // Keeps the on-screen state in sync with anything the user did from the
  // lock screen / notification shade (pause, mute, volume, exit).
  useEffect(() => {
    return onFocusQuickControl((e) => {
      switch (e.action) {
        case 'pause':  if (running) pauseSession(); break;
        case 'resume': if (!running) resumeSession(); break;
        case 'mute':   updatePrefs({ whiteNoiseMuted: true }); break;
        case 'unmute': updatePrefs({ whiteNoiseMuted: false }); break;
        case 'volume': updatePrefs({ whiteNoiseVolume: Math.max(0, Math.min(1, e.volume)), whiteNoiseMuted: e.muted }); break;
        case 'stop':   discardSession(true); clearFocusBgState(); setBackgrounded(false); onClose(); break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  if (!open) return null;

  const total = prefs.durationMin * 60;
  const progress = 1 - remaining / total;
  const hh = Math.floor(remaining / 3600);
  const mm = Math.floor((remaining % 3600) / 60);
  const ss = remaining % 60;
  const timeStr = hh > 0
    ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;


  const attemptClose = () => {
    if (prefs.strict && running) { setConfirmExit(true); return; }
    // If a session is active, auto-move to background so timer + sound
    // keep running via the native foreground service. User can exit from
    // the notification shade or the on-screen background bar.
    if (sessionRef.current && (running || (sessionRef.current.remainingSec ?? 0) > 0)) {
      continueInBackground();
      return;
    }
    noise.stop();
    clearFocusBgState();
    onClose();
  };

  const continueInBackground = () => {
    setShowBackgroundPrompt(false);
    setBackgrounded(true);
    // Post the native foreground-service notification immediately BEFORE the
    // React sheet unmounts, otherwise closing TaskDetail can kill the JS timer
    // before the effect gets a chance to publish it.
    void showFocusOngoing({
      taskTitle: sessionRef.current?.taskTitle,
      remainingSec: sessionRef.current?.endAt
        ? Math.max(0, Math.floor((sessionRef.current.endAt - Date.now()) / 1000))
        : remaining,
      endAtMs: sessionRef.current?.endAt,
      running,
      soundUrl: prefs.whiteNoise && !prefs.whiteNoiseMuted && currentTrack ? currentTrack.url : undefined,
      soundVolume: prefs.whiteNoiseMuted ? 0 : prefs.whiteNoiseVolume,
    });
    onClose(); // hides the host sheet/page wrapper; native service keeps running
  };

  const exitFully = () => {
    setShowBackgroundPrompt(false);
    if (sessionRef.current && running) pauseSession();
    noise.stop();
    clearFocusBgState();
    setBackgrounded(false);
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
    <div
      className="fixed inset-0 z-[100] text-white"
      role="dialog"
      aria-modal="true"
      style={backgrounded ? { opacity: 0, pointerEvents: 'none' } : undefined}
      aria-hidden={backgrounded || undefined}
    >
      {prefs.fullScreen ? (
        <div className="absolute inset-0 bg-black" />
      ) : (
        <>
          <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${bg})` }} />
          <div className="absolute inset-0 bg-black/35" />
        </>
      )}

      <div className="relative h-full w-full flex flex-col" style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <div className="flex items-center justify-between px-4">
          <button onClick={attemptClose} className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10" aria-label="Close">
            <ChevronDown className="h-6 w-6" />
          </button>
          <button onClick={() => setShowMenu(v => !v)} className="h-10 w-10 grid place-items-center rounded-full hover:bg-white/10" aria-label="More">
            <MoreHorizontal className="h-6 w-6" />
          </button>
        </div>

        {taskTitle && !prefs.fullScreen && (
          <div className="px-4 mt-1">
            <div className="flex items-center gap-3 bg-white/95 text-foreground rounded-2xl px-3 py-2.5 shadow-lg">
              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/60 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{taskTitle}</div>
              </div>
              <button onClick={attemptClose} className="h-7 w-7 grid place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 shrink-0" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center select-none">
          {prefs.fullScreen ? (
            <button
              onClick={() => !running && setShowDurations(true)}
              className="w-full flex items-center justify-center"
              aria-label="Change duration"
            >
              <FocusFlipClock hours={hh} minutes={mm} seconds={ss} showHours={hh > 0} />
            </button>
          ) : (
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
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={isHead && progress > 0 ? '#ff4d4f' : 'rgba(255,255,255,0.55)'}
                      strokeWidth={isHead && progress > 0 ? 4 : 2}
                      strokeLinecap="round"
                      opacity={isActive ? 0.95 : 0.35}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <button onClick={() => !running && setShowDurations(true)} className="font-light tabular-nums text-white" style={{ fontSize: hh > 0 ? 56 : 68, letterSpacing: 1 }}>
                  {timeStr}
                </button>
              </div>
            </div>
          )}
          {!running && remaining === total && (
            <button onClick={() => setShowDurations(true)} className="mt-3 text-xs uppercase tracking-widest text-white/70 hover:text-white">
              {prefs.durationMin} min · tap to change
            </button>
          )}

          {/* Sound selection + volume — visible only when sound is on */}
          {prefs.whiteNoise && (
            <div className="mt-6 w-full max-w-xs px-6 space-y-2">
              <button
                onClick={() => setShowSoundLib(true)}
                className="w-full text-xs text-white/80 hover:text-white flex items-center justify-center gap-1.5"
              >
                <Music2 className="h-3.5 w-3.5" />
                {currentTrack ? `${currentTrack.emoji} ${currentTrack.name}` : 'White Noise (synth)'} · change
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updatePrefs({ whiteNoiseMuted: !prefs.whiteNoiseMuted })}
                  className="h-9 w-9 grid place-items-center rounded-full bg-white/15 hover:bg-white/25"
                  aria-label={prefs.whiteNoiseMuted ? 'Unmute' : 'Mute'}
                >
                  {prefs.whiteNoiseMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <input
                  type="range" min={0} max={100}
                  value={Math.round(prefs.whiteNoiseVolume * 100)}
                  onChange={(e) => updatePrefs({ whiteNoiseVolume: Number(e.target.value) / 100, whiteNoiseMuted: false })}
                  className="flex-1 accent-white"
                  aria-label="Volume"
                />
                <span className="text-xs tabular-nums w-8 text-right text-white/80">
                  {prefs.whiteNoiseMuted ? 0 : Math.round(prefs.whiteNoiseVolume * 100)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 mb-8">
          {(() => {
            const hasSession = !!sessionRef.current;
            if (remaining === 0) {
              return (
                <button onClick={() => discardSession(false)} className="px-10 py-3 rounded-full border border-white/80 text-white text-lg font-medium hover:bg-white/10 transition active:scale-95 inline-flex items-center gap-2">
                  <Play className="h-5 w-5" /> Restart
                </button>
              );
            }
            if (!hasSession && !running) {
              return (
                <button onClick={startSession} className="px-12 py-3 rounded-full border border-white/80 text-white text-lg font-medium hover:bg-white/10 transition active:scale-95 inline-flex items-center gap-2">
                  <Play className="h-5 w-5" /> Start
                </button>
              );
            }
            return (
              <>
                <button
                  onClick={running ? pauseSession : resumeSession}
                  className="px-8 py-3 rounded-full border border-white/80 text-white text-base font-medium hover:bg-white/10 transition active:scale-95 inline-flex items-center gap-2"
                >
                  {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  {running ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => { discardSession(true); }}
                  className="px-8 py-3 rounded-full bg-red-500/90 border border-red-400 text-white text-base font-medium hover:bg-red-500 transition active:scale-95 inline-flex items-center gap-2"
                  aria-label="Stop focus"
                >
                  <Square className="h-5 w-5 fill-white" /> Stop
                </button>
              </>
            );
          })()}
        </div>

        <div className="grid grid-cols-4 gap-1 px-4">
          <OptionButton
            icon={<ShieldAlert className="h-6 w-6" />}
            label="Strict Mode"
            active={prefs.strict}
            onClick={() => { const next = !prefs.strict; updatePrefs({ strict: next }); toast.message(next ? 'Strict mode on — exiting requires confirmation' : 'Strict mode off'); }}
          />
          <OptionButton
            icon={<TimerIcon className="h-6 w-6" />}
            label="Timer Mode"
            onClick={() => setShowDurations(true)}
          />
          <OptionButton
            icon={<Maximize2 className="h-6 w-6" />}
            label="Full Screen"
            active={prefs.fullScreen}
            onClick={toggleFullscreen}
          />
          <OptionButton
            icon={<Music2 className="h-6 w-6" />}
            label={prefs.whiteNoise ? 'Sounds' : 'White Noise'}
            active={prefs.whiteNoise}
            onClick={() => {
              if (prefs.whiteNoise) setShowSoundLib(true);
              else updatePrefs({ whiteNoise: true });
            }}
          />
        </div>
      </div>

      {showDurations && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-end z-10" onClick={() => setShowDurations(false)}>
          <div className="w-full bg-background text-foreground rounded-t-3xl p-5 space-y-2 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Set duration</h3>
              <button onClick={() => setShowDurations(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => { updatePrefs({ durationMin: m }); if (!sessionRef.current) setRemaining(m * 60); setShowDurations(false); }}
                  className={cn(
                    'rounded-xl py-3 text-sm font-medium border transition-colors',
                    prefs.durationMin === m
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
                value={prefs.durationMin}
                onChange={e => { const v = Math.max(1, Math.min(480, Number(e.target.value) || 1)); updatePrefs({ durationMin: v }); if (!sessionRef.current) setRemaining(v * 60); }}
                className="mt-1 w-full rounded-xl bg-muted px-3 py-3 text-base outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {showMenu && (
        <div className="absolute top-14 right-4 z-10 min-w-[200px] rounded-xl bg-background text-foreground border shadow-lg overflow-hidden">
          <MenuRow label={prefs.strict ? 'Disable Strict Mode' : 'Enable Strict Mode'} icon={<ShieldAlert className="h-4 w-4" />} onClick={() => { updatePrefs({ strict: !prefs.strict }); setShowMenu(false); }} />
          <MenuRow label="Change Duration" icon={<TimerIcon className="h-4 w-4" />} onClick={() => { setShowDurations(true); setShowMenu(false); }} />
          <MenuRow label="Toggle Full Screen" icon={<Maximize2 className="h-4 w-4" />} onClick={() => { toggleFullscreen(); setShowMenu(false); }} />
          <MenuRow label={prefs.whiteNoise ? 'Stop White Noise' : 'Play White Noise'} icon={<Music2 className="h-4 w-4" />} onClick={() => { updatePrefs({ whiteNoise: !prefs.whiteNoise }); setShowMenu(false); }} />
          <MenuRow label="Browse Sounds & Music" icon={<Music2 className="h-4 w-4" />} onClick={() => { setShowSoundLib(true); setShowMenu(false); }} />
          <MenuRow label="Run in Background" icon={<ArrowDownToLine className="h-4 w-4" />} onClick={() => { setShowMenu(false); continueInBackground(); }} />
          <MenuRow
            label={prefs.notifications ? 'Disable Notifications' : 'Enable Notifications'}
            icon={prefs.notifications ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            onClick={() => {
              const next = !prefs.notifications;
              updatePrefs({ notifications: next });
              if (next) void requestNotificationPermission();
              toast.message(next ? 'Focus notifications on' : 'Focus notifications off');
              setShowMenu(false);
            }}
          />
          {prefs.whiteNoise && (
            <MenuRow label={prefs.whiteNoiseMuted ? 'Unmute Noise' : 'Mute Noise'} icon={prefs.whiteNoiseMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} onClick={() => { updatePrefs({ whiteNoiseMuted: !prefs.whiteNoiseMuted }); setShowMenu(false); }} />
          )}
          {onComplete && (
            <MenuRow label="Mark Task Done" icon={<Check className="h-4 w-4" />} onClick={() => { onComplete(); setShowMenu(false); }} />
          )}
        </div>
      )}

      {confirmExit && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 px-6">
          <div className="bg-background text-foreground rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="text-base font-semibold">Exit Strict Focus?</h3>
            <p className="text-sm text-muted-foreground">You enabled Strict Mode. Exiting now will end your focus session early. Time spent so far will still be counted.</p>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setConfirmExit(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-muted">Stay</button>
              <button onClick={() => { setConfirmExit(false); discardSession(true); onClose(); }} className="px-4 py-2 rounded-lg text-sm bg-destructive text-destructive-foreground">Exit anyway</button>
            </div>
          </div>
        </div>
      )}
      <SoundLibrary
        open={showSoundLib}
        onClose={() => setShowSoundLib(false)}
        selectedId={prefs.soundTrackId}
        onSelect={(t) => {
          updatePrefs({ soundTrackId: t ? t.id : null, whiteNoise: true });
        }}
        volume={prefs.whiteNoiseVolume}
        muted={prefs.whiteNoiseMuted}
        onVolumeChange={(v) => updatePrefs({ whiteNoiseVolume: v, whiteNoiseMuted: false })}
        onMuteToggle={() => updatePrefs({ whiteNoiseMuted: !prefs.whiteNoiseMuted })}
      />

      {showBackgroundPrompt && (
        <div className="absolute inset-0 bg-black/70 flex items-end sm:items-center justify-center z-20 px-4" onClick={() => setShowBackgroundPrompt(false)}>
          <div className="bg-background text-foreground rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">Exit focus session?</h3>
            <p className="text-sm text-muted-foreground">Timer aur sounds dono background mein chalte rahenge. Top bar mein remaining time dikhega.</p>
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={continueInBackground} className="w-full py-2.5 rounded-lg text-sm bg-primary text-primary-foreground font-medium">Run in Background</button>
              <button onClick={exitFully} className="w-full py-2.5 rounded-lg text-sm bg-destructive text-destructive-foreground font-medium">End session</button>
              <button onClick={() => setShowBackgroundPrompt(false)} className="w-full py-2.5 rounded-lg text-sm hover:bg-muted">Cancel</button>
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
