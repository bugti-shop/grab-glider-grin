import type { Folder } from '@/types/note';

/** Curated set of lucide-react icon names safe to use across the app. */
export const FOLDER_ICON_NAMES = [
  'Folder', 'FolderHeart', 'FolderKanban', 'FolderOpen',
  'Briefcase', 'Home', 'Heart', 'Star',
  'ShoppingCart', 'ShoppingBag', 'Gift',
  'Book', 'BookOpen', 'GraduationCap', 'Lightbulb',
  'Plane', 'Car', 'MapPin',
  'Calendar', 'Clock', 'AlarmClock',
  'Users', 'User', 'Baby',
  'Code', 'Cpu', 'Bug',
  'Coffee', 'Pizza', 'Music', 'Camera', 'Dumbbell',
  'DollarSign', 'CreditCard', 'PiggyBank',
  'CheckSquare', 'ListChecks', 'Flag', 'Target', 'Trophy',
] as const;

export type FolderIconName = typeof FOLDER_ICON_NAMES[number];

/** Direct children of `parentId` (null/undefined = root). */
export const getChildFolders = (folders: Folder[], parentId: string | null | undefined): Folder[] =>
  folders.filter(f => (f.parentId || null) === (parentId || null));

/** All descendant ids (recursive) of `folderId`, NOT including itself. */
export const getDescendantFolderIds = (folders: Folder[], folderId: string): string[] => {
  const out: string[] = [];
  const walk = (id: string) => {
    folders.forEach(f => {
      if (f.parentId === id) {
        out.push(f.id);
        walk(f.id);
      }
    });
  };
  walk(folderId);
  return out;
};

/** Folder id + all descendant ids — convenient for "include subfolders" filters. */
export const getFolderAndDescendantIds = (folders: Folder[], folderId: string): string[] => {
  return [folderId, ...getDescendantFolderIds(folders, folderId)];
};

/** Breadcrumb from root to this folder (inclusive). */
export const getFolderPath = (folders: Folder[], folderId: string): Folder[] => {
  const path: Folder[] = [];
  let current: Folder | undefined = folders.find(f => f.id === folderId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined;
  }
  return path;
};

/** True if setting `candidateParent` as parent of `folderId` would create a cycle. */
export const wouldCreateCycle = (
  folders: Folder[],
  folderId: string,
  candidateParent: string | null | undefined,
): boolean => {
  if (!candidateParent) return false;
  if (candidateParent === folderId) return true;
  return getDescendantFolderIds(folders, folderId).includes(candidateParent);
};

/** Returns the folder depth (root = 0). */
export const getFolderDepth = (folders: Folder[], folderId: string): number => {
  return Math.max(0, getFolderPath(folders, folderId).length - 1);
};
