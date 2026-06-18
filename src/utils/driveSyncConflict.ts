// Stub — Drive sync removed. No-op conflict module.
export type ConflictCategory =
  | 'notes' | 'tasks' | 'habits' | 'folders' | 'settings'
  | 'streaks' | 'gamification' | 'journey' | 'tags';

export type ConflictResolution = 'keep_local' | 'keep_remote' | 'merge';

export interface SyncConflict {
  category: ConflictCategory;
  localHash: string;
  remoteHash: string;
  localData?: any;
  remoteData?: any;
  detectedAt: number;
}

export const quickHash = (_data: any): string => '';
export const getStoredHash = async (_cat: ConflictCategory): Promise<string> => '';
export const storeHash = async (_cat: ConflictCategory, _data: any): Promise<void> => {};
export const detectConflict = async (..._args: any[]): Promise<SyncConflict | null> => null;
export const getPendingConflicts = (): SyncConflict[] => [];
export const requestConflictResolution = (..._args: any[]): Promise<ConflictResolution> =>
  Promise.resolve('keep_local');
export const resolveConflict = (..._args: any[]): void => {};
export const resolveAllConflicts = (_resolution: ConflictResolution): void => {};
export const mergeArraysById = <T,>(local: T[], _remote: T[]): T[] => local;
