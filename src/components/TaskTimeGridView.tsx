import { useState, useRef } from 'react';
import { TodoItem } from '@/types/note';
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek as sow,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export type TimeViewMode = 'day' | 'week' | 'month' | '3day';

interface Props {
  mode: TimeViewMode;
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  tasks: TodoItem[];
  onTaskClick?: (task: TodoItem) => void;
  onReschedule: (taskId: string, newDate: Date) => void;
  onQuickAdd?: (date: Date) => void;
}

const HOUR_HEIGHT = 52;
const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function getTaskHour(t: TodoItem): number | null {
  if (!t.dueDate) return null;
  const d = new Date(t.dueDate);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < START_HOUR) return START_HOUR;
  if (h >= END_HOUR) return END_HOUR - 0.5;
  return h;
}

function hasTimeOfDay(t: TodoItem): boolean {
  if (!t.dueDate) return false;
  const d = new Date(t.dueDate);
  return !(d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0);
}

const TaskPill = ({
  task,
  onClick,
  onDragStart,
  compact,
}: {
  task: TodoItem;
  onClick?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  compact?: boolean;
}) => {
  const color =
    task.priority === 'high'
      ? 'bg-red-500/15 border-red-500 text-red-700 dark:text-red-300'
      : task.priority === 'medium'
      ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300'
      : task.priority === 'low'
      ? 'bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300'
      : 'bg-primary/15 border-primary text-primary';
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        'min-w-0 text-left rounded border-l-2 truncate transition-all hover:shadow-sm cursor-grab active:cursor-grabbing',
        color,
        compact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-1 text-xs'
      )}
      style={task.completed ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}
    >
      {task.dueDate && hasTimeOfDay(task) && !compact && (
        <span className="font-medium mr-1">{format(new Date(task.dueDate), 'HH:mm')}</span>
      )}
      <span className="truncate">{task.text}</span>
    </button>
  );
};

// Render a stack of pills as a wrapping grid so overlapping tasks sit side-by-side.
const PillStack = ({
  tasks,
  compact,
  onTaskClick,
  onDragStart,
  maxColumns = 3,
}: {
  tasks: TodoItem[];
  compact?: boolean;
  onTaskClick?: (t: TodoItem) => void;
  onDragStart: (id: string) => (e: React.DragEvent) => void;
  maxColumns?: number;
}) => {
  if (tasks.length === 0) return null;
  const cols = Math.min(tasks.length, maxColumns);
  return (
    <div
      className="grid gap-0.5 w-full"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {tasks.map((t) => (
        <TaskPill
          key={t.id}
          task={t}
          compact={compact}
          onClick={() => onTaskClick?.(t)}
          onDragStart={onDragStart(t.id)}
        />
      ))}
    </div>
  );
};

