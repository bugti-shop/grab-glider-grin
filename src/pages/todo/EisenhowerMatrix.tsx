import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, MoreVertical, LayoutGrid, Eye, EyeOff, Check, Settings2, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { loadTasksFromDB, saveTasksToDB } from '@/utils/taskStorage';
import { TodoItem, Priority, Folder } from '@/types/note';
import { TodoBottomNavigation } from '@/components/TodoBottomNavigation';
import { TaskInputSheet } from '@/components/TaskInputSheet';
import { AppLogo } from '@/components/AppLogo';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/utils/haptics';
import { toast } from 'sonner';
import { genId } from '@/utils/genId';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { useSubscription } from '@/contexts/SubscriptionContext';

type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4';

interface QuadrantDef {
  id: QuadrantId;
  title: string;
  shortTitle: string;
  priority: Priority;
  accent: string;
  badge: string;
  dot: string;
  romanLabel: string;
}

const QUADRANTS: QuadrantDef[] = [
  { id: 'q1', title: 'Urgent & Important', shortTitle: 'Urgent & Important', priority: 'high', accent: 'text-rose-500', badge: 'bg-rose-500', dot: 'border-rose-500', romanLabel: 'I' },
  { id: 'q2', title: 'Not Urgent & Important', shortTitle: 'Not Urgent & Important', priority: 'medium', accent: 'text-amber-500', badge: 'bg-amber-500', dot: 'border-amber-500', romanLabel: 'II' },
  { id: 'q3', title: 'Urgent & Unimportant', shortTitle: 'Urgent & Unimportant', priority: 'low', accent: 'text-blue-500', badge: 'bg-blue-500', dot: 'border-blue-500', romanLabel: 'III' },
  { id: 'q4', title: 'Not Urgent & Unimportant', shortTitle: 'Not Urgent & Unimportant', priority: 'none', accent: 'text-emerald-500', badge: 'bg-emerald-500', dot: 'border-emerald-500', romanLabel: 'IV' },
];

const getQuadrantForTask = (t: TodoItem): QuadrantId => {
  const p = (t.priority || 'none') as string;
  if (p === 'high') return 'q1';
  if (p === 'medium') return 'q2';
  if (p === 'low') return 'q3';
  return 'q4';
};

const formatDue = (d?: Date) => {
  if (!d) return '';
  const date = new Date(d);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = date.getHours() || date.getMinutes()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  if (sameDay(date, today)) return time ? `Today, ${time}` : 'Today';
  if (sameDay(date, tomorrow)) return time ? `Tomorrow, ${time}` : 'Tomorrow';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + (time ? `, ${time}` : '');
};

type FilterId = 'all' | 'high' | 'medium' | 'low' | 'uncategorized';
const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
  { id: 'uncategorized', label: 'Uncategorized' },
];

const matchesFilter = (task: TodoItem, f: FilterId): boolean => {
  if (f === 'all') return true;
  const p = (task.priority || 'none') as string;
  if (f === 'uncategorized') return p === 'none' || !task.priority;
  return p === f;
};

