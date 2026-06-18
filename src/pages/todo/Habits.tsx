import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { Plus, PieChart, LayoutGrid, SlidersHorizontal, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TodoBottomNavigation } from '@/components/TodoBottomNavigation';
import { Habit, HabitDayStatus } from '@/types/habit';
import { loadHabits, saveHabit } from '@/utils/habitStorage';
import { loadHabitSections, DEFAULT_HABIT_SECTION_ID } from '@/utils/habitSectionsStorage';
import { triggerHaptic } from '@/utils/haptics';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';
import { readActiveFocus, cleanupStaleFocusKeys, clearActiveFocus } from '@/utils/focusSession';



const Habits = () => {
  const navigate = useNavigate();
  const { requireCapacity } = useSubscription();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [sections, setSections] = useState(() => loadHabitSections());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const loaded = await loadHabits();
    setHabits(loaded.filter((h) => !h.isArchived));
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

  const isHabitDueOn = (habit: Habit, d: Date): boolean => {
    if (habit.frequency === 'daily') return true;
    if (habit.frequency === 'weekly') {
      if (habit.weeklyDays?.length) return habit.weeklyDays.includes(d.getDay());
      return true;
    }
    if (habit.frequency === 'interval' && habit.intervalDays && habit.startDate) {
      const start = parseISO(habit.startDate);
      const diff = Math.floor((d.getTime() - start.getTime()) / 86400000);
      return diff >= 0 && diff % habit.intervalDays === 0;
    }
    return true;
  };

  const cycleStatus = async (habit: Habit) => {
    triggerHaptic('medium').catch(() => {});
    const current = getStatus(habit);
    // null -> done -> skipped -> failed -> null
    const next: HabitDayStatus | null =
      current === null ? 'done' : current === 'done' ? 'skipped' : current === 'skipped' ? 'failed' : null;

    const others = habit.completions.filter((c) => c.date !== dateKey);
    const updated: Habit = {
      ...habit,
      completions:
        next === null
          ? others
          : [...others, { date: dateKey, completed: next === 'done', status: next }],
      updatedAt: new Date().toISOString(),
    };
    // Optimistic UI — flip the checkbox immediately, then persist.
    const previous = habits;
    setHabits((h) => h.map((x) => (x.id === habit.id ? updated : x)));
    try {
      await saveHabit(updated);
    } catch {
      setHabits(previous);
      toast.error('Could not save check-in. Please try again.');
    }
  };


  const visibleHabits = habits.filter((h) => isHabitDueOn(h, selectedDate));

  const grouped = useMemo(() => {
    const map: Record<string, Habit[]> = {};
    sections.forEach((s) => (map[s.id] = []));
    map[DEFAULT_HABIT_SECTION_ID] = map[DEFAULT_HABIT_SECTION_ID] || [];
    visibleHabits.forEach((h) => {
      const sid = h.sectionId && map[h.sectionId] ? h.sectionId : DEFAULT_HABIT_SECTION_ID;
      map[sid].push(h);
    });
    return map;
  }, [visibleHabits, sections]);

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      {/* Header */}
      <header className="safe-area-top bg-background px-4 pt-3 pb-2 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Habit</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate('/todo/habits/stats')}>
            <PieChart className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <LayoutGrid className="h-5 w-5" />
          </Button>
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

      {/* Sections */}
      <div className="px-3 mt-3 space-y-3">
        {sections.map((sec) => {
          const list = grouped[sec.id] || [];
          if (list.length === 0) return null;
          const isCollapsed = collapsed[sec.id];
          return (
            <div key={sec.id} className="bg-background rounded-2xl overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="text-lg font-semibold text-foreground">{sec.name}</span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="text-sm">{list.length}</span>
                  {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {!isCollapsed && (
                <div>
                  {list.map((h) => {
                    const status = getStatus(h);
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
                          {status === 'done' ? (
                            <Check className="h-6 w-6" style={{ color: h.color }} strokeWidth={3} />
                          ) : status === 'skipped' ? (
                            <X className="h-6 w-6 text-emerald-500" strokeWidth={3} />
                          ) : status === 'failed' ? (
                            <X className="h-6 w-6 text-rose-400" strokeWidth={3} />
                          ) : (
                            <span className="text-2xl leading-none">{h.emoji || '✨'}</span>
                          )}
                        </button>
                        <span className="flex-1 text-base text-foreground truncate">{h.name}</span>
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
                  })}
                </div>
              )}
            </div>
          );
        })}

        {visibleHabits.length === 0 && (
          <div className="bg-background rounded-2xl p-10 text-center text-muted-foreground">
            No habits yet. Tap “+ Add Habit” to create your first one.
          </div>
        )}
      </div>

      {/* Add Habit button — exact same style as + Add Tasks on Today */}
      <Button
        onClick={() => { if (!requireCapacity('habits', habits.length)) return; navigate('/todo/habits/gallery'); }}
        className="fixed left-4 right-4 z-30 h-12 text-base font-semibold"
        style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}
        size="lg"
      >
        <Plus className="h-5 w-5" />Add Habit
      </Button>

      <TodoBottomNavigation />
    </div>
  );
};

export default Habits;
