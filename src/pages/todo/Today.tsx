import { useState, useRef, useCallback, useMemo, useEffect, startTransition, useDeferredValue, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { TodoItem, Priority, TaskSection, TaskStatus } from '@/types/note';
import { Play, Pause, Repeat, Check, Trash2 as TrashIcon, Edit, Plus as PlusIcon, ArrowUpCircle, ArrowDownCircle, Move, History, TrendingUp, Flag, Pin } from 'lucide-react';
import { Plus, FolderIcon, ChevronRight, ChevronDown, MoreVertical, Copy, LayoutList, Trash2, Tag, Columns3, GitBranch, ListChecks, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sparkles, CheckCircle2, Calendar as CalendarIcon2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TodoLayout } from './TodoLayout';

import { useFirstVisitTour } from '@/features/tours/useFeatureTour';
import { TourManager } from '@/features/tours/TourManager';

import { toast } from 'sonner';
import { subDays } from 'date-fns';
import { ResolvedTaskImage } from '@/components/ResolvedTaskImage';
import { WaveformProgressBar } from '@/components/WaveformProgressBar';
import { playCompletionSound } from '@/utils/taskSounds';
import { TASK_CIRCLE, TASK_CHECK_ICON } from '@/utils/taskItemStyles';
import { getRingFillMs } from '@/utils/ringFillDuration';
import { loadCustomSmartViews } from '@/utils/customSmartViews';
import { loadTodoItems } from '@/utils/todoItemsStorage';
import { useSubscription } from '@/contexts/SubscriptionContext';

// Extracted hooks and components
import { useTodayState } from '@/hooks/useTodayState';
import { useTodayActions } from '@/hooks/useTodayActions';
import { useVoicePlayback } from '@/hooks/useVoicePlayback';
import { useTaskSwipe } from '@/hooks/useTaskSwipe';
import { TodoOptionsDropdown } from '@/components/todo/TodoOptionsDropdown';
import { TaskSectionHeader } from '@/components/todo/TaskSectionHeader';
import { TaskSubtasksInline } from '@/components/todo/TaskSubtasksInline';
import { filterAndSortTasks } from '@/utils/tasks/filterAndSortTasks';

// Retry wrapper for lazy imports (handles stale chunk errors after deploys)
const loadWithRetry = <T,>(
  factory: () => Promise<T>,
  retries = 2
): Promise<T> =>
  factory().catch((err) => {
    const isChunkErr = String(err?.message || '').includes('dynamically imported module');
    if (retries > 0 && isChunkErr) {
      return new Promise<T>((resolve, reject) => {
        setTimeout(() => {
          loadWithRetry(factory, retries - 1).then(resolve, reject);
        }, 500);
      });
    }
    if (isChunkErr) {
      // Final failure: force reload once to fetch fresh assets after a deploy
      const key = 'chunk_reload_ts';
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
    throw err;
  });

const lazyRetry = <T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> => lazy(() => loadWithRetry(factory));

// Lazy load alternate views and heavy sheets
const TodaySheets = lazyRetry(() => import('@/components/todo/TodaySheets').then(m => ({ default: m.TodaySheets })));

// Preload factories for view components — called eagerly so chunks are cached before user switches
const kanbanFactory = () => import('@/components/todo/KanbanView').then(m => ({ default: m.KanbanView }));
const kanbanStatusFactory = () => import('@/components/todo/KanbanStatusView').then(m => ({ default: m.KanbanStatusView }));
const timelineFactory = () => import('@/components/todo/TimelineView').then(m => ({ default: m.TimelineView }));
const progressFactory = () => import('@/components/todo/ProgressView').then(m => ({ default: m.ProgressView }));
const priorityFactory = () => import('@/components/todo/PriorityView').then(m => ({ default: m.PriorityView }));
const historyFactory = () => import('@/components/todo/HistoryView').then(m => ({ default: m.HistoryView }));
const groupedFactory = () => import('@/components/todo/GroupedView').then(m => ({ default: m.GroupedView }));
const flatFactory = () => import('@/components/todo/FlatView').then(m => ({ default: m.FlatView }));

const KanbanView = lazyRetry(kanbanFactory);
const KanbanStatusView = lazyRetry(kanbanStatusFactory);
const TimelineView = lazyRetry(timelineFactory);
const ProgressView = lazyRetry(progressFactory);
const PriorityView = lazyRetry(priorityFactory);
const HistoryView = lazyRetry(historyFactory);
const GroupedView = lazyRetry(groupedFactory);
const FlatView = lazy(flatFactory);



// ── Singleton ring controller ────────────────────────────────────────────────
// Only one completion ring may be in the "filling" state at a time. When the
// user taps a second task before the first ring finishes its 700ms animation,
// the previous ring instantly snaps to its committed state (completed) and the
// new ring takes over the fill animation. This prevents stacked ring fills
// and matches the visual the user requested.
type RingCancel = () => void;
let activeRingCancel: RingCancel | null = null;
const claimRing = (cancel: RingCancel) => {
  if (activeRingCancel && activeRingCancel !== cancel) {
    try { activeRingCancel(); } catch {}
  }
  activeRingCancel = cancel;
};
const releaseRing = (cancel: RingCancel) => {
  if (activeRingCancel === cancel) activeRingCancel = null;
};

const FlatCompletionToggle = ({
  item,
  compactMode,
  isPendingFromState,
  priorityColor,
  updateItem,
}: {
  item: TodoItem;
  compactMode: boolean;
  isPendingFromState: boolean;
  priorityColor: string;
  updateItem: (id: string, updates: Partial<TodoItem>) => void;
}) => {
  const [localPending, setLocalPending] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearPending = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLocalPending(false);
  }, []);

  // Stable cancel handle for the singleton — same identity for the component's
  // lifetime so claim/release compare correctly.
  const cancelRef = useRef<RingCancel>(() => {});
  cancelRef.current = clearPending;

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    releaseRing(cancelRef.current);
  }, []);

  const isPending = localPending || isPendingFromState;

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (item.completed || isPending) {
      releaseRing(cancelRef.current);
      clearPending();
      updateItem(item.id, { completed: false });
      return;
    }

    const fillMs = getRingFillMs();
    if (fillMs > 0) {
      claimRing(cancelRef.current);
      setLocalPending(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setLocalPending(false);
        releaseRing(cancelRef.current);
      }, fillMs);
    }
    window.setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), 0);
    updateItem(item.id, { completed: true });
  }, [clearPending, isPending, item.completed, item.id, updateItem]);

  return (
    <button
      disabled={false}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onClick={handleClick}
      className={cn(
        TASK_CIRCLE.base, TASK_CIRCLE.marginTop,
        compactMode ? TASK_CIRCLE.sizeCompact : TASK_CIRCLE.size,
        item.completed && TASK_CIRCLE.completed,
        isPending && TASK_CIRCLE.pending,
      )}
      style={{
        borderColor: (item.completed || isPending) ? undefined : priorityColor,
        backgroundColor: isPending ? priorityColor : undefined,
      }}
    >
      {(item.completed || isPending) && (
        <Check
          className={cn(TASK_CHECK_ICON.base, compactMode ? TASK_CHECK_ICON.sizeCompact : TASK_CHECK_ICON.size, isPending && TASK_CHECK_ICON.pendingAnimation)}
          style={{ color: isPending ? TASK_CHECK_ICON.pendingColor : TASK_CHECK_ICON.completedColor }}
          strokeWidth={TASK_CHECK_ICON.strokeWidth}
        />
      )}
    </button>
  );
};

