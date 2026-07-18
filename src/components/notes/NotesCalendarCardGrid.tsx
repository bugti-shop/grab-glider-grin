import { useMemo, useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, MoreHorizontal, FileText, User, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note } from '@/types/note';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  notes: Note[];
  onEditNote: (n: Note) => void;
  onDeleteNote: (id: string) => void;
  onAddNote?: () => void;
}

const WEEK_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Deterministic pill colors for a given date so it stays stable across renders
const PILL_COLORS = [
  'bg-[#F5A3A3]', // coral
  'bg-[#F5D06F]', // amber
  'bg-[#A7D8A0]', // green
  'bg-[#9EC5F5]', // blue
  'bg-[#C7B0F5]', // purple
];
const hashKey = (k: string) => {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h;
};

export const NotesCalendarCardGrid = ({
  selectedDate,
  onDateSelect,
  notes,
  onEditNote,
  onDeleteNote,
  onAddNote,
}: Props) => {
  const [visibleMonth, setVisibleMonth] = useState<Date>(selectedDate);
  const [sheetOpen, setSheetOpen] = useState(true);

  useEffect(() => {
    setVisibleMonth((prev) =>
      isSameMonth(prev, selectedDate) ? prev : selectedDate,
    );
  }, [selectedDate]);

  // Group notes per day
  const notesByDay = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const k = dateKey(new Date(n.createdAt));
      const list = map.get(k);
      if (list) list.push(n);
      else map.set(k, [n]);
    }
    return map;
  }, [notes]);

  // Build 6-row grid (42 cells) starting Monday
  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 });
    const days: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      days.push(d);
      d = addDays(d, 1);
    }
    while (days.length < 42) days.push(addDays(days[days.length - 1], 1));
    return days.slice(0, 42);
  }, [visibleMonth]);

  const selectedNotes = useMemo(
    () => notes.filter((n) => isSameDay(new Date(n.createdAt), selectedDate)),
    [notes, selectedDate],
  );

  const getPillsForDay = (d: Date) => {
    const list = notesByDay.get(dateKey(d));
    if (!list || list.length === 0) return [] as string[];
    const seed = hashKey(dateKey(d));
    const count = Math.min(list.length, 3);
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      colors.push(PILL_COLORS[(seed + i * 7) % PILL_COLORS.length]);
    }
    return colors;
  };

  return (
    <div className="px-3 pt-2 pb-24">
      {/* Header: Month title + chevrons */}
      <div className="flex items-center justify-center gap-3 mb-4 mt-1">
        <button
          aria-label="Previous month"
          onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
          className="h-8 w-8 flex items-center justify-center rounded-full active:bg-muted"
        >
          <ChevronLeft className="h-5 w-5 text-foreground/70" />
        </button>
        <h2 className="text-[22px] font-bold text-foreground tracking-tight">
          {format(visibleMonth, 'MMMM yyyy')}
        </h2>
        <button
          aria-label="Next month"
          onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
          className="h-8 w-8 flex items-center justify-center rounded-full active:bg-muted"
        >
          <ChevronRight className="h-5 w-5 text-foreground/70" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-[6px] mb-2 px-[2px]">
        {WEEK_LABELS.map((w) => (
          <div
            key={w}
            className="text-center text-[10px] font-semibold tracking-[0.12em] text-muted-foreground"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Date cards grid */}
      <div className="grid grid-cols-7 gap-[6px]">
        {gridDays.map((d) => {
          const inMonth = isSameMonth(d, visibleMonth);
          const isSelected = isSameDay(d, selectedDate);
          const pills = inMonth ? getPillsForDay(d) : [];
          const today = isToday(d);

          return (
            <button
              key={d.toISOString()}
              onClick={() => {
                onDateSelect(d);
                setSheetOpen(true);
              }}
              className={cn(
                'relative aspect-[0.72] rounded-[10px] flex flex-col items-start pt-1.5 pl-1.5 pr-1 transition-all',
                inMonth
                  ? 'bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03)]'
                  : 'bg-transparent',
                isSelected && inMonth && 'ring-[1.5px] ring-foreground',
              )}
            >
              <span
                className={cn(
                  'text-[13px] leading-none font-medium',
                  inMonth ? 'text-foreground' : 'text-muted-foreground/40',
                  (isSelected || today) && inMonth && 'font-bold',
                )}
              >
                {format(d, 'd')}
              </span>

              {/* Colored pills */}
              {pills.length > 0 && (
                <div className="mt-auto mb-1.5 w-full flex flex-col gap-[3px] pr-0.5">
                  {pills.map((c, i) => (
                    <span
                      key={i}
                      className={cn('h-[3.5px] rounded-full', c)}
                      style={{ width: i === 0 ? '85%' : i === 1 ? '70%' : '55%' }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom sheet — notes for selected date */}
      {sheetOpen && (
        <div className="mt-4 -mx-3 rounded-t-[24px] bg-card shadow-[0_-6px_24px_-14px_rgba(0,0,0,0.15)] px-4 pt-3 pb-5">
          {/* Drag handle */}
          <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-muted-foreground/25" />

          {/* Header row */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[19px] font-bold tracking-tight text-foreground">
                {format(selectedDate, 'MMMM d, yyyy')}
              </h3>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {selectedNotes.length} {selectedNotes.length === 1 ? 'note' : 'notes'}
              </p>
            </div>
            <button
              aria-label="Close"
              onClick={() => setSheetOpen(false)}
              className="h-8 w-8 rounded-full bg-muted flex items-center justify-center active:opacity-70"
            >
              <X className="h-4 w-4 text-foreground/70" />
            </button>
          </div>

          {/* Notes list */}
          {selectedNotes.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {selectedNotes.map((n) => {
                const seed = hashKey(n.id);
                const dot = PILL_COLORS[seed % PILL_COLORS.length]
                  .replace('bg-', 'bg-')
                  .replace('[#F5A3A3]', '[#EF6C6C]')
                  .replace('[#F5D06F]', '[#E5B23A]')
                  .replace('[#A7D8A0]', '[#5FB358]')
                  .replace('[#9EC5F5]', '[#4A90E2]')
                  .replace('[#C7B0F5]', '[#8B6FE0]');
                const tagColor = seed % 2 === 0 ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600';
                const TagIcon = seed % 2 === 0 ? FileText : User;
                const tagLabel = seed % 2 === 0 ? 'Work' : 'Personal';
                return (
                  <button
                    key={n.id}
                    onClick={() => onEditNote(n)}
                    className="w-full text-left rounded-2xl bg-muted/40 px-3.5 py-3 flex items-start gap-3 active:opacity-80 transition-opacity"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[15px] font-semibold text-foreground truncate">
                          {n.title || 'Untitled note'}
                        </p>
                        <span className="text-[12px] text-muted-foreground flex-shrink-0 mt-[3px]">
                          {format(new Date(n.createdAt), 'h:mm a')}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', tagColor)}>
                          <TagIcon className="h-3 w-3" />
                          {tagLabel}
                        </span>
                      </div>
                    </div>
                    <MoreHorizontal
                      className="h-4 w-4 text-muted-foreground mt-2 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(n.id);
                      }}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No notes for this date yet.
            </div>
          )}

          {/* Add note button */}
          <button
            onClick={onAddNote}
            className="mt-3 w-full rounded-2xl bg-muted/50 py-3.5 flex items-center justify-center gap-2 text-[15px] font-semibold text-foreground active:opacity-80"
          >
            <Plus className="h-4 w-4" />
            Add note
          </button>
        </div>
      )}
    </div>
  );
};
