/**
 * Task Order Storage - Persists custom task ordering to IndexedDB
 */

import { getSetting, setSetting } from './settingsStorage';

const TASK_ORDER_KEY = 'taskCustomOrder';

interface SparseTaskOrder {
  version: 2;
  ranks: Record<string, number>;
}

interface TaskOrderMap {
  [sectionId: string]: string[] | SparseTaskOrder; // legacy ids array or sparse rank map
}

const isSparseOrder = (value: TaskOrderMap[string]): value is SparseTaskOrder => {
  return !!value && !Array.isArray(value) && typeof value === 'object' && 'ranks' in value;
};

// In-memory cache for synchronous access
let orderCache: TaskOrderMap | null = null;

/**
 * Load custom task order (sync version using cache)
 */
export const loadTaskOrder = (): TaskOrderMap => {
  return orderCache || {};
};

/**
 * Initialize order cache from IndexedDB (call on app startup)
 */
export const initializeTaskOrder = async (): Promise<void> => {
  orderCache = await getSetting<TaskOrderMap>(TASK_ORDER_KEY, {});
};

/**
 * Save custom task order to IndexedDB
 */
export const saveTaskOrder = (order: TaskOrderMap): void => {
  orderCache = order;
  setSetting(TASK_ORDER_KEY, order);
  window.dispatchEvent(new Event('taskOrderChanged'));
};

/**
 * Update order for a specific section
 */
export const updateSectionOrder = (sectionId: string, taskIds: string[]): void => {
  const currentOrder = loadTaskOrder();
  currentOrder[sectionId] = taskIds;
  saveTaskOrder(currentOrder);
};

/**
 * Persist a reorder without writing a huge id array. Used by virtualized lists:
 * moving one row updates one numeric rank, so drag/drop stays fast even when a
 * section has hundreds of thousands of tasks.
 */
export const moveTaskInSectionOrder = (
  sectionId: string,
  orderedTaskIds: string[],
  fromIndex: number,
  toIndex: number,
): void => {
  if (fromIndex === toIndex) return;
  const movedId = orderedTaskIds[fromIndex];
  if (!movedId) return;

  const currentOrder = loadTaskOrder();
  const existing = currentOrder[sectionId];
  const ranks: Record<string, number> = isSparseOrder(existing) ? { ...existing.ranks } : {};
  const originalIndex = new Map(orderedTaskIds.map((id, index) => [id, index]));
  const withoutMoved = orderedTaskIds.filter((id) => id !== movedId);
  const beforeId = toIndex > 0 ? withoutMoved[toIndex - 1] : undefined;
  const afterId = withoutMoved[toIndex] ?? undefined;
  const fallbackRank = (id: string | undefined) => {
    if (!id) return undefined;
    return Number.isFinite(ranks[id]) ? ranks[id] : (originalIndex.get(id) ?? 0) * 1024;
  };
  const beforeRank = fallbackRank(beforeId);
  const afterRank = fallbackRank(afterId);

  let nextRank: number;
  if (beforeRank === undefined && afterRank === undefined) nextRank = 0;
  else if (beforeRank === undefined) nextRank = afterRank! - 1024;
  else if (afterRank === undefined) nextRank = beforeRank + 1024;
  else nextRank = (beforeRank + afterRank) / 2;

  ranks[movedId] = nextRank;
  currentOrder[sectionId] = { version: 2, ranks };
  saveTaskOrder(currentOrder);
};

/**
 * Get order for a specific section
 */
export const getSectionOrder = (sectionId: string): string[] => {
  const order = loadTaskOrder();
  const value = order[sectionId];
  return Array.isArray(value) ? value : [];
};

export const getSectionRanks = (sectionId: string): Record<string, number> => {
  const value = loadTaskOrder()[sectionId];
  return isSparseOrder(value) ? value.ranks : {};
};

/**
 * Apply saved order to tasks within a section
 */
export const applyTaskOrder = <T extends { id: string }>(
  tasks: T[], 
  sectionId: string
): T[] => {
  const savedOrder = getSectionOrder(sectionId);
  const ranks = getSectionRanks(sectionId);
  const hasRanks = Object.keys(ranks).length > 0;
  if (savedOrder.length === 0 && !hasRanks) return tasks;

  if (hasRanks) {
    const rankedTasks = tasks
      .filter((task) => Number.isFinite(ranks[task.id]))
      .sort((a, b) => ranks[a.id] - ranks[b.id]);
    const rankedIds = new Set(rankedTasks.map((task) => task.id));
    const orderedTasks: T[] = [];
    let rankedIndex = 0;

    for (let i = 0; i < tasks.length; i += 1) {
      const fallbackRank = i * 1024;
      while (rankedIndex < rankedTasks.length && ranks[rankedTasks[rankedIndex].id] <= fallbackRank) {
        orderedTasks.push(rankedTasks[rankedIndex]);
        rankedIndex += 1;
      }
      const task = tasks[i];
      if (!rankedIds.has(task.id)) orderedTasks.push(task);
    }

    while (rankedIndex < rankedTasks.length) {
      orderedTasks.push(rankedTasks[rankedIndex]);
      rankedIndex += 1;
    }

    return orderedTasks;
  }
  
  const orderedTasks: T[] = [];
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  
  // First, add tasks in saved order
  for (const taskId of savedOrder) {
    const task = taskMap.get(taskId);
    if (task) {
      orderedTasks.push(task);
      taskMap.delete(taskId);
    }
  }
  
  // Then add any remaining tasks (new tasks not in saved order)
  for (const task of taskMap.values()) {
    orderedTasks.push(task);
  }
  
  return orderedTasks;
};

/**
 * Clear all saved task orders
 */
export const clearAllTaskOrders = (): void => {
  orderCache = {};
  setSetting(TASK_ORDER_KEY, {});
};

/**
 * Remove a specific task from all orders (when task is deleted)
 */
export const removeTaskFromOrders = (taskId: string): void => {
  const order = loadTaskOrder();
  let changed = false;
  
  for (const sectionId of Object.keys(order)) {
    const entry = order[sectionId];
    if (Array.isArray(entry)) {
      const idx = entry.indexOf(taskId);
      if (idx !== -1) {
        entry.splice(idx, 1);
        changed = true;
      }
    } else if (isSparseOrder(entry) && taskId in entry.ranks) {
      delete entry.ranks[taskId];
      changed = true;
    }
  }
  
  if (changed) {
    saveTaskOrder(order);
  }
};