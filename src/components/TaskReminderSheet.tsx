import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Bell, Trash2, X, Plus, Lock, ChevronDown } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { ExtraReminderItem, ExtraReminderRecurring } from '@/types/note';

// Re-exported for backward compatibility with existing imports.
export type { ExtraReminderRecurring } from '@/types/note';
export interface ExtraReminderValue {
  time: Date;
  recurring: ExtraReminderRecurring;
}

interface TaskReminderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Legacy single-value seed (used when `initialItems` is empty). */
  initialValue?: ExtraReminderValue | null;
  /** Preferred: full list of existing reminders. */
  initialItems?: ExtraReminderItem[] | null;
  /** Legacy callback — receives the FIRST reminder for backward compat. */
  onSave: (value: ExtraReminderValue) => void;
  /** Preferred callback — receives the full ordered list of reminders. */
  onSaveAll?: (items: ExtraReminderItem[]) => void;
  onRemove: () => void;
}

const RECURRING_OPTIONS: { value: ExtraReminderRecurring; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

interface DraftReminder {
  id: string;
  date: string;
  time: string;
  recurring: ExtraReminderRecurring;
  daysOfWeek: number[];
}

const seedDraft = (base?: Partial<ExtraReminderItem> | null): DraftReminder => {
  const time = base?.time ? new Date(base.time) : (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15, 0, 0);
    return d;
  })();
  return {
    id: (base as ExtraReminderItem | undefined)?.id ?? uid(),
    date: toDateInput(time),
    time: toTimeInput(time),
    recurring: (base?.recurring as ExtraReminderRecurring | undefined) ?? 'daily',
    daysOfWeek:
      Array.isArray(base?.daysOfWeek) && base!.daysOfWeek!.length > 0
        ? [...base!.daysOfWeek!]
        : [...ALL_DAYS],
  };
};

const draftToDate = (d: DraftReminder): Date | null => {
  if (!d.date || !d.time) return null;
  const [y, m, day] = d.date.split('-').map(Number);
  const [hh, mm] = d.time.split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, day || 1, hh || 0, mm || 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
};

const recurringLabel = (r: ExtraReminderRecurring) =>
  RECURRING_OPTIONS.find((o) => o.value === r)?.label ?? 'Once';

export const TaskReminderSheet = ({
  isOpen,
  onClose,
  initialValue,
  initialItems,
  onSave,
  onSaveAll,
  onRemove,
}: TaskReminderSheetProps) => {
  const { isPro, showFeaturePaywall } = useSubscription();
  const [drafts, setDrafts] = useState<DraftReminder[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialItems && initialItems.length > 0) {
      setDrafts(initialItems.map((it) => seedDraft(it)));
    } else if (initialValue) {
      setDrafts([seedDraft(initialValue)]);
    } else {
      setDrafts([seedDraft()]);
    }
  }, [isOpen, initialValue, initialItems]);

  const updateDraft = (id: string, patch: Partial<DraftReminder>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const toggleDay = (id: string, day: number) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const has = d.daysOfWeek.includes(day);
        const next = has ? d.daysOfWeek.filter((x) => x !== day) : [...d.daysOfWeek, day];
        return { ...d, daysOfWeek: next.sort((a, b) => a - b) };
      })
    );
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.id !== id)));
  };

  const handleAdd = () => {
    if (!isPro && drafts.length >= 1) {
      showFeaturePaywall('multiple_task_reminders');
      return;
    }
    setDrafts((prev) => [...prev, seedDraft()]);
  };

  const handleSave = () => {
    const items: ExtraReminderItem[] = [];
    for (const d of drafts) {
      const dt = draftToDate(d);
      if (!dt) {
        toast.error('Please fill every reminder date and time.');
        return;
      }
      const dow =
        d.daysOfWeek.length === 0 || d.daysOfWeek.length === 7 ? undefined : [...d.daysOfWeek];
      items.push({ id: d.id, time: dt, recurring: d.recurring, daysOfWeek: dow });
    }
    // Free tier hard cap — extra safety on top of the "+ Add reminder" gate.
    const capped = isPro ? items : items.slice(0, 1);

    if (onSaveAll) onSaveAll(capped);
    // Mirror the first item into the legacy single-value callback.
    if (capped[0]) onSave({ time: capped[0].time, recurring: capped[0].recurring });
    onClose();
  };

  const handleRemoveAll = () => {
    onRemove();
    onClose();
  };

  const anyExisting = (initialItems && initialItems.length > 0) || !!initialValue;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[92vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-left">
              <Bell className="h-5 w-5 text-primary" />
              Reminders
            </SheetTitle>
            <button
              type="button"
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-left">
            Extra reminders for this task, independent of its due time.
          </p>
        </SheetHeader>

        <div className="px-4 py-4 space-y-4">
          {drafts.map((d, index) => {
            const preview = draftToDate(d);
            const isPast = preview ? preview.getTime() <= Date.now() : false;
            const showDays = d.recurring === 'daily' || d.recurring === 'weekly';
            return (
              <div
                key={d.id}
                className="rounded-2xl border border-border bg-muted/30 p-3 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={d.date}
                    onChange={(e) => updateDraft(d.id, { date: e.target.value })}
                    className="h-11 flex-1 bg-background"
                    aria-label="Reminder date"
                  />
                  <Input
                    type="time"
                    value={d.time}
                    onChange={(e) => updateDraft(d.id, { time: e.target.value })}
                    className="h-11 w-[120px] bg-background"
                    aria-label="Reminder time"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraft(d.id)}
                    disabled={drafts.length <= 1}
                    className={cn(
                      'p-2 rounded-lg',
                      drafts.length <= 1
                        ? 'text-muted-foreground/40'
                        : 'text-muted-foreground hover:bg-muted hover:text-destructive'
                    )}
                    aria-label="Remove reminder"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <Select
                  value={d.recurring}
                  onValueChange={(v) => updateDraft(d.id, { recurring: v as ExtraReminderRecurring })}
                >
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        {recurringLabel(d.recurring)}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {RECURRING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {showDays && (
                  <div className="flex items-center justify-between gap-1.5">
                    {DAY_LABELS.map((label, i) => {
                      const active = d.daysOfWeek.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleDay(d.id, i)}
                          className={cn(
                            'h-9 w-9 rounded-full text-xs font-semibold transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-background text-muted-foreground border border-border hover:bg-muted'
                          )}
                          aria-pressed={active}
                          aria-label={`Toggle day ${label}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {preview && (
                  <p
                    className={cn(
                      'text-xs',
                      isPast && d.recurring === 'none'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    )}
                  >
                    {isPast && d.recurring === 'none'
                      ? 'This time is in the past — pick a future time.'
                      : `Reminder ${index + 1}: ${format(preview, 'EEE, MMM d • h:mm a')} · ${recurringLabel(d.recurring)}`}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAdd}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-sm font-medium transition-colors',
              isPro
                ? 'border-primary/40 text-primary hover:bg-primary/5'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {isPro ? <Plus className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {isPro ? 'Add reminder' : 'Add reminder — Upgrade for multiple'}
          </button>
        </div>

        <div
          className="px-5 pb-5 pt-2 flex gap-2 border-t border-border bg-background/70 backdrop-blur"
          style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)' }}
        >
          {anyExisting && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive"
              onClick={handleRemoveAll}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove all
            </Button>
          )}
          <Button type="button" className="flex-1" onClick={handleSave}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
