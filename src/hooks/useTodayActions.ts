/**
 * useTodayActions — All action handlers for the Today page.
 * Extracted from Today.tsx to reduce file size.
 */
import { useCallback, useRef } from 'react';
import { genId } from '@/utils/genId';
import { TodoItem, Folder, Priority, Note, TaskSection } from '@/types/note';
import { loadNotesFromDB, saveNotesToDB } from '@/utils/noteStorage';
import { useTranslation } from 'react-i18next';
import { recordCompletion, TASK_STREAK_KEY } from '@/utils/streakStorage';
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
import { deleteTaskFromDB, updateTaskInDB } from '@/utils/taskStorage';

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

  // Keep a ref to items for reliable access in async callbacks
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const recentCompletionLocks = useRef<Map<string, number>>(new Map());

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
    const newSection: TaskSection = { ...section, id: genId(), name: `${section.name} (Copy)`, order: maxOrder + 1, updatedAt: new Date() } as TaskSection;
    const sectionTasks = items.filter(i => i.sectionId === sectionId && !i.completed);

    // Cap duplicated tasks to remaining per-folder and global soft limits
    const folderTasksCount = items.filter(i => (i.folderId || null) === (selectedFolderId || null)).length;
    const remainingFolder = isPro ? sectionTasks.length : Math.max(0, FREE_CAPACITY_LIMITS.tasksPerFolder - folderTasksCount);
    const remainingGlobal = isPro ? sectionTasks.length : Math.max(0, SOFT_FREE_LIMITS.tasks - items.length);
    const allowedCount = isPro ? sectionTasks.length : Math.min(sectionTasks.length, remainingFolder, remainingGlobal);
    const duplicatedTasks = sectionTasks.slice(0, allowedCount).map((task) => ({ ...task, id: genId(), sectionId: newSection.id }));

    setSections(prev => [...prev, newSection]);
    setItems(prev => [...duplicatedTasks, ...prev]);
    toast.success(t('todayPage.sectionDuplicated'));
  }, [sections, items, selectedFolderId, isPro, requireCapacity, setSections, setItems, t]);

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
    setInputSectionId(null);
    if (newItem.reminderTime) {
      import('@/utils/reminderScheduler').then(({ scheduleTaskReminder }) => {
        scheduleTaskReminder(newItem.id, newItem.text, new Date(newItem.reminderTime!), newItem.isUrgent).catch(console.warn);
      });
    }
  }, [inputSectionId, defaultSectionId, sections, taskAddPosition, setItems, setInputSectionId, isPro, softRequireCreate, requireCapacity, selectedFolderId]);


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
    setItems(prev => [...newItems, ...prev]);
    toast.success(t('todayPage.addedTasks', { count: newItems.length }));
    setInputSectionId(null);
  }, [selectedFolderId, inputSectionId, sections, setItems, setInputSectionId, t, isPro, softRequireCreate, requireCapacity]);

  const updateItem = useCallback(async (itemId: string, updates: Partial<TodoItem>) => {
    const onlyCompletion = Object.keys(updates).every(k => k === 'completed' || k === 'completedAt' || k === 'modifiedAt');
    if (!onlyCompletion && !softRequireMutate()) return;
    const lockUntil = recentCompletionLocks.current.get(itemId) ?? 0;
    if (updates.completed === false && lockUntil > Date.now()) return;

    const now = new Date();
    const updatesWithTimestamp: Partial<TodoItem> = { ...updates, modifiedAt: now };

    // Get the current item from ref (reliable in async contexts)
    const currentItem = itemsRef.current.find(i => i.id === itemId);
    if (!currentItem) return;
    if (updates.completed === true && currentItem.completed) return;

    const isNewCompletion = updates.completed === true && currentItem && !currentItem.completed;

    if (isNewCompletion) {
      recentCompletionLocks.current.set(itemId, Date.now() + 900);
      updatesWithTimestamp.completedAt = now;
      playCompletionSound();
      import('@/utils/reminderScheduler').then(({ cancelTaskReminder }) => {
        cancelTaskReminder(itemId).catch(console.warn);
      });
    }
    if (updates.completed === false && currentItem?.completed) {
      updatesWithTimestamp.completedAt = undefined;
    }

    // Handle recurring tasks
    if (currentItem && isNewCompletion) {
      if (currentItem.repeatType && currentItem.repeatType !== 'none') {
        const nextTask = createNextRecurringTask(currentItem);
        if (nextTask) {
          const nextTaskWithTimestamps = { ...nextTask, createdAt: now, modifiedAt: now };
          const updatedCurrent = { ...currentItem, ...updatesWithTimestamp } as TodoItem;
          setItems(prev => {
            const next = [nextTaskWithTimestamps, ...prev.map(i => i.id === itemId ? { ...i, ...updatesWithTimestamp } : i)];
            itemsRef.current = next;
            return next;
          });
          void updateTaskInDB(itemId, updatesWithTimestamp);
          import('@/utils/cloudSync/storeBridge').then(({ pushTasks }) => pushTasks([updatedCurrent, nextTaskWithTimestamps] as TodoItem[])).catch(() => {});
          toast.success(t('todayPage.recurringTaskCompleted'), { icon: '🔄' });
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
          return;
        }
      }
    }

    const updatedItem = { ...currentItem, ...updatesWithTimestamp } as TodoItem;
    setItems(prev => {
      const next = prev.map(i => i.id === itemId ? { ...i, ...updatesWithTimestamp } : i);
      itemsRef.current = next;
      return next;
    });
    void updateTaskInDB(itemId, updatesWithTimestamp);
    import('@/utils/cloudSync/storeBridge').then(({ pushTasks }) => pushTasks([updatedItem])).catch(() => {});

    if (isNewCompletion) {
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
      toast.success(t('todayPage.taskCompleted'), { duration: 1500 });
    }
  }, [setItems, t, softRequireMutate]);

  const deleteItem = useCallback(async (itemId: string, _showUndo: boolean = false, skipConfirm: boolean = false) => {
    if (!softRequireMutate()) return;
    const deletedItem = itemsRef.current.find(item => item.id === itemId);
    if (!deletedItem) return;
    
    if (tasksSettings.confirmBeforeDelete && !skipConfirm) {
      setDeleteConfirmItem(deletedItem);
      return;
    }
    
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    trackDeletion(itemId, 'tasks');
    setItems(prev => {
      const next = prev.filter(item => item.id !== itemId);
      itemsRef.current = next;
      return next;
    });
    void deleteTaskFromDB(itemId);
    toast.success(t('todayPage.taskDeleted'), { duration: 1500 });
  }, [tasksSettings.confirmBeforeDelete, setItems, setDeleteConfirmItem, t, softRequireMutate]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmItem) return;
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    const deletedItem = deleteConfirmItem;
    trackDeletion(deletedItem.id, 'tasks');
    setItems(prev => {
      const next = prev.filter(item => item.id !== deletedItem.id);
      itemsRef.current = next;
      return next;
    });
    void deleteTaskFromDB(deletedItem.id);
    setDeleteConfirmItem(null);
    toast.success(t('todayPage.taskDeleted'), { duration: 1500 });
  }, [deleteConfirmItem, setItems, setDeleteConfirmItem, t]);

  const duplicateTask = useCallback(async (task: TodoItem) => {
    // Enforce per-folder + global free-plan limits on duplicates
    const folderTasksCount = itemsRef.current.filter(t => (t.folderId || null) === (task.folderId || null)).length;
    if (!requireCapacity('tasksPerFolder', folderTasksCount)) return;
    if (!isPro && !softRequireCreate('tasks', itemsRef.current.length)) return;
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
    const duplicatedTask: TodoItem = { ...task, id: genId(), completed: false, text: `${task.text} (Copy)` };
    setItems(prev => [duplicatedTask, ...prev]);
  }, [setItems, requireCapacity, softRequireCreate, isPro]);

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
      ...item, id: genId(), completed: option === 'all-reset' ? false : item.completed, text: `${item.text} (Copy)`
    }));
    setItems(prev => [...duplicated, ...prev]);
    toast.success(t('todayPage.duplicatedTasks', { count: duplicated.length }));
  }, [items, selectedFolderId, isPro, requireCapacity, softRequireCreate, setItems, t]);

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
        selectedItems.forEach(item => {
          trackDeletion(item.id, 'tasks');
          void deleteTaskFromDB(item.id);
        });
        setItems(prev => {
          const next = prev.filter(i => !selectedTaskIds.has(i.id));
          itemsRef.current = next;
          return next;
        });
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
        const duplicated = dupSlice.map((item, idx) => ({ ...item, id: genId(), completed: false, text: `${item.text} (Copy)` }));
        setItems(prev => [...duplicated, ...prev]);
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
  }, [items, selectedTaskIds, uncompletedItems, requireFeature, setItems, setSelectedTaskIds, setIsSelectionMode, setIsMoveToFolderOpen, setIsPrioritySheetOpen, setIsBulkDateSheetOpen, setIsBulkReminderSheetOpen, setIsBulkRepeatSheetOpen, setIsBulkSectionMoveOpen, setIsBulkStatusOpen, setIsSelectActionsOpen, convertToNotes, t]);

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