const Today = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { softRequireCreate, canCreateWithinSoftLimit } = useSubscription();

  // ── All state from extracted hook ──
  const state = useTodayState();
  const [inputDefaultDate, setInputDefaultDate] = useState<Date | undefined>(undefined);
  const {
    tasksSettings, getPriorityColor, getPriorityName, requireFeature, isPro, allGlobalTags,
    items, setItems, folders, setFolders, sections, setSections,
    selectedFolderId, setSelectedFolderId, isInputOpen, setIsInputOpen,
    inputSectionId, setInputSectionId, selectedTask, setSelectedTask,
    selectedImage, setSelectedImage, isSelectionMode, setIsSelectionMode,
    selectedTaskIds, setSelectedTaskIds, isCompletedOpen, setIsCompletedOpen,
    showCompleted, setShowCompleted,
    dateFilter, setDateFilter, priorityFilter, setPriorityFilter,
    statusFilter, setStatusFilter, tagFilter, setTagFilter,
    smartList, setSmartList,
    viewMode, setViewMode, sortBy, setSortBy,
    hideDetailsOptions, setHideDetailsOptions,
    compactMode, setCompactMode, groupByOption, setGroupByOption,
    viewModeSearch, setViewModeSearch, dropdownView, setDropdownView,
    isFilterSheetOpen, setIsFilterSheetOpen,
    isDuplicateSheetOpen, setIsDuplicateSheetOpen,
    isFolderManageOpen, setIsFolderManageOpen,
    isMoveToFolderOpen, setIsMoveToFolderOpen,
    isSelectActionsOpen, setIsSelectActionsOpen,
    isPrioritySheetOpen, setIsPrioritySheetOpen,
    isBatchTaskOpen, setIsBatchTaskOpen,
    isSectionEditOpen, setIsSectionEditOpen,
    isSectionMoveOpen, setIsSectionMoveOpen,
    editingSection, setEditingSection,
    selectedSubtask, setSelectedSubtask,
    isBulkDateSheetOpen, setIsBulkDateSheetOpen,
    isBulkReminderSheetOpen, setIsBulkReminderSheetOpen,
    isBulkRepeatSheetOpen, setIsBulkRepeatSheetOpen,
    isBulkSectionMoveOpen, setIsBulkSectionMoveOpen,
    isBulkStatusOpen, setIsBulkStatusOpen,
    isTaskOptionsOpen, setIsTaskOptionsOpen,
    isAutoScheduleOpen, setIsAutoScheduleOpen,
    defaultSectionId, setDefaultSectionId,
    taskAddPosition, setTaskAddPosition,
    showStatusBadge, setShowStatusBadge,
    groupBy, setGroupBy, optionsSortBy, setOptionsSortBy,
    orderVersion, setOrderVersion,
    deleteConfirmItem, setDeleteConfirmItem,
    customSmartViews, setCustomSmartViews,
    activeCustomViewId, setActiveCustomViewId,
    isSaveSmartViewOpen, setIsSaveSmartViewOpen,
    swipeMoveTaskId, setSwipeMoveTaskId,
    swipeDateTaskId, setSwipeDateTaskId,
    pendingCompleteId, setPendingCompleteId,
    pendingCompleteTimer,
    collapsedViewSections, setCollapsedViewSections,
    expandedTasks, toggleSubtasks,
    showStreakChallenge, closeStreakChallenge,
    streakData, streakWeekData,
    smartListData,
    processedItems, searchFilteredItems, uncompletedItems, completedItems,
    sortedSections, toggleViewSectionCollapse, handleClearFilters,
  } = state;

  useEffect(() => {
    const openFirstTaskForTour = () => {
      const firstTask = uncompletedItems[0] ?? completedItems[0] ?? items[0];
      if (firstTask) setSelectedTask(firstTask);
    };
    window.addEventListener('flowist-tour-open-first-task', openFirstTaskForTour);
    return () => window.removeEventListener('flowist-tour-open-first-task', openFirstTaskForTour);
  }, [completedItems, items, setSelectedTask, uncompletedItems]);

  // Widget deep-link: ?add=1 → auto-open the task input sheet.
  // ?widget=1 marks this as a launcher-widget flow, so closing the sheet
  // (either after saving or by dismissing) minimizes the app back to the
  // launcher instead of leaving the user parked inside Flowist.
  const widgetModeRef = useRef(false);
  const [widgetMode, setWidgetMode] = useState(false);
  useEffect(() => {
    const checkAddParam = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('add') !== '1') return;
      if (params.get('widget') === '1') {
        widgetModeRef.current = true;
        setWidgetMode(true);
      }
      setIsInputOpen(true);
      params.delete('add');
      params.delete('widget');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    };
    checkAddParam();
    const t1 = window.setTimeout(checkAddParam, 250);
    const t2 = window.setTimeout(checkAddParam, 800);
    window.addEventListener('popstate', checkAddParam);
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2);
      window.removeEventListener('popstate', checkAddParam);
    };
  }, [location.search, setIsInputOpen]);

  // Task-views + toolbar-power discovery: once the user has 5+ tasks, they're
  // ready to learn about layout switching (Kanban/Timeline) and bulk power tools.
  // TourManager itself dedupes seen/dismissed state, so this is safe to re-run.
  useEffect(() => {
    if (items.length >= 1) {
      // First task ever → run the natural-language input coach-mark once.
      import('@/features/tours/useFeatureTour').then((m) =>
        m.notifyOnboardingMilestone('first-task'),
      );
    }
    if (items.length >= 5) {
      TourManager.startTour('task-views', { auto: true });
    }
    if (items.length >= 15) {
      TourManager.queueTour('task-toolbar-power');
    }
  }, [items.length]);


  // Open a task when arriving via /todo/today?openTask=<id> OR via in-app mention event.
  useEffect(() => {
    const openTask = (found: TodoItem) => {
      setIsInputOpen(false);
      setSelectedFolderId(found.folderId ?? null);
      setDateFilter('all');
      setPriorityFilter('all');
      setStatusFilter('all');
      setTagFilter([]);
      setSmartList('all');
      setActiveCustomViewId(null);
      setIsSelectionMode(false);
      setSelectedTaskIds(new Set());
      if (found.completed) {
        setShowCompleted(true);
        setIsCompletedOpen(true);
      }
      setSelectedTask(found);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    };

    const openById = (openId: string) => {
      if (!openId) return false;
      const found = items.find(i => i.id === openId);
      if (found) {
        openTask(found);
        return true;
      }
      void loadTodoItems().then((fresh) => {
        const freshFound = fresh.find(i => i.id === openId);
        if (!freshFound) return;
        setItems(fresh);
        openTask(freshFound);
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get('openTask') === openId) {
            params.delete('openTask');
            const qs = params.toString();
            window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
          }
          const pending = JSON.parse(sessionStorage.getItem('lovable:pendingMention') || 'null') as { type?: string; id?: string } | null;
          if (pending?.type === 'task' && pending.id === openId) sessionStorage.removeItem('lovable:pendingMention');
        } catch {}
      });
      return false;
    };
    try {
      const pending = JSON.parse(sessionStorage.getItem('lovable:pendingMention') || 'null') as { type?: string; id?: string; ts?: number } | null;
      if (pending?.type === 'task' && pending.id && Date.now() - (pending.ts || 0) < 10_000 && openById(pending.id)) {
        sessionStorage.removeItem('lovable:pendingMention');
      }
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('openTask');
    if (openId && openById(openId)) {
      params.delete('openTask');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string; id?: string } | undefined;
      if (detail?.type === 'task' && detail.id) openById(detail.id);
    };
    window.addEventListener('lovable:openMention', handler as EventListener);
    return () => window.removeEventListener('lovable:openMention', handler as EventListener);
  }, [location.search, items, setItems, setSelectedTask, setSelectedFolderId, setDateFilter, setPriorityFilter, setStatusFilter, setTagFilter, setSmartList, setActiveCustomViewId, setShowCompleted, setIsCompletedOpen, setIsInputOpen, setIsSelectionMode, setSelectedTaskIds]);

  useEffect(() => {
    const preloadViewChunks = () => {
      void kanbanFactory();
      void kanbanStatusFactory();
      void timelineFactory();
      void progressFactory();
      void priorityFactory();
      void historyFactory();
      void groupedFactory();
      void flatFactory();
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preloadViewChunks, { timeout: 2000 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(preloadViewChunks, 1500);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // ── All actions from extracted hook ──
  const actions = useTodayActions({
    items, setItems, folders, setFolders, sections, setSections,
    selectedFolderId, setSelectedFolderId, inputSectionId, setInputSectionId,
    selectedTaskIds, setSelectedTaskIds, setIsSelectionMode, setIsInputOpen,
    setEditingSection, setIsSectionEditOpen, setIsMoveToFolderOpen,
    setIsPrioritySheetOpen, setIsBulkDateSheetOpen, setIsBulkReminderSheetOpen,
    setIsBulkRepeatSheetOpen, setIsBulkSectionMoveOpen, setIsBulkStatusOpen,
    setIsSelectActionsOpen, setCollapsedViewSections,
    deleteConfirmItem, setDeleteConfirmItem,
    defaultSectionId, taskAddPosition, uncompletedItems,
    requireFeature, isPro, tasksSettings, setOrderVersion,
  });

  const {
    handleCreateFolder, handleEditFolder, handleDeleteFolder, handleReorderFolders, handleToggleFolderFavorite,
    handleAddSection, handleEditSection, handleSaveSection, handleDeleteSection,
    handleDuplicateSection, handleMoveSection, handleToggleSectionCollapse,
    handleAddTaskToSection, handleSectionDragEnd,
    handleAddTask, handleBatchAddTasks, updateItem, deleteItem, confirmDelete, duplicateTask,
    handleSelectTask, handleDuplicate, handleSelectAction, handleMoveToFolder,
    handleSetPriority, handleMoveTaskToFolder,
    convertToNotes, handleConvertSingleTask,
    handleUnifiedReorder, handleSectionReorder,
    handleUpdateSubtaskFromSheet, handleDeleteSubtaskFromSheet, handleConvertSubtaskToTask,
    updateSubtask, deleteSubtask,
  } = actions;


  // ── Voice playback (extracted hook) ──
  const voice = useVoicePlayback();
  const { playingVoiceId, voiceProgress, voiceCurrentTime, voiceDuration, voicePlaybackSpeed, resolvedVoiceUrls, flatAudioRef } = voice;
  const { formatDuration, handleFlatVoicePlay, cycleVoicePlaybackSpeed, handleVoiceSeek, seekToPercent } = voice;

  // Resolve voice URLs
  const voiceItemsKey = items.filter(i => i.voiceRecording?.audioUrl).map(i => i.id).join(',');
  useMemo(() => { voice.resolveVoiceUrls(items); }, [voiceItemsKey]);

  // ── Swipe handlers (extracted hook) ──
  const swipe = useTaskSwipe(tasksSettings.swipeToComplete, updateSubtask, deleteSubtask);
  const { swipeState, SWIPE_ACTION_WIDTH, handleFlatTouchStart, handleFlatTouchMove, handleFlatTouchEnd, handleSwipeAction } = swipe;
  const { subtaskSwipeState, handleSubtaskSwipeStart, handleSubtaskSwipeMove, handleSubtaskSwipeEnd } = swipe;
  const pendingVisualCompleteTimers = useRef<Map<string, number>>(new Map());
  const [pendingVisualCompleteIds, setPendingVisualCompleteIds] = useState<Set<string>>(new Set());

  const showCompletionFill = useCallback((taskId: string) => {
    const fillMs = getRingFillMs();
    if (fillMs <= 0) return;
    setPendingVisualCompleteIds((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
    const existingTimer = pendingVisualCompleteTimers.current.get(taskId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      pendingVisualCompleteTimers.current.delete(taskId);
      setPendingVisualCompleteIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, fillMs);
    pendingVisualCompleteTimers.current.set(taskId, timer);
  }, []);

  // ── Render helpers ──

  // Render task item in flat layout style for ALL view modes
  const renderTaskItem = (item: TodoItem) => {
    const hasSubtasks = item.subtasks && item.subtasks.length > 0;
    const currentSwipe = swipeState?.id === item.id ? swipeState : null;
    const isExpanded = expandedTasks.has(item.id);
    const completedSubtasks = item.subtasks?.filter(st => st.completed).length || 0;
    const totalSubtasks = item.subtasks?.length || 0;
    const isVisuallyPending = pendingVisualCompleteIds.has(item.id) || pendingCompleteId === item.id;
    
    return (
      <div key={item.id} className="relative">
        <div className="relative overflow-hidden">
          {/* Swipe action backgrounds */}
          <div className="absolute inset-0 flex">
            <div className="flex items-center justify-start" style={{ opacity: (currentSwipe?.x || 0) > 0 ? 1 : 0 }}>
              <button
                onClick={() => handleSwipeAction(() => {
                  if (!item.completed) {
                    showCompletionFill(item.id);
                    window.setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 0);
                    updateItem(item.id, { completed: true });
                  } else {
                    updateItem(item.id, { completed: false });
                  }
                })}
                className="flex flex-col items-center justify-center w-[60px] h-full bg-success text-success-foreground"
              >
                <Check className="h-5 w-5" />
                <span className="text-[10px] font-medium mt-1">{t('swipe.done', 'Done')}</span>
              </button>
              <button
                onClick={() => handleSwipeAction(() => { if (!requireFeature('pin_feature')) return; updateItem(item.id, { isPinned: !item.isPinned }); })}
                className="flex flex-col items-center justify-center w-[60px] h-full bg-warning text-warning-foreground"
              >
                <ArrowUpCircle className={cn("h-5 w-5", item.isPinned && "fill-current")} />
                <span className="text-[10px] font-medium mt-1">{t('swipe.pin', 'Pin')}</span>
              </button>
            </div>
            <div className="absolute right-0 inset-y-0 flex items-center justify-end" style={{ opacity: (currentSwipe?.x || 0) < 0 ? 1 : 0, width: SWIPE_ACTION_WIDTH * 3 }}>
              <button onClick={() => handleSwipeAction(() => setSwipeMoveTaskId(item.id))} className="flex flex-col items-center justify-center w-[60px] h-full bg-info text-info-foreground">
                <FolderIcon className="h-5 w-5" />
                <span className="text-[10px] font-medium mt-1">{t('swipe.move', 'Move')}</span>
              </button>
              <button onClick={() => handleSwipeAction(() => deleteItem(item.id, true))} className="flex flex-col items-center justify-center w-[60px] h-full bg-destructive text-destructive-foreground">
                <TrashIcon className="h-5 w-5" />
                <span className="text-[10px] font-medium mt-1">{t('swipe.delete', 'Delete')}</span>
              </button>
              <button onClick={() => handleSwipeAction(() => setSwipeDateTaskId(item.id))} className="flex flex-col items-center justify-center w-[60px] h-full bg-warning text-warning-foreground">
                <CalendarIcon2 className="h-5 w-5" />
                <span className="text-[10px] font-medium mt-1">{t('swipe.date', 'Date')}</span>
              </button>
            </div>
          </div>
          
          {/* Main flat item */}
          <div 
            className={cn(
              "flex items-start gap-3 border-b border-border/50 bg-background relative z-10",
              compactMode ? "py-1.5 px-1.5 gap-2" : "py-2.5 px-2"
            )}
            style={{ 
              transform: `translateX(${currentSwipe?.x || 0}px)`, 
              transition: currentSwipe?.isSwiping ? 'none' : 'transform 0.3s ease-out' 
            }}
            onTouchStart={(e) => handleFlatTouchStart(item.id, e)}
            onTouchMove={(e) => handleFlatTouchMove(item.id, e)}
            onTouchEnd={() => handleFlatTouchEnd(item)}
          >
            {isSelectionMode && (
              <Checkbox checked={selectedTaskIds.has(item.id)} onCheckedChange={() => handleSelectTask(item.id)} className={cn(compactMode ? "h-4 w-4" : "h-5 w-5", "mt-0.5")} />
            )}
            
            <FlatCompletionToggle
              item={item}
              compactMode={compactMode}
              isPendingFromState={isVisuallyPending}
              priorityColor={getPriorityColor(item.priority || 'none')}
              updateItem={updateItem}
            />
            <div data-tour="task-row" className="flex-1 min-w-0" onClick={() => !currentSwipe?.isSwiping && setSelectedTask(item)}>
              {item.voiceRecording ? (
                <div className="flex items-center gap-2">
                  <button onClick={(e) => handleFlatVoicePlay(item, e)} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors min-w-0 flex-1">
                    {playingVoiceId === item.id ? <Pause className="h-4 w-4 text-primary flex-shrink-0" /> : <Play className="h-4 w-4 text-primary flex-shrink-0" />}
                    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                      {resolvedVoiceUrls[item.id] ? (
                        <WaveformProgressBar
                          audioUrl={resolvedVoiceUrls[item.id]}
                          progress={playingVoiceId === item.id ? voiceProgress : 0}
                          duration={voiceDuration[item.id] || item.voiceRecording.duration}
                          isPlaying={playingVoiceId === item.id}
                          onSeek={(percent) => {
                            seekToPercent(percent, item);
                          }}
                          height={12}
                        />
                      ) : (
                        <div className="relative h-1.5 bg-primary/20 rounded-full overflow-hidden cursor-pointer" onClick={(e) => handleVoiceSeek(e, item)}>
                          <div className="absolute h-full bg-primary rounded-full transition-all duration-100" style={{ width: playingVoiceId === item.id ? `${voiceProgress}%` : '0%' }} />
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-primary font-medium">{playingVoiceId === item.id ? formatDuration(Math.round(voiceCurrentTime)) : '0:00'}</span>
                        <span className="text-primary/70">{formatDuration(voiceDuration[item.id] || item.voiceRecording.duration)}</span>
                      </div>
                    </div>
                  </button>
                  <button onClick={cycleVoicePlaybackSpeed} className="px-2 py-1 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 transition-colors min-w-[40px]">{voicePlaybackSpeed}x</button>
                  {item.repeatType && item.repeatType !== 'none' && <Repeat className="h-3 w-3 text-accent-purple flex-shrink-0" />}
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  {item.isPinned && <Pin className={cn(compactMode ? "h-3 w-3" : "h-3.5 w-3.5", "text-warning fill-warning flex-shrink-0")} />}
                  <span className={cn(compactMode ? "text-xs" : "text-sm", "min-w-0 truncate transition-all duration-300", (item.completed || isVisuallyPending) && "text-muted-foreground line-through")}>{item.text}</span>
                  {item.repeatType && item.repeatType !== 'none' && <Repeat className={cn(compactMode ? "h-2.5 w-2.5" : "h-3 w-3", "text-accent-purple flex-shrink-0")} />}
                </div>
              )}
              {!compactMode && !hideDetailsOptions.hideDateTime && item.tagIds && item.tagIds.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {item.tagIds.slice(0, 4).map((tagId) => {
                    const tag = allGlobalTags.find(t => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span key={tagId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full text-white" style={{ backgroundColor: `hsl(${tag.color})` }}>
                        {tag.icon && <span>{tag.icon}</span>}
                        <Tag className="h-2.5 w-2.5" />
                        {tag.name}
                      </span>
                    );
                  })}
                  {item.tagIds.length > 4 && <span className="text-[10px] text-muted-foreground">+{item.tagIds.length - 4}</span>}
                </div>
              )}
              {!hideDetailsOptions.hideDateTime && item.dueDate && (
                <p className={cn("text-muted-foreground", compactMode ? "text-[10px] mt-0.5" : "text-xs mt-1")}>{new Date(item.dueDate).toLocaleDateString()}</p>
              )}
              {!hideDetailsOptions.hideSubtasks && hasSubtasks && !isExpanded && (
                <p className={cn("text-muted-foreground", compactMode ? "text-[10px] mt-0.5" : "text-xs mt-1")}>{completedSubtasks}/{totalSubtasks} subtasks</p>
              )}
              {!compactMode && !hideDetailsOptions.hideStatus && showStatusBadge && !item.completed && item.status && (
                <Badge variant="outline" className={cn(
                  "text-[10px] px-1.5 py-0 mt-1",
                  item.status === 'not_started' && "border-muted-foreground text-muted-foreground bg-muted/30",
                  item.status === 'in_progress' && "border-info text-info bg-info/10",
                  item.status === 'almost_done' && "border-warning text-warning bg-warning/10"
                )}>
                  {item.status === 'not_started' ? t('grouping.notStarted') : item.status === 'in_progress' ? t('grouping.inProgress') : t('grouping.almostDone')}
                </Badge>
              )}
            </div>
            {item.imageUrl && (
              <div className={cn("rounded-full overflow-hidden border-2 border-border flex-shrink-0 cursor-pointer hover:border-primary transition-colors", compactMode ? "w-7 h-7" : "w-10 h-10")} onClick={(e) => { e.stopPropagation(); setSelectedImage(item.imageUrl!); }}>
                <ResolvedTaskImage srcRef={item.imageUrl} alt="Task attachment" className="w-full h-full object-cover" />
              </div>
            )}
            {hasSubtasks && (
              <button onClick={(e) => { e.stopPropagation(); toggleSubtasks(item.id); }} className={cn("rounded hover:bg-muted transition-colors flex-shrink-0", compactMode ? "p-0.5" : "p-1 mt-0.5")}>
                {isExpanded ? <ChevronDown className={cn(compactMode ? "h-3 w-3" : "h-4 w-4", "text-muted-foreground")} /> : <ChevronRight className={cn(compactMode ? "h-3 w-3" : "h-4 w-4", "text-muted-foreground")} />}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render subtasks inline — reuse the exact same task card UI as the main task,
  // so subtasks share sizing, priority stripe, layout, separators and vibe.
  // Applies the same priority/status/date/tag filters and sort rules as main tasks.
  const renderSubtasksInline = (item: TodoItem) => {
    const isExpanded = expandedTasks.has(item.id);
    if (!isExpanded || !item.subtasks || item.subtasks.length === 0) return null;
    // Keep completed subtasks visible under an uncompleted parent (with strikethrough).
    // They only leave when the parent itself is completed (parent moves to Completed
    // section and carries its subtasks along). So we ignore statusFilter here.
    const sorted = filterAndSortTasks(item.subtasks, {
      priorityFilter, statusFilter: 'all', dateFilter, tagFilter, sortBy,
    });
    if (sorted.length === 0) return null;
    // Nested DragDropContext so subtasks reorder independently of the parent
    // task list (@hello-pangea/dnd supports nested contexts). Dragging a
    // subtask row will NOT drag the parent because the parent Draggable in the
    // outer view lives in a different context.
    const handleSubtaskDragEnd = (result: DropResult) => {
      if (!result.destination || !item.subtasks) return;
      if (result.destination.index === result.source.index) return;
      // Reorder against the currently displayed (sorted) list so the drop
      // lands where the user visually released it, then map back to a full
      // subtask array preserving any items filtered out from view.
      const visibleIds = sorted.map(s => s.id);
      const reorderedVisibleIds = Array.from(visibleIds);
      const [movedId] = reorderedVisibleIds.splice(result.source.index, 1);
      reorderedVisibleIds.splice(result.destination.index, 0, movedId);
      const byId = new Map(item.subtasks.map(st => [st.id, st]));
      const hidden = item.subtasks.filter(st => !visibleIds.includes(st.id));
      const reorderedFull = [
        ...reorderedVisibleIds.map(id => byId.get(id)!).filter(Boolean),
        ...hidden,
      ];
      updateItem(item.id, { subtasks: reorderedFull });
      try { Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    };
    // Stop pointer / touch / mouse events from bubbling out of the subtask
    // area. The parent task's <Draggable dragHandleProps> are spread on the
    // whole row (row = task header + this inline subtask container), so
    // without this the parent's drag sensor also grabs the touch and the
    // ENTIRE container (parent + all subtasks) starts dragging when the user
    // long-presses a single subtask. The nested subtask Draggable's own
    // handlers fire first on the inner row, then this wrapper swallows the
    // event so it never reaches the parent handle.
    const stopDragBubble = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
      <div
        className="ml-3 sm:ml-4 md:ml-5 pl-3 sm:pl-4 border-l-2 border-border/50"
        onClick={stopDragBubble}
        onPointerDown={stopDragBubble}
        onTouchStart={stopDragBubble}
        onMouseDown={stopDragBubble}
      >
        <DragDropContext onDragEnd={handleSubtaskDragEnd}>
          <Droppable droppableId={`inline-subs-${item.id}`}>
            {(dropProvided) => (
              <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                {sorted.map((sub, idx) => (
                  <Draggable key={sub.id} draggableId={`sub-${sub.id}`} index={idx}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        className={cn(snapshot.isDragging && "bg-muted/60 shadow-md rounded-md")}
                      >
                        {renderTaskItem(sub)}
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    );
  };



  // Render section header — delegates to extracted component
  const renderSectionHeader = (section: TaskSection, isDragging: boolean = false, taskCountOverride?: number) => (
    <TaskSectionHeader
      section={section}
      sections={sections}
      isDragging={isDragging}
      uncompletedItems={uncompletedItems}
      taskCountOverride={taskCountOverride}
      viewMode={viewMode}
      collapsedViewSections={collapsedViewSections}
      onToggleSectionCollapse={handleToggleSectionCollapse}
      onEditSection={handleEditSection}
      onAddTaskToSection={handleAddTaskToSection}
      onAddSection={handleAddSection}
      onDuplicateSection={handleDuplicateSection}
      onMoveSection={(sec) => { setEditingSection(sec); setIsSectionMoveOpen(true); }}
      onDeleteSection={handleDeleteSection}
    />
  );

  const renderCompletedSectionForViewMode = () => {
    if (!showCompleted || completedItems.length === 0) return null;
    const isCollapsed = collapsedViewSections.has('view-completed');
    return (
      <div className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden mt-6">
        <button onClick={() => toggleViewSectionCollapse('view-completed')} className="w-full flex items-center gap-2 px-4 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: `4px solid #10b981` }}>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm font-semibold flex-1 text-left text-muted-foreground uppercase tracking-wide">Completed</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{completedItems.length}</span>
          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {!isCollapsed && (
          <div className="p-2 space-y-2">
            {completedItems.map((item) => (
              <div key={item.id} className="bg-card rounded-lg border border-border/50 opacity-70 cv-auto">{renderTaskItem(item)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleSubtaskClick = (subtask: TodoItem, parentId?: string) => {
    if (parentId) setSelectedSubtask({ subtask, parentId });
    else setSelectedTask(subtask);
  };

  return (
    <TodoLayout title="Flowist" searchValue={viewModeSearch} onSearchChange={(val) => startTransition(() => setViewModeSearch(val))}>
      <TodayTourTrigger />
      <main className="py-3 pb-32">
        <h1 className="sr-only">Flowist — Today's Tasks &amp; Daily Planner</h1>
        

        {/* Folders — full width to align with search bar */}
        <div className="mb-4" data-tour="todo-folders-section">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold flex items-center gap-2"><FolderIcon className="h-5 w-5" />{t('menu.folders')}</h2>
              </div>
              <div className="flex items-center gap-2">
                {isSelectionMode && (
                  <Button variant="default" size="sm" onClick={() => { setIsSelectionMode(false); setSelectedTaskIds(new Set()); }}>{t('menu.cancel')}</Button>
                )}
                <TodoOptionsDropdown
                  dropdownView={dropdownView}
                  setDropdownView={setDropdownView}
                  requireFeature={requireFeature}
                  isPro={isPro}
                  smartList={smartList}
                  setSmartList={setSmartList}
                  smartListData={smartListData}
                  customSmartViews={customSmartViews}
                  setCustomSmartViews={setCustomSmartViews}
                  activeCustomViewId={activeCustomViewId}
                  setActiveCustomViewId={setActiveCustomViewId}
                  setDateFilter={setDateFilter}
                  setPriorityFilter={setPriorityFilter}
                  setStatusFilter={setStatusFilter}
                  setTagFilter={setTagFilter}
                  setSelectedFolderId={setSelectedFolderId}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  showCompleted={showCompleted}
                  setShowCompleted={setShowCompleted}
                  hideDetailsOptions={hideDetailsOptions}
                  setHideDetailsOptions={setHideDetailsOptions}
                  compactMode={compactMode}
                  setCompactMode={setCompactMode}
                  setIsTaskOptionsOpen={setIsTaskOptionsOpen}
                  groupByOption={groupByOption}
                  setGroupByOption={setGroupByOption}
                  setIsFilterSheetOpen={setIsFilterSheetOpen}
                  setIsDuplicateSheetOpen={setIsDuplicateSheetOpen}
                  setIsBatchTaskOpen={setIsBatchTaskOpen}
                  handleAddSection={handleAddSection}
                  setIsFolderManageOpen={setIsFolderManageOpen}
                  setIsSelectionMode={setIsSelectionMode}
                  setIsSelectActionsOpen={setIsSelectActionsOpen}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                />
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">

              <DragDropContext onDragEnd={(result: DropResult) => {
                if (!result.destination) return;
                const sorted = [...folders].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
                const reordered = Array.from(sorted);
                const [moved] = reordered.splice(result.source.index, 1);
                reordered.splice(result.destination.index, 0, moved);
                handleReorderFolders(reordered);
              }}>
                <Droppable droppableId="folder-chips" direction="horizontal">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="flex gap-2">
                      {[...folders].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0)).map((folder, index) => {
                        const isSelected = selectedFolderId === folder.id;
                        return (
                          <Draggable key={folder.id} draggableId={`folder-chip-${folder.id}`} index={index}>
                            {(dragProvided, snapshot) => (
                              <button
                                ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}
                                onClick={() => setSelectedFolderId(folder.id)}
                                onContextMenu={(e) => { e.preventDefault(); handleToggleFolderFavorite(folder.id); }}
                                className={cn("flex items-center gap-2 px-4 py-2 rounded-full transition-all whitespace-nowrap flex-shrink-0", isSelected ? "text-primary-foreground" : "hover:opacity-80 text-foreground", !isSelected && "bg-muted", snapshot.isDragging && "shadow-lg opacity-90 ring-2 ring-primary/30")}
                                style={{ ...(isSelected ? { backgroundColor: folder.color } : undefined), ...dragProvided.draggableProps.style }}
                              >
                                {folder.isFavorite && <Star className="h-3.5 w-3.5 fill-current" />}
                                <FolderIcon className="h-4 w-4" />{folder.name}
                              </button>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </div>


        <div className="max-w-2xl mx-auto md:max-w-none md:mx-0">

          {isSelectionMode && selectedTaskIds.size > 0 && (
            <div className="fixed left-4 right-4 z-40 bg-card border rounded-lg shadow-lg p-4" style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }}>
              <p className="text-sm mb-3 font-medium">{t('bulk.tasksSelected', { count: selectedTaskIds.size })}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsSelectActionsOpen(true)}>{t('common.actions', 'Actions')}</Button>
                <Button variant="outline" size="sm" onClick={() => handleSelectAction('delete')}>
                  <Trash2 className="h-4 w-4 mr-2" />{t('common.delete')}
                </Button>
              </div>
            </div>
          )}

          {/* Collapse All / Expand All */}
          {['flat', 'timeline', 'progress', 'priority', 'history', 'kanban'].includes(viewMode) && (
            <div className="mb-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => {
                if (collapsedViewSections.size > 0) {
                  setCollapsedViewSections(new Set());
                } else {
                  const allSectionIds = new Set<string>();
                  if (viewMode === 'flat') {
                    if (groupByOption !== 'none') {
                      if (groupByOption === 'section') sortedSections.forEach(s => allSectionIds.add(`group-section-${s.id}`));
                      else if (groupByOption === 'priority') ['high', 'medium', 'low', 'none'].forEach(id => allSectionIds.add(`group-priority-${id}`));
                      else if (groupByOption === 'date') ['overdue', 'today', 'tomorrow', 'this-week', 'later', 'no-date'].forEach(id => allSectionIds.add(`group-date-${id}`));
                    } else {
                      sortedSections.forEach(s => allSectionIds.add(`flat-${s.id}`));
                    }
                  } else if (viewMode === 'kanban') {
                    sortedSections.forEach(s => allSectionIds.add(`kanban-${s.id}`));
                    allSectionIds.add('kanban-completed');
                  } else if (viewMode === 'timeline') {
                    ['timeline-overdue', 'timeline-today', 'timeline-tomorrow', 'timeline-thisweek', 'timeline-later', 'timeline-nodate'].forEach(id => allSectionIds.add(id));
                  } else if (viewMode === 'progress') {
                    ['progress-notstarted', 'progress-inprogress', 'progress-almostdone'].forEach(id => allSectionIds.add(id));
                  } else if (viewMode === 'priority') {
                    ['priority-high', 'priority-medium', 'priority-low', 'priority-none'].forEach(id => allSectionIds.add(id));
                  } else if (viewMode === 'history') {
                    ['history-completed-today', 'history-completed-yesterday', 'history-this-week', 'history-older'].forEach(id => allSectionIds.add(id));
                  }
                  allSectionIds.add('view-completed');
                  setCollapsedViewSections(allSectionIds);
                }
              }} className="gap-1 whitespace-nowrap">
                {collapsedViewSections.size > 0 ? <><ChevronDown className="h-4 w-4" />{t('sections.expandAll')}</> : <><ChevronRight className="h-4 w-4" />{t('sections.collapseAll')}</>}
              </Button>
            </div>
          )}

          {/* Tasks by View Mode */}
          {processedItems.length === 0 ? (
            <div className="text-center py-20"><p className="text-muted-foreground">{t('emptyStates.noTasks')}</p></div>
          ) : (
            <Suspense fallback={null}>
              {viewMode === 'kanban' ? (
                <KanbanView
                  sortedSections={sortedSections}
                  sections={sections}
                  uncompletedItems={uncompletedItems}
                  completedItems={completedItems}
                  showCompleted={showCompleted}
                  collapsedViewSections={collapsedViewSections}
                  toggleViewSectionCollapse={toggleViewSectionCollapse}
                  renderTaskItem={renderTaskItem}
                  renderSubtasksInline={renderSubtasksInline}
                  setItems={setItems}
                  setOrderVersion={setOrderVersion}
                  handleEditSection={handleEditSection}
                  handleAddTaskToSection={handleAddTaskToSection}
                  handleDuplicateSection={handleDuplicateSection}
                  handleDeleteSection={handleDeleteSection}
                  handleAddSection={handleAddSection}
                />
              ) : viewMode === 'kanban-status' ? (
                <KanbanStatusView
                  items={items}
                  uncompletedItems={uncompletedItems}
                  completedItems={completedItems}
                  collapsedViewSections={collapsedViewSections}
                  toggleViewSectionCollapse={toggleViewSectionCollapse}
                  renderTaskItem={renderTaskItem}
                  renderSubtasksInline={renderSubtasksInline}
                  updateItem={updateItem}
                  setOrderVersion={setOrderVersion}
                />
              ) : viewMode === 'timeline' ? (
                <TimelineView
                  uncompletedItems={uncompletedItems}
                  completedItems={completedItems}
                  showCompleted={showCompleted}
                  collapsedViewSections={collapsedViewSections}
                  toggleViewSectionCollapse={toggleViewSectionCollapse}
                  renderTaskItem={renderTaskItem}
                  renderSubtasksInline={renderSubtasksInline}
                  renderCompletedSection={renderCompletedSectionForViewMode}
                  onDragEnd={(taskId, destGroup, destIndex, sourceGroup) => {
                    if (sourceGroup !== destGroup) {
                      const today = new Date();
                      let newDate: Date | undefined;
                      if (destGroup === 'timeline-overdue') newDate = subDays(today, 1);
                      else if (destGroup === 'timeline-today') newDate = today;
                      else if (destGroup === 'timeline-tomorrow') { newDate = new Date(); newDate.setDate(newDate.getDate() + 1); }
                      else if (destGroup === 'timeline-thisweek') { newDate = new Date(); newDate.setDate(newDate.getDate() + 3); }
                      else if (destGroup === 'timeline-later') { newDate = new Date(); newDate.setDate(newDate.getDate() + 14); }
                      else if (destGroup === 'timeline-nodate') newDate = undefined;
                      updateItem(taskId, { dueDate: newDate });
                      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
                      toast.success(t('todayPage.dateUpdated', 'Task date updated'));
                    }
                  }}
                  setOrderVersion={setOrderVersion}
                  onAddForDate={(date) => {
                    setInputDefaultDate(date);
                    setIsInputOpen(true);
                  }}
                />

              ) : viewMode === 'progress' ? (
                <ProgressView
                  uncompletedItems={uncompletedItems}
                  collapsedViewSections={collapsedViewSections}
                  toggleViewSectionCollapse={toggleViewSectionCollapse}
                  renderTaskItem={renderTaskItem}
                  renderSubtasksInline={renderSubtasksInline}
                  renderCompletedSection={renderCompletedSectionForViewMode}
                  setOrderVersion={setOrderVersion}
                />
              ) : viewMode === 'priority' ? (
                <PriorityView
                  uncompletedItems={uncompletedItems}
                  collapsedViewSections={collapsedViewSections}
                  toggleViewSectionCollapse={toggleViewSectionCollapse}
                  renderTaskItem={renderTaskItem}
                  renderSubtasksInline={renderSubtasksInline}
                  renderCompletedSection={renderCompletedSectionForViewMode}
                  updateItem={updateItem}
                  getPriorityColor={getPriorityColor}
                  items={items}
                  setOrderVersion={setOrderVersion}
                />
              ) : viewMode === 'history' ? (
                <HistoryView
                  completedItems={completedItems}
                  collapsedViewSections={collapsedViewSections}
                  toggleViewSectionCollapse={toggleViewSectionCollapse}
                  renderTaskItem={renderTaskItem}
                />
              ) : groupByOption !== 'none' ? (
                <GroupedView
                  groupByOption={groupByOption}
                  sortedSections={sortedSections}
                  sections={sections}
                  uncompletedItems={uncompletedItems}
                  completedItems={completedItems}
                  showCompleted={showCompleted}
                  isCompletedOpen={isCompletedOpen}
                  setIsCompletedOpen={setIsCompletedOpen}
                  compactMode={compactMode}
                  collapsedViewSections={collapsedViewSections}
                  toggleViewSectionCollapse={toggleViewSectionCollapse}
                  renderTaskItem={renderTaskItem}
                  renderSubtasksInline={renderSubtasksInline}
                  updateItem={updateItem}
                  getPriorityColor={getPriorityColor}
                  setOrderVersion={setOrderVersion}
                />
              ) : (
                <FlatView
                  sortedSections={sortedSections}
                  sections={sections}
                  uncompletedItems={uncompletedItems}
                  completedItems={completedItems}
                  showCompleted={showCompleted}
                  isCompletedOpen={isCompletedOpen}
                  setIsCompletedOpen={setIsCompletedOpen}
                  compactMode={compactMode}
                  collapsedViewSections={collapsedViewSections}
                  renderTaskItem={renderTaskItem}
                  renderSubtasksInline={renderSubtasksInline}
                  renderSectionHeader={renderSectionHeader}
                  renderVirtualSectionHeader={renderSectionHeader}
                  updateItem={updateItem}
                  handleSectionDragEnd={handleSectionDragEnd}
                  setOrderVersion={setOrderVersion}
                />
              )}
            </Suspense>
          )}
        </div>
      </main>

      <Button data-tour="todo-add-task" onClick={async () => {
        if (!isPro && !canCreateWithinSoftLimit('tasks', items.length)) { softRequireCreate('tasks', items.length); return; }
        try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
        setIsInputOpen(true);
      }} className="fixed left-4 right-4 z-30 h-12 text-base font-semibold lg:hidden" style={{ bottom: 'calc(4.25rem + var(--safe-bottom, 0px))' }} size="lg">
        <Plus className="h-5 w-5" />{t('tasks.addTask')}
      </Button>

      {/* All sheets/dialogs extracted to TodaySheets */}
      <Suspense fallback={null}><TodaySheets
        isInputOpen={isInputOpen}
        inputDefaultDate={inputDefaultDate}
        preventInputBackdropClose={widgetMode}
        onCloseInput={() => {
          setIsInputOpen(false); setInputSectionId(null); setInputDefaultDate(undefined);
          if (widgetModeRef.current) {
            widgetModeRef.current = false;
            setWidgetMode(false);
            // Return user to the launcher — the widget-quick-add flow
            // should feel like a launcher overlay, not a full app trip.
            // Only fires on EXPLICIT close (X / back / Save & close),
            // never after individual task adds (sheet stays sticky).
            import('@capacitor/app').then(({ App }) => {
              const anyApp: any = App;
              if (typeof anyApp.minimizeApp === 'function') anyApp.minimizeApp().catch(() => {});
              else App.exitApp().catch(() => {});
            }).catch(() => {});
          }
        }}
        onAddTask={handleAddTask}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onCreateFolder={handleCreateFolder}
        sections={sections}
        inputSectionId={inputSectionId}
        selectedTask={selectedTask}
        items={items}
        onCloseTask={() => setSelectedTask(null)}
        onUpdateTask={(updatedTask) => setSelectedTask(updatedTask)}
        updateItem={updateItem}
        onDeleteTask={deleteItem}
        onDuplicateTask={duplicateTask}
        onConvertToNote={handleConvertSingleTask}
        onMoveTaskToFolder={handleMoveTaskToFolder}
        isFilterSheetOpen={isFilterSheetOpen}
        onCloseFilter={() => setIsFilterSheetOpen(false)}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedTags={tagFilter}
        onTagsChange={setTagFilter}
        onFolderChange={setSelectedFolderId}
        onClearAll={handleClearFilters}
        isSaveSmartViewOpen={isSaveSmartViewOpen}
        onOpenSaveSmartView={() => setIsSaveSmartViewOpen(true)}
        onCloseSaveSmartView={() => setIsSaveSmartViewOpen(false)}
        onSmartViewSaved={() => loadCustomSmartViews().then(setCustomSmartViews)}
        isDuplicateSheetOpen={isDuplicateSheetOpen}
        onCloseDuplicate={() => setIsDuplicateSheetOpen(false)}
        onDuplicate={handleDuplicate}
        isFolderManageOpen={isFolderManageOpen}
        onCloseFolderManage={() => setIsFolderManageOpen(false)}
        onEditFolder={handleEditFolder}
        onDeleteFolder={handleDeleteFolder}
        onReorderFolders={handleReorderFolders}
        onToggleFolderFavorite={handleToggleFolderFavorite}
        isAutoScheduleOpen={isAutoScheduleOpen}
        onCloseAutoSchedule={() => setIsAutoScheduleOpen(false)}
        onApplySchedule={(updated) => { setItems(updated); toast.success(t('todayPage.scheduleApplied', 'Schedule applied!'), { icon: '📅' }); }}
        isMoveToFolderOpen={isMoveToFolderOpen}
        onCloseMoveToFolder={() => setIsMoveToFolderOpen(false)}
        onMoveToFolder={handleMoveToFolder}
        isSelectActionsOpen={isSelectActionsOpen}
        onCloseSelectActions={() => setIsSelectActionsOpen(false)}
        selectedCount={selectedTaskIds.size}
        onSelectAction={handleSelectAction}
        totalCount={uncompletedItems.length}
        isPrioritySheetOpen={isPrioritySheetOpen}
        onClosePriority={() => setIsPrioritySheetOpen(false)}
        onSetPriority={handleSetPriority}
        isBatchTaskOpen={isBatchTaskOpen}
        onCloseBatchTask={() => setIsBatchTaskOpen(false)}
        onBatchAddTasks={handleBatchAddTasks}
        isSectionEditOpen={isSectionEditOpen}
        onCloseSectionEdit={() => { setIsSectionEditOpen(false); setEditingSection(null); }}
        editingSection={editingSection}
        onSaveSection={handleSaveSection}
        isSectionMoveOpen={isSectionMoveOpen}
        onCloseSectionMove={() => { setIsSectionMoveOpen(false); setEditingSection(null); }}
        onMoveToPosition={(targetIndex) => editingSection && handleMoveSection(editingSection.id, targetIndex)}
        selectedSubtask={selectedSubtask}
        onCloseSubtask={() => setSelectedSubtask(null)}
        onUpdateSubtask={handleUpdateSubtaskFromSheet}
        onDeleteSubtask={handleDeleteSubtaskFromSheet}
        onConvertSubtaskToTask={handleConvertSubtaskToTask}
        isTaskOptionsOpen={isTaskOptionsOpen}
        onCloseTaskOptions={() => setIsTaskOptionsOpen(false)}
        groupBy={groupBy}
        sortBy={optionsSortBy}
        onGroupByChange={setGroupBy}
        onSortByChange={setOptionsSortBy}
        defaultSectionId={defaultSectionId}
        onDefaultSectionChange={setDefaultSectionId}
        taskAddPosition={taskAddPosition}
        onTaskAddPositionChange={setTaskAddPosition}
        hideDetailsOptions={hideDetailsOptions}
        onHideDetailsOptionsChange={setHideDetailsOptions}
        selectedImage={selectedImage}
        onCloseImage={() => setSelectedImage(null)}
        isBulkDateSheetOpen={isBulkDateSheetOpen}
        onCloseBulkDate={() => setIsBulkDateSheetOpen(false)}
        onBulkSetDate={(date) => { setItems(items.map(i => selectedTaskIds.has(i.id) ? { ...i, dueDate: date } : i)); setSelectedTaskIds(new Set()); setIsSelectionMode(false); toast.success(t('todayPage.bulkDateSet', { count: selectedTaskIds.size })); }}
        isBulkReminderSheetOpen={isBulkReminderSheetOpen}
        onCloseBulkReminder={() => setIsBulkReminderSheetOpen(false)}
        onBulkSetReminder={(date) => { setItems(items.map(i => selectedTaskIds.has(i.id) ? { ...i, reminderTime: date } : i)); setSelectedTaskIds(new Set()); setIsSelectionMode(false); toast.success(t('todayPage.bulkReminderSet', { count: selectedTaskIds.size })); }}
        isBulkRepeatSheetOpen={isBulkRepeatSheetOpen}
        onCloseBulkRepeat={() => setIsBulkRepeatSheetOpen(false)}
        onBulkSetRepeat={(repeatType) => { setItems(items.map(i => selectedTaskIds.has(i.id) ? { ...i, repeatType: repeatType as TodoItem['repeatType'] } : i)); setSelectedTaskIds(new Set()); setIsSelectionMode(false); toast.success(t('todayPage.bulkRepeatSet', { count: selectedTaskIds.size })); }}
        isBulkSectionMoveOpen={isBulkSectionMoveOpen}
        onCloseBulkSectionMove={() => setIsBulkSectionMoveOpen(false)}
        onBulkMoveToSection={(sectionId) => { setItems(items.map(i => selectedTaskIds.has(i.id) ? { ...i, sectionId } : i)); setSelectedTaskIds(new Set()); setIsSelectionMode(false); toast.success(t('todayPage.bulkSectionMoved', { count: selectedTaskIds.size })); }}
        isBulkStatusOpen={isBulkStatusOpen}
        onCloseBulkStatus={() => setIsBulkStatusOpen(false)}
        onBulkStatusChange={(status) => {
          const isCompleting = status === 'completed';
          const now = new Date();
          setItems(items.map(i => selectedTaskIds.has(i.id) ? { ...i, status: status as TodoItem['status'], completed: isCompleting ? true : i.completed, completedAt: isCompleting ? now : i.completedAt, modifiedAt: now } : i));
          setSelectedTaskIds(new Set()); setIsSelectionMode(false);
          if (isCompleting) playCompletionSound();
          toast.success(t('todayPage.bulkStatusSet', { count: selectedTaskIds.size }));
        }}
        deleteConfirmItem={deleteConfirmItem}
        onCloseDeleteConfirm={() => setDeleteConfirmItem(null)}
        onConfirmDelete={confirmDelete}
        swipeMoveTaskId={swipeMoveTaskId}
        onCloseSwipeMove={() => setSwipeMoveTaskId(null)}
        onSwipeMoveFolder={(folderId) => { if (swipeMoveTaskId) { updateItem(swipeMoveTaskId, { folderId: folderId || undefined }); toast.success(t('tasks.movedToFolder', 'Task moved to folder')); } setSwipeMoveTaskId(null); }}
        onSwipeMoveSection={(sectionId) => { if (swipeMoveTaskId) { updateItem(swipeMoveTaskId, { sectionId: sectionId || undefined }); toast.success(t('tasks.movedToSection', 'Task moved to section')); } setSwipeMoveTaskId(null); }}
        swipeMoveCurrentFolderId={items.find(i => i.id === swipeMoveTaskId)?.folderId}
        swipeMoveCurrentSectionId={items.find(i => i.id === swipeMoveTaskId)?.sectionId}
        swipeDateTaskId={swipeDateTaskId}
        onCloseSwipeDate={() => setSwipeDateTaskId(null)}
        onSwipeDateSet={(taskId, date) => { updateItem(taskId, { dueDate: date }); }}
        showStreakChallenge={showStreakChallenge}
        onCloseStreakChallenge={closeStreakChallenge}
        currentStreak={streakData?.currentStreak || 0}
        streakWeekData={streakWeekData}
      />
      </Suspense>
    </TodoLayout>
  );

};

// First-visit tour trigger — mounted inside <TodoLayout> so navigation context is ready.
const TodayTourTrigger = () => {
  useFirstVisitTour('/todo/today', 'task-add-basics');
  return null;
};

export default Today;

