// Google Drive integration has been removed.
// This file is kept as a no-op stub so existing imports across the app
// continue to resolve. Google sign-in is still used for authentication only.

export interface SyncCategoryProgress {
  category: string;
  status: 'pending' | 'uploading' | 'downloading' | 'done' | 'error';
  progress?: number;
  error?: string;
}

export interface SyncProgressEvent {
  phase: 'upload' | 'download' | 'idle';
  categories: SyncCategoryProgress[];
  overall: number;
}

const noop = async (..._args: any[]): Promise<any> => undefined;

export const upsertFile = noop as (fileName: string, data: any) => Promise<string>;
export const downloadFile = noop as <T>(fileName: string) => Promise<T | null>;
export const deleteNamedFile = noop as (fileName: string) => Promise<void>;
export const deleteAllDriveData = noop as () => Promise<void>;
export const uploadToDrive = noop as () => Promise<void>;
export const downloadFromDrive = noop as () => Promise<void>;
export const uploadCategory = noop as (category: string, ...rest: any[]) => Promise<void>;
export const syncNotesToDrive = noop;
export const syncTasksToDrive = noop;
export const syncHabitsToDrive = noop;
export const syncFoldersToDrive = noop;
export const syncSettingsToDrive = noop;
export const syncTagsToDrive = noop;
export const syncStreaksToDrive = noop;
export const syncGamificationToDrive = noop;
export const syncJourneyToDrive = noop;
export const restoreFromDrive = noop as () => Promise<void>;
export const syncWithDrive = noop as () => Promise<void>;
export const startAutoSync = noop as () => Promise<void>;
export const stopAutoSync = (): void => {};
export const setupManualSyncListener = (): (() => void) => () => {};
