import { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns';
import {
  ArrowLeft, MoreVertical, ChevronLeft, ChevronRight,
  CheckCircle2, CalendarCheck, Percent, Activity, Trash2, Check, Share2, ChevronUp,
  Pencil, Target, Archive,
} from 'lucide-react';

import { m as motion, AnimatePresence, useMotionValue, useTransform, animate as motionAnimate } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Habit, HabitDayStatus } from '@/types/habit';
import { loadHabits, saveHabit, deleteHabit } from '@/utils/habitStorage';
import { triggerHaptic } from '@/utils/haptics';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';


const HabitDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [habit, setHabit] = useState<Habit | null>(null);
  const [month, setMonth] = useState(new Date());
  const [expanded, setExpanded] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const knobX = useMotionValue(0);
  const completingRef = useRef(false);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    const all = await loadHabits();
    setHabit(all.find((h) => h.id === id) || null);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Pill swipe-to-complete geometry — keep motion hooks before any early return.
  const KNOB = 56;
  const PAD = 4;
  const maxDrag = Math.max(0, trackWidth - KNOB - PAD * 2);
  const progress = useTransform(knobX, [0, Math.max(1, maxDrag)], [0, 1]);
  const fillWidth = useTransform(knobX, (v) => `${KNOB + Math.max(0, v)}px`);
  const labelOpacity = useTransform(progress, [0, 0.5], [1, 0]);

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    const days: Date[] = [];
    let d = start;
    while (d <= end) { days.push(d); d = addDays(d, 1); }
    return days;
  }, [month]);

  if (!habit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const headerColor = habit.color || 'hsl(345, 82%, 72%)';

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayDone = habit.completions.some((c) => c.date === todayKey && c.completed);

  const toggleToday = async () => {
    triggerHaptic('medium').catch(() => {});
    const others = habit.completions.filter((c) => c.date !== todayKey);
    const updated: Habit = {
      ...habit,
      completions: todayDone
        ? others
        : [...others, { date: todayKey, completed: true, status: 'done' }],
      updatedAt: new Date().toISOString(),
    };
    await saveHabit(updated);
    setHabit(updated);
  };

  const finishSwipe = () => {
    if (completingRef.current) return;
    completingRef.current = true;
    motionAnimate(knobX, maxDrag, { type: 'spring', stiffness: 420, damping: 32 });
    toggleToday().finally(() => {
      completingRef.current = false;
    });
  };

  const handleDragEnd = () => {
    if (knobX.get() >= maxDrag * 0.55) finishSwipe();
    else motionAnimate(knobX, 0, { type: 'spring', stiffness: 380, damping: 30 });
  };

  // Tap-to-complete fallback: if user taps the knob without dragging, still check in.
  const handleKnobTap = () => {
    if (todayDone || completingRef.current) return;
    finishSwipe();
  };


  const statusFor = (d: Date): HabitDayStatus | null => {
    const key = format(d, 'yyyy-MM-dd');
    const rec = habit.completions.find((c) => c.date === key);
    if (!rec) return null;
    return rec.status || (rec.completed ? 'done' : null);
  };

  const monthlyCheckins = habit.completions.filter(
    (c) => c.completed && isSameMonth(new Date(c.date), month)
  ).length;
  const totalCheckins = habit.completions.filter((c) => c.completed).length;
  const daysInMonth = endOfMonth(month).getDate();
  const monthlyPct = Math.round((monthlyCheckins / daysInMonth) * 100);

  const streak = (() => {
    const dates = new Set(habit.completions.filter((c) => c.completed).map((c) => c.date));
    let s = 0; let cur = new Date();
    while (dates.has(format(cur, 'yyyy-MM-dd'))) { s++; cur = addDays(cur, -1); }
    return s;
  })();
  const bestStreak = (() => {
    const sorted = Array.from(new Set(habit.completions.filter((c) => c.completed).map((c) => c.date))).sort();
    let best = 0, cur = 0, prev: Date | null = null;
    for (const k of sorted) {
      const d = new Date(k);
      if (prev && (d.getTime() - prev.getTime()) / 86400000 === 1) cur++;
      else cur = 1;
      best = Math.max(best, cur); prev = d;
    }
    return best;
  })();

  const handleDelete = async () => {
    if (!confirm('Delete this habit?')) return;
    await deleteHabit(habit.id);
    navigate(-1);
  };

  const handleEdit = () => navigate(`/todo/habits/new?id=${habit.id}`);

  const handleArchive = async () => {
    const updated: Habit = { ...habit, isArchived: !habit.isArchived, updatedAt: new Date().toISOString() };
    await saveHabit(updated);
    navigate(-1);
  };

  const handleShare = async () => {
    triggerHaptic('light').catch(() => {});
    const text = `${habit.emoji || '✨'} ${habit.name} — ${streak} day streak (best ${bestStreak}). Total check-ins: ${totalCheckins}.`;
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: habit.name, text });
      else { await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }
    } catch {}
  };

  const handleStartFocus = () => {
    try { sessionStorage.setItem('focus:habit', JSON.stringify({ id: habit.id, name: habit.name })); } catch {}
    navigate('/todo');
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: headerColor }}>
      {/* Decorative blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -left-16 top-24 w-[420px] h-32 rounded-full opacity-40" style={{ background: 'rgba(255,255,255,0.35)' }} />
        <div className="absolute -left-12 top-60 w-64 h-20 rounded-full opacity-30" style={{ background: 'rgba(255,255,255,0.25)' }} />
        <AnimatePresence>
          {todayDone && (
            <motion.div
              key="achieved-stamp"
              initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
              animate={{ opacity: 1, scale: 1, rotate: 12 }}
              exit={{ opacity: 0, scale: 0.6, rotate: 30 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
              className="absolute right-6 top-28 w-32 h-32 rounded-full border-[3px] border-white/70 flex items-center justify-center text-white text-xs font-extrabold tracking-[0.25em] select-none shadow-[0_0_0_2px_rgba(255,255,255,0.15)_inset]"
            >
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.25 }}
              >
                ACHIEVED
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Top bar */}
      <header className="safe-area-top relative z-10 px-4 pt-3 pb-2 flex items-center justify-between text-white">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20">
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <MoreVertical className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleEdit}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleStartFocus}>
              <Target className="h-4 w-4 mr-2" /> Start Focus
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" /> Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchive}>
              <Archive className="h-4 w-4 mr-2" /> {habit.isArchived ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>

        </DropdownMenu>
      </header>

      {/* HERO: big icon + name + quote */}
      <div className="relative z-10 px-6 pt-2 pb-6 text-center">
        <div className="mx-auto w-56 h-56 rounded-full flex items-center justify-center text-[120px] select-none"
          style={{ background: 'rgba(255,255,255,0.18)' }}>
          <span>{habit.emoji || '✨'}</span>
        </div>
        <h1 className="mt-8 text-white text-[34px] font-extrabold leading-tight drop-shadow-sm">{habit.name}</h1>
        <p className="mt-2 text-white/85 text-[15px]">{habit.quote || 'Keep going, one day at a time'}</p>
      </div>

      {/* Swipe-to-complete pill OR achieved stats card */}
      <div className="relative z-10 px-6 mt-4">
        <AnimatePresence mode="wait" initial={false}>
          {!todayDone ? (
            <motion.div
              key="pill"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              ref={trackRef}
              className="relative h-16 rounded-full overflow-hidden select-none"
              style={{ background: 'rgba(255,255,255,0.28)' }}
            >
              {/* progress fill following the knob */}
              <motion.div
                aria-hidden
                className="absolute top-0 left-0 h-full rounded-full pointer-events-none"
                style={{ width: fillWidth, background: 'rgba(255,255,255,0.35)' }}
              />
              <motion.span
                style={{ opacity: labelOpacity }}
                className="absolute inset-0 flex items-center justify-center text-white/95 text-[15px] font-semibold tracking-wide pointer-events-none"
              >
                Swipe to check in →
              </motion.span>
              <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: maxDrag }}
                dragElastic={0}
                dragMomentum={false}
                onDragEnd={handleDragEnd}
                onTap={handleKnobTap}
                whileTap={{ scale: 0.96 }}
                style={{ x: knobX, color: headerColor, top: PAD, left: PAD, touchAction: 'none' }}
                className="absolute h-14 w-14 rounded-full bg-white shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing"
                aria-label="Swipe to check in"
              >
                <Check className="h-7 w-7" strokeWidth={3} />
              </motion.div>

            </motion.div>
          ) : (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl bg-white shadow-xl p-5"
            >
              <div className="grid grid-cols-3 text-center">
                <div>
                  <div className="text-[32px] font-bold text-foreground leading-none">{totalCheckins}</div>
                  <div className="text-xs text-muted-foreground mt-2">Total check-ins</div>
                </div>
                <div>
                  <div className="text-[32px] font-bold text-foreground leading-none">{bestStreak}</div>
                  <div className="text-xs text-muted-foreground mt-2">Best Streak</div>
                </div>
                <div>
                  <div className="text-[32px] font-bold text-foreground leading-none">{streak}</div>
                  <div className="text-xs text-muted-foreground mt-2">Streak</div>
                </div>
              </div>
              <button
                onClick={() => { triggerHaptic('light').catch(() => {}); }}
                className="mt-4 w-full h-12 rounded-full text-white font-semibold text-[15px]"
                style={{ background: headerColor, opacity: 0.85 }}
              >
                <Share2 className="inline-block h-4 w-4 mr-2 -mt-0.5" /> Share
              </button>
              <button
                onClick={toggleToday}
                className="mt-2 w-full text-[12px] text-muted-foreground underline"
              >
                Undo today's check-in
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Expand chevron */}
      <div className="relative z-10 flex justify-center pt-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-white/90 active:scale-95"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? <ChevronUp className="h-7 w-7" /> : <ChevronUp className="h-7 w-7 rotate-180" />}
        </button>
      </div>

      {/* Expandable details panel */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 overflow-hidden"
          >
            <div className="px-3 space-y-3 pb-10 pt-4">
              {/* Calendar card */}
              <div className="bg-background rounded-2xl p-3">
                <div className="flex items-center justify-between px-2 py-1">
                  <Button variant="ghost" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="text-lg font-semibold">{format(month, 'MMMM')}</span>
                  <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-7 text-center text-xs text-muted-foreground py-2">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-y-2 pb-2">
                  {grid.map((d) => {
                    const status = statusFor(d);
                    const inMonth = isSameMonth(d, month);
                    const isToday = isSameDay(d, new Date());
                    return (
                      <div key={d.toISOString()} className="flex items-center justify-center py-1">
                        <div className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center text-base',
                          !inMonth && 'text-muted-foreground/40',
                          inMonth && !status && 'text-foreground',
                          isToday && !status && 'border border-primary text-primary',
                          status === 'done' && 'bg-primary text-primary-foreground',
                          status === 'skipped' && 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
                          status === 'failed' && 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
                        )}>
                          {format(d, 'd')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-background rounded-2xl p-4">
                <h2 className="text-lg font-bold mb-3">Check-ins Statistics</h2>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="Monthly check-ins" value={String(monthlyCheckins)} unit="Days" />
                  <StatCard icon={<CalendarCheck className="h-4 w-4 text-teal-500" />} label="Total check-ins" value={String(totalCheckins)} unit="Days" />
                  <StatCard icon={<Percent className="h-4 w-4 text-amber-500" />} label="Monthly %" value={String(monthlyPct)} unit="%" />
                  <StatCard icon={<Activity className="h-4 w-4 text-indigo-500" />} label="Streak" value={String(streak)} unit="Days" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatCard = ({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) => (
  <div className="bg-muted/40 rounded-xl p-3">
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div className="mt-2 flex items-baseline gap-1">
      <span className="text-3xl font-bold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
  </div>
);

export default HabitDetail;