const EisenhowerMatrix = () => {
  const navigate = useNavigate();
  const { requireCapacity } = useSubscription();
  const [params, setParams] = useSearchParams();
  const activeQ = params.get('q') as QuadrantId | null;
  const [tasks, setTasks] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpenFor, setAddOpenFor] = useState<QuadrantId | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const restoredRef = useRef(false);

  const reload = useCallback(async () => {
    try {
      const t = await loadTasksFromDB();
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // Two-way sync: refresh when tasks are added/updated anywhere else
    const onTasksUpdated = () => reload();
    window.addEventListener('tasksUpdated', onTasksUpdated);
    // Cross-tab sync (storage events fire in other tabs)
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes('task') || e.key.includes('todo')) reload();
    };
    window.addEventListener('storage', onStorage);
    // Refresh when tab becomes visible again
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('tasksUpdated', onTasksUpdated);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  useEffect(() => {
    getSetting<Folder[] | null>('todoFolders', null).then(f => {
      if (f) setFolders(f.map(x => ({ ...x, createdAt: new Date(x.createdAt) })));
    });
  }, []);

  // Skeleton removed — render empty/loaded UI directly per UX request.

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (params.get('q')) return;
    getSetting<QuadrantId | null>('eisenhowerLastQuadrant', null).then(saved => {
      if (saved && ['q1','q2','q3','q4'].includes(saved)) {
        setParams({ q: saved }, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeQ) setSetting('eisenhowerLastQuadrant', activeQ);
  }, [activeQ]);

  useEffect(() => {
    getSetting<FilterId>('eisenhowerLastFilter', 'all').then(f => {
      if (FILTERS.find(x => x.id === f)) setFilter(f);
    });
    getSetting<boolean>('eisenhowerShowCompleted', true).then(v => setShowCompleted(v));
    getSetting<boolean>('eisenhowerShowDetails', false).then(v => setShowDetails(v));
  }, []);
  useEffect(() => { setSetting('eisenhowerLastFilter', filter); }, [filter]);
  useEffect(() => { setSetting('eisenhowerShowCompleted', showCompleted); }, [showCompleted]);
  useEffect(() => { setSetting('eisenhowerShowDetails', showDetails); }, [showDetails]);

  // Group tasks (include completed; UI decides display)
  const grouped = useMemo(() => {
    const map: Record<QuadrantId, TodoItem[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const t of tasks) {
      map[getQuadrantForTask(t)].push(t);
    }
    return map;
  }, [tasks]);

  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());

  const toggleComplete = async (task: TodoItem) => {
    triggerHaptic('light').catch(() => {});
    const becomingComplete = !task.completed;
    const updated = tasks.map(t => t.id === task.id
      ? { ...t, completed: becomingComplete, completedAt: becomingComplete ? new Date() : undefined }
      : t);
    setTasks(updated);
    if (becomingComplete) {
      setRecentlyCompleted(prev => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });
      setTimeout(() => {
        setRecentlyCompleted(prev => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, 900);
    }
    await saveTasksToDB(updated);
    window.dispatchEvent(new Event('tasksUpdated'));
  };

  const deleteTask = async (task: TodoItem) => {
    if (!confirm(`Delete "${task.text}"?`)) return;
    triggerHaptic('medium').catch(() => {});
    const updated = tasks.filter(t => t.id !== task.id);
    setTasks(updated);
    await saveTasksToDB(updated);
    try {
      const { pushTaskDelete } = await import('@/utils/cloudSync/storeBridge');
      pushTaskDelete(task.id);
    } catch {}
    window.dispatchEvent(new Event('tasksUpdated'));
    toast.success('Task deleted', { duration: 1000 });
  };

  const handleCreateFolder = async (name: string, color: string) => {
    const newFolder: Folder = { id: genId(), name, color, isDefault: false, createdAt: new Date() };
    const updated = [...folders, newFolder];
    setFolders(updated);
    await setSetting('todoFolders', updated);
  };

  const handleAddTaskFromSheet = async (
    task: Omit<TodoItem, 'id' | 'completed'>,
    q: QuadrantId,
  ) => {
    // Free plan capacity: 10 tasks per quadrant
    const currentInQuadrant = tasks.filter(t => getQuadrantForTask(t) === q).length;
    if (!requireCapacity('eisenhowerTasksPerQuadrant', currentInQuadrant)) return;
    const quad = QUADRANTS.find(x => x.id === q)!;
    const now = new Date();
    const newTask: TodoItem = {
      id: genId(),
      completed: false,
      createdAt: now,
      modifiedAt: now,
      ...task,
      // Force priority to match the quadrant so it stays in this matrix
      priority: quad.priority,
    } as TodoItem;
    const updated = [newTask, ...tasks];
    setTasks(updated);
    await saveTasksToDB(updated);
    // Push the new task explicitly so it reaches the cloud even if the
    // batched saveTasksToDB throttles or coalesces writes.
    try {
      const { pushTasks } = await import('@/utils/cloudSync/storeBridge');
      pushTasks([newTask]);
    } catch {}
    window.dispatchEvent(new Event('tasksUpdated'));
    toast.success('Task added', { duration: 1000 });
  };

  // ============= Quadrant Detail View =============
  if (activeQ) {
    const quad = QUADRANTS.find(q => q.id === activeQ);
    if (!quad) {
      setParams({});
      return null;
    }
    const allItems = grouped[activeQ];
    const visibleByCompletion = showCompleted ? allItems : allItems.filter(t => !t.completed || recentlyCompleted.has(t.id));
    const items = visibleByCompletion.filter(t => matchesFilter(t, filter));
    return (
      <div className="min-h-screen bg-muted/30 pb-20">
        <header className="sticky top-0 bg-muted/30 backdrop-blur z-20" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setParams({})}
                className="p-2 -ml-2 rounded-full hover:bg-muted active:bg-muted/70"
                aria-label="Back to matrix overview"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-bold truncate">{quad.title}</h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCompleted(v => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-border bg-background active:bg-muted"
                aria-pressed={showCompleted}
                aria-label={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
              >
                {showCompleted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {showCompleted ? 'Hide' : 'Show'} completed
              </button>
              <button className="p-2 rounded-full hover:bg-muted" aria-label="More options">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div
            role="tablist"
            aria-label="Filter tasks"
            className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide"
          >
            {FILTERS.map(f => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground border border-border'
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </header>

        <main className="px-3 pt-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center pt-16 px-6">
              <div className="w-40 h-40 rounded-3xl bg-muted/60 flex items-center justify-center mb-4">
                <LayoutGrid className={cn('h-16 w-16', quad.accent)} />
              </div>
              <p className="text-base font-semibold">
                {allItems.length === 0 ? 'No tasks here yet' : `No ${filter === 'all' ? '' : filter + ' '}tasks`}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {allItems.length === 0 ? (
                  <>
                    {quad.id === 'q1' && 'Crises and deadlines that need attention right now.'}
                    {quad.id === 'q2' && 'Planning, growth and goals — schedule time for these.'}
                    {quad.id === 'q3' && 'Interruptions to delegate or batch when possible.'}
                    {quad.id === 'q4' && 'Distractions to minimize or eliminate.'}
                  </>
                ) : (
                  'Try a different filter or add a new task.'
                )}
              </p>
              <button
                onClick={() => setAddOpenFor(activeQ)}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium text-sm shadow-md active:scale-95 transition-transform"
              >
                <Plus className="h-4 w-4" />
                Add first task
              </button>
            </div>
          ) : (
            <div className="bg-background rounded-2xl divide-y divide-border/60 shadow-sm">
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-base font-bold">{FILTERS.find(f => f.id === filter)?.label}</span>
                <span className="text-sm text-muted-foreground">{items.length}</span>
              </div>
              {items.map(task => (
                <div
                  key={task.id}
                  className="w-full flex items-center gap-2 px-4 py-3 active:bg-muted/40"
                >
                  <button
                    onClick={() => toggleComplete(task)}
                    className="flex flex-1 items-center gap-3 text-left min-w-0"
                  >
                    <span
                      className={cn(
                        'h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                        quad.dot,
                        task.completed && quad.badge
                      )}
                    >
                      {task.completed && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                    </span>
                    <span
                      className={cn(
                        'flex-1 text-sm truncate',
                        task.completed && 'line-through text-muted-foreground'
                      )}
                    >
                      {task.text}
                    </span>
                    {task.dueDate && (
                      <span className={cn(
                        'text-xs font-medium flex-shrink-0',
                        task.completed ? 'text-muted-foreground' : 'text-primary'
                      )}>
                        {formatDue(task.dueDate)}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => deleteTask(task)}
                    className="p-2 -mr-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95"
                    aria-label={`Delete ${task.text}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>

        <button
          onClick={() => setAddOpenFor(activeQ)}
          className="fixed bottom-20 right-5 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          style={{ marginBottom: 'var(--safe-bottom, 0px)' }}
          aria-label="Add task"
        >
          <Plus className="h-7 w-7" />
        </button>

        <TaskInputSheet
          isOpen={addOpenFor !== null}
          onClose={() => setAddOpenFor(null)}
          onAddTask={(task) => addOpenFor && handleAddTaskFromSheet(task, addOpenFor)}
          folders={folders}
          selectedFolderId={null}
          onCreateFolder={handleCreateFolder}
        />

        <TodoBottomNavigation />
      </div>
    );
  }

  // ============= Overview (4 quadrants) =============
  return (
    <div className="min-h-screen bg-muted/30 pb-20">
      <header className="sticky top-0 bg-background z-20 border-b" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex items-center gap-2">
            <AppLogo size="sm" />
            <h1 className="text-lg font-bold">Eisenhower Matrix</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-full hover:bg-muted active:bg-muted/70" aria-label="View options">
                <Settings2 className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuCheckboxItem
                checked={showDetails}
                onCheckedChange={setShowDetails}
              >
                Show details
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="p-3">
        <div className="grid grid-cols-2 gap-3 items-stretch auto-rows-fr">
          {QUADRANTS.map(q => {
            const all = grouped[q.id];
            const items = (showCompleted ? all : all.filter(t => !t.completed || recentlyCompleted.has(t.id)));
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setParams({ q: q.id })}
                className="text-left bg-background rounded-2xl p-3 shadow-sm border border-border/40 min-h-[260px] h-full flex flex-col active:scale-[0.98] transition-transform"
                aria-label={`Open ${q.title}`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className={cn('h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0', q.badge)}>
                    {q.romanLabel}
                  </span>
                  <span className={cn('text-[11px] font-bold leading-tight break-words', q.accent)}>
                    {q.shortTitle}
                  </span>
                </div>
                <div className="flex-1 space-y-2">
                  {loading ? null : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-1 py-4">
                      <LayoutGrid className={cn('h-8 w-8 mb-1 opacity-60', q.accent)} />
                      <p className="text-[11px] font-medium text-foreground">
                        {q.id === 'q1' && 'Do it now'}
                        {q.id === 'q2' && 'Schedule it'}
                        {q.id === 'q3' && 'Delegate it'}
                        {q.id === 'q4' && 'Eliminate it'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Tap to add tasks</p>
                    </div>
                  ) : (
                    items.slice(0, 6).map(task => (
                      <div
                        key={task.id}
                        className="w-full flex items-start gap-2 text-left"
                      >
                        <span className={cn(
                          'mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                          q.dot,
                          task.completed && q.badge
                        )}>
                          {task.completed && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-xs leading-snug truncate',
                            task.completed && 'line-through text-muted-foreground'
                          )}>{task.text}</p>
                          {showDetails && task.dueDate && (
                            <p className={cn(
                              'text-[10px] mt-0.5 truncate',
                              task.completed ? 'text-muted-foreground' : 'text-primary'
                            )}>{formatDue(task.dueDate)}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4 px-4">
          Tasks are placed by priority: High → I, Medium → II, Low → III, None → IV
        </p>
      </main>

      <TaskInputSheet
        isOpen={addOpenFor !== null}
        onClose={() => setAddOpenFor(null)}
        onAddTask={(task) => addOpenFor && handleAddTaskFromSheet(task, addOpenFor)}
        folders={folders}
        selectedFolderId={null}
        onCreateFolder={handleCreateFolder}
      />

      <TodoBottomNavigation />
    </div>
  );
};

export default EisenhowerMatrix;
