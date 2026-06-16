import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';

import { TodoLayout } from './TodoLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Hourglass, Plus, Cake, Heart, PartyPopper, Trash2, Pencil,
  MoreVertical, CheckCircle2, RotateCcw, BellOff, Settings2, X,
  ChevronRight,

} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CountdownEvent,
  CountdownRepeat,
  CountdownType,
  ReminderOffset,
  deleteCountdown,
  getDaysUntil,
  loadCountdowns,
  markCountdownDone,

  snoozeCountdown,
  upsertCountdown,
} from '@/utils/countdownStorage';
import {
  cancelCountdownReminders,
  scheduleCountdownReminders,
} from '@/utils/countdownReminders';
import { getSetting, setSetting } from '@/utils/settingsStorage';

const TYPE_META: Record<
  CountdownType,
  { label: string; Icon: typeof Hourglass; color: string; bg: string }
> = {
  countdown: {
    label: 'Countdown',
    Icon: Hourglass,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-100 dark:bg-sky-950/40',
  },
  anniversary: {
    label: 'Anniversary',
    Icon: Heart,
    color: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-100 dark:bg-pink-950/40',
  },
  birthday: {
    label: 'Birthday',
    Icon: Cake,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-100 dark:bg-rose-950/40',
  },
  holiday: {
    label: 'Holiday',
    Icon: PartyPopper,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-950/40',
  },
};

