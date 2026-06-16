/**
 * Task Comments — REMOVED.
 * Firebase RTDB team comments have been removed.
 * This file is kept as a stub to prevent import errors.
 */

export interface TaskComment {
  id: string;
  taskId: string;
  teamId: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  createdAt: string;
  editedAt?: string;
}

export const addTaskComment = async (..._args: any[]): Promise<TaskComment> => { throw new Error('Team features removed'); };
export const deleteTaskComment = async (..._args: any[]): Promise<void> => {};
export const editTaskComment = async (..._args: any[]): Promise<void> => {};
export const getTaskComments = async (..._args: any[]): Promise<TaskComment[]> => [];
export const onTaskCommentsChanged = (..._args: any[]): (() => void) => () => {};
export const getTaskCommentCount = async (..._args: any[]): Promise<number> => 0;