export const TaskTimeGridView = ({
  mode,
  selectedDate,
  onDateSelect,
  tasks,
  onTaskClick,
  onReschedule,
  onQuickAdd,
}: Props) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const navigate = (dir: 1 | -1) => {
    if (mode === 'day') onDateSelect(addDays(selectedDate, dir));
    else if (mode === '3day') onDateSelect(addDays(selectedDate, dir * 3));
    else if (mode === 'week') onDateSelect(dir > 0 ? addWeeks(selectedDate, 1) : subWeeks(selectedDate, 1));
    else onDateSelect(dir > 0 ? addMonths(selectedDate, 1) : subMonths(selectedDate, 1));
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  };

  const handleDragStart = (taskId: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(taskId);
  };

  /**
   * Drop on a slot.
   * - If `hour` is a number, the new date inherits that hour (and 0 minutes).
   * - If `hour` is null (all-day row or month cell), preserve the task's existing
   *   time-of-day when present, otherwise set to midnight.
   */
  const handleDropOnSlot = (date: Date, hour: number | null) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggingId;
    if (!taskId) return;
    const existing = tasks.find((t) => t.id === taskId);
    const newDate = new Date(date);
    if (hour !== null) {
      newDate.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    } else if (existing?.dueDate && hasTimeOfDay(existing)) {
      const cur = new Date(existing.dueDate);
      newDate.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
    } else {
      newDate.setHours(0, 0, 0, 0);
    }
    onReschedule(taskId, newDate);
    setDraggingId(null);
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  };

  const allowDrop = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverKey !== key) setDragOverKey(key);
  };

  const handleQuickAdd = (date: Date, hour: number | null) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onQuickAdd) return;
    const d = new Date(date);
    if (hour !== null) d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    else d.setHours(9, 0, 0, 0);
    onQuickAdd(d);
  };

  const headerLabel =
    mode === 'day'
      ? format(selectedDate, 'EEEE, MMM d, yyyy')
      : mode === '3day'
      ? `${format(selectedDate, 'MMM d')} – ${format(addDays(selectedDate, 2), 'MMM d, yyyy')}`
      : mode === 'week'
      ? `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')} – ${format(addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), 6), 'MMM d, yyyy')}`
      : format(selectedDate, 'MMMM yyyy');

  // ---- DAY VIEW ----
  const renderDay = () => {
    const dayTasks = tasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), selectedDate));
    const allDayTasks = dayTasks.filter((t) => !hasTimeOfDay(t));
    const timedTasks = dayTasks.filter((t) => hasTimeOfDay(t));

    return (
      <div className="border border-border/40 rounded-lg overflow-hidden bg-card">
        <div
          className={cn(
            'flex border-b border-border/40 bg-muted/20 min-h-[40px]',
            dragOverKey === 'day-allday' && 'bg-primary/10 ring-1 ring-primary/40 ring-inset'
          )}
          onDragOver={allowDrop('day-allday')}
          onDragLeave={() => setDragOverKey(null)}
          onDrop={handleDropOnSlot(selectedDate, null)}
        >
          <div className="w-14 px-2 py-1.5 text-[10px] uppercase text-muted-foreground border-r border-border/40 flex items-center">All day</div>
          <div className="flex-1 p-1 flex items-center gap-1">
            <div className="flex-1 min-w-0">
              <PillStack tasks={allDayTasks} onTaskClick={onTaskClick} onDragStart={handleDragStart} maxColumns={2} />
            </div>
            {onQuickAdd && (
              <button
                onClick={handleQuickAdd(selectedDate, null)}
                className="shrink-0 h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
                aria-label="Add all-day task"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          {HOURS.map((h) => {
            const key = `day-${h}`;
            const slotTasks = timedTasks.filter((t) => {
              const th = getTaskHour(t);
              return th !== null && Math.floor(th) === h;
            });
            return (
              <div
                key={h}
                className={cn(
                  'group flex border-b border-border/30 transition-colors',
                  dragOverKey === key && 'bg-primary/10'
                )}
                style={{ minHeight: HOUR_HEIGHT }}
                onDragOver={allowDrop(key)}
                onDragLeave={() => setDragOverKey(null)}
                onDrop={handleDropOnSlot(selectedDate, h)}
              >
                <div className="w-14 px-2 py-1 text-[10px] text-muted-foreground border-r border-border/30 text-right">
                  {format(new Date().setHours(h, 0, 0, 0), 'h a')}
                </div>
                <div className="flex-1 p-1 flex items-start gap-1">
                  <div className="flex-1 min-w-0">
                    <PillStack tasks={slotTasks} onTaskClick={onTaskClick} onDragStart={handleDragStart} maxColumns={2} />
                  </div>
                  {onQuickAdd && (
                    <button
                      onClick={handleQuickAdd(selectedDate, h)}
                      className="shrink-0 h-6 w-6 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-muted flex items-center justify-center text-muted-foreground transition-opacity"
                      aria-label={`Add task at ${h}:00`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ---- WEEK / 3-DAY VIEW ----
  const renderDaysGrid = (days: Date[], keyPrefix: string) => {
    return (
      <div className="border border-border/40 rounded-lg overflow-hidden bg-card">
        <div className="flex border-b border-border/40 bg-muted/20">
          <div className="w-12 border-r border-border/40" />
          {days.map((d) => {
            const isSel = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, new Date());
            return (
              <button
                key={d.toISOString()}
                onClick={() => onDateSelect(d)}
                className={cn(
                  'flex-1 py-1.5 text-center border-r border-border/30 last:border-r-0 transition-colors',
                  isSel && 'bg-primary/10'
                )}
              >
                <div className="text-[10px] uppercase text-muted-foreground">{format(d, 'EEE')}</div>
                <div
                  className={cn(
                    'text-sm font-medium mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full',
                    isToday && 'bg-primary text-primary-foreground'
                  )}
                >
                  {format(d, 'd')}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex border-b border-border/40 bg-muted/10 min-h-[36px]">
          <div className="w-12 px-1 py-1 text-[9px] uppercase text-muted-foreground border-r border-border/30 flex items-center justify-end">all</div>
          {days.map((d) => {
            const key = `${keyPrefix}-all-${d.toDateString()}`;
            const allDay = tasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), d) && !hasTimeOfDay(t));
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  'flex-1 border-r border-border/30 last:border-r-0 p-0.5',
                  dragOverKey === key && 'bg-primary/10'
                )}
                onDragOver={allowDrop(key)}
                onDragLeave={() => setDragOverKey(null)}
                onDrop={handleDropOnSlot(d, null)}
              >
                <PillStack tasks={allDay} compact onTaskClick={onTaskClick} onDragStart={handleDragStart} maxColumns={1} />
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <div>
            {HOURS.map((h) => (
              <div key={h} className="flex border-b border-border/20" style={{ minHeight: HOUR_HEIGHT * 0.85 }}>
                <div className="w-12 px-1 py-0.5 text-[9px] text-muted-foreground border-r border-border/30 text-right">
                  {format(new Date().setHours(h, 0, 0, 0), 'h a')}
                </div>
                {days.map((d) => {
                  const key = `${keyPrefix}-${d.toDateString()}-${h}`;
                  const slotTasks = tasks.filter((t) => {
                    if (!t.dueDate || !isSameDay(new Date(t.dueDate), d) || !hasTimeOfDay(t)) return false;
                    const th = getTaskHour(t);
                    return th !== null && Math.floor(th) === h;
                  });
                  return (
                    <div
                      key={d.toISOString()}
                      className={cn(
                        'group flex-1 border-r border-border/30 last:border-r-0 p-0.5 relative',
                        dragOverKey === key && 'bg-primary/10'
                      )}
                      onDragOver={allowDrop(key)}
                      onDragLeave={() => setDragOverKey(null)}
                      onDrop={handleDropOnSlot(d, h)}
                      onDoubleClick={onQuickAdd ? () => onQuickAdd(new Date(new Date(d).setHours(h, 0, 0, 0))) : undefined}
                    >
                      <PillStack tasks={slotTasks} compact onTaskClick={onTaskClick} onDragStart={handleDragStart} maxColumns={2} />
                      {onQuickAdd && slotTasks.length === 0 && (
                        <button
                          onClick={handleQuickAdd(d, h)}
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center text-muted-foreground hover:bg-muted/40 transition-opacity"
                          aria-label="Add task"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return renderDaysGrid(days, 'wk');
  };

  const render3Day = () => {
    const days = Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i));
    return renderDaysGrid(days, '3d');
  };

  // ---- MONTH VIEW ----
  const renderMonth = () => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const gridStart = sow(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div className="border border-border/40 rounded-lg overflow-hidden bg-card">
        <div className="grid grid-cols-7 bg-muted/20 border-b border-border/40">
          {weekDays.map((d) => (
            <div key={d} className="text-center py-1.5 text-[10px] uppercase text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((d) => {
            const key = `mo-${d.toDateString()}`;
            const inMonth = isSameMonth(d, selectedDate);
            const isSel = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, new Date());
            const dayTasks = tasks
              .filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), d))
              .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
            return (
              <div
                key={d.toISOString()}
                onClick={() => onDateSelect(d)}
                onDoubleClick={onQuickAdd ? () => onQuickAdd(new Date(new Date(d).setHours(9, 0, 0, 0))) : undefined}
                onDragOver={allowDrop(key)}
                onDragLeave={() => setDragOverKey(null)}
                onDrop={handleDropOnSlot(d, null)}
                className={cn(
                  'group min-h-[78px] p-1 text-left border-r border-b border-border/20 last:border-r-0 transition-colors cursor-pointer relative',
                  !inMonth && 'bg-muted/10 text-muted-foreground/50',
                  isSel && 'bg-primary/10 ring-1 ring-primary/40 ring-inset',
                  dragOverKey === key && 'bg-primary/15'
                )}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div
                    className={cn(
                      'text-xs font-medium inline-flex items-center justify-center h-5 w-5 rounded-full',
                      isToday && 'bg-primary text-primary-foreground'
                    )}
                  >
                    {format(d, 'd')}
                  </div>
                  {onQuickAdd && (
                    <button
                      onClick={handleQuickAdd(d, null)}
                      className="h-5 w-5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-muted flex items-center justify-center text-muted-foreground transition-opacity"
                      aria-label="Add task"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <TaskPill key={t.id} task={t} compact onClick={() => onTaskClick?.(t)} onDragStart={handleDragStart(t.id)} />
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[9px] text-muted-foreground px-1">+{dayTasks.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-primary" />
          {headerLabel}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {mode === 'day' && renderDay()}
      {mode === '3day' && render3Day()}
      {mode === 'week' && renderWeek()}
      {mode === 'month' && renderMonth()}
    </div>
  );
};
