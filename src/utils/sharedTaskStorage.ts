/**
 * Shared Team Tasks — REMOVED.
 * Firebase RTDB team features have been removed.
 * This file is kept as a stub to prevent import errors.
 */

export type SharedTaskPriority = 'high' | 'medium' | 'low' | 'none';
export type SharedTaskStatus = 'todo' | 'in_progress' | 'done';

export interface SharedTask {
  id: string;
  teamId: string;
  listId: string;
  title: string;
  description?: string;
  status: SharedTaskStatus;
  priority: SharedTaskPriority;
  assignedTo?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  completedAt?: string;
}

export interface SharedTaskList {
  id: string;
  teamId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

// All functions are no-ops
export const createSharedTaskList = async (): Promise<SharedTaskList> => { throw new Error('Team features removed'); };
export const getSharedTaskLists = async (): Promise<SharedTaskList[]> => [];
export const deleteSharedTaskList = async (): Promise<void> => {};
export const createSharedTask = async (): Promise<SharedTask> => { throw new Error('Team features removed'); };
export const updateSharedTask = async (): Promise<void> => {};
export const deleteSharedTask = async (): Promise<void> => {};
export const getSharedTasks = async (): Promise<SharedTask[]> => [];
export const onSharedTasksChanged = (): (() => void) => () => {};
export const onSharedTaskListsChanged = (): (() => void) => () => {};