/** Selectable card themes (id, label, swatch, gradient, accent text, header bg). */
export const COUNTDOWN_THEMES: Array<{
  id: string;
  label: string;
  swatch: string;
  // tailwind classes
  cardBg: string;        // row + detail background
  headerBg: string;      // detail calendar-page header
  accentText: string;    // detail event name color
  iconBg: string;        // row icon circle
  iconColor: string;     // row icon color
}> = [
  { id: 'blue',   label: 'Sky',     swatch: '#6F87E4',
    cardBg: 'bg-[hsl(220_80%_92%)] dark:bg-[hsl(220_30%_18%)]',
    headerBg: 'bg-[#6F87E4]', accentText: 'text-[#4567E0]',
    iconBg: 'bg-sky-100 dark:bg-sky-950/40', iconColor: 'text-sky-600 dark:text-sky-400' },
  { id: 'rose',   label: 'Rose',    swatch: '#F472B6',
    cardBg: 'bg-rose-100 dark:bg-rose-950/30',
    headerBg: 'bg-rose-400', accentText: 'text-rose-600 dark:text-rose-400',
    iconBg: 'bg-rose-100 dark:bg-rose-950/40', iconColor: 'text-rose-600 dark:text-rose-400' },
  { id: 'amber',  label: 'Amber',   swatch: '#F59E0B',
    cardBg: 'bg-amber-100 dark:bg-amber-950/30',
    headerBg: 'bg-amber-400', accentText: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-950/40', iconColor: 'text-amber-600 dark:text-amber-400' },
  { id: 'emerald',label: 'Emerald', swatch: '#10B981',
    cardBg: 'bg-emerald-100 dark:bg-emerald-950/30',
    headerBg: 'bg-emerald-500', accentText: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-950/40', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'violet', label: 'Violet',  swatch: '#8B5CF6',
    cardBg: 'bg-violet-100 dark:bg-violet-950/30',
    headerBg: 'bg-violet-500', accentText: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-100 dark:bg-violet-950/40', iconColor: 'text-violet-600 dark:text-violet-400' },
  { id: 'slate',  label: 'Slate',   swatch: '#64748B',
    cardBg: 'bg-slate-100 dark:bg-slate-900/60',
    headerBg: 'bg-slate-500', accentText: 'text-slate-700 dark:text-slate-300',
    iconBg: 'bg-slate-200 dark:bg-slate-800', iconColor: 'text-slate-600 dark:text-slate-300' },
];

export const getCountdownTheme = (id?: string) =>
  COUNTDOWN_THEMES.find((t) => t.id === id) ?? COUNTDOWN_THEMES[0];

const ALL_OFFSETS: ReminderOffset[] = [0, 1, 2, 3, 7, 14, 30];
const OFFSET_LABEL: Record<ReminderOffset, string> = {
  0: 'On the day',
  1: '1 day before',
  2: '2 days before',
  3: '3 days before',
  7: '1 week before',
  14: '2 weeks before',
  30: '1 month before',
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

interface EditorState {
  open: boolean;
  editing?: CountdownEvent;
  initialType?: CountdownType;
  /** unique key so each open remounts the editor with fresh state */
  openId?: number;
}

const Countdown = () => {
  const navigate = useNavigate();
  const { requireCapacity } = useSubscription();
  const [items, setItems] = useState<CountdownEvent[]>([]);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [showCompleted, setShowCompleted] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);


  const reload = async () => setItems(await loadCountdowns());

  useEffect(() => {
    reload();
    getSetting<boolean>('countdownShowCompleted', true).then(setShowCompleted);
    const onUpdate = () => reload();
    window.addEventListener('countdownsUpdated', onUpdate);
    return () => window.removeEventListener('countdownsUpdated', onUpdate);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    if (!showCompleted) list = list.filter((i) => !i.completed);
    return [...list].sort((a, b) => {
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const da = getDaysUntil(a);
      const db = getDaysUntil(b);
      const ua = da >= 0 ? 0 : 1;
      const ub = db >= 0 ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return Math.abs(da) - Math.abs(db);
    });
  }, [items, search, showCompleted]);

  const toggleShowCompleted = async () => {
    const next = !showCompleted;
    setShowCompleted(next);
    await setSetting('countdownShowCompleted', next);
  };

  const handleDelete = async (item: CountdownEvent) => {
    await cancelCountdownReminders(item.id);
    await deleteCountdown(item.id);
    toast.success('Countdown deleted');
    reload();
  };

  const handleToggleDone = async (item: CountdownEvent) => {
    const next = !item.completed;
    await markCountdownDone(item.id, next);
    if (next) await cancelCountdownReminders(item.id);
    else await scheduleCountdownReminders({ ...item, completed: false });
    toast.success(next ? 'Marked done' : 'Reopened');
    reload();
  };

  const handleSnooze = async (item: CountdownEvent, days: number) => {
    await snoozeCountdown(item.id, days);
    const updated = (await loadCountdowns()).find((c) => c.id === item.id);
    if (updated) await scheduleCountdownReminders(updated);
    toast.success(`Snoozed for ${days} day${days === 1 ? '' : 's'}`);
    reload();
  };

  const openNew = (type: CountdownType) => {
    setFabOpen(false);
    if (!requireCapacity('countdowns', items.length)) return;
    setEditor({ open: true, initialType: type, openId: Date.now() });
  };


  const openEdit = (item: CountdownEvent) => {
    setEditor({ open: true, editing: item, openId: Date.now() });
  };

  const fabTypes: CountdownType[] = ['holiday', 'birthday', 'anniversary', 'countdown'];

  return (
    <TodoLayout title="Countdown" searchValue={search} onSearchChange={setSearch}>
      <div className="container mx-auto px-3 sm:px-4 py-3 max-w-screen-md">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Settings2 className="h-3.5 w-3.5 mr-1" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={showCompleted}
                onCheckedChange={toggleShowCompleted}
              >
                Show completed
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Hourglass className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No countdowns yet</p>
              <p className="text-xs mt-1">Tap + to add your first one</p>
            </div>
          ) : (
            filtered.map((item) => (
              <CountdownRow
                key={item.id}
                item={item}
                onOpen={() => navigate(`/todo/countdown/${item.id}`)}
                onEdit={() => openEdit(item)}
                onDelete={() => handleDelete(item)}
                onToggleDone={() => handleToggleDone(item)}
                onSnooze={(d) => handleSnooze(item, d)}
              />
            ))
          )}
        </div>
      </div>

      {/* Radial / fan FAB */}
      <Popover open={fabOpen} onOpenChange={setFabOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            className="fixed right-4 h-14 w-14 rounded-full shadow-lg z-30"
            style={{ bottom: 'calc(4.5rem + var(--safe-bottom, 0px))' }}
            aria-label="Add countdown"
          >
            {fabOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={12}
          className="w-auto p-2 bg-transparent border-0 shadow-none"
        >
          <div className="flex flex-col items-end gap-3">
            {fabTypes.map((t) => {
              const m = TYPE_META[t];
              return (
                <button
                  key={t}
                  onClick={() => openNew(t)}
                  className="flex items-center gap-3 group"
                >
                  <span className="font-semibold text-foreground bg-card/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm">
                    {m.label}
                  </span>
                  <span
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center shadow-md bg-card',
                    )}
                  >
                    <m.Icon className={cn('h-6 w-6', m.color)} />
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <CountdownEditorSheet
        key={editor.openId ?? 'closed'}
        state={editor}
        onClose={() => setEditor({ open: false })}
        onSaved={() => {
          setEditor({ open: false });
          reload();
        }}
      />
    </TodoLayout>
  );
};

interface RowProps {
  item: CountdownEvent;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
  onSnooze: (days: number) => void;
}

const CountdownRow = ({ item, onOpen, onEdit, onDelete, onToggleDone, onSnooze }: RowProps) => {
  const meta = TYPE_META[item.type];
  const theme = getCountdownTheme(item.colorId);
  const days = getDaysUntil(item);
  const isFuture = days >= 0;
  const completed = !!item.completed;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border border-border/50 transition-opacity',
        item.colorId ? theme.cardBg : 'bg-card',
        completed && 'opacity-60'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0',
          completed ? 'bg-muted' : (item.colorId ? theme.iconBg : meta.bg)
        )}
        aria-label={`Open ${item.name}`}
      >
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
        ) : (
          <meta.Icon className={cn('h-5 w-5', item.colorId ? theme.iconColor : meta.color)} />
        )}
      </button>


      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <p
          className={cn(
            'font-semibold truncate',
            completed && 'line-through text-muted-foreground'
          )}
        >
          {item.name}
        </p>
      </button>

      <button type="button" onClick={onOpen} className="text-right">
        <p
          className={cn(
            'text-2xl font-bold leading-none',
            completed
              ? 'text-muted-foreground'
              : isFuture
              ? 'text-primary'
              : 'text-emerald-600 dark:text-emerald-400'
          )}
        >
          {Math.abs(days)}
        </p>
        <p
          className={cn(
            'text-[11px] font-medium',
            completed
              ? 'text-muted-foreground'
              : isFuture
              ? 'text-primary'
              : 'text-emerald-600 dark:text-emerald-400'
          )}
        >
          {days === 0 ? 'Today' : isFuture ? 'Days Left' : 'Days Since'}
        </p>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            aria-label="More actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onToggleDone}>
            {completed ? (
              <>
                <RotateCcw className="h-4 w-4 mr-2" /> Reopen
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark done
              </>
            )}
          </DropdownMenuItem>
          {!completed && (
            <>
              <DropdownMenuLabel className="text-[11px] text-muted-foreground pt-2">
                Snooze
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSnooze(1)}>
                <BellOff className="h-4 w-4 mr-2" /> 1 day
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(7)}>
                <BellOff className="h-4 w-4 mr-2" /> 1 week
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(30)}>
                <BellOff className="h-4 w-4 mr-2" /> 1 month
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

