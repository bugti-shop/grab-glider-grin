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
import { Note, TodoItem } from '@/types/note';
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

  // Task rendering (optional). When provided, tasks display below the calendar
  // instead of notes, using a checklist row with a priority-colored ring.
  tasks?: TodoItem[];
  onTaskToggle?: (task: TodoItem) => void;
  onTaskClick?: (task: TodoItem) => void;
  getPriorityColor?: (priorityId: string) => string;
}


type Mode = 'day' | 'week' | 'month';

const WEEK_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const DEFAULT_PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
  none: '#d1d5db',
};

export const NotesCalendarDayWeekMonth = ({
  selectedDate,
  onDateSelect,
  notes = [],

  onEditNote,
  onDeleteNote,
  itemLabel = 'Notes',
  tasks,
  onTaskToggle,
  onTaskClick,
  getPriorityColor,
}: Props) => {
  const [mode, setMode] = useState<Mode>('day');

  const isTaskMode = Array.isArray(tasks);

  const noteDateSet = useMemo(() => {
    const s = new Set<string>();
    if (isTaskMode) {
      for (const t of tasks!) {
        if (t.dueDate) s.add(dateKey(new Date(t.dueDate)));
      }
    } else {
      for (const n of notes) s.add(dateKey(new Date(n.createdAt)));
    }
    return s;
  }, [notes, tasks, isTaskMode]);

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

  const selectedTasks = useMemo(
    () =>
      (tasks || []).filter(
        (t) => t.dueDate && isSameDay(new Date(t.dueDate), selectedDate),
      ),
    [tasks, selectedDate],
  );

  const sortedSelectedTasks = useMemo(() => {
    const withTime = selectedTasks.filter((t) => !!t.reminderTime);
    const withoutTime = selectedTasks.filter((t) => !t.reminderTime);
    withTime.sort((a, b) => new Date(a.reminderTime!).getTime() - new Date(b.reminderTime!).getTime());
    return [...withTime, ...withoutTime];
  }, [selectedTasks]);

  const formatTaskTime = (task: TodoItem): string => {
    if (!task.reminderTime) return '';
    const d = new Date(task.reminderTime);
    if (isNaN(d.getTime())) return '';
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = ((h + 11) % 12) + 1;
    return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const ringColorFor = (task: TodoItem): string => {
    const id = (task.priority as string) || 'none';
    if (getPriorityColor) {
      const c = getPriorityColor(id);
      if (c) return c;
    }
    return DEFAULT_PRIORITY_COLORS[id] || DEFAULT_PRIORITY_COLORS.none;
  };

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

      {/* List header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[16px] font-bold text-foreground">
            {itemLabel} on {format(selectedDate, 'MMM d')}
          </h3>
          {(isTaskMode ? sortedSelectedTasks.length : selectedNotes.length) > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-muted text-[11px] font-semibold text-foreground/70 tabular-nums">
              {isTaskMode ? sortedSelectedTasks.length : selectedNotes.length}
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

      {/* List body */}
      <div className="px-4 pb-24">
        {isTaskMode ? (
          sortedSelectedTasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No tasks for this date yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {sortedSelectedTasks.map((task) => {
                const ring = ringColorFor(task);
                const time = formatTaskTime(task);
                return (
                  <li key={task.id}>
                    <button
                      onClick={() => onTaskClick?.(task)}
                      className="w-full flex items-center gap-3 py-3.5 text-left active:bg-muted/40 rounded-md transition-colors"
                    >
                      <span
                        role="checkbox"
                        aria-checked={task.completed}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskToggle?.(task);
                        }}
                        className="shrink-0 h-[26px] w-[26px] rounded-full flex items-center justify-center transition-colors"
                        style={{
                          border: `1.5px solid ${ring}`,
                          background: task.completed ? ring : 'transparent',
                        }}
                      >
                        {task.completed && (
                          <svg viewBox="0 0 12 12" className="h-[12px] w-[12px] text-white">
                            <path
                              d="M2 6.5l2.5 2.5L10 3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span
                        className={cn(
                          'flex-1 min-w-0 truncate text-[17px] leading-[1.35] font-medium',
                          task.completed
                            ? 'text-muted-foreground line-through'
                            : 'text-foreground',
                        )}
                      >
                        {task.text}
                      </span>
                      {time && (
                        <span className="shrink-0 text-[14px] text-muted-foreground tabular-nums">
                          {time}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

          )
        ) : selectedNotes.length === 0 ? (
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
