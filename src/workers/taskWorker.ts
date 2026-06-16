/**
 * Web Worker for heavy task computations.
 * Offloads filtering, sorting, searching, and grouping from the main thread.
 * 
 * Communication protocol:
 *   Main → Worker: { type, id, payload }
 *   Worker → Main: { type: 'result', id, result } | { type: 'error', id, error }
 */

// ── Types (duplicated to avoid import issues in worker context) ──

type Priority = 'high' | 'medium' | 'low' | 'none' | string;
type TaskStatus = 'not_started' | 'in_progress' | 'almost_done' | 'completed';
type DateFilter = 'all' | 'today' | 'tomorrow' | 'this-week' | 'overdue' | 'has-date' | 'no-date';
type PriorityFilter = 'all' | Priority;
type StatusFilter = 'all' | 'completed' | 'uncompleted' | 'not_started' | 'in_progress' | 'almost_done';
type SortBy = 'date' | 'priority' | 'name' | 'created';
type SortType = 'newest' | 'oldest' | 'name';
type SmartListType = string;

interface MinimalTask {
  id: string;
  text: string;
  completed: boolean;
  priority?: Priority;
  status?: TaskStatus;
  isPinned?: boolean;
  dueDate?: string | null;
  reminderTime?: string | null;
  repeatType?: string;
  tags?: string[];
  tagIds?: string[];
  folderId?: string;
  sectionId?: string;
  description?: string;
  completedAt?: string | null;
  createdAt?: string | null;
  subtasks?: MinimalTask[];
  estimatedHours?: number;
}

// ── Date helpers (no date-fns in worker — use native) ──

const startOfDayMs = (d: Date) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};

