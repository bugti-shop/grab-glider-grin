// Folder storage utilities for notes and tasks — IndexedDB backed
import { getSetting, setSetting } from '@/utils/settingsStorage';

export interface Folder {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  type: 'notes' | 'tasks' | 'both';
  createdAt: Date;
  updatedAt: Date;
}

const FOLDERS_KEY = 'nota_folders';

export const loadFolders = async (): Promise<Folder[]> => {
  try {
    const stored = await getSetting<any[]>(FOLDERS_KEY, []);
    if (!stored || stored.length === 0) return [];
    
    return stored.map((folder: any) => ({
      ...folder,
      createdAt: new Date(folder.createdAt),
      updatedAt: new Date(folder.updatedAt),
    }));
  } catch (error) {
    console.error('Error loading folders:', error);
    return [];
  }
};

export const saveFolders = async (folders: Folder[]): Promise<void> => {
  try {
    const serialized = folders.map(folder => ({
      ...folder,
      createdAt: folder.createdAt instanceof Date ? folder.createdAt.toISOString() : folder.createdAt,
      updatedAt: folder.updatedAt instanceof Date ? folder.updatedAt.toISOString() : folder.updatedAt,
    }));
    await setSetting(FOLDERS_KEY, serialized);
    window.dispatchEvent(new Event('foldersUpdated'));
    // Auto-sync folders to Google Drive
    import('@/utils/googleDriveSync').then(({ syncFoldersToDrive }) => {
      syncFoldersToDrive().catch(() => {});
    });
  } catch (error) {
    console.error('Error saving folders:', error);
  }
};

export const createFolder = async (folder: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Folder> => {
  const newFolder: Folder = {
    ...folder,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  const folders = await loadFolders();
  folders.push(newFolder);
  await saveFolders(folders);
  
  return newFolder;
};

export const updateFolder = async (id: string, updates: Partial<Folder>): Promise<Folder | null> => {
  const folders = await loadFolders();
  const index = folders.findIndex(f => f.id === id);
  
  if (index === -1) return null;
  
  folders[index] = {
    ...folders[index],
    ...updates,
    updatedAt: new Date(),
  };
  
  await saveFolders(folders);
  return folders[index];
};

export const deleteFolder = async (id: string): Promise<boolean> => {
  const folders = await loadFolders();
  const filtered = folders.filter(f => f.id !== id);

  if (filtered.length === folders.length) return false;

  await saveFolders(filtered);

  // Track deletion for cross-device sync and upload immediately
  import('@/utils/deletionTracker').then(({ trackDeletion, loadDeletions }) => {
    trackDeletion(id, 'folders');
    import('@/utils/googleDriveSync').then(({ uploadCategory }) => {
      uploadCategory('flowist_deletions.json', loadDeletions()).catch(() => {});
    });
  });

  return true;
};