interface EditorProps {
  state: EditorState;
  onClose: () => void;
  onSaved: () => void;
}

const CountdownEditorSheet = ({ state, onClose, onSaved }: EditorProps) => {
  const editing = state.editing;
  const [name, setName] = useState(editing?.name || '');
  const [date, setDate] = useState(editing?.date || todayISO());
  const [type, setType] = useState<CountdownType>(
    editing?.type || state.initialType || 'countdown'
  );
  const [repeat, setRepeat] = useState<CountdownRepeat>(
    editing?.repeat ?? (type === 'birthday' || type === 'anniversary' ? 'yearly' : 'none')
  );
  const [notes, setNotes] = useState(editing?.notes || '');
  const [remindersOn, setRemindersOn] = useState<boolean>(
    (editing?.reminderOffsets?.length ?? 1) > 0
  );
  const [offsets, setOffsets] = useState<ReminderOffset[]>(
    editing?.reminderOffsets ?? [0, 3]
  );
  const [reminderTime, setReminderTime] = useState(editing?.reminderTime || '09:00');
  const [showAge, setShowAge] = useState<boolean>(editing?.showAge ?? true);
  const [smartListMode, setSmartListMode] = useState<'always' | 'on-day'>(
    editing?.smartListMode ?? 'on-day'
  );
  const [colorId, setColorId] = useState<string>(editing?.colorId ?? COUNTDOWN_THEMES[0].id);

  const meta = TYPE_META[type];

  const daysPreview = useMemo(() => {
    if (!date) return null;
    return getDaysUntil({ date, repeat, snoozedUntil: undefined });
  }, [date, repeat]);

  const datePretty = useMemo(() => {
    if (!date) return '';
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  }, [date]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Please enter a name');
      return;
    }
    if (!date) {
      toast.error('Please pick a date');
      return;
    }
    const saved = await upsertCountdown({
      id: editing?.id,
      name: trimmed,
      date,
      type,
      repeat,
      notes: notes.trim() || undefined,
      reminderOffsets: remindersOn ? offsets : [],
      reminderTime: remindersOn ? reminderTime : undefined,
      completed: editing?.completed ?? false,
      snoozedUntil: editing?.snoozedUntil,
      showAge: type === 'birthday' || type === 'anniversary' ? showAge : undefined,
      smartListMode,
      styleId: editing?.styleId,
      colorId,
    });
    // Proactively request OS notification permission when reminders are on
    if (remindersOn) {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { LocalNotifications } = await import('@capacitor/local-notifications');
          await LocalNotifications.requestPermissions();
        } else {
          const { requestNotificationPermission } = await import('@/utils/webNotifications');
          await requestNotificationPermission();
        }
      } catch {}
    }
    await scheduleCountdownReminders(saved);
    toast.success(editing ? 'Countdown updated' : 'Countdown added');
    onSaved();
  };

  const reminderSummary = remindersOn
    ? offsets.length === 0
      ? 'None'
      : offsets
          .slice()
          .sort((a, b) => a - b)
          .map((o) => (o === 0 ? 'On the day' : `${o} day${o === 1 ? '' : 's'} early`))
          .join(', ')
    : 'Off';

  const repeatLabel: Record<CountdownRepeat, string> = {
    none: 'Never',
    daily: 'Every Day',
    weekly: 'Every Week',
    monthly: 'Every Month',
    yearly: 'Every Year',
  };

  return (
    <Sheet open={state.open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] sm:h-[100dvh] p-0 flex flex-col gap-0 max-w-full sm:max-w-md sm:mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
          <h2 className="text-2xl font-bold">{editing ? 'Edit' : 'Add'}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-32">
          {/* Type icon */}
          <div className="flex justify-center py-4">
            <Select value={type} onValueChange={(v) => setType(v as CountdownType)}>
              <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 [&>svg]:hidden">
                <div
                  className={cn(
                    'h-20 w-20 rounded-full flex items-center justify-center',
                    meta.bg
                  )}
                >
                  <meta.Icon className={cn('h-10 w-10', meta.color)} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="countdown">Countdown</SelectItem>
                <SelectItem value="anniversary">Anniversary</SelectItem>
                <SelectItem value="birthday">Birthday</SelectItem>
                <SelectItem value="holiday">Holiday</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="mb-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="h-14 text-base bg-muted/50 border-0 rounded-xl"
              autoFocus
            />
          </div>

          {/* Card 1: Date / Reminder / Repeat */}
          <div className="rounded-2xl bg-card border border-border/50 divide-y divide-border/50 mb-4">
            <label className="flex items-center justify-between px-4 py-4 cursor-pointer">
              <span className="font-medium">Date</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent outline-none text-right"
                />
                <ChevronRight className="h-4 w-4" />
              </span>
            </label>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Reminder</span>
                <Switch checked={remindersOn} onCheckedChange={setRemindersOn} />
              </div>
              {remindersOn && (
                <>
                  <div className="text-xs text-muted-foreground mb-2">{reminderSummary}</div>
                  <ToggleGroup
                    type="multiple"
                    value={offsets.map(String)}
                    onValueChange={(vals) =>
                      setOffsets(
                        (vals.map(Number) as ReminderOffset[]).sort((a, b) => a - b)
                      )
                    }
                    className="flex flex-wrap justify-start gap-1"
                  >
                    {ALL_OFFSETS.map((o) => (
                      <ToggleGroupItem
                        key={o}
                        value={String(o)}
                        size="sm"
                        className="text-[11px] h-7 px-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                        aria-label={OFFSET_LABEL[o]}
                      >
                        {OFFSET_LABEL[o]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <div className="mt-2">
                    <Input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="h-9 w-32"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-4">
              <span className="font-medium">Repeat</span>
              <Select value={repeat} onValueChange={(v) => setRepeat(v as CountdownRepeat)}>
                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 text-muted-foreground">
                  <SelectValue>{repeatLabel[repeat]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Never</SelectItem>
                  <SelectItem value="daily">Every Day</SelectItem>
                  <SelectItem value="weekly">Every Week</SelectItem>
                  <SelectItem value="monthly">Every Month</SelectItem>
                  <SelectItem value="yearly">Every Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Card 2: Type / Show Age / Smart List */}
          <div className="rounded-2xl bg-card border border-border/50 divide-y divide-border/50 mb-4">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="font-medium">Type</span>
              <Select value={type} onValueChange={(v) => setType(v as CountdownType)}>
                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 text-muted-foreground">
                  <SelectValue>{TYPE_META[type].label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="countdown">Countdown</SelectItem>
                  <SelectItem value="anniversary">Anniversary</SelectItem>
                  <SelectItem value="birthday">Birthday</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(type === 'birthday' || type === 'anniversary') && (
              <div className="flex items-center justify-between px-4 py-4">
                <span className="font-medium">Show Age</span>
                <Switch checked={showAge} onCheckedChange={setShowAge} />
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-4">
              <span className="font-medium">Show in Smart List</span>
              <Select
                value={smartListMode}
                onValueChange={(v) => setSmartListMode(v as 'always' | 'on-day')}
              >
                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 text-muted-foreground">
                  <SelectValue>
                    {smartListMode === 'always' ? 'Always' : 'On the day'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on-day">On the day</SelectItem>
                  <SelectItem value="always">Always</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Theme / Color */}
          <div className="rounded-2xl bg-card border border-border/50 mb-4 px-4 py-4">
            <p className="font-medium mb-3">Theme</p>
            <div className="flex flex-wrap gap-2">
              {COUNTDOWN_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setColorId(t.id)}
                  aria-label={t.label}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 transition-all',
                    colorId === t.id
                      ? 'border-foreground scale-110 shadow-md'
                      : 'border-transparent'
                  )}
                  style={{ backgroundColor: t.swatch }}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4">

            <Label htmlFor="cd-notes" className="text-xs text-muted-foreground">
              Notes (optional)
            </Label>
            <Textarea
              id="cd-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 bg-background px-4 pt-3 pb-[calc(1rem+var(--safe-bottom,0px))] space-y-3">
          {daysPreview !== null && (
            <p className="text-center text-sm text-muted-foreground">
              {Math.abs(daysPreview)} days {daysPreview >= 0 ? 'left until' : 'since'}{' '}
              {datePretty}
            </p>
          )}
          <Button onClick={handleSave} className="w-full h-12 text-base rounded-xl">
            {editing ? 'Save' : 'Add'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default Countdown;
