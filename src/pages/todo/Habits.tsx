import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format,
  addDays,
  startOfWeek as dfStartOfWeek,
  isSameDay,
  parseISO,
} from 'date-fns';
import { Plus, PieChart, LayoutGrid, SlidersHorizontal, Check, X, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TodoBottomNavigation } from '@/components/TodoBottomNavigation';
import { Habit, HabitDayStatus, HabitSection } from '@/types/habit';
import { loadHabits, saveHabit } from '@/utils/habitStorage';
import { loadHabitSections, DEFAULT_HABIT_SECTION_ID, getHabitSectionTree } from '@/utils/habitSectionsStorage';
import { triggerHaptic } from '@/utils/haptics';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';
import { readActiveFocus, cleanupStaleFocusKeys, clearActiveFocus } from '@/utils/focusSession';
import { checkMilestones, milestoneEmoji } from '@/utils/habitMilestones';
import { HabitImportSheet } from '@/components/habits/HabitImportSheet';
import { isHabitDueOnDate as smartIsHabitDueOnDate, isMakeUpDay } from '@/utils/habitScheduler';
import { applyStreakFreezes, freezesRemaining, getFreezeState } from '@/utils/habitFreezes';
import { isHabitPausedOn } from '@/utils/habitPause';

const Habits = () => {
  const navigate = useNavigate();
  const { requireCapacity } = useSubscription();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [sections, setSections] = useState(() => loadHabitSections());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    const loaded = await loadHabits();
    // Apply streak freezes lazily for any active habit so the UI always
    // reflects up-to-date streak protection. Persist only when changed.
    const refreshed: Habit[] = [];
    for (const h of loaded) {
      if (h.isArchived) { refreshed.push(h); continue; }
      const before = h.freezeState;
      const after = applyStreakFreezes(h);
      const changed =
        after.currentStreak !== h.currentStreak ||
        after.bestStreak !== h.bestStreak ||
        JSON.stringify(after.freezeState) !== JSON.stringify(before);
      if (changed) {
        try { await saveHabit(after); } catch {}
        refreshed.push(after);
      } else {
        refreshed.push(h);
      }
    }
    setHabits(refreshed.filter((h) => !h.isArchived));
  }, []);

  useEffect(() => {
    load();
    const onUpd = () => load();
    const onSec = () => setSections(loadHabitSections());
    window.addEventListener('habitsUpdated', onUpd);
    window.addEventListener('habitSectionsUpdated', onSec);
    return () => {
      window.removeEventListener('habitsUpdated', onUpd);
      window.removeEventListener('habitSectionsUpdated', onSec);
    };
  }, [load]);

  // After refresh, if a focus session is still active, jump back into that
  // habit so the dialog reopens automatically. Also sweep stale entries.
  useEffect(() => {
    cleanupStaleFocusKeys();
    const active = readActiveFocus();
    if (!active?.habitId) return;
    if (active.endAt && active.endAt <= Date.now()) {
      clearActiveFocus();
      return;
    }
    navigate(`/todo/habits/${active.habitId}`, { replace: true });
  }, [navigate]);

  // Handle widget tap deep-link:
  //  /todo/habits?check=<id>           → cycle that habit
  //  /todo/habits?action=done&id=<id>  → mark done (idempotent)
  //  /todo/habits?action=skip&id=<id>  → mark skipped (idempotent)
  useEffect(() => {
    if (habits.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const checkId = params.get('check');
    const action = params.get('action');
    const actionId = params.get('id');
    let consumed = false;

    if (checkId) {
      const target = habits.find((h) => h.id === checkId);
      if (target) {
        cycleStatus(target);
        toast.success(`${target.emoji || '✨'} ${target.name} — checked in`);
      }
      consumed = true;
    } else if (action && actionId && (action === 'done' || action === 'skip')) {
      const target = habits.find((h) => h.id === actionId);
      if (target) {
        setHabitStatusFromWidget(target, action === 'done' ? 'done' : 'skipped');
      }
      consumed = true;
    }

    if (consumed) {
      params.delete('check');
      params.delete('action');
      params.delete('id');
      const next = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits.length]);

  /** Apply a specific status (done|skipped) from a widget action. Idempotent. */
  const setHabitStatusFromWidget = async (habit: Habit, status: HabitDayStatus) => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const rec = habit.completions.find((c) => c.date === todayKey);
    if (rec?.status === status) {
      toast(`${habit.emoji || '✨'} ${habit.name} — already ${status}`);
      return;
    }
    const others = habit.completions.filter((c) => c.date !== todayKey);
    const updated: Habit = {
      ...habit,
      completions: [
        ...others,
        { date: todayKey, completed: status === 'done', status, note: rec?.note },
      ],
      updatedAt: new Date().toISOString(),
    };
    const withMilestones = fireMilestoneToasts(habit, updated);
    const previous = habits;
    setHabits((h) => h.map((x) => (x.id === habit.id ? withMilestones : x)));
    try {
      await saveHabit(withMilestones);
      if (status === 'done') {
        fireChainToast(withMilestones);
        toast.success(`${habit.emoji || '✨'} ${habit.name} — done`);
      } else {
        toast(`${habit.emoji || '✨'} ${habit.name} — skipped`);
      }
    } catch {
      setHabits(previous);
      toast.error('Could not save check-in. Please try again.');
    }
  };

  // 7-day strip ending today
  const weekDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  }, []);

  const dateKey = format(selectedDate, 'yyyy-MM-dd');

  const getStatus = (habit: Habit): HabitDayStatus | null => {
    const rec = habit.completions.find((c) => c.date === dateKey);
    if (!rec) return null;
    if (rec.status) return rec.status;
    return rec.completed ? 'done' : null;
  };

  /** Returns how many days this week (Mon-Sun) have a completed entry. */
  const completedThisWeek = (habit: Habit, ref: Date): number => {
    const weekStart = dfStartOfWeek(ref, { weekStartsOn: 1 });
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const k = format(addDays(weekStart, i), 'yyyy-MM-dd');
      if (habit.completions.some((c) => c.date === k && c.completed)) n++;
    }
    return n;
  };

  const isHabitDueOn = (habit: Habit, d: Date): boolean => {
    // Paused / vacation / sick day always wins — hide from today list.
    if (isHabitPausedOn(habit, d)) return false;
    if (
      habit.frequency === 'weekly' &&
      !habit.weeklyDays?.length &&
      habit.weeklyCount &&
      habit.weeklyCount > 0
    ) {
      const done = completedThisWeek(habit, d);
      const todayKey = format(d, 'yyyy-MM-dd');
      const alreadyDoneToday = habit.completions.some(
        (c) => c.date === todayKey && c.completed
      );
      return alreadyDoneToday || done < habit.weeklyCount;
    }
    return smartIsHabitDueOnDate(habit, d);
  };

  /** Fire a child-habit toast once when the parent is completed today. */
  const fireChainToast = (parent: Habit) => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const children = habits.filter((h) => h.chainAfterHabitId === parent.id);
    for (const child of children) {
      const alreadyDone = child.completions.some(
        (c) => c.date === todayKey && c.completed
      );
      if (alreadyDone) continue;
      toast(`Next up: ${child.emoji || '✨'} ${child.name}`, {
        action: {
          label: 'Open',
          onClick: () => navigate(`/todo/habits/${child.id}`),
        },
      });
    }
  };

  /** Fire celebration toast(s) for milestones newly crossed by `updated`. */
  const fireMilestoneToasts = (prev: Habit, updated: Habit): Habit => {
    const { events, unlocked } = checkMilestones(prev, updated);
    if (events.length === 0) return updated;
    for (const e of events) {
      toast(`${milestoneEmoji(e.threshold)} ${e.threshold}-day milestone unlocked!`, {
        description: `${updated.emoji || '✨'} ${updated.name} — ${e.source === 'streak' ? 'streak' : 'total check-ins'}`,
      });
    }
    return { ...updated, unlockedMilestones: unlocked };
  };


  const cycleStatus = async (habit: Habit) => {
    triggerHaptic('medium').catch(() => {});
    const isAmount = habit.goalType === 'amount' && (habit.goalAmount ?? 0) > 0;
    const rec = habit.completions.find((c) => c.date === dateKey);

    // Amount habits: tap = +1 toward the goal.
    if (isAmount) {
      const others = habit.completions.filter((c) => c.date !== dateKey);
      const nextAmount = (rec?.amount ?? 0) + 1;
      const wasCompleted = rec?.completed ?? false;
      const completed = nextAmount >= (habit.goalAmount ?? 1);
      const updated: Habit = {
        ...habit,
        completions: [
          ...others,
          {
            date: dateKey,
            amount: nextAmount,
            completed,
            status: completed ? 'done' : undefined,
            note: rec?.note,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      const withMilestones = fireMilestoneToasts(habit, updated);
      const previous = habits;
      setHabits((h) => h.map((x) => (x.id === habit.id ? withMilestones : x)));
      try {
        await saveHabit(withMilestones);
        if (completed && !wasCompleted) fireChainToast(withMilestones);
      } catch {
        setHabits(previous);
        toast.error('Could not save check-in. Please try again.');
      }
      return;
    }

    // Build / Avoid: cycle null → done → skipped → failed → null.
    const current = getStatus(habit);
    const next: HabitDayStatus | null =
      current === null ? 'done' : current === 'done' ? 'skipped' : current === 'skipped' ? 'failed' : null;

    const others = habit.completions.filter((c) => c.date !== dateKey);
    const updated: Habit = {
      ...habit,
      completions:
        next === null
          ? others
          : [...others, { date: dateKey, completed: next === 'done', status: next, note: rec?.note }],
      updatedAt: new Date().toISOString(),
    };
    const withMilestones = fireMilestoneToasts(habit, updated);
    const previous = habits;
    setHabits((h) => h.map((x) => (x.id === habit.id ? withMilestones : x)));
    try {
      await saveHabit(withMilestones);
      if (next === 'done' && current !== 'done') fireChainToast(withMilestones);
    } catch {
      setHabits(previous);
      toast.error('Could not save check-in. Please try again.');
    }
  };

  const visibleHabits = habits.filter((h) => isHabitDueOn(h, selectedDate));

  /**
   * Group habits by section, then arrange into a nested
   * "root section → child sections" structure.
   */
  const { rootSections, childrenByParent, habitsBySection } = useMemo(() => {
    const tree = getHabitSectionTree();
    const map: Record<string, Habit[]> = {};
    sections.forEach((s) => (map[s.id] = []));
    map[DEFAULT_HABIT_SECTION_ID] = map[DEFAULT_HABIT_SECTION_ID] || [];
    visibleHabits.forEach((h) => {
      const sid = h.sectionId && map[h.sectionId] ? h.sectionId : DEFAULT_HABIT_SECTION_ID;
      map[sid].push(h);
    });
    return {
      rootSections: tree.root,
      childrenByParent: tree.childrenByParent,
      habitsBySection: map,
    };
  }, [visibleHabits, sections]);

  const renderHabitRow = (h: Habit) => {
    const status = getStatus(h);
    const isAmount = h.goalType === 'amount' && (h.goalAmount ?? 0) > 0;
    const rec = h.completions.find((c) => c.date === dateKey);
    const isAvoid = h.kind === 'avoid';
    const weeklyQuota =
      h.frequency === 'weekly' && !h.weeklyDays?.length && (h.weeklyCount ?? 0) > 0
        ? { done: completedThisWeek(h, selectedDate), goal: h.weeklyCount! }
        : null;

    return (
      <button
        key={h.id}
        onClick={() => navigate(`/todo/habits/${h.id}`)}
        className="w-full flex items-center gap-3 px-4 py-3 border-t border-border/40 text-left active:bg-muted/40"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            cycleStatus(h);
          }}
          className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor:
              status === 'done'
                ? `${h.color}22`
                : status === 'skipped' || status === 'failed'
                ? 'transparent'
                : `${h.color}22`,
          }}
          aria-label="toggle status"
        >
          {isAmount && !status ? (
            <span className="text-sm font-bold" style={{ color: h.color }}>
              {rec?.amount ?? 0}
            </span>
          ) : status === 'done' ? (
            <Check className="h-6 w-6" style={{ color: h.color }} strokeWidth={3} />
          ) : status === 'skipped' ? (
            <X className="h-6 w-6 text-emerald-500" strokeWidth={3} />
          ) : status === 'failed' ? (
            <X className="h-6 w-6 text-rose-400" strokeWidth={3} />
          ) : (
            <span className="text-2xl leading-none">{h.emoji || '✨'}</span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-base text-foreground truncate flex items-center gap-1.5">
            {isAvoid && <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">Avoid</span>}
            <span className="truncate">{h.name}</span>
            {h.difficulty && (
              <span
                className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                  h.difficulty === 'easy' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
                  h.difficulty === 'medium' && 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
                  h.difficulty === 'hard' && 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                )}
              >
                {h.difficulty === 'easy' ? 'Easy' : h.difficulty === 'medium' ? 'Med' : 'Hard'}
              </span>
            )}
            {isMakeUpDay(h, selectedDate) && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-300"
                title="Rescheduled from a missed day"
              >
                Make-up
              </span>
            )}
            {(getFreezeState(h).frozenDates?.length ?? 0) > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300"
                title={`Streak protected • ${freezesRemaining(h)} freeze${freezesRemaining(h) === 1 ? '' : 's'} left this month`}
              >
                ❄ {freezesRemaining(h)}
              </span>
            )}
          </div>
          {weeklyQuota && (
            <div className="text-[11px] text-muted-foreground">
              {weeklyQuota.done} / {weeklyQuota.goal} this week
            </div>
          )}
          {isAmount && (
            <div className="text-[11px] text-muted-foreground">
              {rec?.amount ?? 0} / {h.goalAmount} {h.goalUnit || ''}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-foreground">
            {h.completions.filter((c) => c.completed).length}
          </div>
          <div className="text-[11px] text-muted-foreground -mt-1">
            Total Day{h.completions.filter((c) => c.completed).length === 1 ? '' : 's'}
          </div>
        </div>
      </button>
    );
  };

  const renderSection = (sec: HabitSection, depth: number) => {
    const ownList = habitsBySection[sec.id] || [];
    const children = childrenByParent[sec.id] || [];
    // Hide a section entirely if it (and its children) have no visible habits.
    const childHabitsCount = children.reduce(
      (n, c) => n + (habitsBySection[c.id]?.length || 0),
      0
    );
    if (ownList.length === 0 && childHabitsCount === 0) return null;
    const isCollapsed = collapsed[sec.id];
    return (
      <div
        key={sec.id}
        className="bg-background rounded-2xl overflow-hidden"
        style={{ marginLeft: depth * 12 }}
      >
        <button
          onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <span className="text-lg font-semibold text-foreground">{sec.name}</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="text-sm">{ownList.length + childHabitsCount}</span>
            {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
        {!isCollapsed && (
          <div>
            {ownList.map(renderHabitRow)}
            {children.map((child) => (
              <div key={child.id} className="border-t border-border/40 pl-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 pb-1">
                  {child.name}
                </div>
                {(habitsBySection[child.id] || []).map(renderHabitRow)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      {/* Header */}
      <header className="safe-area-top bg-background px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Habit</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate('/todo/habits/stats')}>
            <PieChart className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="More options">
                <LayoutGrid className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Download className="h-4 w-4 mr-2" />
                Import Habits
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate('/todo/habits/sections')}>
            <SlidersHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* 7-day strip */}
      <div className="bg-background px-2 pb-3">
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d) => {
            const isSel = isSameDay(d, selectedDate);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelectedDate(d)}
                className="flex flex-col items-center gap-1.5 py-1"
              >
                <span className="text-xs text-muted-foreground">{format(d, 'EEE')}</span>
                <span
                  className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center text-base font-medium',
                    isSel ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  )}
                >
                  {format(d, 'd')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections (with nested children) */}
      <div className="px-3 mt-3 space-y-3">
        {rootSections.map((sec) => renderSection(sec, 0))}

        {visibleHabits.length === 0 && (
          <div className="bg-background rounded-2xl p-10 text-center text-muted-foreground">
            No habits yet. Tap "+ Add Habit" to create your first one.
          </div>
        )}
      </div>

      {/* Add Habit button — exact same style as + Add Tasks on Today */}
      <Button
        onClick={() => { if (!requireCapacity('habits', habits.length)) return; navigate('/todo/habits/gallery'); }}
        className="fixed left-4 right-4 z-30 h-12 text-base font-semibold md:hidden"
        style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}
        size="lg"
      >
        <Plus className="h-5 w-5" />Add Habit
      </Button>

      <TodoBottomNavigation />

      <HabitImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
};

export default Habits;

