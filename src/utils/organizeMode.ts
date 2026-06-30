// Display-mode preference: organize notes/tasks by Folders (default) or Tags.
// On switch to "tags", we mirror folder names into the global tag store so
// existing items remain reachable. Folders themselves are kept intact, so the
// user can switch back without losing data.

import { getSetting, setSetting } from '@/utils/settingsStorage';
import { getAllTags, createTag, TAG_COLORS, type AppTag } from '@/utils/tagStorage';
import { loadFolders as loadAppFolders } from '@/utils/folderStorage';
import { loadNotesFromDB, saveNotesToDB } from '@/utils/noteStorage';
import { loadTasksFromDB, saveTasksToDB } from '@/utils/taskStorage';

export type OrganizeMode = 'folders' | 'tags';
export type OrganizeScope = 'notes' | 'tasks';

const KEY: Record<OrganizeScope, string> = {
  notes: 'notesOrganizeMode',
  tasks: 'tasksOrganizeMode',
};

export const getOrganizeMode = async (scope: OrganizeScope): Promise<OrganizeMode> =>
  getSetting<OrganizeMode>(KEY[scope], 'folders');

const dispatchChange = (scope: OrganizeScope, mode: OrganizeMode) => {
  window.dispatchEvent(
    new CustomEvent('organizeModeChanged', { detail: { scope, mode } }),
  );
};

/** Ensure a global tag exists for every folder belonging to the given scope,
 *  and propagate that tagId onto items that live in those folders. Additive —
 *  never removes existing folderId / tagIds. Safe to run multiple times. */
const mirrorFoldersToTags = async (scope: OrganizeScope) => {
  // 1) Build folder list relevant to this scope.
  const appFolders = await loadAppFolders().catch(() => []);
  const settingsFolders = await getSetting<any[]>(
    scope === 'notes' ? 'folders' : 'todoFolders',
    [],
  );

  const wanted: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  const push = (id: any, name: any) => {
    if (!id || !name) return;
    const sid = String(id);
    if (seen.has(sid)) return;
    seen.add(sid);
    wanted.push({ id: sid, name: String(name) });
  };
  for (const f of appFolders) {
    if (f.type === scope || f.type === 'both') push(f.id, f.name);
  }
  for (const f of settingsFolders || []) push(f.id, f.name);

  if (wanted.length === 0) return;

  // 2) Create missing tags (case-insensitive name match).
  const existing = await getAllTags();
  const byName = new Map<string, AppTag>(
    existing.map((t) => [t.name.trim().toLowerCase(), t]),
  );
  const folderTagMap = new Map<string, string>(); // folderId -> tagId
  let colorIdx = existing.length;
  for (const f of wanted) {
    const key = f.name.trim().toLowerCase();
    const hit = byName.get(key);
    if (hit) {
      folderTagMap.set(f.id, hit.id);
    } else {
      const tag = await createTag(f.name, TAG_COLORS[colorIdx++ % TAG_COLORS.length]);
      folderTagMap.set(f.id, tag.id);
      byName.set(key, tag);
    }
  }

  // 3) Propagate tagId additively to items in those folders.
  if (scope === 'notes') {
    const notes = await loadNotesFromDB();
    let touched = false;
    const next = notes.map((n) => {
      const tagId = n.folderId ? folderTagMap.get(String(n.folderId)) : undefined;
      if (!tagId) return n;
      const existingIds = n.tagIds || [];
      if (existingIds.includes(tagId)) return n;
      touched = true;
      return { ...n, tagIds: [...existingIds, tagId] };
    });
    if (touched) await saveNotesToDB(next);
  } else {
    const tasks = await loadTasksFromDB();
    let touched = false;
    const next = tasks.map((task) => {
      const tagId = task.folderId ? folderTagMap.get(String(task.folderId)) : undefined;
      if (!tagId) return task;
      const existingIds = task.tagIds || [];
      if (existingIds.includes(tagId)) return task;
      touched = true;
      return { ...task, tagIds: [...existingIds, tagId] };
    });
    if (touched) await saveTasksToDB(next);
  }
};

export const setOrganizeMode = async (
  scope: OrganizeScope,
  mode: OrganizeMode,
): Promise<void> => {
  await setSetting(KEY[scope], mode);
  if (mode === 'tags') {
    try {
      await mirrorFoldersToTags(scope);
    } catch (e) {
      console.warn('[organizeMode] folder→tag mirroring failed', e);
    }
  }
  dispatchChange(scope, mode);
};