const isToday = (d: Date) => {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const isTomorrow = (d: Date) => {
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  return d.getFullYear() === tom.getFullYear() && d.getMonth() === tom.getMonth() && d.getDate() === tom.getDate();
};

const isThisWeek = (d: Date) => {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return d >= startOfWeek && d < endOfWeek;
};

const isThisMonth = (d: Date) => {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const isYesterday = (d: Date) => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate();
};

const formatMonthYear = (d: Date) => {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatWeekRange = (d: Date) => {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${m[start.getMonth()]} ${start.getDate()} - ${m[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
};

// ── Smart List Filters ──

const smartListFilters: Record<string, (t: MinimalTask) => boolean> = {
  all: () => true,
  today: (t) => t.dueDate ? isToday(new Date(t.dueDate)) : false,
  overdue: (t) => {
    if (!t.dueDate || t.completed) return false;
    return new Date(t.dueDate) < startOfDayMs(new Date());
  },
  'no-date': (t) => !t.dueDate && !t.completed,
  'has-attachments': (t) => !!t.description || false,
  recurring: (t) => !!t.repeatType && t.repeatType !== 'none',
  'high-priority': (t) => t.priority === 'high',
  pinned: (t) => !!t.isPinned,
};

// ── Filter + Sort (Today page) ──

interface FilterSortPayload {
  items: MinimalTask[];
  smartList: SmartListType;
  selectedFolderId: string | null;
  allowedFolderIds?: string[];
  priorityFilter: PriorityFilter;
  statusFilter: StatusFilter;
  dateFilter: DateFilter;
  tagFilter: string[];
  sortBy: SortBy;
  searchQuery: string;
  showCompleted: boolean;
}

function filterAndSort(p: FilterSortPayload): {
  uncompleted: MinimalTask[];
  completed: MinimalTask[];
  total: number;
} {
  let filtered = p.items;

  // Smart list
  if (p.smartList !== 'all') {
    const fn = smartListFilters[p.smartList];
    if (fn) filtered = filtered.filter(fn);
  }

  // Folder
  if (p.selectedFolderId) {
    const allowed = new Set(p.allowedFolderIds?.length ? p.allowedFolderIds : [p.selectedFolderId]);
    filtered = filtered.filter(i => !!i.folderId && allowed.has(i.folderId));
  }

  // Priority
  if (p.priorityFilter !== 'all') {
    filtered = filtered.filter(i => i.priority === p.priorityFilter);
  }

  // Status
  if (p.statusFilter !== 'all') {
    switch (p.statusFilter) {
      case 'completed': filtered = filtered.filter(i => i.completed); break;
      case 'uncompleted': filtered = filtered.filter(i => !i.completed); break;
      case 'not_started': filtered = filtered.filter(i => i.status === 'not_started' || !i.status); break;
      case 'in_progress': filtered = filtered.filter(i => i.status === 'in_progress'); break;
      case 'almost_done': filtered = filtered.filter(i => i.status === 'almost_done'); break;
    }
  }

  // Date filter
  if (p.dateFilter !== 'all') {
    const today = startOfDayMs(new Date());
    filtered = filtered.filter(i => {
      const d = i.dueDate ? new Date(i.dueDate) : null;
      switch (p.dateFilter) {
        case 'today': return d ? isToday(d) : false;
        case 'tomorrow': return d ? isTomorrow(d) : false;
        case 'this-week': return d ? isThisWeek(d) : false;
        case 'overdue': return d ? d < today && !i.completed : false;
        case 'has-date': return !!d;
        case 'no-date': return !d;
        default: return true;
      }
    });
  }

  // Tag filter
  if (p.tagFilter.length > 0) {
    filtered = filtered.filter(i => {
      const ids = i.tagIds || [];
      return p.tagFilter.some(t => ids.includes(t));
    });
  }

  // Search
  if (p.searchQuery.trim()) {
    const q = p.searchQuery.toLowerCase();
    filtered = filtered.filter(i =>
      i.text.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    );
  }

  // Sort
  const po: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
  filtered.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    switch (p.sortBy) {
      case 'date':
        return (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
               (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
      case 'priority':
        return (po[a.priority || 'none'] ?? 3) - (po[b.priority || 'none'] ?? 3);
      case 'name': return a.text.localeCompare(b.text);
      case 'created': return parseInt(b.id) - parseInt(a.id);
      default: return 0;
    }
  });

  return {
    uncompleted: filtered.filter(i => !i.completed),
    completed: filtered.filter(i => i.completed),
    total: filtered.length,
  };
}

// ── Upcoming grouping ──

interface UpcomingPayload {
  items: MinimalTask[];
  smartList: SmartListType;
  priorityFilter: PriorityFilter;
  statusFilter: StatusFilter;
  selectedFolderId: string | null;
  showCompleted: boolean;
  sortOrder: 'asc' | 'desc';
  groupBy: 'week' | 'month';
}

function filterAndGroupUpcoming(p: UpcomingPayload): Record<string, MinimalTask[]> {
  let filtered = [...p.items];

  if (p.smartList !== 'all') {
    const fn = smartListFilters[p.smartList];
    if (fn) filtered = filtered.filter(fn);
  }
  if (p.priorityFilter !== 'all') filtered = filtered.filter(i => i.priority === p.priorityFilter);
  if (p.statusFilter !== 'all') {
    if (p.statusFilter === 'completed') filtered = filtered.filter(i => i.completed);
    else filtered = filtered.filter(i => !i.completed);
  }
  if (p.selectedFolderId) filtered = filtered.filter(i => i.folderId === p.selectedFolderId);
  if (!p.showCompleted) filtered = filtered.filter(i => !i.completed);

  filtered.sort((a, b) => {
    if (!a.dueDate || !b.dueDate) return 0;
    const cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    return p.sortOrder === 'asc' ? cmp : -cmp;
  });

  const groups: Record<string, MinimalTask[]> = {};
  for (const item of filtered) {
    if (!item.dueDate) continue;
    const d = new Date(item.dueDate);
    const key = p.groupBy === 'week' ? formatWeekRange(d) : formatMonthYear(d);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

// ── History filtering + grouping ──

interface HistoryPayload {
  items: MinimalTask[];
  searchQuery: string;
  filter: 'all' | 'recurring' | 'today' | 'week' | 'month' | 'dateRange';
  sortBy: SortType;
  dateFrom?: string | null;
  dateTo?: string | null;
  // i18n keys for group headers
  labels: { today: string; yesterday: string; thisWeek: string; month: string };
}

function filterAndGroupHistory(p: HistoryPayload): {
  filtered: MinimalTask[];
  groups: Record<string, MinimalTask[]>;
} {
  let filtered = [...p.items];

  if (p.searchQuery.trim()) {
    const q = p.searchQuery.toLowerCase();
    filtered = filtered.filter(t =>
      t.text.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.tags?.some(tag => tag.toLowerCase().includes(q))
    );
  }

  switch (p.filter) {
    case 'recurring': filtered = filtered.filter(t => t.repeatType && t.repeatType !== 'none'); break;
    case 'today': filtered = filtered.filter(t => t.dueDate && isToday(new Date(t.dueDate))); break;
    case 'week': filtered = filtered.filter(t => t.dueDate && isThisWeek(new Date(t.dueDate))); break;
    case 'month': filtered = filtered.filter(t => t.dueDate && isThisMonth(new Date(t.dueDate))); break;
    case 'dateRange':
      if (p.dateFrom || p.dateTo) {
        const from = p.dateFrom ? startOfDayMs(new Date(p.dateFrom)) : null;
        const to = p.dateTo ? new Date(new Date(p.dateTo).setHours(23, 59, 59, 999)) : null;
        filtered = filtered.filter(t => {
          const td = t.completedAt ? new Date(t.completedAt)
            : t.dueDate ? new Date(t.dueDate)
            : new Date(parseInt(t.id) || Date.now());
          if (from && to) return td >= from && td <= to;
          if (from) return td >= from;
          if (to) return td <= to;
          return true;
        });
      }
      break;
  }

  const getTime = (t: MinimalTask) => {
    if (t.completedAt) return new Date(t.completedAt).getTime();
    if (t.dueDate) return new Date(t.dueDate).getTime();
    return parseInt(t.id) || 0;
  };

  switch (p.sortBy) {
    case 'newest': filtered.sort((a, b) => getTime(b) - getTime(a)); break;
    case 'oldest': filtered.sort((a, b) => getTime(a) - getTime(b)); break;
    case 'name': filtered.sort((a, b) => a.text.localeCompare(b.text)); break;
  }

  const groups: Record<string, MinimalTask[]> = {};
  for (const task of filtered) {
    const date = task.completedAt ? new Date(task.completedAt)
      : task.dueDate ? new Date(task.dueDate)
      : new Date(parseInt(task.id) || Date.now());
    let key: string;
    if (isToday(date)) key = p.labels.today;
    else if (isYesterday(date)) key = p.labels.yesterday;
    else if (isThisWeek(date)) key = p.labels.thisWeek;
    else if (isThisMonth(date)) key = p.labels.month;
    else key = formatMonthYear(date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  }

  return { filtered, groups };
}

// ── Productivity stats ──

interface StatsPayload {
  items: MinimalTask[];
}

function computeStats(p: StatsPayload) {
  const total = p.items.length;
  const completed = p.items.filter(i => i.completed).length;
  const overdue = p.items.filter(i => !i.completed && i.dueDate && new Date(i.dueDate) < new Date()).length;
  const highPriority = p.items.filter(i => i.priority === 'high' && !i.completed).length;
  const withSubtasks = p.items.filter(i => i.subtasks && i.subtasks.length > 0).length;
  const totalSubtasks = p.items.reduce((sum, i) => sum + (i.subtasks?.length || 0), 0);
  const completedSubtasks = p.items.reduce((sum, i) => sum + (i.subtasks?.filter(s => s.completed).length || 0), 0);

  return {
    total,
    completed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    overdue,
    highPriority,
    withSubtasks,
    totalSubtasks,
    completedSubtasks,
  };
}

// ── Message handler ──

type WorkerMessage =
  | { type: 'filterSort'; id: string; payload: FilterSortPayload }
  | { type: 'upcomingGroup'; id: string; payload: UpcomingPayload }
  | { type: 'historyGroup'; id: string; payload: HistoryPayload }
  | { type: 'stats'; id: string; payload: StatsPayload };

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, id, payload } = e.data;

  try {
    let result: any;

    switch (type) {
      case 'filterSort':
        result = filterAndSort(payload as FilterSortPayload);
        break;
      case 'upcomingGroup':
        result = filterAndGroupUpcoming(payload as UpcomingPayload);
        break;
      case 'historyGroup':
        result = filterAndGroupHistory(payload as HistoryPayload);
        break;
      case 'stats':
        result = computeStats(payload as StatsPayload);
        break;
      default:
        self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
        return;
    }

    self.postMessage({ type: 'result', id, result });
  } catch (err: any) {
    self.postMessage({ type: 'error', id, error: err?.message || 'Worker error' });
  }
};
