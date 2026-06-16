import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Bell, Trash2, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type ExtraReminderRecurring = 'none' | 'daily' | 'weekly' | 'monthly';

export interface ExtraReminderValue {
  time: Date;
  recurring: ExtraReminderRecurring;
}

interface TaskReminderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue?: ExtraReminderValue | null;
  onSave: (value: ExtraReminderValue) => void;
  onRemove: () => void;
}

const RECURRING_OPTIONS: { value: ExtraReminderRecurring; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const pad = (n: number) => n.toString().padStart(2, '0');

const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const TaskReminderSheet = ({
  isOpen,
  onClose,
  initialValue,
  onSave,
  onRemove,
}: TaskReminderSheetProps) => {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [recurring, setRecurring] = useState<ExtraReminderRecurring>('none');

  useEffect(() => {
    if (!isOpen) return;
    const base = initialValue?.time
      ? new Date(initialValue.time)
      : (() => {
          const d = new Date();
          d.setMinutes(d.getMinutes() + 15, 0, 0);
          return d;
        })();
    setDateStr(toDateInput(base));
    setTimeStr(toTimeInput(base));
    setRecurring(initialValue?.recurring ?? 'none');
  }, [isOpen, initialValue]);

  const handleSave = () => {
    if (!dateStr || !timeStr) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
    if (isNaN(dt.getTime())) return;
    onSave({ time: dt, recurring });
    onClose();
  };

  const previewDate = (() => {
    if (!dateStr || !timeStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
    return isNaN(dt.getTime()) ? null : dt;
  })();

  const isPast = previewDate ? previewDate.getTime() <= Date.now() : false;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-left">
              <Bell className="h-5 w-5 text-primary" />
              Extra reminder
            </SheetTitle>
            <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-left">
            Set an additional reminder, separate from the task's due time.
          </p>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="extra-rem-date" className="text-xs">Date</Label>
              <Input
                id="extra-rem-date"
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="extra-rem-time" className="text-xs">Time</Label>
              <Input
                id="extra-rem-time"
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Repeat</Label>
            <Select value={recurring} onValueChange={(v) => setRecurring(v as ExtraReminderRecurring)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {previewDate && (
            <div
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm',
                isPast && recurring === 'none'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-border bg-muted/40 text-muted-foreground'
              )}
            >
              {isPast && recurring === 'none'
                ? 'This time is in the past — pick a future time.'
                : `Reminds ${format(previewDate, 'EEE, MMM d • h:mm a')}${
                    recurring !== 'none' ? `, repeating ${recurring}` : ''
                  }`}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 flex gap-2" style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)' }}>
          {initialValue && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          )}
          <Button
            type="button"
            className="flex-1"
            onClick={handleSave}
            disabled={!previewDate || (isPast && recurring === 'none')}
          >
            Save reminder
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
