import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { HabitReminder } from '@/types/habit';

interface Props {
  reminders: HabitReminder[];
  onChange: (next: HabitReminder[]) => void;
  /** Soft cap — we won't render the add button beyond this. */
  maxReminders?: number;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Multi-reminder editor: each reminder has a time and optional weekday
 * restriction. An empty `days` array means "every day".
 */
export const RemindersList = ({ reminders, onChange, maxReminders = 5 }: Props) => {
  const update = (idx: number, patch: Partial<HabitReminder>) => {
    onChange(reminders.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx: number) => {
    onChange(reminders.filter((_, i) => i !== idx));
  };
  const add = () => {
    onChange([...reminders, { enabled: true, time: '08:00', days: [] }]);
  };
  const toggleDay = (idx: number, day: number) => {
    const r = reminders[idx];
    const days = r.days ?? [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    update(idx, { days: next });
  };

  return (
    <div className="space-y-3">
      {reminders.map((r, idx) => {
        const days = r.days ?? [];
        const everyDay = days.length === 0 || days.length === 7;
        return (
          <div key={idx} className="rounded-xl bg-muted/40 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={r.time}
                onChange={(e) => update(idx, { time: e.target.value })}
                className="h-10 w-32 bg-background border-0"
              />
              <span className="text-xs text-muted-foreground flex-1">
                {everyDay ? 'Every day' : `${days.length} day${days.length === 1 ? '' : 's'}/week`}
              </span>
              <Button variant="ghost" size="icon" onClick={() => remove(idx)} aria-label="Remove reminder">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              {DAY_LABELS.map((lbl, di) => {
                const sel = everyDay || days.includes(di);
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => toggleDay(idx, di)}
                    className={cn(
                      'h-8 w-8 rounded-full text-xs font-semibold transition-colors',
                      sel ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
                    )}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {reminders.length < maxReminders && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-2 text-primary text-base font-medium"
        >
          <Plus className="h-4 w-4" /> Add reminder
        </button>
      )}
    </div>
  );
};
