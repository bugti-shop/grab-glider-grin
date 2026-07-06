import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { genId } from '@/utils/genId';
import { recordCompletion, TASK_STREAK_KEY } from '@/utils/streakStorage';

import { NotesCalendarView } from '@/components/NotesCalendarView';
import { TaskTimeGridView, TimeViewMode } from '@/components/TaskTimeGridView';
import { YearCalendarView } from '@/components/YearCalendarView';

import { Plus, ListTodo, CalendarDays, Clock, MapPin, Repeat, Trash2, Edit, MoreVertical, X, GripVertical, LayoutList, Columns3, GitBranch, Flag, ListChecks, ChevronRight, ChevronDown, TrendingUp, History, CheckCircle2, Circle, Loader2, Sun, AlertCircle, Crown, Check, Grid3x3, Calendar as CalendarIconLucide, Columns2, Square, Rows3 } from 'lucide-react';
import { useSubscription, FREE_LIMITS } from '@/contexts/SubscriptionContext';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { Button } from '@/components/ui/button';
import { TaskInputSheet } from '@/components/TaskInputSheet';
import { TodoItem, Folder, CalendarEvent, Priority, TaskSection, TaskStatus } from '@/types/note';
import { TaskItem } from '@/components/TaskItem';
import { FlatTaskList } from '@/components/tasks/FlatTaskList';
import { TaskDetailPage } from '@/components/TaskDetailPage';
import { TaskFilterSheet, DateFilter, PriorityFilter, StatusFilter } from '@/components/TaskFilterSheet';
import { SelectActionsSheet, SelectAction } from '@/components/SelectActionsSheet';
import { MoveToFolderSheet } from '@/components/MoveToFolderSheet';
import { PrioritySelectSheet } from '@/components/PrioritySelectSheet';
import { SmartListsDropdown, SmartListType, getSmartListFilter } from '@/components/SmartListsDropdown';
import { PremiumCrown } from '@/components/PremiumCrown';
import { lazy, Suspense } from 'react';
 
import { CalendarBackgroundSheet } from '@/components/CalendarBackgroundSheet';
import { SubtaskDetailSheet } from '@/components/SubtaskDetailSheet';
import { usePriorities } from '@/hooks/usePriorities';

import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { isSameDay, format, addDays, addWeeks, addMonths, isToday, isTomorrow, isThisWeek, isBefore, startOfDay, isYesterday } from 'date-fns';
import { createNextRecurringTask } from '@/utils/recurringTasks';
import { playCompletionSound } from '@/utils/taskSounds';
import { archiveCompletedTasks } from '@/utils/taskCleanup';
import { applyTaskOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TodoBottomNavigation } from '@/components/TodoBottomNavigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Flame, CalendarX, Clock as ClockIcon } from 'lucide-react';
import { Calendar as CalendarIcon2 } from 'lucide-react';

import { toast } from 'sonner';
import { loadTodoItems, saveTodoItems, deleteTodoItem } from '@/utils/todoItemsStorage';
import { bulkPutTasksInDB, bulkUpdateTasksInDB, updateTaskInDB } from '@/utils/taskStorage';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EventEditor } from '@/components/EventEditor';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { loadCountdowns, CountdownEvent } from '@/utils/countdownStorage';



type ViewMode = 'flat' | 'kanban' | 'kanban-status' | 'timeline' | 'progress' | 'priority' | 'history';

const defaultSections: TaskSection[] = [
  { id: 'default', name: 'Tasks', color: '#3b82f6', isCollapsed: false, order: 0 }
];

