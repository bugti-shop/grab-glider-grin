import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';

import { format } from 'date-fns';
import { ArrowLeft, RotateCw, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Habit, HabitDifficulty, HabitFrequencyType, HabitGoalType, HabitKind, HabitReminder } from '@/types/habit';
import { saveHabit, loadHabits } from '@/utils/habitStorage';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { loadHabitSections, DEFAULT_HABIT_SECTION_ID, getHabitSectionTree } from '@/utils/habitSectionsStorage';
import { genId } from '@/utils/genId';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/utils/haptics';
import { scheduleHabitReminder, testHabitReminder } from '@/utils/habitReminders';
import { RemindersList } from '@/components/habits/RemindersList';
import { HABIT_COLOR_SWATCHES, DEFAULT_HABIT_COLOR } from '@/utils/habitColors';
import { toast } from 'sonner';

const ICON_GRID = [
  '😊', '💧', '🍞', '🍚', '🍌', '🥕', '🍦',
  '🌙', '🏃‍♂️', '🏃', '🧘', '🤸', '🚴', '🏊',
  '📘', '✏️', '📓', '💵', '📋', '📞', '👍',
  '👤', '💼', '📷', '👁️', '🦷', '🚿', '🧹',
  '⭐', '📺', '🍽️', '😷', '🚶', '⚖️', '🍫',
];

const QUOTES = [
  'Stay healthier, stay happier',
  'Small steps every day',
  'Discipline equals freedom',
  'Progress, not perfection',
  'Consistency is the key',
  'One day at a time',
];

const STEP_BASICS = 0;
const STEP_DETAILS = 1;

const HabitNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const { requireCapacity } = useSubscription();
  const prefill = (location.state as { name?: string; emoji?: string; quote?: string } | null) || null;
  const [step, setStep] = useState(STEP_BASICS);

  // Holds the original habit when editing — so we preserve completions, streaks, etc.
  const editingRef = useRef<Habit | null>(null);

  // Basics
  const [name, setName] = useState(prefill?.name ?? '');
  const [emoji, setEmoji] = useState(prefill?.emoji ?? '🍌');
  const [quote, setQuote] = useState(prefill?.quote ?? QUOTES[0]);
  const [kind, setKind] = useState<HabitKind>('build');
  const [color, setColor] = useState<string>(DEFAULT_HABIT_COLOR);
  const [difficulty, setDifficulty] = useState<HabitDifficulty | undefined>(undefined);

  // Details
  const [frequency, setFrequency] = useState<HabitFrequencyType>('daily');
  const [weeklyDays, setWeeklyDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [weeklyCount, setWeeklyCount] = useState(2);
  const [intervalDays, setIntervalDays] = useState(2);

  const [goalType, setGoalType] = useState<HabitGoalType>('all');
  const [goalAmount, setGoalAmount] = useState(1);
  const [goalUnit, setGoalUnit] = useState('times');
  const [showGoalDialog, setShowGoalDialog] = useState(false);

  const [startDate, setStartDate] = useState<Date>(new Date());
  const [showDateDialog, setShowDateDialog] = useState(false);

  const [goalDays, setGoalDays] = useState(0); // 0 = forever
  const [showGoalDaysDialog, setShowGoalDaysDialog] = useState(false);

  const [sections, setSections] = useState(() => loadHabitSections());
  const [sectionId, setSectionId] = useState<string>(DEFAULT_HABIT_SECTION_ID);

  const [reminders, setReminders] = useState<HabitReminder[]>([]);
  const [autoPopup, setAutoPopup] = useState(false);

  // "Stack after" — id of the parent habit whose completion triggers this one.
  const [chainAfterHabitId, setChainAfterHabitId] = useState<string | undefined>(undefined);
  const [allHabits, setAllHabits] = useState<Habit[]>([]);
  useEffect(() => {
    loadHabits().then((list) => setAllHabits(list.filter((h) => !h.isArchived)));
  }, []);

  useEffect(() => {
    const onSec = () => setSections(loadHabitSections());
    window.addEventListener('habitSectionsUpdated', onSec);
    return () => window.removeEventListener('habitSectionsUpdated', onSec);
  }, []);

  // Load existing habit when editing.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      const all = await loadHabits();
      const h = all.find((x) => x.id === editId);
      if (!h || cancelled) return;
      editingRef.current = h;
      setName(h.name);
      setEmoji(h.emoji || '🍌');
      setQuote(h.quote || QUOTES[0]);
      setFrequency(h.frequency);
      if (h.weeklyDays?.length) setWeeklyDays(h.weeklyDays);
      if (h.weeklyCount) setWeeklyCount(h.weeklyCount);
      if (h.intervalDays) setIntervalDays(h.intervalDays);
      setGoalType(h.goalType || 'all');
      if (h.goalAmount) setGoalAmount(h.goalAmount);
      if (h.goalUnit) setGoalUnit(h.goalUnit);
      if (h.startDate) setStartDate(new Date(h.startDate));
      setGoalDays(h.goalDays || 0);
      if (h.sectionId) setSectionId(h.sectionId);
      if (h.reminders && h.reminders.length > 0) setReminders(h.reminders);
      else if (h.reminder?.enabled) setReminders([h.reminder]);
      setAutoPopup(!!h.autoPopupLog);
      setKind(h.kind ?? 'build');
      setChainAfterHabitId(h.chainAfterHabitId);
      if (h.color) setColor(h.color);
      setDifficulty(h.difficulty);
    })();
    return () => { cancelled = true; };
  }, [editId]);


  const toggleDay = (d: number) => {
    setWeeklyDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const refreshQuote = () => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  };

  const goalLabel = useMemo(() => {
    if (goalType === 'all') return 'Achieve it all';
    return `Reach ${goalAmount} ${goalUnit}`;
  }, [goalType, goalAmount, goalUnit]);

  const goalDaysLabel = goalDays === 0 ? 'Forever' : `${goalDays} days`;

  const canContinue = step === STEP_BASICS ? name.trim().length > 0 : true;

  const handleSave = async () => {
    triggerHaptic('medium').catch(() => {});
    const existing = await loadHabits();
    const editingExisting = editingRef.current;
    if (!editingExisting) {
      const activeCount = existing.filter((h) => !h.isArchived).length;
      if (!requireCapacity('habits', activeCount)) return;
    }
    const now = new Date().toISOString();
    const habit: Habit = {
      id: editingExisting?.id ?? genId(),
      name: name.trim(),
      emoji,
      color: editingExisting?.color ?? 'hsl(220, 85%, 59%)',
      quote,
      frequency,
      weeklyDays: frequency === 'weekly' || frequency === 'daily' ? weeklyDays : undefined,
      weeklyCount: frequency === 'weekly' ? weeklyCount : undefined,
      intervalDays: frequency === 'interval' ? intervalDays : undefined,
      goalType,
      goalAmount: goalType === 'amount' ? goalAmount : undefined,
      goalUnit: goalType === 'amount' ? goalUnit : undefined,
      startDate: format(startDate, 'yyyy-MM-dd'),
      goalDays,
      sectionId,
      kind,
      chainAfterHabitId: chainAfterHabitId || undefined,
      reminders: reminders.length > 0 ? reminders : undefined,
      reminder: undefined, // legacy field cleared on save
      autoPopupLog: autoPopup,
      completions: editingExisting?.completions ?? [],
      currentStreak: editingExisting?.currentStreak ?? 0,
      bestStreak: editingExisting?.bestStreak ?? 0,
      isArchived: editingExisting?.isArchived ?? false,
      createdAt: editingExisting?.createdAt ?? now,
      updatedAt: now,
    };
    await saveHabit(habit);
    if (habit.reminders && habit.reminders.length > 0) {
      await scheduleHabitReminder(habit);
    }
    navigate('/todo/habits', { replace: true });
  };


  const handleTestReminder = async () => {
    triggerHaptic('light').catch(() => {});
    await testHabitReminder(name.trim() || 'Test habit', emoji, 3000);
    toast.success('Test reminder will fire in 3 seconds');
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <header className="safe-area-top bg-muted/30 px-4 pt-3 pb-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => (step === STEP_BASICS ? navigate(-1) : setStep(STEP_BASICS))}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{editId ? 'Edit Habit' : 'New Habit'}</h1>
      </header>

      <div className="px-3 space-y-3">
        {step === STEP_BASICS ? (
          <>
            {/* Build / Avoid toggle */}
            <section className="bg-background rounded-2xl p-2 flex">
              {(['build', 'avoid'] as HabitKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'flex-1 h-11 rounded-xl text-sm font-semibold capitalize transition-colors',
                    kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  {k === 'build' ? '🌱 Build a habit' : '🚫 Avoid / Quit'}
                </button>
              ))}
            </section>

            {/* Name */}
            <section className="bg-background rounded-2xl p-4">
              <Label className="text-base text-foreground">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Eat fruits"
                className="mt-3 h-12 bg-muted/60 border-0 text-base"
              />
            </section>

            {/* Icon */}
            <section className="bg-background rounded-2xl p-4">
              <Label className="text-base text-foreground">Icon</Label>

              <div className="mt-3 flex items-center gap-3">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center text-3xl"
                  style={{ backgroundColor: 'hsl(142, 71%, 85%)' }}
                >
                  {emoji}
                </div>
                <div className="h-14 w-14 rounded-full bg-pink-200 dark:bg-pink-900/50 flex items-center justify-center text-2xl font-bold text-white">
                  {(name[0] || 'A').toUpperCase()}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-3 mt-4">
                {ICON_GRID.map((ic, i) => {
                  const isSel = ic === emoji;
                  const palette = [
                    'bg-yellow-100', 'bg-teal-100', 'bg-pink-100', 'bg-sky-100',
                    'bg-green-100', 'bg-orange-100', 'bg-pink-100',
                    'bg-indigo-100', 'bg-green-100', 'bg-orange-100', 'bg-pink-100',
                    'bg-orange-100', 'bg-green-100', 'bg-cyan-100',
                    'bg-sky-100', 'bg-amber-100', 'bg-rose-100', 'bg-emerald-100',
                    'bg-blue-100', 'bg-pink-100', 'bg-pink-100',
                    'bg-rose-100', 'bg-cyan-100', 'bg-pink-100', 'bg-lime-100',
                    'bg-cyan-100', 'bg-cyan-100', 'bg-orange-100',
                    'bg-fuchsia-100', 'bg-rose-100', 'bg-amber-100', 'bg-pink-100',
                    'bg-emerald-100', 'bg-teal-100', 'bg-pink-100',
                  ];
                  return (
                    <button
                      key={i}
                      onClick={() => setEmoji(ic)}
                      className={cn(
                        'aspect-square rounded-full flex items-center justify-center text-xl relative',
                        palette[i % palette.length],
                        isSel && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      )}
                    >
                      <span>{ic}</span>
                      {isSel && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Quote */}
            <section className="bg-background rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base text-foreground">Quote</Label>
                <Button variant="ghost" size="icon" onClick={refreshQuote}>
                  <RotateCw className="h-4 w-4 text-primary" />
                </Button>
              </div>
              <Input
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                className="mt-3 h-12 bg-muted/60 border-0 text-base"
              />
            </section>

            <Button
              onClick={() => setStep(STEP_DETAILS)}
              disabled={!canContinue}
              className="fixed left-4 right-4 z-30 h-12 text-base font-semibold"
              style={{ bottom: 'calc(0.75rem + var(--safe-bottom, 0px))' }}
              size="lg"
            >
              Next
            </Button>
          </>
        ) : (
          <>
            {/* Frequency */}
            <section className="bg-background rounded-2xl p-4">
              <Label className="text-base text-foreground">Frequency</Label>
              <div className="flex items-center gap-6 mt-3 border-b border-border/60">
                {(['daily', 'weekly', 'interval'] as HabitFrequencyType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFrequency(f)}
                    className={cn(
                      'pb-2 text-sm font-semibold uppercase tracking-wide relative',
                      frequency === f ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {f}
                    {frequency === f && (
                      <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              {frequency === 'daily' && (
                <div className="flex items-center justify-between mt-4 gap-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((lbl, i) => {
                    const sel = weeklyDays.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => toggleDay(i)}
                        className={cn(
                          'h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold',
                          sel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}

              {frequency === 'weekly' && (
                <div className="mt-4 flex items-center justify-center gap-4 py-6">
                  <NumberWheel value={weeklyCount} onChange={setWeeklyCount} min={1} max={7} />
                  <span className="text-base text-foreground">days per week</span>
                </div>
              )}

              {frequency === 'interval' && (
                <div className="mt-4 flex items-center justify-center gap-4 py-6">
                  <span className="text-base text-foreground">Every</span>
                  <NumberWheel value={intervalDays} onChange={setIntervalDays} min={2} max={30} />
                  <span className="text-base text-foreground">days</span>
                </div>
              )}
            </section>

            {/* Goal / Start Date / Goal Days */}
            <section className="bg-background rounded-2xl divide-y divide-border/60">
              <Row label="Goal" value={goalLabel} onClick={() => setShowGoalDialog(true)} />
              <Row label="Start Date" value={format(startDate, 'MMM d')} onClick={() => setShowDateDialog(true)} />
              <Row label="Goal Days" value={goalDaysLabel} onClick={() => setShowGoalDaysDialog(true)} />
            </section>

            {/* Section */}
            <section className="bg-background rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base text-foreground">Section</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate('/todo/habits/sections')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                {sections.map((s) => {
                  const sel = sectionId === s.id;
                  const parent = s.parentSectionId ? sections.find((p) => p.id === s.parentSectionId) : null;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSectionId(s.id)}
                      className={cn(
                        'px-5 h-10 rounded-lg text-sm font-medium whitespace-nowrap',
                        sel ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                      )}
                    >
                      {parent ? `${parent.name} › ${s.name}` : s.name}
                    </button>
                  );
                })}
              </div>
            </section>


            {/* Reminders (multi) */}
            <section className="bg-background rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base text-foreground">Reminders</Label>
                {reminders.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleTestReminder}>
                    Test
                  </Button>
                )}
              </div>
              <div className="mt-3">
                <RemindersList reminders={reminders} onChange={setReminders} maxReminders={5} />
              </div>
            </section>

            {/* Stack after (habit chain) */}
            {allHabits.filter((h) => h.id !== editingRef.current?.id).length > 0 && (
              <section className="bg-background rounded-2xl p-4">
                <Label className="text-base text-foreground">Stack after</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Triggered when the chosen habit is checked in for the day.
                </p>
                <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => setChainAfterHabitId(undefined)}
                    className={cn(
                      'px-4 h-10 rounded-lg text-sm font-medium whitespace-nowrap',
                      !chainAfterHabitId ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    )}
                  >
                    None
                  </button>
                  {allHabits
                    .filter((h) => h.id !== editingRef.current?.id)
                    .map((h) => {
                      const sel = chainAfterHabitId === h.id;
                      return (
                        <button
                          key={h.id}
                          onClick={() => setChainAfterHabitId(h.id)}
                          className={cn(
                            'px-4 h-10 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-1.5',
                            sel ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                          )}
                        >
                          <span>{h.emoji || '✨'}</span>
                          <span>{h.name}</span>
                        </button>
                      );
                    })}
                </div>
              </section>
            )}

            {/* Auto popup */}
            <section className="bg-background rounded-2xl p-4 flex items-center justify-between">
              <span className="text-base text-foreground">Auto pop-up of habit log</span>
              <Switch checked={autoPopup} onCheckedChange={setAutoPopup} />
            </section>


            <Button
              onClick={handleSave}
              className="fixed left-4 right-4 z-30 h-12 text-base font-semibold"
              style={{ bottom: 'calc(0.75rem + var(--safe-bottom, 0px))' }}
              size="lg"
            >
              Save
            </Button>
          </>
        )}
      </div>

      {/* Goal dialog */}
      <Dialog open={showGoalDialog} onOpenChange={setShowGoalDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <RadioRow
              label="Achieve it all"
              selected={goalType === 'all'}
              onClick={() => setGoalType('all')}
            />
            <RadioRow
              label="Reach a certain amount"
              selected={goalType === 'amount'}
              onClick={() => setGoalType('amount')}
            />
            {goalType === 'amount' && (
              <div className="flex items-center gap-2 pt-2">
                <Input
                  type="number"
                  min={1}
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(Math.max(1, Number(e.target.value) || 1))}
                  className="h-10 w-24"
                />
                <Input
                  value={goalUnit}
                  onChange={(e) => setGoalUnit(e.target.value)}
                  placeholder="unit (e.g. cups)"
                  className="h-10 flex-1"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowGoalDialog(false)} className="text-primary">
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => setShowGoalDialog(false)} className="text-primary">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Date dialog */}
      <Dialog open={showDateDialog} onOpenChange={setShowDateDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Date</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={(d) => d && setStartDate(d)}
            initialFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDateDialog(false)} className="text-primary">
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => setShowDateDialog(false)} className="text-primary">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal Days dialog */}
      <Dialog open={showGoalDaysDialog} onOpenChange={setShowGoalDaysDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Goal Days</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <RadioRow label="Forever" selected={goalDays === 0} onClick={() => setGoalDays(0)} />
            {[7, 21, 30, 66, 100].map((n) => (
              <RadioRow
                key={n}
                label={`${n} days`}
                selected={goalDays === n}
                onClick={() => setGoalDays(n)}
              />
            ))}
            <Input
              type="number"
              min={1}
              placeholder="Custom"
              value={goalDays && ![7, 21, 30, 66, 100].includes(goalDays) ? goalDays : ''}
              onChange={(e) => setGoalDays(Math.max(0, Number(e.target.value) || 0))}
              className="h-10"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowGoalDaysDialog(false)} className="text-primary">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Row = ({ label, value, onClick }: { label: string; value: string; onClick: () => void }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-4 text-left">
    <span className="text-base text-foreground">{label}</span>
    <span className="text-base text-muted-foreground">{value} ›</span>
  </button>
);

const RadioRow = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-1 py-2 text-left"
  >
    <span
      className={cn(
        'h-5 w-5 rounded-full border-2 flex items-center justify-center',
        selected ? 'border-primary' : 'border-muted-foreground/50'
      )}
    >
      {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
    </span>
    <span className="text-base text-foreground">{label}</span>
  </button>
);

const NumberWheel = ({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) => {
  return (
    <div className="flex flex-col items-center select-none">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="text-3xl text-muted-foreground/50 leading-none"
      >
        {value - 1 >= min ? value - 1 : ''}
      </button>
      <div className="text-4xl font-bold text-foreground my-1 min-w-[3rem] text-center">
        {value}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="text-3xl text-muted-foreground/50 leading-none"
      >
        {value + 1 <= max ? value + 1 : ''}
      </button>
    </div>
  );
};

export default HabitNew;
