import { useMemo, useState, type MouseEvent } from 'react';
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
import { Check, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note, TodoItem } from '@/types/note';
import { NoteCard } from '@/components/NoteCard';
import { TASK_CHECK_ICON, TASK_CIRCLE } from '@/utils/taskItemStyles';

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
  onSubtaskToggle?: (parent: TodoItem, subtask: TodoItem) => void;
  onSubtaskClick?: (parent: TodoItem, subtask: TodoItem) => void;
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
  onSubtaskToggle,
  onSubtaskClick,
  getPriorityColor,
}: Props) => {
  const [mode, setMode] = useState<Mode>('day');
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

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

  const toggleExpanded = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const renderTodayStyleTask = (task: TodoItem, parent?: TodoItem) => {
    const hasSubtasks = !parent && !!task.subtasks?.length;
    const isExpanded = expandedTaskIds.has(task.id);
    const completedSubtasks = task.subtasks?.filter((st) => st.completed).length || 0;
    const totalSubtasks = task.subtasks?.length || 0;
    const priorityColor = ringColorFor(task);

    const handleToggle = (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (parent) onSubtaskToggle?.(parent, task);
      else onTaskToggle?.(task);
    };

    const handleOpen = () => {
      if (parent) onSubtaskClick?.(parent, task);
      else onTaskClick?.(task);
    };

    return (
      <div key={task.id} className="relative">
        <div className="relative overflow-hidden">
          <div className="flex items-start gap-3 border-b border-border/50 bg-background relative z-10 py-2.5 px-2">
            <button
              type="button"
              aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
              aria-pressed={task.completed}
              onClick={handleToggle}
              className={cn(
                TASK_CIRCLE.base,
                TASK_CIRCLE.marginTop,
                TASK_CIRCLE.size,
                task.completed && TASK_CIRCLE.completed,
              )}
              style={{ borderColor: task.completed ? undefined : priorityColor }}
            >
              {task.completed && (
                <Check
                  className={cn(TASK_CHECK_ICON.base, TASK_CHECK_ICON.size)}
                  style={{ color: TASK_CHECK_ICON.completedColor }}
                  strokeWidth={TASK_CHECK_ICON.strokeWidth}
                />
              )}
            </button>

            <div className="flex-1 min-w-0" onClick={handleOpen}>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'text-sm min-w-0 truncate transition-all duration-300 font-normal',
                    task.completed && 'text-muted-foreground line-through',
                  )}
                >
                  {task.text}
                </span>
              </div>
              {task.dueDate && (
                <p className="text-muted-foreground text-xs mt-1">
                  {new Date(task.dueDate).toLocaleDateString()}
                </p>
              )}
              {hasSubtasks && !isExpanded && (
                <p className="text-muted-foreground text-xs mt-1">
                  {completedSubtasks}/{totalSubtasks} subtasks
                </p>
              )}
            </div>

            {hasSubtasks && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(task.id);
                }}
                className="rounded hover:bg-muted transition-colors flex-shrink-0 p-1 mt-0.5"
                aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            )}
          </div>
        </div>

        {hasSubtasks && isExpanded && (
          <div className="ml-3 sm:ml-4 md:ml-5 pl-3 sm:pl-4 border-l-2 border-border/50">
            {task.subtasks!.map((subtask) => renderTodayStyleTask(subtask, task))}
          </div>
        )}
      </div>
    );
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

      {!isTaskMode && (
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
      )}

      {/* List body */}
      <div className={cn('pb-24', isTaskMode ? 'px-2 pt-3' : 'px-4')}>
        {isTaskMode ? (
          sortedSelectedTasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No tasks for this date yet.
            </div>
          ) : (
            <div>{sortedSelectedTasks.map((task) => renderTodayStyleTask(task))}</div>

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