const TodoCalendar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getPriorityColor } = usePriorities();
  const { requireFeature, isPro, softRequireCreate, canCreateWithinSoftLimit, requireCapacity, requireProFeature } = useSubscription();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isEventEditorOpen, setIsEventEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sections, setSections] = useState<TaskSection[]>(defaultSections);
  const [taskDates, setTaskDates] = useState<Date[]>([]);
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'pending' | 'completed'>('all');
  const [selectedTask, setSelectedTask] = useState<TodoItem | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('flat');

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Advanced filters
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [smartList, setSmartList] = useState<SmartListType>('all');

  // Sheets
  const [isSelectActionsOpen, setIsSelectActionsOpen] = useState(false);
  const [isMoveToFolderOpen, setIsMoveToFolderOpen] = useState(false);
  const [isPrioritySheetOpen, setIsPrioritySheetOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
   
  
  // Calendar background
  const [calendarBackground, setCalendarBackground] = useState<string>('none');
  const [isBackgroundSheetOpen, setIsBackgroundSheetOpen] = useState(false);

  // Collapsed sections
  const [collapsedViewSections, setCollapsedViewSections] = useState<Set<string>>(new Set());
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  // Subtask detail
  const [selectedSubtask, setSelectedSubtask] = useState<{ subtask: TodoItem; parentId: string } | null>(null);

  // Order version for force re-render
  const [orderVersion, setOrderVersion] = useState(0);

  // Calendar layout mode: list / year / month / week / 3day / day
  type CalendarLayout = 'list' | 'year' | TimeViewMode;
  const [calendarLayout, setCalendarLayout] = useState<CalendarLayout>('list');
  // Prefilled due date when quick-adding from a calendar time slot
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);
  // Calendar chip filters — which sections (and events) appear as chips in list view
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const [hideEvents, setHideEvents] = useState(false);
  const [hideCountdowns, setHideCountdowns] = useState(false);


  // Countdown events (shown as markers/pills in time-grid views)
  const [countdowns, setCountdowns] = useState<CountdownEvent[]>([]);

  useEffect(() => {
    const load = async () => setCountdowns(await loadCountdowns());
    load();
    const handler = () => load();
    window.addEventListener('countdownsUpdated', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('countdownsUpdated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const countdownPseudoTasks = useMemo<TodoItem[]>(() => {
    if (countdowns.length === 0) return [];
    const out: TodoItem[] = [];
    const today = startOfDay(new Date());
    const windowStart = addDays(today, -60);
    const windowEnd = addDays(today, 365);
    const parseDate = (iso: string, hhmm?: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      const [hh, mm] = (hhmm || '09:00').split(':').map(Number);
      return new Date(y, (m || 1) - 1, d || 1, hh || 9, mm || 0);
    };
    const advance = (d: Date, rep: CountdownEvent['repeat']): Date | null => {
      switch (rep) {
        case 'daily': return addDays(d, 1);
        case 'weekly': return addWeeks(d, 1);
        case 'monthly': return addMonths(d, 1);
        case 'yearly': return addMonths(d, 12);
        default: return null;
      }
    };
    for (const c of countdowns) {
      if (c.completed && c.repeat === 'none') continue;
      const base = parseDate(c.date, c.reminderTime);
      const occurrences: Date[] = [];
      let cur = new Date(base);
      // wind forward if past for one-off
      if (c.repeat === 'none') {
        if (cur >= windowStart && cur <= windowEnd) occurrences.push(cur);
      } else {
        // catch up to window
        while (cur < windowStart) {
          const next = advance(cur, c.repeat);
          if (!next) break;
          cur = next;
        }
        while (cur <= windowEnd) {
          occurrences.push(new Date(cur));
          const next = advance(cur, c.repeat);
          if (!next) break;
          cur = next;
        }
      }
      const typeIcon = c.type === 'birthday' ? '🎂' : c.type === 'anniversary' ? '💍' : c.type === 'holiday' ? '🎉' : '🎯';
      for (const occ of occurrences) {
        out.push({
          id: `countdown:${c.id}:${occ.getTime()}`,
          text: `${typeIcon} ${c.name}`,
          completed: !!c.completed && c.repeat === 'none',
          createdAt: new Date(c.createdAt),
          dueDate: occ,
        } as TodoItem);
        // Reminder markers
        (c.reminderOffsets || []).forEach((off) => {
          if (off === 0) return;
          const reminderDate = addDays(occ, -off);
          if (reminderDate < windowStart || reminderDate > windowEnd) return;
          out.push({
            id: `countdown:${c.id}:reminder:${reminderDate.getTime()}`,
            text: `🔔 ${c.name} (${off}d)`,
            completed: false,
            createdAt: new Date(c.createdAt),
            dueDate: reminderDate,
          } as TodoItem);
        });
      }
    }
    return out;
  }, [countdowns]);

  const itemsWithCountdowns = useMemo(() => [...items, ...countdownPseudoTasks], [items, countdownPseudoTasks]);



  const loadTasks = useCallback(async () => {
    let tasks = await loadTodoItems();
    
    const { activeTasks, archivedCount } = await archiveCompletedTasks(tasks, 3);
    if (archivedCount > 0) {
      await saveTodoItems(activeTasks);
      tasks = activeTasks;
      toast.info(t('todayPage.archivedCompleted', { count: archivedCount }), { icon: '📦' });
    }
    
    setItems(tasks);

    let filteredTasks = tasks;
    if (filterType === 'pending') filteredTasks = tasks.filter(task => !task.completed);
    else if (filterType === 'completed') filteredTasks = tasks.filter(task => task.completed);

    const dates = filteredTasks.filter(task => task.dueDate).map(task => new Date(task.dueDate!));
    setTaskDates(dates);

    const savedFolders = await getSetting<Folder[]>('todoFolders', []);
    if (savedFolders.length > 0) setFolders(savedFolders);

    const savedSections = await getSetting<TaskSection[]>('todoSections', []);
    setSections(savedSections.length > 0 ? savedSections : defaultSections);

    const savedEvents = await getSetting<CalendarEvent[]>('calendarEvents', []);
    if (savedEvents.length > 0) {
      const loadedEvents = savedEvents.map((e: CalendarEvent) => ({
        ...e,
        startDate: new Date(e.startDate),
        endDate: new Date(e.endDate),
        createdAt: new Date(e.createdAt),
        updatedAt: new Date(e.updatedAt),
      }));
      setEvents(loadedEvents);
      const evDates = loadedEvents.map((e: CalendarEvent) => new Date(e.startDate));
      setEventDates(evDates);
    }

    // Load saved view mode
    const savedViewMode = await getSetting<ViewMode>('calendarViewMode', 'flat');
    setViewMode(savedViewMode);

    const savedLayoutRaw = await getSetting<string>('calendarLayoutMode', 'list');
    const savedLayout = (savedLayoutRaw === 'classic' ? 'list' : savedLayoutRaw) as CalendarLayout;
    setCalendarLayout(savedLayout);


  }, [filterType]);

  useEffect(() => {
    loadTasks();
    const handleTasksUpdate = () => loadTasks();
    window.addEventListener('tasksUpdated', handleTasksUpdate);
    window.addEventListener('sectionsUpdated', handleTasksUpdate);
    window.addEventListener('storage', handleTasksUpdate);
    return () => {
      window.removeEventListener('tasksUpdated', handleTasksUpdate);
      window.removeEventListener('sectionsUpdated', handleTasksUpdate);
      window.removeEventListener('storage', handleTasksUpdate);
    };
  }, [loadTasks]);

  // Persist view mode
  useEffect(() => {
    getSetting<string>('calendarBackground', 'none').then(setCalendarBackground);
    getSetting<string[]>('calendarHiddenSections', []).then((arr) => setHiddenSections(new Set(arr || [])));
    getSetting<boolean>('calendarHideEvents', false).then((v) => setHideEvents(!!v));
    getSetting<boolean>('calendarHideCountdowns', false).then((v) => setHideCountdowns(!!v));
  }, []);

  // Persist chip filter changes
  useEffect(() => { setSetting('calendarHiddenSections', Array.from(hiddenSections)); }, [hiddenSections]);
  useEffect(() => { setSetting('calendarHideEvents', hideEvents); }, [hideEvents]);
  useEffect(() => { setSetting('calendarHideCountdowns', hideCountdowns); }, [hideCountdowns]);


  // Save view mode when changed
  const handleViewModeChange = useCallback(async (mode: ViewMode) => {
    setViewMode(mode);
    await setSetting('calendarViewMode', mode);
  }, []);

  // Events for selected date (including recurring)
  const eventsForSelectedDate = useMemo(() => {
    if (!date) return [];
    return events.filter(event => {
      const eventStart = new Date(event.startDate);
      if (isSameDay(eventStart, date)) return true;
      if (event.repeat !== 'never') return isRecurringEventOnDate(event, date);
      return false;
    });
  }, [date, events]);

  const isRecurringEventOnDate = (event: CalendarEvent, targetDate: Date): boolean => {
    const eventStart = new Date(event.startDate);
    if (targetDate < eventStart) return false;
    const daysDiff = Math.floor((targetDate.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24));
    switch (event.repeat) {
      case 'daily': return true;
      case 'weekly': return daysDiff % 7 === 0;
      case 'monthly': return eventStart.getDate() === targetDate.getDate();
      case 'yearly': return eventStart.getDate() === targetDate.getDate() && eventStart.getMonth() === targetDate.getMonth();
      default: return false;
    }
  };

  const getRecurringEventDates = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    const futureLimit = new Date(today);
    futureLimit.setMonth(futureLimit.getMonth() + 3);
    events.forEach(event => {
      const eventStart = new Date(event.startDate);
      dates.push(eventStart);
      if (event.repeat !== 'never') {
        let currentDate = new Date(eventStart);
        while (currentDate <= futureLimit) {
          switch (event.repeat) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'monthly': currentDate = addMonths(currentDate, 1); break;
            case 'yearly': currentDate = addMonths(currentDate, 12); break;
            default: currentDate = futureLimit;
          }
          if (currentDate <= futureLimit) dates.push(new Date(currentDate));
        }
      }
    });
    return dates;
  }, [events]);

  const toggleViewSectionCollapse = (sectionId: string) => {
    setCollapsedViewSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) newSet.delete(sectionId);
      else newSet.add(sectionId);
      return newSet;
    });
  };

  // Selection mode handlers
  const handleToggleSelection = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const taskIds = tasksForSelectedDate.filter(t => !t.completed).map(t => t.id);
    setSelectedTaskIds(new Set(taskIds));
  }, []);

  const handleSelectAction = async (action: SelectAction) => {
    const selectedTasks = items.filter(t => selectedTaskIds.has(t.id));
    switch (action) {
      case 'selectAll':
        setSelectedTaskIds(new Set(items.filter(t => !t.completed).map(t => t.id)));
        toast.success(t('todayPage.selectedTasks', { count: items.filter(t => !t.completed).length }));
        return;
      case 'complete': {
        const now = new Date();
        const ids = new Set(selectedTasks.map(t => t.id));
        const updated = items.map(i => ids.has(i.id) ? { ...i, completed: true, completedAt: now, modifiedAt: now } : i);
        setItems(updated);
        const total = selectedTasks.length;
        const showProgress = total >= 500;
        const toastId = showProgress ? `bulk-complete-${Date.now()}` : undefined;
        if (showProgress) toast.loading(`Completing 0 / ${total.toLocaleString()}…`, { id: toastId });
        const { bulkUpdateTasksInDB } = await import('@/utils/taskStorage');
        await bulkUpdateTasksInDB(
          updated.filter(i => ids.has(i.id)),
          false,
          showProgress ? ({ processed }) => {
            toast.loading(`Completing ${processed.toLocaleString()} / ${total.toLocaleString()}…`, { id: toastId });
          } : undefined,
        );
        if (showProgress && toastId) toast.dismiss(toastId);
        toast.success(t('todayPage.completedTasks', { count: total }));
        break;
      }
      case 'delete': {
        const ids = selectedTasks.map(t => t.id);
        const idSet = new Set(ids);
        setItems(items.filter(i => !idSet.has(i.id)));
        const total = ids.length;
        const showProgress = total >= 500;
        const toastId = showProgress ? `bulk-delete-${Date.now()}` : undefined;
        if (showProgress) toast.loading(`Deleting 0 / ${total.toLocaleString()}…`, { id: toastId });
        const { bulkDeleteTasksFromDB } = await import('@/utils/taskStorage');
        await bulkDeleteTasksFromDB(
          ids,
          false,
          showProgress ? ({ processed }) => {
            toast.loading(`Deleting ${processed.toLocaleString()} / ${total.toLocaleString()}…`, { id: toastId });
          } : undefined,
        );
        if (showProgress && toastId) toast.dismiss(toastId);
        toast.success(t('todayPage.deletedTasks', { count: total }));
        break;
      }
      case 'move':
        setIsMoveToFolderOpen(true);
        return;
      case 'priority':
        setIsPrioritySheetOpen(true);
        return;
      case 'duplicate': {
        const duplicatedTasks = selectedTasks.map((task) => ({ ...task, id: genId(), completed: false, completedAt: undefined, modifiedAt: new Date() }));
        setItems((prev) => [...duplicatedTasks, ...prev]);
        await bulkPutTasksInDB(duplicatedTasks);
        toast.success(t('todayPage.duplicatedTasks', { count: selectedTasks.length }));
        break;
      }
      case 'pin':
        const updatedPinItems = items.map(item => 
          selectedTaskIds.has(item.id) ? { ...item, isPinned: !item.isPinned } : item
        );
        setItems(updatedPinItems);
        await bulkUpdateTasksInDB(updatedPinItems.filter(item => selectedTaskIds.has(item.id)));
        toast.success(t('todayPage.pinnedTasks', { count: selectedTasks.length }));
        break;
      case 'setStatus':
        const updatedStatusItems = items.map(item => 
          selectedTaskIds.has(item.id) ? { ...item, status: 'in-progress' as any } : item
        );
        setItems(updatedStatusItems);
        await bulkUpdateTasksInDB(updatedStatusItems.filter(item => selectedTaskIds.has(item.id)));
        toast.success(t('todayPage.updatedStatus', { count: selectedTasks.length }));
        break;
      case 'setRepeat':
      case 'setReminder':
      case 'moveToSection':
      case 'convert':
        toast.info(t('common.comingSoon', 'Coming soon'));
        return;
      case 'setDueDate':
        const updatedDateItems = items.map(item => 
          selectedTaskIds.has(item.id) ? { ...item, dueDate: new Date() } : item
        );
        setItems(updatedDateItems);
        await bulkUpdateTasksInDB(updatedDateItems.filter(item => selectedTaskIds.has(item.id)));
        toast.success(t('todayPage.updatedDueDate', { count: selectedTasks.length }));
        break;
    }
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
    window.dispatchEvent(new Event('tasksUpdated'));
  };

  const handleMoveToFolder = async (folderId: string | null) => {
    const updatedItems = items.map(item => 
      selectedTaskIds.has(item.id) ? { ...item, folderId: folderId || undefined } : item
    );
    setItems(updatedItems);
    await bulkUpdateTasksInDB(updatedItems.filter(item => selectedTaskIds.has(item.id)));
    toast.success(t('todayPage.movedTasks', { count: selectedTaskIds.size }));
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
    setIsMoveToFolderOpen(false);
    window.dispatchEvent(new Event('tasksUpdated'));
  };

  const handleSetPriority = async (priority: Priority) => {
    const updatedItems = items.map(item => 
      selectedTaskIds.has(item.id) ? { ...item, priority } : item
    );
    setItems(updatedItems);
    await bulkUpdateTasksInDB(updatedItems.filter(item => selectedTaskIds.has(item.id)));
    toast.success(t('todayPage.updatedPriority', { count: selectedTaskIds.size }));
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
    setIsPrioritySheetOpen(false);
    window.dispatchEvent(new Event('tasksUpdated'));
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setIsEventEditorOpen(true);
  };

  const handleDeleteEvent = (event: CalendarEvent) => {
    setEventToDelete(event);
  };

  const confirmDeleteEvent = async () => {
    if (eventToDelete) {
      const updatedEvents = events.filter(e => e.id !== eventToDelete.id);
      setEvents(updatedEvents);
      await setSetting('calendarEvents', updatedEvents);
      // Notification cancellation removed
      toast.success(t('todayPage.eventDeleted'));
      setEventToDelete(null);
    }
  };

  const handleSaveEvent = async (eventData: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingEvent) {
      const updatedEvent: CalendarEvent = { ...editingEvent, ...eventData, updatedAt: new Date() };
      const updatedEvents = events.map(e => e.id === editingEvent.id ? updatedEvent : e);
      setEvents(updatedEvents);
      await setSetting('calendarEvents', updatedEvents);
      await scheduleEventNotification(updatedEvent);
      setEditingEvent(null);
    } else {
      const newEvent: CalendarEvent = { ...eventData, id: genId(), createdAt: new Date(), updatedAt: new Date() };
      const updatedEvents = [...events, newEvent];
      setEvents(updatedEvents);
      await setSetting('calendarEvents', updatedEvents);
      await scheduleEventNotification(newEvent);
    }
    // Trigger system calendar sync
    window.dispatchEvent(new CustomEvent('calendarEventsUpdated'));
  };

  const scheduleEventNotification = async (_event: CalendarEvent) => {
    // Notification scheduling removed
  };

  const handleAddTask = async (task: Omit<TodoItem, 'id' | 'completed'>) => {
    const allItemsExisting = await loadTodoItems();
    const targetFolderId = task.folderId ?? null;
    const folderTasksCount = allItemsExisting.filter(t => (t.folderId || null) === targetFolderId).length;
    if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
    if (!isPro && !softRequireCreate('tasks', allItemsExisting.length)) return;
    const newItem: TodoItem = { id: genId(), completed: false, ...task };
    allItemsExisting.unshift(newItem);
    await saveTodoItems(allItemsExisting);
    setItems(allItemsExisting);
    setTaskDates(allItemsExisting.filter(t => t.dueDate).map(t => new Date(t.dueDate!)));
    window.dispatchEvent(new Event('tasksUpdated'));

    // Notification scheduling removed
  };

  const handleCreateFolder = async (name: string, color: string) => {
    if (!requireCapacity('taskFolders', folders.length)) return;
    const newFolder: Folder = { id: genId(), name, color, isDefault: false, createdAt: new Date() };
    const updatedFolders = [...folders, newFolder];
    setFolders(updatedFolders);
    await setSetting('todoFolders', updatedFolders);
  };

  const handleUpdateTask = async (itemId: string, updates: Partial<TodoItem>) => {
    const currentItem = items.find(t => t.id === itemId);
    const now = new Date();
    const updatesWithTimestamp: Partial<TodoItem> = { ...updates, modifiedAt: now };
    if (updates.completed === true && currentItem && !currentItem.completed) updatesWithTimestamp.completedAt = now;
    if (updates.completed === false && currentItem?.completed) updatesWithTimestamp.completedAt = undefined;
    const isNewCompletion = updates.completed === true && currentItem && !currentItem.completed;
    
    if (isNewCompletion) {
      playCompletionSound();
      recordCompletion(TASK_STREAK_KEY).then((streakResult) => {
        if (streakResult.newMilestone) {
          toast.success(t('todayPage.streakMilestone', { days: streakResult.newMilestone }));
          window.dispatchEvent(new CustomEvent('streakMilestone', { detail: { milestone: streakResult.newMilestone } }));
        }
        if (streakResult.earnedFreeze) {
          toast.success(t('todayPage.earnedStreakFreeze'), { description: t('todayPage.earnedStreakFreezeDesc') });
        }
        if (streakResult.streakIncremented) {
          window.dispatchEvent(new CustomEvent('streakChallengeShow', { detail: { currentStreak: streakResult.data.currentStreak } }));
        }
        window.dispatchEvent(new CustomEvent('streakUpdated'));
      }).catch((e) => console.warn('Failed to record streak:', e));
    }
    
    if (currentItem && isNewCompletion) {
      if (currentItem.repeatType && currentItem.repeatType !== 'none') {
        const nextTask = createNextRecurringTask(currentItem);
        if (nextTask) {
          const updatedItems = [nextTask, ...items.map(t => t.id === itemId ? { ...t, ...updatesWithTimestamp } : t)];
          setItems(updatedItems);
          bulkPutTasksInDB([nextTask, { ...currentItem, ...updatesWithTimestamp }]).catch(console.warn);
          toast.success(t('todayPage.recurringTaskCompleted'), { icon: '🔄' });
          window.dispatchEvent(new Event('tasksUpdated'));
          return;
        }
      }
    }
    
    const updatedItems = items.map(task => task.id === itemId ? { ...task, ...updatesWithTimestamp } : task);
    setItems(updatedItems);
    updateTaskInDB(itemId, updatesWithTimestamp).catch(console.warn);
    window.dispatchEvent(new Event('tasksUpdated'));
  };

  const handleDeleteTask = async (itemId: string) => {
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
    const updatedItems = items.filter(task => task.id !== itemId);
    setItems(updatedItems);
    await deleteTodoItem(itemId);
    window.dispatchEvent(new Event('tasksUpdated'));
  };

  // Track drag/scroll to prevent task opening
  const isDraggingRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTaskClick = (task: TodoItem) => {
    // Don't open if we just finished a drag or scroll
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    if (isSelectionMode) {
      handleToggleSelection(task.id);
    } else {
      setSelectedTask(task);
    }
  };

  const handleImageClick = (imageUrl: string) => window.open(imageUrl, '_blank');

  // Filter tasks for selected date with smart list and priority filters
  const tasksForSelectedDate = useMemo(() => {
    if (!date) return [];
    let filtered = items.filter(task => {
      if (!task.dueDate) return false;
      const matches = isSameDay(new Date(task.dueDate), date);
      if (filterType === 'pending') return matches && !task.completed;
      if (filterType === 'completed') return matches && task.completed;
      return matches;
    });
    if (smartList !== 'all') filtered = filtered.filter(getSmartListFilter(smartList));
    if (priorityFilter !== 'all') filtered = filtered.filter(task => task.priority === priorityFilter);
    if (tagFilter.length > 0) {
      filtered = filtered.filter(task => task.tagIds?.some(id => tagFilter.includes(id)));
    }
    return filtered;
  }, [date, items, filterType, smartList, priorityFilter, tagFilter]);

  const uncompletedTasks = useMemo(() => tasksForSelectedDate.filter(t => !t.completed), [tasksForSelectedDate]);
  const completedTasks = useMemo(() => tasksForSelectedDate.filter(t => t.completed), [tasksForSelectedDate]);

  const sortedSections = useMemo(() => [...sections].sort((a, b) => a.order - b.order), [sections]);

   
  const hasItemsForDate = tasksForSelectedDate.length > 0 || eventsForSelectedDate.length > 0;

  // Render section header for view modes
  const renderViewModeSectionHeader = (
    label: string, taskCount: number, color: string, icon: React.ReactNode, sectionId: string, extra?: React.ReactNode
  ) => {
    const isCollapsed = collapsedViewSections.has(sectionId);
    return (
      <button 
        onClick={() => toggleViewSectionCollapse(sectionId)}
        className="w-full flex items-center gap-2 px-4 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" 
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <span style={{ color }}>{icon}</span>
        <span className="text-sm font-semibold flex-1 text-left">{label}</span>
        {extra}
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{taskCount}</span>
        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
    );
  };

  // Render completed section for view modes
  const renderCompletedSection = () => {
    if (!showCompleted || completedTasks.length === 0) return null;
    const isCollapsed = collapsedViewSections.has('cal-completed');
    return (
      <div className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden mt-4">
        <button 
          onClick={() => toggleViewSectionCollapse('cal-completed')}
          className="w-full flex items-center gap-2 px-4 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" 
          style={{ borderLeft: `4px solid #10b981` }}
        >
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm font-semibold flex-1 text-left text-muted-foreground uppercase tracking-wide">{t('todayPage.completed')}</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{completedTasks.length}</span>
          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {!isCollapsed && (
          <div className="p-2 space-y-2">
            {completedTasks.map((task) => (
              <div key={task.id} className="bg-card rounded-lg border border-border/50 opacity-70">
                <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render task item within a droppable group
  const renderGroupedTasks = (groupTasks: TodoItem[], groupId: string) => {
    const isCollapsed = collapsedViewSections.has(groupId);
    if (isCollapsed) return null;
    const orderedTasks = applyTaskOrder(groupTasks, groupId);
    return (
      <Droppable droppableId={groupId}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={cn("p-2 space-y-2 min-h-[50px]", snapshot.isDraggingOver && "bg-primary/5")}>
            {orderedTasks.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">{t('todayPage.dropTasksHere')}</div>
            ) : orderedTasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card rounded-lg border border-border/50 overflow-hidden", snapshot.isDragging && "shadow-lg ring-2 ring-primary")}
                    onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                    onTouchMove={(e) => { if (touchStartRef.current) { const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x); const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y); if (dx > 10 || dy > 10) isDraggingRef.current = true; } }}
                    onTouchEnd={() => { touchStartRef.current = null; }}
                  >
                    <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    );
  };

  // Generic drag end for grouped views
  const handleGroupedDragEnd = useCallback((result: DropResult, getNewValue: (destGroup: string) => Partial<TodoItem> | null) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (source.droppableId !== destination.droppableId) {
      const updates = getNewValue(destination.droppableId);
      if (updates) {
        handleUpdateTask(draggableId, updates);
      }
    }

    const destGroupTasks = uncompletedTasks.filter(t => t.id !== draggableId);
    const currentlyOrdered = applyTaskOrder(destGroupTasks, destination.droppableId);
    const ids = currentlyOrdered.map(t => t.id);
    ids.splice(destination.index, 0, draggableId);
    updateSectionOrder(destination.droppableId, ids);
    setOrderVersion(v => v + 1);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }, [uncompletedTasks, items]);

  // Render tasks based on view mode
  const renderTasksView = () => {
    if (tasksForSelectedDate.length === 0) return null;
    if (tasksForSelectedDate.length > 200) return renderFlatView();

    switch (viewMode) {
      case 'priority':
        return renderPriorityView();
      case 'kanban':
        return renderKanbanView();
      case 'kanban-status':
        return renderStatusView();
      case 'timeline':
        return renderTimelineView();
      case 'progress':
        return renderProgressView();
      case 'history':
        return renderHistoryView();
      default:
        return renderFlatView();
    }
  };

  const renderFlatView = () => {
    if (tasksForSelectedDate.length > 200) {
      return (
        <div className="space-y-4">
          <FlatTaskList
            items={uncompletedTasks}
            rowHeight={68}
            useWindow
            renderRow={(row) => (
              <div className="bg-card rounded-lg border border-border/50 overflow-hidden">
                <TaskItem item={row.task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
              </div>
            )}
          />
          {showCompleted && completedTasks.length > 0 && (
            <Collapsible open={isCompletedOpen} onOpenChange={setIsCompletedOpen}>
              <div className="bg-muted/50 rounded-xl p-3 border border-border/30">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between px-2 py-2 hover:bg-muted/60 rounded-lg transition-colors">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('todayPage.completed')}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm font-medium">{completedTasks.length}</span>
                      {isCompletedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  <FlatTaskList
                    items={completedTasks}
                    rowHeight={68}
                    useWindow
                    renderRow={(row) => (
                      <div className="opacity-70 bg-card rounded-lg border border-border/50 overflow-hidden">
                        <TaskItem item={row.task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                      </div>
                    )}
                  />
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      );
    }
    return (
      <DragDropContext onDragStart={() => { isDraggingRef.current = true; }} onDragEnd={(result) => {
        isDraggingRef.current = true; // keep true so click is suppressed, reset in handleTaskClick
        if (!result.destination || !date) return;
        const { source, destination, draggableId } = result;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        // Update section if moved between
        const sourceSectionId = source.droppableId.replace('cal-flat-', '');
        const destSectionId = destination.droppableId.replace('cal-flat-', '');
        if (sourceSectionId !== destSectionId) {
          handleUpdateTask(draggableId, { sectionId: destSectionId === 'default' ? undefined : destSectionId });
        }

        const destTasks = uncompletedTasks.filter(t => {
          const sid = t.sectionId || 'default';
          return sid === destSectionId;
        });
        const ordered = applyTaskOrder(destTasks, `cal-flat-${destSectionId}`);
        const ids = ordered.map(t => t.id).filter(id => id !== draggableId);
        ids.splice(destination.index, 0, draggableId);
        updateSectionOrder(`cal-flat-${destSectionId}`, ids);
        setOrderVersion(v => v + 1);
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      }}>
        <div className="space-y-4">
          {sortedSections.map((section) => {
            const sectionTasks = uncompletedTasks.filter(item => 
              item.sectionId === section.id || (!item.sectionId && section.id === sections[0]?.id)
            );
            const sectionId = section.id === sections[0]?.id ? 'default' : section.id;
            const flatSectionId = `cal-flat-${sectionId}`;
            const isCollapsed = collapsedViewSections.has(flatSectionId);
            const orderedTasks = applyTaskOrder(sectionTasks, flatSectionId);

            return (
              <div key={section.id} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
                <button 
                  onClick={() => toggleViewSectionCollapse(flatSectionId)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-border/30 hover:bg-muted/20 transition-colors"
                  style={{ borderLeft: `4px solid ${section.color}` }}
                >
                  <LayoutList className="h-3.5 w-3.5" style={{ color: section.color }} />
                  <span className="text-sm font-semibold flex-1 text-left">{section.name}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sectionTasks.length}</span>
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!isCollapsed && (
                  <Droppable droppableId={`cal-flat-${sectionId}`}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className={cn("p-2 space-y-1 min-h-[40px]", snapshot.isDraggingOver && "bg-primary/5")}>
                        {orderedTasks.length === 0 ? (
                          <div className="py-4 text-center text-sm text-muted-foreground">{t('todayPage.noTasksInSection', 'No tasks in this section')}</div>
                        ) : orderedTasks.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div 
                                ref={provided.innerRef} 
                                {...provided.draggableProps} 
                                {...provided.dragHandleProps} 
                                className={cn("bg-card rounded-lg border border-border/50", snapshot.isDragging && "shadow-lg ring-2 ring-primary")}
                                onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                                onTouchMove={(e) => {
                                  if (touchStartRef.current) {
                                    const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
                                    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
                                    if (dx > 10 || dy > 10) isDraggingRef.current = true;
                                  }
                                }}
                                onTouchEnd={() => { touchStartRef.current = null; }}
                              >
                                <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                )}
              </div>
            );
          })}
          {/* Completed */}
          {showCompleted && completedTasks.length > 0 && (
            <Collapsible open={isCompletedOpen} onOpenChange={setIsCompletedOpen}>
              <div className="bg-muted/50 rounded-xl p-3 border border-border/30">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between px-2 py-2 hover:bg-muted/60 rounded-lg transition-colors">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('todayPage.completed')}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm font-medium">{completedTasks.length}</span>
                      {isCompletedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  {completedTasks.map(task => (
                    <div key={task.id} className="opacity-70">
                      <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                    </div>
                  ))}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      </DragDropContext>
    );
  };

  const renderKanbanView = () => {
    return (
      <DragDropContext onDragStart={() => { isDraggingRef.current = true; }} onDragEnd={(result) => {
        isDraggingRef.current = true;
        if (!result.destination) return;
        const { source, destination, draggableId } = result;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const sourceSectionId = source.droppableId.replace('cal-kanban-', '');
        const destSectionId = destination.droppableId.replace('cal-kanban-', '');
        if (sourceSectionId !== destSectionId) {
          handleUpdateTask(draggableId, { sectionId: destSectionId === 'default' ? undefined : destSectionId });
          toast.success(t('todayPage.taskMoved'));
        }
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      }}>
        <div className="overflow-x-auto pb-4 -mx-4 px-4">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {sortedSections.map((section) => {
              const sectionTasks = uncompletedTasks.filter(item => 
                item.sectionId === section.id || (!item.sectionId && section.id === sections[0]?.id)
              );
              const kanbanId = `cal-kanban-${section.id}`;
              const isCollapsed = collapsedViewSections.has(kanbanId);
              return (
                <div key={section.id} className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
                  <button onClick={() => toggleViewSectionCollapse(kanbanId)} className="w-full flex items-center gap-2 px-3 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: `4px solid ${section.color}` }}>
                    <Columns3 className="h-3.5 w-3.5" style={{ color: section.color }} />
                    <span className="text-sm font-semibold flex-1 text-left">{section.name}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sectionTasks.length}</span>
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {!isCollapsed && (
                    <Droppable droppableId={kanbanId}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className={cn("min-h-[200px] max-h-[400px] overflow-y-auto p-2 space-y-2", snapshot.isDraggingOver && "bg-primary/5")}>
                          {sectionTasks.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">{t('todayPage.dropTasksHere')}</div>
                          ) : sectionTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card rounded-lg border border-border/50 shadow-sm", snapshot.isDragging && "shadow-lg ring-2 ring-primary")}
                                  onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                                  onTouchMove={(e) => { if (touchStartRef.current) { const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x); const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y); if (dx > 10 || dy > 10) isDraggingRef.current = true; } }}
                                  onTouchEnd={() => { touchStartRef.current = null; }}
                                >
                                   <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              );
            })}
            {/* Completed column */}
            {showCompleted && completedTasks.length > 0 && (
              <div className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
                <button onClick={() => toggleViewSectionCollapse('cal-kanban-completed')} className="w-full flex items-center gap-2 px-3 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: '4px solid #10b981' }}>
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-sm font-semibold flex-1 text-left text-muted-foreground uppercase tracking-wide">{t('todayPage.completed')}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{completedTasks.length}</span>
                </button>
                {!collapsedViewSections.has('cal-kanban-completed') && (
                  <div className="min-h-[100px] max-h-[400px] overflow-y-auto p-2 space-y-2">
                    {completedTasks.map(task => (
                      <div key={task.id} className="bg-card rounded-lg border border-border/50 shadow-sm opacity-70">
                        <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DragDropContext>
    );
  };

  const renderStatusView = () => {
    const statusGroups: { id: TaskStatus; label: string; color: string; icon: React.ReactNode; tasks: TodoItem[] }[] = [
      { id: 'not_started', label: t('todayPage.notStarted'), color: '#6b7280', icon: <Circle className="h-3.5 w-3.5" />, tasks: uncompletedTasks.filter(item => !item.status || item.status === 'not_started') },
      { id: 'in_progress', label: t('todayPage.inProgress'), color: '#3b82f6', icon: <Loader2 className="h-3.5 w-3.5" />, tasks: uncompletedTasks.filter(item => item.status === 'in_progress') },
      { id: 'almost_done', label: t('todayPage.almostDone'), color: '#f59e0b', icon: <ClockIcon className="h-3.5 w-3.5" />, tasks: uncompletedTasks.filter(item => item.status === 'almost_done') },
      { id: 'completed', label: t('todayPage.completed'), color: '#10b981', icon: <CheckCircle2 className="h-3.5 w-3.5" />, tasks: completedTasks },
    ];

    return (
      <DragDropContext onDragStart={() => { isDraggingRef.current = true; }} onDragEnd={(result) => {
        isDraggingRef.current = true;
        if (!result.destination) return;
        const { source, destination, draggableId } = result;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;
        const destStatus = destination.droppableId.replace('cal-status-', '') as TaskStatus;
        handleUpdateTask(draggableId, { status: destStatus, completed: destStatus === 'completed', completedAt: destStatus === 'completed' ? new Date() : undefined });
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
        toast.success(t('todayPage.statusUpdated', { status: destStatus.replace('_', ' ') }));
      }}>
        <div className="overflow-x-auto pb-4 -mx-4 px-4">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {statusGroups.map((group) => {
              const sectionId = `cal-status-${group.id}`;
              const isCollapsed = collapsedViewSections.has(sectionId);
              return (
                <div key={group.id} className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
                  <button onClick={() => toggleViewSectionCollapse(sectionId)} className="w-full flex items-center gap-2 px-3 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: `4px solid ${group.color}` }}>
                    <span style={{ color: group.color }}>{group.icon}</span>
                    <span className="text-sm font-semibold flex-1 text-left">{group.label}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{group.tasks.length}</span>
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {!isCollapsed && (
                    <Droppable droppableId={sectionId}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className={cn("min-h-[200px] max-h-[400px] overflow-y-auto p-2 space-y-2", snapshot.isDraggingOver && "bg-primary/5")}>
                          {group.tasks.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">{t('todayPage.dropTasksHere')}</div>
                          ) : group.tasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card rounded-lg border border-border/50 shadow-sm", snapshot.isDragging && "shadow-lg ring-2 ring-primary", group.id === 'completed' && "opacity-70")}
                                  onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                                  onTouchMove={(e) => { if (touchStartRef.current) { const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x); const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y); if (dx > 10 || dy > 10) isDraggingRef.current = true; } }}
                                  onTouchEnd={() => { touchStartRef.current = null; }}
                                >
                                  <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>
    );
  };

  const renderPriorityView = () => {
    const priorityGroups = [
      { id: 'cal-priority-high', label: t('grouping.highPriority', 'High Priority'), tasks: uncompletedTasks.filter(t => t.priority === 'high'), color: getPriorityColor('high'), icon: <Flame className="h-4 w-4" style={{ color: getPriorityColor('high') }} /> },
      { id: 'cal-priority-medium', label: t('grouping.mediumPriority', 'Medium Priority'), tasks: uncompletedTasks.filter(t => t.priority === 'medium'), color: getPriorityColor('medium'), icon: <Flag className="h-4 w-4" style={{ color: getPriorityColor('medium') }} /> },
      { id: 'cal-priority-low', label: t('grouping.lowPriority', 'Low Priority'), tasks: uncompletedTasks.filter(t => t.priority === 'low'), color: getPriorityColor('low'), icon: <Flag className="h-4 w-4" style={{ color: getPriorityColor('low') }} /> },
      { id: 'cal-priority-none', label: t('grouping.noPriority', 'No Priority'), tasks: uncompletedTasks.filter(t => !t.priority || t.priority === 'none'), color: getPriorityColor('none'), icon: <Flag className="h-4 w-4" style={{ color: getPriorityColor('none') }} /> },
    ];

    return (
      <DragDropContext onDragStart={() => { isDraggingRef.current = true; }} onDragEnd={(result) => {
        isDraggingRef.current = true;
        if (!result.destination) return;
        const { source, destination, draggableId } = result;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;
        if (source.droppableId !== destination.droppableId) {
          let newPriority: Priority = 'none';
          if (destination.droppableId === 'cal-priority-high') newPriority = 'high';
          else if (destination.droppableId === 'cal-priority-medium') newPriority = 'medium';
          else if (destination.droppableId === 'cal-priority-low') newPriority = 'low';
          handleUpdateTask(draggableId, { priority: newPriority });
          toast.success(t('todayPage.priorityUpdated'));
        }
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      }}>
        <div className="space-y-4">
          {priorityGroups.map(group => (
            <div key={group.id} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
              {renderViewModeSectionHeader(group.label, group.tasks.length, group.color, group.icon, group.id)}
              {renderGroupedTasks(group.tasks, group.id)}
            </div>
          ))}
          {renderCompletedSection()}
        </div>
      </DragDropContext>
    );
  };

  const renderTimelineView = () => {
    const today = startOfDay(new Date());
    const timelineGroups = [
      { id: 'cal-tl-overdue', label: t('todayPage.overdue'), tasks: uncompletedTasks.filter(t => t.dueDate && isBefore(new Date(t.dueDate), today)), color: '#ef4444', icon: <AlertCircle className="h-4 w-4" /> },
      { id: 'cal-tl-today', label: t('todayPage.today'), tasks: uncompletedTasks.filter(t => t.dueDate && isToday(new Date(t.dueDate))), color: '#3b82f6', icon: <Sun className="h-4 w-4" /> },
      { id: 'cal-tl-tomorrow', label: t('todayPage.tomorrow'), tasks: uncompletedTasks.filter(t => t.dueDate && isTomorrow(new Date(t.dueDate))), color: '#f59e0b', icon: <CalendarIcon2 className="h-4 w-4" /> },
      { id: 'cal-tl-thisweek', label: t('todayPage.thisWeek'), tasks: uncompletedTasks.filter(t => t.dueDate && isThisWeek(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && !isTomorrow(new Date(t.dueDate))), color: '#10b981', icon: <CalendarIcon2 className="h-4 w-4" /> },
      { id: 'cal-tl-later', label: t('todayPage.later'), tasks: uncompletedTasks.filter(t => t.dueDate && !isBefore(new Date(t.dueDate), today) && !isThisWeek(new Date(t.dueDate))), color: '#8b5cf6', icon: <Clock className="h-4 w-4" /> },
      { id: 'cal-tl-nodate', label: t('todayPage.noDate'), tasks: uncompletedTasks.filter(t => !t.dueDate), color: '#6b7280', icon: <CalendarX className="h-4 w-4" /> },
    ];

    return (
      <div className="space-y-4">
        {timelineGroups.map(group => (
          <div key={group.id} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
            {renderViewModeSectionHeader(group.label, group.tasks.length, group.color, group.icon, group.id)}
            {!collapsedViewSections.has(group.id) && (
              <div className="p-2 space-y-2">
                {group.tasks.map(task => (
                  <div key={task.id} className="bg-card rounded-lg border border-border/50">
                    <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                  </div>
                ))}
                {group.tasks.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">{t('todayPage.noTasks')}</div>}
              </div>
            )}
          </div>
        ))}
        {renderCompletedSection()}
      </div>
    );
  };

  const renderProgressView = () => {
    const notStarted = uncompletedTasks.filter(t => !t.subtasks || t.subtasks.length === 0 || t.subtasks.every(st => !st.completed));
    const inProgress = uncompletedTasks.filter(t => t.subtasks && t.subtasks.length > 0 && t.subtasks.some(st => st.completed) && t.subtasks.some(st => !st.completed));
    const almostDone = uncompletedTasks.filter(t => t.subtasks && t.subtasks.length > 0 && t.subtasks.filter(st => st.completed).length >= t.subtasks.length * 0.75 && t.subtasks.some(st => !st.completed));

    const notStartedLabel = t('progress.notStarted', 'Not Started');
    const inProgressLabel = t('progress.inProgress', 'In Progress');
    const almostDoneLabel = t('progress.almostDone', 'Almost Done');
    const progressGroups = [
      { id: 'cal-prog-notstarted', label: notStartedLabel, tasks: notStarted.filter(t => !inProgress.includes(t) && !almostDone.includes(t)), color: '#6b7280', percent: '0%' },
      { id: 'cal-prog-inprogress', label: inProgressLabel, tasks: inProgress.filter(t => !almostDone.includes(t)), color: '#f59e0b', percent: '25-74%' },
      { id: 'cal-prog-almostdone', label: almostDoneLabel, tasks: almostDone, color: '#10b981', percent: '75%+' },
    ];

    return (
      <div className="space-y-4">
        {progressGroups.map(group => (
          <div key={group.id} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
            {renderViewModeSectionHeader(group.label, group.tasks.length, group.color, <TrendingUp className="h-4 w-4" />, group.id, <span className="text-xs text-muted-foreground">{group.percent}</span>)}
            {!collapsedViewSections.has(group.id) && (
              <div className="p-2 space-y-2">
                {group.tasks.map(task => (
                  <div key={task.id} className="bg-card rounded-lg border border-border/50">
                    <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                  </div>
                ))}
                {group.tasks.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">No tasks</div>}
              </div>
            )}
          </div>
        ))}
        {renderCompletedSection()}
      </div>
    );
  };

  const renderHistoryView = () => {
    const todayCompleted = completedTasks.filter(t => t.dueDate && isToday(new Date(t.dueDate)));
    const yesterdayCompleted = completedTasks.filter(t => t.dueDate && isYesterday(new Date(t.dueDate)));
    const thisWeekCompleted = completedTasks.filter(t => t.dueDate && isThisWeek(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && !isYesterday(new Date(t.dueDate)));
    const olderCompleted = completedTasks.filter(t => !t.dueDate || !isThisWeek(new Date(t.dueDate)));

    const historyGroups = [
      { label: t('todayPage.completedToday'), tasks: todayCompleted, color: '#10b981' },
      { label: t('todayPage.completedYesterday'), tasks: yesterdayCompleted, color: '#3b82f6' },
      { label: t('todayPage.thisWeek'), tasks: thisWeekCompleted, color: '#8b5cf6' },
      { label: t('todayPage.older'), tasks: olderCompleted, color: '#6b7280' },
    ];

    const hasHistory = historyGroups.some(g => g.tasks.length > 0);
    if (!hasHistory) {
      return (
        <div className="text-center py-20">
          <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">{t('todayPage.noCompletedTasks')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {historyGroups.filter(g => g.tasks.length > 0).map(group => {
          const sectionId = `cal-history-${group.label.toLowerCase().replace(/\s+/g, '-')}`;
          const isCollapsed = collapsedViewSections.has(sectionId);
          return (
            <div key={group.label} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
              {renderViewModeSectionHeader(group.label, group.tasks.length, group.color, <CheckCircle2 className="h-4 w-4" />, sectionId)}
              {!isCollapsed && (
                <div className="p-2 space-y-2">
                  {group.tasks.map(task => (
                    <div key={task.id} className="bg-card rounded-lg border border-border/50 opacity-70">
                      <TaskItem item={task} onUpdate={handleUpdateTask} onDelete={handleDeleteTask} onTaskClick={handleTaskClick} onImageClick={handleImageClick} allTasks={items} hideDetails hidePriorityBorder />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Handle subtask updates
  const handleUpdateSubtaskFromSheet = async (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => {
    const parent = items.find(t => t.id === parentId);
    if (!parent) return;
    const updatedSubtasks = parent.subtasks?.map(st => st.id === subtaskId ? { ...st, ...updates } : st);
    await handleUpdateTask(parentId, { subtasks: updatedSubtasks });
    setSelectedSubtask(null);
  };

  const handleDeleteSubtaskFromSheet = async (parentId: string, subtaskId: string) => {
    const parent = items.find(t => t.id === parentId);
    if (!parent) return;
    const updatedSubtasks = parent.subtasks?.filter(st => st.id !== subtaskId);
    await handleUpdateTask(parentId, { subtasks: updatedSubtasks });
    setSelectedSubtask(null);
  };

  return (
    <div className="min-h-screen bg-background pb-14">
      <div style={{ paddingTop: 'var(--safe-top, 0px)' }}>
        {/* Selection mode actions */}
        {isSelectionMode && (
          <div className="flex items-center justify-between gap-2 p-2 mx-4 mt-2 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedTaskIds.size > 0 && selectedTaskIds.size === tasksForSelectedDate.filter(t => !t.completed).length}
                onCheckedChange={(checked) => {
                  if (checked) handleSelectAll();
                  else setSelectedTaskIds(new Set());
                }}
              />
              <span className="text-sm text-muted-foreground">{selectedTaskIds.size} {t('todayPage.selected')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setIsSelectActionsOpen(true)} disabled={selectedTaskIds.size === 0}>
                <MoreVertical className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setIsSelectionMode(false); setSelectedTaskIds(new Set()); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Calendar layout switcher (icon menu in top-right) */}
        <div className="px-4 pt-2 flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">
            {(() => {
              const labels: Record<CalendarLayout, string> = {
                list: t('calendar.list', 'List'),
                year: t('calendar.year', 'Year'),
                month: t('calendar.month', 'Month'),
                week: t('calendar.week', 'Week'),
                '3day': t('calendar.threeDay', '3 Day'),
                day: t('calendar.day', 'Day'),
              };
              return labels[calendarLayout];
            })()}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                {(() => {
                  const Icon = ({
                    list: LayoutList,
                    year: Grid3x3,
                    month: CalendarIconLucide,
                    week: Columns3,
                    '3day': Columns2,
                    day: Square,
                  } as const)[calendarLayout];
                  return <Icon className="h-4 w-4" />;
                })()}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 bg-popover border shadow-lg z-50">
              {([
                { id: 'list', label: t('calendar.list', 'List'), Icon: LayoutList, free: true },
                { id: 'year', label: t('calendar.year', 'Year'), Icon: Grid3x3, free: false, proKey: 'calendar_view_year' },
                { id: 'month', label: t('calendar.month', 'Month'), Icon: CalendarIconLucide, free: true },
                { id: 'week', label: t('calendar.week', 'Week'), Icon: Columns3, free: false, proKey: 'calendar_view_week' },
                { id: '3day', label: t('calendar.threeDay', '3 Day'), Icon: Columns2, free: false, proKey: 'calendar_view_3day' },
                { id: 'day', label: t('calendar.day', 'Day'), Icon: Square, free: false, proKey: 'calendar_view_day' },
              ] as const).map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  onClick={async () => {
                    if (!opt.free && !isPro) {
                      requireProFeature((opt as any).proKey);
                      return;
                    }
                    setCalendarLayout(opt.id);
                    await setSetting('calendarLayoutMode', opt.id);
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                  }}
                  className={cn('cursor-pointer flex items-center justify-between', calendarLayout === opt.id && 'text-primary')}
                >
                  <span className="flex items-center gap-2">
                    <opt.Icon className="h-4 w-4" />
                    {opt.label}
                    {!opt.free && !isPro && <PremiumCrown size={12} />}
                  </span>
                  {calendarLayout === opt.id && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {calendarLayout === 'list' ? (
          <NotesCalendarView 
            selectedDate={date} 
            onDateSelect={setDate} 
            taskDates={taskDates} 
            eventDates={getRecurringEventDates}
            showEmptyState={!hasItemsForDate}
            emptyStateMessage={t('calendar.noTasksForDate', 'No tasks for the day.')}
            emptyStateSubMessage={t('calendar.clickToCreateTasks', 'Click "+" to create your tasks.')}
            calendarBackground={calendarBackground}
            onBackgroundSettingsClick={() => setIsBackgroundSheetOpen(true)}
            getDayChips={useMemo(() => {
              // Pre-bucket all tasks + events into a Map<YYYY-M-D, chips[]> once
              // so day cells look up in O(1) instead of scanning 5000 items each.
              const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const bucket = new Map<string, { id: string; label: string; color: string; completed?: boolean }[]>();
              for (const task of itemsWithCountdowns) {
                if (!task.dueDate) continue;
                const isCountdown = task.id?.startsWith('countdown:');
                if (isCountdown && hideCountdowns) continue;
                const sectionKey = task.sectionId || 'default';
                if (!isCountdown && hiddenSections.has(sectionKey)) continue;
                const section = sections.find((s) => s.id === sectionKey);
                const color = (isCountdown ? '#f59e0b' : undefined)
                  || section?.color
                  || (task.priority ? getPriorityColor(task.priority as Priority) : undefined)
                  || '#3c78f0';
                const k = key(new Date(task.dueDate));
                const arr = bucket.get(k) || [];
                arr.push({ id: task.id, label: task.text || 'Task', color, completed: !!task.completed });
                bucket.set(k, arr);
              }
              if (!hideEvents) {
                for (const ev of events) {
                  const start = new Date(ev.startDate);
                  const k = key(start);
                  const arr = bucket.get(k) || [];
                  arr.push({ id: `event:${ev.id}:${start.getTime()}`, label: ev.title || 'Event', color: '#10b981' });
                  bucket.set(k, arr);
                  // Note: recurring events still resolved per-day via isRecurringEventOnDate below.
                }
              }
              return (day: Date) => {
                const chips = bucket.get(key(day)) || [];
                if (hideEvents) return chips;
                // Recurring events (rare — only iterate events list, not tasks)
                const rec: typeof chips = [];
                for (const ev of events) {
                  if (ev.repeat === 'never') continue;
                  if (isSameDay(new Date(ev.startDate), day)) continue; // already bucketed
                  if (isRecurringEventOnDate(ev, day)) {
                    rec.push({ id: `event:${ev.id}:${day.getTime()}`, label: ev.title || 'Event', color: '#10b981' });
                  }
                }
                return rec.length ? [...chips, ...rec] : chips;
              };
            }, [itemsWithCountdowns, events, sections, hiddenSections, hideEvents, hideCountdowns, getPriorityColor])}
            onChipClick={(chip) => {
              if (chip.id.startsWith('event:')) {
                const eventId = chip.id.split(':')[1];
                const ev = events.find((e) => e.id === eventId);
                if (ev) {
                  setEditingEvent(ev);
                  setIsEventEditorOpen(true);
                }
                return;
              }
              if (chip.id.startsWith('countdown:')) {
                const cid = chip.id.split(':')[1];
                navigate(`/todo/countdown/${cid}`);
                return;
              }
              const task = itemsWithCountdowns.find((t) => t.id === chip.id);
              if (task) setSelectedTask(task);
            }}
            headerExtras={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t('calendar.filterChips', 'Filter sections')}
                    className="h-7 px-2 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 backdrop-blur hover:bg-accent/40 text-xs font-medium"
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    {(hiddenSections.size > 0 || hideEvents || hideCountdowns) && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover border shadow-lg z-50">
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('calendar.showOnCalendar', 'Show on calendar')}
                  </div>
                  <DropdownMenuSeparator />
                  {sortedSections.map((s) => {
                    const isOn = !hiddenSections.has(s.id);
                    return (
                      <DropdownMenuItem
                        key={s.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          setHiddenSections((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          });
                        }}
                        className="cursor-pointer flex items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="truncate">{s.name}</span>
                        </span>
                        {isOn && <Check className="h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setHideEvents((v) => !v); }}
                    className="cursor-pointer flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#10b981' }} />
                      {t('calendar.events', 'Events')}
                    </span>
                    {!hideEvents && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setHideCountdowns((v) => !v); }}
                    className="cursor-pointer flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
                      {t('calendar.countdowns', 'Countdowns')}
                    </span>
                    {!hideCountdowns && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />



        ) : calendarLayout === 'year' ? (
          <div className="px-4 py-3">
            <YearCalendarView
              selectedDate={date || new Date()}
              onDateSelect={(d) => setDate(d)}
              tasks={items}
            />
          </div>
        ) : (
          <div className="px-4 py-3">
            <TaskTimeGridView
              mode={calendarLayout}
              selectedDate={date || new Date()}
              onDateSelect={(d) => setDate(d)}
              tasks={itemsWithCountdowns}
              onTaskClick={(task) => {
                if (task.id?.startsWith('countdown:')) {
                  const cid = task.id.split(':')[1];
                  navigate(`/todo/countdown/${cid}`);
                  return;
                }
                setSelectedTask(task);
              }}
              onReschedule={(taskId, newDate) => {
                if (taskId.startsWith('countdown:')) {
                  toast.info(t('calendar.countdownNotReschedulable', 'Edit countdown from its detail page'));
                  return;
                }
                handleUpdateTask(taskId, { dueDate: newDate });
                toast.success(t('calendar.taskRescheduled', 'Task rescheduled'));
              }}
              onQuickAdd={(d) => {
                setDate(d);
                setQuickAddDate(d);
                setIsInputOpen(true);
              }}
            />

          </div>
        )}


        {/* Events and Tasks for selected date */}
        {date && hasItemsForDate && (
          <div className="px-4 space-y-4">
            {/* Events for selected date */}
            {eventsForSelectedDate.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-normal flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {t('calendar.events')}
                </h3>
                <div className="space-y-2">
                  {eventsForSelectedDate.map((event) => (
                    <Card key={event.id} className="overflow-hidden">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{event.title}</h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {event.allDay ? t('calendar.allDay') : `${format(new Date(event.startDate), 'h:mm a')} - ${format(new Date(event.endDate), 'h:mm a')}`}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>
                              )}
                              {event.repeat !== 'never' && (
                                <span className="flex items-center gap-1"><Repeat className="h-3 w-3" />{event.repeat}</span>
                              )}
                            </div>
                            {event.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditEvent(event)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteEvent(event)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Tasks heading with view mode selector */}
            {tasksForSelectedDate.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-normal flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-primary" />
                    {format(date, 'MMMM dd, yyyy')}
                    <Badge variant="secondary" className="ml-2">{tasksForSelectedDate.length}</Badge>
                  </h3>
                  {/* View mode selector */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 h-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-popover border shadow-lg z-50">
                      <DropdownMenuItem onClick={() => handleViewModeChange('flat')} className={cn("cursor-pointer", viewMode === 'flat' && "bg-accent")}>
                        <LayoutList className="h-4 w-4 mr-2" />{t('menu.flatLayout', 'Flat Layout')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleViewModeChange('kanban')} className={cn("cursor-pointer", viewMode === 'kanban' && "bg-accent")}>
                        <Columns3 className="h-4 w-4 mr-2" />{t('menu.kanbanBoard', 'Kanban Board')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { if (!requireFeature('view_mode_status_board')) return; handleViewModeChange('kanban-status'); }} className={cn("cursor-pointer", viewMode === 'kanban-status' && "bg-accent")}>
                        <ListChecks className="h-4 w-4 mr-2" />{t('menu.statusBoard', 'Status Board')}
                        
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { if (!requireFeature('view_mode_timeline')) return; handleViewModeChange('timeline'); }} className={cn("cursor-pointer", viewMode === 'timeline' && "bg-accent")}>
                        <GitBranch className="h-4 w-4 mr-2" />{t('menu.timelineBoard', 'Timeline')}
                        
                      </DropdownMenuItem>
                      {/* Progress Board removed from views */}
                      <DropdownMenuItem onClick={() => { if (!requireFeature('view_mode_priority')) return; handleViewModeChange('priority'); }} className={cn("cursor-pointer", viewMode === 'priority' && "bg-accent")}>
                        <Flag className="h-4 w-4 mr-2" />{t('menu.priorityBoard', 'Priority Board')}
                        
                      </DropdownMenuItem>
                      {/* History Log removed from views */}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowCompleted(!showCompleted)} className="cursor-pointer">
                        {showCompleted ? t('todayPage.hideCompleted') : t('todayPage.showCompleted')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setIsSelectionMode(true); setIsSelectActionsOpen(true); }} className="cursor-pointer">
                        {t('todayPage.selectTasks')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIsFilterSheetOpen(true)} className="cursor-pointer">
                        {t('todayPage.filters')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Render tasks with selected view mode */}
                {renderTasksView()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size="lg"
            className="fixed right-6 h-14 w-14 rounded-full shadow-lg z-30"
            style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="mb-2 w-48 z-50 bg-card">
          <DropdownMenuItem onClick={() => {
            if (!isPro && !canCreateWithinSoftLimit('tasks', items.length)) { softRequireCreate('tasks', items.length); return; }
            setIsInputOpen(true);
          }} className="gap-2">
            <ListTodo className="h-4 w-4" />
            {t('calendar.addTask')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setEditingEvent(null); setIsEventEditorOpen(true); }} className="gap-2">
            <CalendarDays className="h-4 w-4" />
            {t('calendar.addEvent')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskInputSheet isOpen={isInputOpen} onClose={() => { setIsInputOpen(false); setQuickAddDate(null); }} onAddTask={handleAddTask} folders={folders} selectedFolderId={null} onCreateFolder={handleCreateFolder} defaultDate={quickAddDate || date} />

      <EventEditor
        event={editingEvent}
        isOpen={isEventEditorOpen}
        onClose={() => { setIsEventEditorOpen(false); setEditingEvent(null); }}
        onSave={handleSaveEvent}
        defaultDate={date}
      />

      <TaskFilterSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        folders={folders}
        selectedFolderId={null}
        onFolderChange={() => {}}
        dateFilter={'all'}
        onDateFilterChange={() => {}}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        statusFilter={'all'}
        onStatusFilterChange={() => {}}
        selectedTags={tagFilter}
        onTagsChange={setTagFilter}
        onClearAll={() => { setPriorityFilter('all'); setTagFilter([]); setSmartList('all'); }}
      />

      <SelectActionsSheet
        isOpen={isSelectActionsOpen}
        onClose={() => setIsSelectActionsOpen(false)}
        onAction={handleSelectAction}
        selectedCount={selectedTaskIds.size}
        totalCount={tasksForSelectedDate.filter(t => !t.completed).length}
      />

      <MoveToFolderSheet
        isOpen={isMoveToFolderOpen}
        onClose={() => setIsMoveToFolderOpen(false)}
        folders={folders}
        onSelect={handleMoveToFolder}
      />

      <PrioritySelectSheet
        isOpen={isPrioritySheetOpen}
        onClose={() => setIsPrioritySheetOpen(false)}
        onSelect={handleSetPriority}
      />

       

      {/* Delete Event Confirmation */}
      <AlertDialog open={!!eventToDelete} onOpenChange={(open) => !open && setEventToDelete(null)}>
        <AlertDialogContent className="bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('todayPage.deleteEvent')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('todayPage.deleteEventConfirm', { title: eventToDelete?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('todayPage.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteEvent} className="bg-destructive text-destructive-foreground">{t('todayPage.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Detail - Full Page like Home */}
      <TaskDetailPage
        isOpen={!!selectedTask}
        task={selectedTask}
        folders={folders}
        allTasks={items}
        onClose={() => setSelectedTask(null)}
        onUpdate={(updatedTask) => { handleUpdateTask(updatedTask.id, updatedTask); setSelectedTask(updatedTask); }}
        onDelete={handleDeleteTask}
        onDuplicate={async (task) => {
          const duplicatedTask: TodoItem = { ...task, id: genId(), completed: false };
          const updatedItems = [...items, duplicatedTask];
          setItems(updatedItems);
          await saveTodoItems(updatedItems);
          window.dispatchEvent(new Event('tasksUpdated'));
        }}
        onConvertToNote={() => {}}
        onMoveToFolder={(taskId, folderId) => handleUpdateTask(taskId, { folderId: folderId || undefined })}
      />

      {/* Subtask Detail Sheet */}
      <SubtaskDetailSheet
        isOpen={!!selectedSubtask}
        subtask={selectedSubtask?.subtask || null}
        parentId={selectedSubtask?.parentId || null}
        onClose={() => setSelectedSubtask(null)}
        onUpdate={handleUpdateSubtaskFromSheet}
        onDelete={handleDeleteSubtaskFromSheet}
        onConvertToTask={(parentId, subtask) => {
          const parent = items.find(t => t.id === parentId);
          if (!parent) return;
          const updatedSubtasks = parent.subtasks?.filter(st => st.id !== subtask.id);
          handleUpdateTask(parentId, { subtasks: updatedSubtasks });
          const newTask = { ...subtask, subtasks: [], sectionId: parent.sectionId };
          handleUpdateTask(newTask.id, newTask);
          setSelectedSubtask(null);
        }}
      />

      <CalendarBackgroundSheet
        isOpen={isBackgroundSheetOpen}
        onClose={() => setIsBackgroundSheetOpen(false)}
        currentBackground={calendarBackground}
        onBackgroundChange={setCalendarBackground}
      />
      
      <TodoBottomNavigation />
    </div>
  );
};

export default TodoCalendar;
