// Persistent in-memory cache for notes folders (Notebooks).
// Keeps folder data alive when Notebooks / NotebookDetail unmount during
// bottom-nav switches so the UI shows folders instantly on re-mount.
import type { Folder as FolderType } from '@/types/note';

type NotebooksCache = {
  folders: FolderType[] | null;
  loaded: boolean;
};

export const notebooksRuntimeCache: NotebooksCache = ((globalThis as any)
  .__flowistNotebooksRuntimeCache ??= {
  folders: null,
  loaded: false,
});

export const setNotebooksCache = (folders: FolderType[]) => {
  notebooksRuntimeCache.folders = folders;
  notebooksRuntimeCache.loaded = true;
};
