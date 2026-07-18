import { useMemo, useState } from 'react';
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addMonths,
  subMonths,
} from 'date-fns';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note } from '@/types/note';
import { NoteCard } from '@/components/NoteCard';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  notes?: Note[];
  onEditNote?: (n: Note) => void;
  onDeleteNote?: (id: string) => void;
  // Accepted for compatibility; ignored by this layout
  highlightedDates?: Date[];
  onBackgroundSettingsClick?: () => void;
  onAddClick?: () => void;
  onMonthClick?: () => void;
  onAddNote?: () => void;
  itemLabel?: string; // e.g. "Notes" or "Tasks"

}


type Mode = 'day' | 'week' | 'month';

const WEEK_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const NotesCalendarDayWeekMonth = ({
  selectedDate,
  onDateSelect,
  notes = [],

  onEditNote,
  onDeleteNote,
  itemLabel = 'Notes',
}: Props) => {
  const [mode, setMode] = useState<Mode>('day');

  const noteDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) s.add(dateKey(new Date(n.createdAt)));
    return s;
  }, [notes]);

  // Anchor: start of week containing selectedDate (Monday-start)
  const weekStart = useMemo(
    () => startOfWeek(selectedDate, { weekStartsOn: 1 }),
    [selectedDate],
  );

  // For 'day' & 'week' we show 2 weeks strip (matches reference).
  const twoWeekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 14; i++) days.push(addDays(weekStart, i));
    return days;
  }, [weekStart]);

  // Full month grid for 'month'
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(selectedDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 });
    const days: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days.slice(0, 42);
  }, [selectedDate]);

  const selectedNotes = useMemo(
    () => notes.filter((n) => isSameDay(new Date(n.createdAt), selectedDate)),
    [notes, selectedDate],
  );

  const goPrev = () => {
    if (mode === 'month') onDateSelect(subMonths(selectedDate, 1));
    else onDateSelect(subWeeks(selectedDate, mode === 'day' ? 1 : 2));
  };
  const goNext = () => {
    if (mode === 'month') onDateSelect(addMonths(selectedDate, 1));
    else onDateSelect(addWeeks(selectedDate, mode === 'day' ? 1 : 2));
  };

  const renderDayCell = (d: Date, opts: { compact?: boolean; inMonth?: boolean } = {}) => {
    const selected = isSameDay(d, selectedDate);
    const dow = d.getDay(); // 0=Sun, 6=Sat
    const isSat = dow === 6;
    const isSun = dow === 0;
    const has = noteDateSet.has(dateKey(d));
    const dim = opts.inMonth === false;

    return (
      <button
        key={d.toISOString()}
        onClick={() => onDateSelect(d)}
        className={cn(
          'relative flex flex-col items-center justify-center gap-[2px] rounded-[14px] py-2 min-w-0 transition-colors',
          selected && 'bg-black text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.45)]',
        )}
      >
        <span
          className={cn(
            'text-[17px] font-bold tabular-nums leading-none',
            selected
              ? 'text-white'
              : dim
                ? 'text-muted-foreground/35'
                : has
                  ? 'text-[#2563eb]'
                  : 'text-foreground',
          )}
        >
          {format(d, 'd')}
        </span>
        {!opts.compact && (
          <span
            className={cn(
              'text-[9.5px] font-semibold tracking-[0.05em] leading-none',
              selected ? 'text-white/90' : 'text-muted-foreground/70',
            )}
          >
            {format(d, 'MMM').toUpperCase()}
          </span>
        )}
        <span
          className={cn(
            'mt-1 h-[3px] w-[3px] rounded-full',
            has
              ? selected
                ? 'bg-white/85'
                : 'bg-[#2563eb]'
              : 'bg-transparent',
          )}
        />
      </button>
    );
  };


  return (
    <div className="w-full bg-background">
      {/* Header: Title + segmented control */}
      <div className="px-4 pt-3 pb-3 flex items-center justify-between gap-3">
        <button
          onClick={() => onDateSelect(new Date())}
          className="text-left"
          aria-label="Jump to today"
        >
          <h2 className="text-[22px] font-bold text-foreground tracking-tight leading-tight">
            {format(selectedDate, 'MMMM yyyy')}
          </h2>
        </button>
        <div className="inline-flex items-center rounded-full bg-muted/60 p-[3px] text-[13px] font-medium">
          {(['day', 'week', 'month'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1.5 rounded-full transition-colors capitalize',
                mode === m
                  ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-muted-foreground',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {mode === 'month' ? (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-7 mb-1">
            {WEEK_LABELS.map((l) => (
              <div key={l} className="text-center text-[10px] font-semibold tracking-wider text-muted-foreground/70 pb-1">
                {l}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((d) =>
              renderDayCell(d, { compact: true, inMonth: isSameMonth(d, selectedDate) }),
            )}
          </div>
        </div>
      ) : (
        <div className="px-3">
          {/* Weekday labels */}
          <div className="grid grid-cols-7 mb-1">
            {WEEK_LABELS.map((l) => (
              <div
                key={l}
                className="text-center text-[10.5px] font-semibold tracking-wider pb-1 text-muted-foreground/70"
              >
                {l}
              </div>
            ))}
          </div>


          {/* Row 1 */}
          <div className="grid grid-cols-7 gap-1">
            {twoWeekDays.slice(0, 7).map((d) => renderDayCell(d))}
          </div>

          {mode === 'week' && (
            <>
              <div className="h-px bg-border/60 my-2 mx-1" />
              {/* Row 2 */}
              <div className="grid grid-cols-7 gap-1">
                {twoWeekDays.slice(7, 14).map((d) => renderDayCell(d))}
              </div>
            </>
          )}

          <div className="h-px bg-border/60 mt-3" />
        </div>
      )}

      {/* Notes header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[16px] font-bold text-foreground">
            {itemLabel} on {format(selectedDate, 'MMM d')}
          </h3>
          {selectedNotes.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-muted text-[11px] font-semibold text-foreground/70 tabular-nums">
              {selectedNotes.length}
            </span>
          )}
        </div>
        <button
          aria-label="Filter"
          className="h-9 w-9 flex items-center justify-center rounded-full border border-border/60 active:bg-muted transition-colors"
        >
          <SlidersHorizontal className="h-[15px] w-[15px] text-foreground/70" />
        </button>
      </div>

      {/* Notes list */}
      <div className="px-4 pb-24">
        {selectedNotes.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No {itemLabel.toLowerCase()} for this date yet.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedNotes.map((n) => (
              <NoteCard key={n.id} note={n} onEdit={onEditNote} onDelete={onDeleteNote} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesCalendarDayWeekMonth;
