/**
 * useTodayActions — All action handlers for the Today page.
 * Extracted from Today.tsx to reduce file size.
 */
import { useCallback, useRef, startTransition } from 'react';
import { genId } from '@/utils/genId';
import { withCopySuffix } from '@/utils/duplicateName';
import { TodoItem, Folder, Priority, Note, TaskSection } from '@/types/note';
import { loadNotesFromDB, saveNotesToDB } from '@/utils/noteStorage';
import { saveTodoItem, updateTodoItem, deleteTodoItem, saveTodoItems } from '@/utils/todoItemsStorage';
import { useTranslation } from 'react-i18next';
import { recordCompletions, TASK_STREAK_KEY } from '@/utils/streakStorage';
import { createNextRecurringTask } from '@/utils/recurringTasks';
import { playCompletionSound } from '@/utils/taskSounds';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { toast } from 'sonner';
import { DuplicateOption } from '@/components/DuplicateOptionsSheet';
import { SelectAction } from '@/components/SelectActionsSheet';
import { DropResult } from '@hello-pangea/dnd';
import { useSubscription, FREE_LIMITS, SOFT_FREE_LIMITS, FREE_CAPACITY_LIMITS } from '@/contexts/SubscriptionContext';
import { updateSectionOrder } from '@/utils/taskOrderStorage';
import { getAllSettings, setSetting } from '@/utils/settingsStorage';
import { loadDeletions, trackDeletion } from '@/utils/deletionTracker';
import { uploadCategory } from '@/utils/googleDriveSync';

// Align the completion-flush window with the ring-fill animation (~900ms).
// Flushing earlier removes the row from the uncompleted list while the user is
// still tapping nearby rows — the virtualizer shifts, the visually-targeted row
// is no longer under the pointer, and the 4th tap appears "stuck" / lost.
// Holding the visual state for the full ring duration lets rapid taps queue
// without yanking the DOM out from under the user.
// Persist checkmark taps quickly, but reconcile the expensive React list after
// the user stops tapping. This keeps 5k–100k item lists responsive while the
// ring/checkmark paint updates immediately through the existing visual state.
const COMPLETION_BATCH_MS = 250;
const COMPLETION_RECONCILE_DEBOUNCE_MS = 1200;
const COMPLETION_GLOBAL_EVENT_DELAY_MS = 3200;

interface UseTodayActionsProps {
  items: TodoItem[];
  setItems: React.Dispatch<React.SetStateAction<TodoItem[]>>;
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  sections: TaskSection[];
  setSections: React.Dispatch<React.SetStateAction<TaskSection[]>>;
  selectedFolderId: string | null;
  setSelectedFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  inputSectionId: string | null;
  setInputSectionId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedTaskIds: Set<string>;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsInputOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingSection: React.Dispatch<React.SetStateAction<TaskSection | null>>;
  setIsSectionEditOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMoveToFolderOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPrioritySheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBulkDateSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBulkReminderSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBulkRepeatSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBulkSectionMoveOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBulkStatusOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSelectActionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCollapsedViewSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  deleteConfirmItem: TodoItem | null;
  setDeleteConfirmItem: React.Dispatch<React.SetStateAction<TodoItem | null>>;
  defaultSectionId?: string;
  taskAddPosition: 'top' | 'bottom';
  uncompletedItems: TodoItem[];
  requireFeature: (feature: string) => boolean;
  isPro: boolean;
  tasksSettings: { confirmBeforeDelete: boolean; swipeToComplete: boolean };
  setOrderVersion: React.Dispatch<React.SetStateAction<number>>;
}

export const useTodayActions = (props: UseTodayActionsProps) => {
  const { t } = useTranslation();
  const {
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
  } = props;

  // Soft paywall — free users have hard lifetime create caps; edit/delete stays allowed.
  const { softRequireCreate, softRequireMutate, canCreateWithinSoftLimit, requireCapacity } = useSubscription();

  // Keep O(1) task lookups for checkbox taps. A linear `items.find(...)` on
  // every tap was enough to freeze mobile Chrome when users rapidly completed
  // tasks in very large lists.
  const itemsRef = useRef(items);
  const itemsByIdRef = useRef<Map<string, TodoItem>>(new Map());
  const itemIndexByIdRef = useRef<Map<string, number>>(new Map());
  const rebuildItemLookups = useCallback((source: TodoItem[]) => {
    const byId = new Map<string, TodoItem>();
    const byIndex = new Map<string, number>();
    source.forEach((item, index) => {
      byId.set(item.id, item);
      byIndex.set(item.id, index);
    });
    itemsByIdRef.current = byId;
    itemIndexByIdRef.current = byIndex;
  }, []);
  if (itemsRef.current !== items || itemsByIdRef.current.size !== items.length) {
    itemsRef.current = items;
    rebuildItemLookups(items);
  }
  const pendingDeferredCompletionUpdatesRef = useRef<Map<string, Partial<TodoItem>>>(new Map());
  const pendingCompletionPersistTasksRef = useRef<Map<string, TodoItem>>(new Map());
  const deferredCompletionFlushTimerRef = useRef<number | null>(null);
  const completionPersistFlushTimerRef = useRef<number | null>(null);
  const pendingCompletionStatsRef = useRef(0);
  const completionStatsTimerRef = useRef<number | null>(null);

  const markSingleTaskPersisted = useCallback((skipProcessing = false) => {
    try {
      const now = Date.now();
      (window as any).__flowistSkipNextTaskFullSave = now;
      if (skipProcessing) (window as any).__flowistSkipNextTaskProcessing = now;
    } catch {}
  }, []);

  const persistBulkTasks = useCallback((tasks: TodoItem[]) => {
    if (tasks.length === 0) return;
    // Skip both the expensive full-array save AND the immediate worker
    // re-filter/sort. The state layer prepends local-only rows optimistically,
    // so duplicating 200+ tasks appears instantly without a post-click hang.
    markSingleTaskPersisted(true);
    void import('@/utils/taskStorage').then(({ bulkUpdateTasksInDB }) =>
      bulkUpdateTasksInDB(tasks).then((persisted) => {
        if (!persisted) toast.error(t('todayPage.storageFull'), { id: 'storage-full' });
      }),
    );
  }, [markSingleTaskPersisted, t]);

  const flushDeferredCompletionState = useCallback(() => {
    const pending = pendingDeferredCompletionUpdatesRef.current;
    deferredCompletionFlushTimerRef.current = null;
    if (pending.size === 0) return;

    const updatesById = new Map(pending);
    pending.clear();
    markSingleTaskPersisted(true);
    // Mark the large list re-filter / re-sort as a non-urgent transition so
    // the next checkmark tap (a higher-priority discrete event) is never
    // blocked by React reconciling thousands of virtualized rows.
    startTransition(() => {
      setItems(prev => {
        let changed = false;
        const next = prev.slice();
        updatesById.forEach((updates, id) => {
          const index = itemIndexByIdRef.current.get(id);
          if (index == null || index < 0 || index >= next.length) return;
          const item = next[index];
          if (!item || item.id !== id) return;
          changed = true;
          next[index] = { ...item, ...updates };
        });
        if (changed) {
          itemsRef.current = next;
          rebuildItemLookups(next);
        }
        return changed ? next : prev;
      });
    });
  }, [markSingleTaskPersisted, rebuildItemLookups, setItems]);

  const queueDeferredCompletionState = useCallback((itemId: string, updates: Partial<TodoItem>) => {
    pendingDeferredCompletionUpdatesRef.current.set(itemId, updates);
    if (deferredCompletionFlushTimerRef.current) window.clearTimeout(deferredCompletionFlushTimerRef.current);
    deferredCompletionFlushTimerRef.current = window.setTimeout(flushDeferredCompletionState, COMPLETION_RECONCILE_DEBOUNCE_MS);
  }, [flushDeferredCompletionState]);

  const flushCompletionPersistence = useCallback(() => {
    completionPersistFlushTimerRef.current = null;
    const pending = pendingCompletionPersistTasksRef.current;
    if (pending.size === 0) return;
    const tasks = Array.from(pending.values());
    pending.clear();
    markSingleTaskPersisted(true);
    void import('@/utils/taskStorage').then(({ bulkPutTasksInWorker }) =>
      bulkPutTasksInWorker(tasks, false, undefined, COMPLETION_GLOBAL_EVENT_DELAY_MS).then((persisted) => {
        if (!persisted) toast.error(t('todayPage.storageFull'), { id: 'storage-full' });
      }),
    );
  }, [markSingleTaskPersisted, t]);

  const queueCompletionPersistence = useCallback((task: TodoItem) => {
    pendingCompletionPersistTasksRef.current.set(task.id, task);
    if (!completionPersistFlushTimerRef.current) {
      completionPersistFlushTimerRef.current = window.setTimeout(flushCompletionPersistence, COMPLETION_BATCH_MS);
    }
  }, [flushCompletionPersistence]);

  const flushCompletionStats = useCallback(() => {
    const count = pendingCompletionStatsRef.current;
    pendingCompletionStatsRef.current = 0;
    completionStatsTimerRef.current = null;
    if (count <= 0) return;
    const run = () => {
      recordCompletions(TASK_STREAK_KEY, count).then((streakResult) => {
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
    };
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
    if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(run, { timeout: 2000 });
    else window.setTimeout(run, 0);
  }, [t]);

  const queueCompletionStats = useCallback(() => {
    pendingCompletionStatsRef.current += 1;
    if (completionStatsTimerRef.current) window.clearTimeout(completionStatsTimerRef.current);
    completionStatsTimerRef.current = window.setTimeout(flushCompletionStats, 900);
  }, [flushCompletionStats]);

  // ── Folder Actions ──
  const handleCreateFolder = useCallback((name: string, color: string, icon?: string, parentId?: string) => {
    if (!requireCapacity('taskFolders', folders.length)) return;
    const now = new Date();
    const newFolder: Folder = { id: genId(), name, color, icon, parentId, isDefault: false, createdAt: now, updatedAt: now } as Folder;
    setFolders(prev => [...prev, newFolder]);
  }, [folders.length, requireCapacity, setFolders]);

  const handleEditFolder = useCallback((folderId: string, name: string, color: string, icon?: string, parentId?: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name, color, icon, parentId, updatedAt: new Date() } as Folder : f));
  }, [setFolders]);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    // Cascade: also delete every descendant folder, unassign their tasks
    const { getDescendantFolderIds } = await import('@/utils/folderHelpers');
    const descendants = getDescendantFolderIds(folders, folderId);
    const toRemove = new Set<string>([folderId, ...descendants]);
    const updatedFolders = folders.filter(f => !toRemove.has(f.id));
    setItems(prev => prev.map(item => (item.folderId && toRemove.has(item.folderId)) ? { ...item, folderId: undefined } : item));
    setFolders(updatedFolders);
    if (selectedFolderId && toRemove.has(selectedFolderId)) setSelectedFolderId(null);

    toRemove.forEach((id) => trackDeletion(id, 'todoFolders'));
    import('@/utils/cloudSync/storeBridge').then(({ pushFolderDelete }) => {
      toRemove.forEach((id) => pushFolderDelete(id));
    }).catch(() => {});

    try {
      await setSetting('todoFolders', updatedFolders);
      if (selectedFolderId && toRemove.has(selectedFolderId)) {
        await setSetting('todoSelectedFolder', 'null');
      }

      const settings = await getAllSettings();
      await Promise.allSettled([
        uploadCategory('flowist_settings.json', settings),
        uploadCategory('flowist_deletions.json', loadDeletions()),
      ]);
    } catch (error) {
      console.warn('Failed to sync deleted folder state:', error);
    }
  }, [folders, selectedFolderId, setItems, setFolders, setSelectedFolderId]);

  const handleReorderFolders = useCallback((reorderedFolders: Folder[]) => {
    setFolders(reorderedFolders);
    toast.success(t('todayPage.foldersReordered'));
  }, [setFolders, t]);

  const handleToggleFolderFavorite = useCallback((folderId: string) => {
    setFolders(prev => {
      const folder = prev.find(f => f.id === folderId);
      toast.success(folder?.isFavorite ? t('todayPage.removedFromFavorites') : t('todayPage.addedToFavorites'), { icon: '⭐' });
      return prev.map(f => f.id === folderId ? { ...f, isFavorite: !f.isFavorite } : f);
    });
  }, [setFolders, t]);

  // ── Section Actions ──
  const handleAddSection = useCallback((position: 'above' | 'below', referenceId?: string) => {
    // Per-folder sections cap (Free: 10 per folder)
    const folderSectionsCount = sections.filter(s => (s.folderId || null) === (selectedFolderId || null)).length;
    if (!requireCapacity('sectionsPerFolder', folderSectionsCount)) return;

    const maxOrder = Math.max(...sections.map(s => s.order), 0);
    let newOrder = maxOrder + 1;
    if (referenceId) {
      const refSection = sections.find(s => s.id === referenceId);
      if (refSection) {
        newOrder = position === 'above' ? refSection.order - 0.5 : refSection.order + 0.5;
      }
    }
    const newSection: TaskSection = {
      id: genId(), name: t('todayPage.newSection'), color: '#3b82f6', isCollapsed: false, order: newOrder,
      // Scope new sections to the currently selected folder (if any)
      folderId: selectedFolderId || undefined,
      updatedAt: new Date(),
    } as TaskSection;
    const updatedSections = [...sections, newSection].sort((a, b) => a.order - b.order).map((s, idx) => ({ ...s, order: idx }));
    setSections(updatedSections);
    setEditingSection(newSection);
    setIsSectionEditOpen(true);
    toast.success(t('todayPage.sectionAdded'));
  }, [sections, selectedFolderId, isPro, softRequireCreate, requireFeature, setSections, setEditingSection, setIsSectionEditOpen, t]);

  const handleEditSection = useCallback((section: TaskSection) => {
    setEditingSection(section);
    setIsSectionEditOpen(true);
  }, [setEditingSection, setIsSectionEditOpen]);

  const handleSaveSection = useCallback((updatedSection: TaskSection) => {
    setSections(prev => prev.map(s => s.id === updatedSection.id ? { ...updatedSection, updatedAt: new Date() } as TaskSection : s));
  }, [setSections]);

  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (sections.length <= 1) {
      toast.error(t('todayPage.cannotDeleteLastSection'));
      return;
    }
    const remainingSections = sections.filter(s => s.id !== sectionId);
    const normalizedSections = remainingSections
      .sort((a, b) => a.order - b.order)
      .map((section, index) => ({ ...section, order: index }));
    const firstSection = normalizedSections[0];

    setItems(prev => prev.map(item => item.sectionId === sectionId ? { ...item, sectionId: firstSection.id } : item));
    setSections(normalizedSections);

    trackDeletion(sectionId, 'todoSections');
    import('@/utils/cloudSync/storeBridge').then(({ pushSectionDelete }) => pushSectionDelete(sectionId)).catch(() => {});

    try {
      await setSetting('todoSections', normalizedSections);
      const settings = await getAllSettings();
      await Promise.allSettled([
        uploadCategory('flowist_settings.json', settings),
        uploadCategory('flowist_deletions.json', loadDeletions()),
      ]);
    } catch (error) {
      console.warn('Failed to sync deleted section state:', error);
    }

    toast.success(t('todayPage.sectionDeleted'));
  }, [sections, setItems, setSections, t]);

  const handleDuplicateSection = useCallback((sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    // Enforce sections-per-folder capacity
    const folderSectionsCount = sections.filter(s => (s.folderId || null) === (selectedFolderId || null)).length;
    if (!requireCapacity('sectionsPerFolder', folderSectionsCount)) return;

    const maxOrder = Math.max(...sections.map(s => s.order), 0);
    const newSection: TaskSection = { ...section, id: genId(), name: withCopySuffix(section.name), order: maxOrder + 1, updatedAt: new Date() } as TaskSection;
    const sectionTasks = items.filter(i => i.sectionId === sectionId && !i.completed);

    // Cap duplicated tasks to remaining per-folder and global soft limits
    const folderTasksCount = items.filter(i => (i.folderId || null) === (selectedFolderId || null)).length;
    const remainingFolder = isPro ? sectionTasks.length : Math.max(0, FREE_CAPACITY_LIMITS.tasksPerFolder - folderTasksCount);
    const remainingGlobal = isPro ? sectionTasks.length : Math.max(0, SOFT_FREE_LIMITS.tasks - items.length);
    const allowedCount = isPro ? sectionTasks.length : Math.min(sectionTasks.length, remainingFolder, remainingGlobal);
    const duplicatedTasks = sectionTasks.slice(0, allowedCount).map((task) => ({ ...task, id: genId(), sectionId: newSection.id }));

    setSections(prev => [...prev, newSection]);
    setItems(prev => {
      const next = [...duplicatedTasks, ...prev];
      itemsRef.current = next;
      return next;
    });
    persistBulkTasks(duplicatedTasks);
    toast.success(t('todayPage.sectionDuplicated'));
  }, [sections, items, selectedFolderId, isPro, requireCapacity, setSections, setItems, t, persistBulkTasks]);

  const handleMoveSection = useCallback((sectionId: string, targetIndex: number) => {
    const sortedSections = [...sections].sort((a, b) => a.order - b.order);
    const currentIndex = sortedSections.findIndex(s => s.id === sectionId);
    if (currentIndex === targetIndex) return;
    const [movedSection] = sortedSections.splice(currentIndex, 1);
    sortedSections.splice(targetIndex, 0, movedSection);
    const now = new Date();
    setSections(sortedSections.map((s, idx) => ({ ...s, order: idx, updatedAt: s.id === sectionId ? now : (s as any).updatedAt })) as TaskSection[]);
    toast.success(t('todayPage.sectionMoved'));
  }, [sections, setSections, t]);

  const handleToggleSectionCollapse = useCallback((sectionId: string) => {
    const flatSectionId = `flat-${sectionId}`;
    setCollapsedViewSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(flatSectionId)) newSet.delete(flatSectionId);
      else newSet.add(flatSectionId);
      return newSet;
    });
  }, [setCollapsedViewSections]);

  const handleAddTaskToSection = useCallback(async (sectionId: string) => {
    // Per-folder tasks cap (Free: 99 per folder)
    const folderTasksCount = itemsRef.current.filter(t => (t.folderId || null) === (selectedFolderId || null)).length;
    if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
    if (!isPro && !canCreateWithinSoftLimit('tasks', itemsRef.current.length)) {
      softRequireCreate('tasks', itemsRef.current.length);
      return;
    }
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
    setInputSectionId(sectionId);
    setIsInputOpen(true);
  }, [setInputSectionId, setIsInputOpen, isPro, canCreateWithinSoftLimit, softRequireCreate, requireCapacity, selectedFolderId]);


  const handleSectionDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    if (sourceIndex === destIndex) return;
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    const sortedSects = [...sections].sort((a, b) => a.order - b.order);
    const [removed] = sortedSects.splice(sourceIndex, 1);
    sortedSects.splice(destIndex, 0, removed);
    const now = new Date();
    setSections(sortedSects.map((s, idx) => ({ ...s, order: idx, updatedAt: now })) as TaskSection[]);
  }, [sections, setSections]);

  // ── Task CRUD ──
  const handleAddTask = useCallback(async (task: Omit<TodoItem, 'id' | 'completed'>) => {
    // Per-folder tasks cap (Free: 99 per folder)
    const targetFolderId = task.folderId ?? selectedFolderId ?? null;
    const folderTasksCount = itemsRef.current.filter(t => (t.folderId || null) === targetFolderId).length;
    if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
    if (!isPro && !softRequireCreate('tasks', itemsRef.current.length)) return;
    const now = new Date();
    const newItem: TodoItem = {
      id: genId(), completed: false, ...task,
      // Inherit currently-selected folder so tasks added inside a folder appear in that folder's view.
      folderId: task.folderId ?? selectedFolderId ?? undefined,
      sectionId: task.sectionId || inputSectionId || defaultSectionId || sections[0]?.id,
      dueDate: task.dueDate || new Date(),
      createdAt: now, modifiedAt: now,
      status: task.status || 'not_started',
      reminderTime: (task.dueDate && !task.reminderTime) ? task.dueDate : task.reminderTime,
    };
    if (taskAddPosition === 'bottom') setItems(prev => [...prev, newItem]);
    else setItems(prev => [newItem, ...prev]);
    markSingleTaskPersisted(false);
    void saveTodoItem(newItem).then(({ persisted }) => {
      if (!persisted) toast.error(t('todayPage.storageFull'), { id: 'storage-full' });
    });
    setInputSectionId(null);
    if (newItem.reminderTime) {
      import('@/utils/reminderScheduler').then(({ scheduleTaskReminder }) => {
        scheduleTaskReminder(newItem.id, newItem.text, new Date(newItem.reminderTime!), newItem.isUrgent).catch(console.warn);
      });
    }
  }, [inputSectionId, defaultSectionId, sections, taskAddPosition, setItems, setInputSectionId, isPro, softRequireCreate, requireCapacity, selectedFolderId, markSingleTaskPersisted, t]);


  const handleBatchAddTasks = useCallback(async (taskTexts: string[], sectionId?: string, folderId?: string, priority?: Priority, dueDate?: Date) => {
    const existingCount = itemsRef.current.length;
    const targetFolderId = folderId || selectedFolderId || undefined;
    const folderTasksCount = itemsRef.current.filter(t => (t.folderId || undefined) === targetFolderId).length;
    const remainingFolderCapacity = isPro ? taskTexts.length : Math.max(0, FREE_CAPACITY_LIMITS.tasksPerFolder - folderTasksCount);
    const remainingCreates = Math.max(0, SOFT_FREE_LIMITS.tasks - existingCount);
    const allowedCount = isPro ? taskTexts.length : Math.min(taskTexts.length, remainingCreates, remainingFolderCapacity);
    const allowedTexts = taskTexts.slice(0, allowedCount);

    if (!isPro && allowedTexts.length === 0) {
      if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
      if (!softRequireCreate('tasks', existingCount)) return;
    }

    const now = new Date();
    const newItems: TodoItem[] = allowedTexts.map((text, idx) => ({
      id: genId(), text, completed: false,
      folderId: targetFolderId,
      sectionId: sectionId || inputSectionId || sections[0]?.id,
      priority, dueDate: dueDate || new Date(), createdAt: now, modifiedAt: now,
    }));
    if (newItems.length === 0) return;
    // Additive insert: never rewrite the whole tasks store. With 100k+ existing
    // tasks, full-array saves blocked the main thread for seconds; bulk-put
    // streams new rows in batches and keeps the UI responsive.
    setItems(prev => [...newItems, ...prev]);
    markSingleTaskPersisted(true);
    void import('@/utils/taskStorage').then(({ bulkPutTasksInWorker }) =>
      bulkPutTasksInWorker(newItems).then((persisted) => {
        if (!persisted) toast.error(t('todayPage.storageFull'), { id: 'storage-full' });
      }),
    );
    toast.success(t('todayPage.addedTasks', { count: newItems.length }));
    setInputSectionId(null);
  }, [selectedFolderId, inputSectionId, sections, setItems, setInputSectionId, t, isPro, softRequireCreate, requireCapacity, markSingleTaskPersisted]);

  const updateItem = useCallback(async (itemId: string, updates: Partial<TodoItem>) => {
    const onlyCompletion = Object.keys(updates).every(k => k === 'completed' || k === 'completedAt' || k === 'modifiedAt');
    if (!onlyCompletion && !softRequireMutate()) return;
    const now = new Date();
    const updatesWithTimestamp: Partial<TodoItem> = { ...updates, modifiedAt: now };

    // Get the current item from ref (reliable in async contexts)
    const currentItem = itemsByIdRef.current.get(itemId) ?? itemsRef.current.find(i => i.id === itemId);

    const isNewCompletion = updates.completed === true && currentItem && !currentItem.completed;

    if (isNewCompletion) {
      updatesWithTimestamp.completedAt = now;
      // Do not create/resume AudioContext inside the checkbox click handler —
      // that can steal tens of milliseconds on Android when large lists are in
      // memory. The visual fill + data update happen first; sound follows on
      // the next task without blocking the tap.
      window.setTimeout(() => playCompletionSound(), 0);
      import('@/utils/reminderScheduler').then(({ cancelTaskReminder }) => {
        cancelTaskReminder(itemId).catch(console.warn);
      });
    }
    if (updates.completed === false && currentItem?.completed) {
      updatesWithTimestamp.completedAt = undefined;
    }
    if (updates.completed === false) {
      pendingDeferredCompletionUpdatesRef.current.delete(itemId);
    }

    const persistUpdate = (skipProcessing = true) => {
      markSingleTaskPersisted(skipProcessing);
      void updateTodoItem(itemId, updatesWithTimestamp).then((persisted) => {
        if (!persisted) toast.error(t('todayPage.storageFull'), { id: 'storage-full' });
      });
    };

    // Handle recurring tasks
    if (currentItem && isNewCompletion) {
      if (currentItem.repeatType && currentItem.repeatType !== 'none') {
        const nextTask = createNextRecurringTask(currentItem);
        if (nextTask) {
          const nextTaskWithTimestamps = { ...nextTask, createdAt: now, modifiedAt: now };
          setItems(prev => {
            const next = [nextTaskWithTimestamps, ...prev.map(i => i.id === itemId ? { ...i, ...updatesWithTimestamp } : i)];
            itemsRef.current = next;
            return next;
          });
          persistUpdate(false);
          void saveTodoItem(nextTaskWithTimestamps);
          toast.success(t('todayPage.recurringTaskCompleted'), { icon: '🔄' });
          queueCompletionStats();
          return;
        }
      }
    }

    const commitStateUpdate = () => setItems(prev => {
      const next = prev.map(i => i.id === itemId ? { ...i, ...updatesWithTimestamp } : i);
      itemsRef.current = next;
      return next;
    });

    const canUseLightCompletionPath =
      currentItem &&
      (!currentItem.repeatType || currentItem.repeatType === 'none') &&
      Object.keys(updates).every(k => k === 'completed' || k === 'completedAt' || k === 'modifiedAt');

    if (canUseLightCompletionPath) {
      // Mutate the existing task object synchronously so the already-rendered
      // row can paint completed/uncompleted on the next lightweight visual
      // state render. The expensive array/filter/sort reconciliation is delayed
      // until tapping settles, preventing the 2–4 checkbox "whole app stuck"
      // failure on large lists.
      const optimisticTask = { ...currentItem, ...updatesWithTimestamp };
      Object.assign(currentItem, updatesWithTimestamp);
      itemsByIdRef.current.set(itemId, currentItem);
      queueCompletionPersistence(optimisticTask);
      queueDeferredCompletionState(itemId, updatesWithTimestamp);
    } else {
      commitStateUpdate();
      persistUpdate(true);
    }

    if (isNewCompletion) {
      queueCompletionStats();
      toast.success(t('todayPage.taskCompleted'), {
        id: 'task-completed',
        action: {
          label: t('todayPage.undo'),
          onClick: () => {
            setItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: false, completedAt: undefined, modifiedAt: new Date() } : i));
            toast.success(t('todayPage.taskRestored'));
          }
        },
        duration: 5000,
      });
    }
  }, [setItems, t, softRequireMutate, markSingleTaskPersisted, queueCompletionStats, queueDeferredCompletionState, queueCompletionPersistence]);

  const deleteItem = useCallback(async (itemId: string, _showUndo: boolean = false, skipConfirm: boolean = false) => {
    if (!softRequireMutate()) return;
    let deletedItem: TodoItem | undefined;
    setItems(prev => {
      deletedItem = prev.find(item => item.id === itemId);
      return prev;
    });
    if (!deletedItem) return;
    
    if (tasksSettings.confirmBeforeDelete && !skipConfirm) {
      setDeleteConfirmItem(deletedItem);
      return;
    }
    
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    const itemToRestore = deletedItem;
    setItems(prev => {
      const next = prev.filter(item => item.id !== itemId);
      itemsRef.current = next;
      return next;
    });
    markSingleTaskPersisted(true);
    void deleteTodoItem(itemId);
    toast.success(t('todayPage.taskDeleted'), {
      action: { label: t('todayPage.undo'), onClick: () => { setItems(prev => [itemToRestore!, ...prev]); toast.success(t('todayPage.taskRestored')); } },
      duration: 5000,
    });
  }, [tasksSettings.confirmBeforeDelete, setItems, setDeleteConfirmItem, t, softRequireMutate, markSingleTaskPersisted]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmItem) return;
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    const deletedItem = deleteConfirmItem;
    setItems(prev => {
      const next = prev.filter(item => item.id !== deletedItem.id);
      itemsRef.current = next;
      return next;
    });
    markSingleTaskPersisted(true);
    void deleteTodoItem(deletedItem.id);
    setDeleteConfirmItem(null);
    toast.success(t('todayPage.taskDeleted'), {
      action: { label: t('todayPage.undo'), onClick: () => { setItems(prev => [deletedItem, ...prev]); toast.success(t('todayPage.taskRestored')); } },
      duration: 5000,
    });
  }, [deleteConfirmItem, setItems, setDeleteConfirmItem, t, markSingleTaskPersisted]);

  const duplicateTask = useCallback(async (task: TodoItem) => {
    // Enforce per-folder + global free-plan limits on duplicates
    const folderTasksCount = itemsRef.current.filter(t => (t.folderId || null) === (task.folderId || null)).length;
    if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
    if (!isPro && !softRequireCreate('tasks', itemsRef.current.length)) return;
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    const duplicatedTask: TodoItem = { ...task, id: genId(), completed: false, text: withCopySuffix(task.text) };
    setItems(prev => [duplicatedTask, ...prev]);
    markSingleTaskPersisted(false);
    void saveTodoItem(duplicatedTask);
  }, [setItems, requireCapacity, softRequireCreate, isPro, markSingleTaskPersisted]);

  // ── Selection / Bulk ──
  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  }, [setSelectedTaskIds]);

  const handleDuplicate = useCallback((option: DuplicateOption) => {
    const filteredItems = selectedFolderId ? items.filter(i => i.folderId === selectedFolderId) : items;
    let toDuplicate: TodoItem[] = option === 'uncompleted' ? filteredItems.filter(i => !i.completed) : filteredItems;

    // Cap to remaining per-folder + global free-plan capacity
    const folderTasksCount = items.filter(i => (i.folderId || null) === (selectedFolderId || null)).length;
    const remainingFolder = isPro ? toDuplicate.length : Math.max(0, FREE_CAPACITY_LIMITS.tasksPerFolder - folderTasksCount);
    const remainingGlobal = isPro ? toDuplicate.length : Math.max(0, SOFT_FREE_LIMITS.tasks - items.length);
    const allowedCount = isPro ? toDuplicate.length : Math.min(toDuplicate.length, remainingFolder, remainingGlobal);
    if (allowedCount === 0) {
      if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
      if (!softRequireCreate('tasks', items.length)) return;
      return;
    }
    toDuplicate = toDuplicate.slice(0, allowedCount);

    const duplicated = toDuplicate.map((item, idx) => ({
      ...item, id: genId(), completed: option === 'all-reset' ? false : item.completed, text: withCopySuffix(item.text)
    }));
    setItems(prev => {
      const next = [...duplicated, ...prev];
      itemsRef.current = next;
      return next;
    });
    persistBulkTasks(duplicated);
    toast.success(t('todayPage.duplicatedTasks', { count: duplicated.length }));
  }, [items, selectedFolderId, isPro, requireCapacity, softRequireCreate, setItems, t, persistBulkTasks]);

  const convertToNotes = useCallback(async (tasksToConvert: TodoItem[]) => {
    const existingNotes = await loadNotesFromDB();
    const newNotes: Note[] = tasksToConvert.map((task, idx) => ({
      id: genId(), type: 'regular' as const, title: task.text,
      content: task.description || '', voiceRecordings: [],
      images: task.imageUrl ? [task.imageUrl] : [],
      createdAt: new Date(), updatedAt: new Date(),
    }));
    await saveNotesToDB([...newNotes, ...existingNotes]);
    setItems(prev => prev.filter(i => !tasksToConvert.some(tc => tc.id === i.id)));
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
    toast.success(t('todayPage.convertedToNotes', { count: tasksToConvert.length }));
  }, [setItems, setSelectedTaskIds, setIsSelectionMode, t]);

  const handleConvertSingleTask = useCallback((task: TodoItem) => {
    convertToNotes([task]);
  }, [convertToNotes]);

  const handleSelectAction = useCallback((action: SelectAction) => {
    const selectedItems = items.filter(i => selectedTaskIds.has(i.id));
    switch (action) {
      case 'selectAll':
        setSelectedTaskIds(new Set(uncompletedItems.map(i => i.id)));
        toast.success(t('todayPage.selectedTasks', { count: uncompletedItems.length }));
        return;
      case 'move': setIsMoveToFolderOpen(true); break;
      case 'delete':
        setItems(prev => prev.filter(i => !selectedTaskIds.has(i.id)));
        import('@/utils/cloudSync/storeBridge').then(({ pushTaskDelete }) => {
          selectedItems.forEach(item => pushTaskDelete(item.id));
        }).catch(() => {});
        setSelectedTaskIds(new Set()); setIsSelectionMode(false);
        toast.success(t('todayPage.deletedTasks', { count: selectedItems.length }));
        break;
      case 'complete':
        const completionTimestamp = new Date();
        playCompletionSound();
        setItems(prev => prev.map(i => selectedTaskIds.has(i.id) ? {
          ...i,
          completed: true,
          completedAt: i.completed ? i.completedAt : completionTimestamp,
          modifiedAt: completionTimestamp,
        } : i));
        setSelectedTaskIds(new Set()); setIsSelectionMode(false);
        toast.success(t('todayPage.completedTasks', { count: selectedItems.length }));
        break;
      case 'pin':
        if (!requireFeature('pin_feature')) return;
        setItems(prev => prev.map(i => selectedTaskIds.has(i.id) ? { ...i, isPinned: !i.isPinned, modifiedAt: new Date() } : i));
        toast.success(t('todayPage.pinnedTasks', { count: selectedItems.length }));
        setSelectedTaskIds(new Set()); setIsSelectionMode(false);
        break;
      case 'priority': setIsPrioritySheetOpen(true); break;
      case 'duplicate': {
        const folderTasksCount = items.filter(i => (i.folderId || null) === (selectedFolderId || null)).length;
        const remainingFolder = isPro ? selectedItems.length : Math.max(0, FREE_CAPACITY_LIMITS.tasksPerFolder - folderTasksCount);
        const remainingGlobal = isPro ? selectedItems.length : Math.max(0, SOFT_FREE_LIMITS.tasks - items.length);
        const allowedCount = isPro ? selectedItems.length : Math.min(selectedItems.length, remainingFolder, remainingGlobal);
        if (allowedCount === 0) {
          if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
          softRequireCreate('tasks', items.length);
          return;
        }
        const dupSlice = selectedItems.slice(0, allowedCount);
        const duplicated = dupSlice.map((item, idx) => ({ ...item, id: genId(), completed: false, text: withCopySuffix(item.text) }));
        setItems(prev => {
          const next = [...duplicated, ...prev];
          itemsRef.current = next;
          return next;
        });
        persistBulkTasks(duplicated);
        setSelectedTaskIds(new Set()); setIsSelectionMode(false);
        toast.success(t('todayPage.duplicatedTasks', { count: duplicated.length }));
        break;
      }
      case 'convert': convertToNotes(selectedItems); break;
      case 'setDueDate': setIsBulkDateSheetOpen(true); break;
      case 'setReminder': setIsBulkReminderSheetOpen(true); break;
      case 'setRepeat': setIsBulkRepeatSheetOpen(true); break;
      case 'moveToSection': setIsBulkSectionMoveOpen(true); break;
      case 'setStatus':
        if (!requireFeature('task_status')) return;
        setIsBulkStatusOpen(true); break;
    }
    setIsSelectActionsOpen(false);
  }, [items, selectedTaskIds, uncompletedItems, requireFeature, setItems, setSelectedTaskIds, setIsSelectionMode, setIsMoveToFolderOpen, setIsPrioritySheetOpen, setIsBulkDateSheetOpen, setIsBulkReminderSheetOpen, setIsBulkRepeatSheetOpen, setIsBulkSectionMoveOpen, setIsBulkStatusOpen, setIsSelectActionsOpen, convertToNotes, t, persistBulkTasks]);

  const handleMoveToFolder = useCallback((folderId: string | null) => {
    const now = new Date();
    setItems(prev => prev.map(i => selectedTaskIds.has(i.id) ? { ...i, folderId: folderId || undefined, modifiedAt: now } : i));
    setSelectedTaskIds(new Set()); setIsSelectionMode(false);
    toast.success(t('todayPage.movedTasks', { count: selectedTaskIds.size }));
  }, [selectedTaskIds, setItems, setSelectedTaskIds, setIsSelectionMode, t]);

  const handleSetPriority = useCallback((priority: Priority) => {
    const now = new Date();
    setItems(prev => prev.map(i => selectedTaskIds.has(i.id) ? { ...i, priority, modifiedAt: now } : i));
    setSelectedTaskIds(new Set()); setIsSelectionMode(false);
    toast.success(t('todayPage.updatedPriority', { count: selectedTaskIds.size }));
  }, [selectedTaskIds, setItems, setSelectedTaskIds, setIsSelectionMode, t]);

  const handleMoveTaskToFolder = useCallback((taskId: string, folderId: string | null) => {
    const now = new Date();
    setItems(prev => prev.map(i => i.id === taskId ? { ...i, folderId: folderId || undefined, modifiedAt: now } : i));
    toast.success(t('todayPage.taskMoved'));
  }, [setItems, t]);

  // ── Subtask handlers ──
  const handleUnifiedReorder = useCallback((updatedItems: TodoItem[]) => {
    setItems(prev => {
      const completedItems = prev.filter(item => item.completed);
      return [...updatedItems, ...completedItems];
    });
  }, [setItems]);

  const handleSectionReorder = useCallback((updatedSections: TaskSection[]) => {
    setSections(updatedSections);
  }, [setSections]);

  const handleUpdateSubtaskFromSheet = useCallback((parentId: string, subtaskId: string, updates: Partial<TodoItem>) => {
    const now = new Date();
    const updatesWithTimestamp: Partial<TodoItem> = { ...updates, modifiedAt: now };
    if (updates.completed === true) updatesWithTimestamp.completedAt = now;
    if (updates.completed === false) updatesWithTimestamp.completedAt = undefined;
    setItems(prev => prev.map(item => {
      if (item.id === parentId && item.subtasks) {
        return { ...item, modifiedAt: now, subtasks: item.subtasks.map(st => st.id === subtaskId ? { ...st, ...updatesWithTimestamp } : st) };
      }
      return item;
    }));
  }, [setItems]);

  const handleDeleteSubtaskFromSheet = useCallback((parentId: string, subtaskId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === parentId && item.subtasks) {
        return { ...item, subtasks: item.subtasks.filter(st => st.id !== subtaskId) };
      }
      return item;
    }));
  }, [setItems]);

  const handleConvertSubtaskToTask = useCallback((parentId: string, subtask: TodoItem) => {
    setItems(prev => {
      const updatedItems = prev.map(item => {
        if (item.id === parentId && item.subtasks) {
          return { ...item, subtasks: item.subtasks.filter(st => st.id !== subtask.id) };
        }
        return item;
      });
      const newTask: TodoItem = { ...subtask, sectionId: prev.find(i => i.id === parentId)?.sectionId || sections[0]?.id };
      return [newTask, ...updatedItems];
    });
  }, [sections, setItems]);

  const updateSubtask = useCallback(async (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => {
    const now = new Date();
    const updatesWithTimestamp: Partial<TodoItem> = { ...updates, modifiedAt: now };
    if (updates.completed === true) updatesWithTimestamp.completedAt = now;
    if (updates.completed === false) updatesWithTimestamp.completedAt = undefined;
    setItems(prev => prev.map(item => {
      if (item.id === parentId && item.subtasks) {
        return { ...item, modifiedAt: now, subtasks: item.subtasks.map(st => st.id === subtaskId ? { ...st, ...updatesWithTimestamp } : st) };
      }
      return item;
    }));
  }, [setItems]);

  const deleteSubtask = useCallback((parentId: string, subtaskId: string, showUndo: boolean = false) => {
    let deletedSubtask: TodoItem | null = null;
    setItems(prev => prev.map(item => {
      if (item.id === parentId && item.subtasks) {
        deletedSubtask = item.subtasks.find(st => st.id === subtaskId) || null;
        return { ...item, subtasks: item.subtasks.filter(st => st.id !== subtaskId) };
      }
      return item;
    }));
    if (showUndo && deletedSubtask) {
      const subtaskToRestore = deletedSubtask;
      toast.success(t('todayPage.subtaskDeleted', 'Subtask deleted'), {
        action: {
          label: t('todayPage.undo'),
          onClick: () => {
            setItems(prev => prev.map(item => {
              if (item.id === parentId) return { ...item, subtasks: [...(item.subtasks || []), subtaskToRestore] };
              return item;
            }));
            toast.success(t('todayPage.subtaskRestored', 'Subtask restored'));
          }
        },
        duration: 5000,
      });
    }
  }, [setItems, t]);

  return {
    // Folder actions
    handleCreateFolder, handleEditFolder, handleDeleteFolder, handleReorderFolders, handleToggleFolderFavorite,
    // Section actions
    handleAddSection, handleEditSection, handleSaveSection, handleDeleteSection,
    handleDuplicateSection, handleMoveSection, handleToggleSectionCollapse,
    handleAddTaskToSection, handleSectionDragEnd,
    // Task CRUD
    handleAddTask, handleBatchAddTasks, updateItem, deleteItem, confirmDelete, duplicateTask,
    // Selection / Bulk
    handleSelectTask, handleDuplicate, handleSelectAction, handleMoveToFolder,
    handleSetPriority, handleMoveTaskToFolder,
    // Convert
    convertToNotes, handleConvertSingleTask,
    // Reorder
    handleUnifiedReorder, handleSectionReorder,
    // Subtask handlers
    handleUpdateSubtaskFromSheet, handleDeleteSubtaskFromSheet, handleConvertSubtaskToTask,
    updateSubtask, deleteSubtask,
  };
};
