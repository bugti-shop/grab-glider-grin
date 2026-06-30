import { HabitSection } from '@/types/habit';
import { genId } from './genId';

const KEY = 'habit-sections-v1';

const DEFAULTS: HabitSection[] = [
  { id: 'morning', name: 'Morning', order: 0 },
  { id: 'afternoon', name: 'Afternoon', order: 1 },
  { id: 'night', name: 'Night', order: 2 },
  { id: 'others', name: 'Others', order: 3 },
];

export const loadHabitSections = (): HabitSection[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...DEFAULTS];
    const parsed = JSON.parse(raw) as HabitSection[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULTS];
    return parsed.sort((a, b) => a.order - b.order);
  } catch {
    return [...DEFAULTS];
  }
};

const writeLocal = (sections: HabitSection[]) => {
  localStorage.setItem(KEY, JSON.stringify(sections));
  window.dispatchEvent(new Event('habitSectionsUpdated'));
};

export const saveHabitSections = (sections: HabitSection[]) => {
  writeLocal(sections);
  import('@/utils/cloudSync/storeBridge').then(({ pushHabitSections }) => {
    try { pushHabitSections(sections); } catch {}
  }).catch(() => {});
};

/** Apply cloud snapshot — replaces local list and skips re-push. */
export const _applyCloudHabitSections = (sections: HabitSection[]) => {
  writeLocal(sections.sort((a, b) => a.order - b.order));
};

export const addHabitSection = (name: string, parentSectionId?: string): HabitSection => {
  const sections = loadHabitSections();
  const section: HabitSection = {
    id: genId(),
    name: name.trim() || 'Section',
    order: sections.length,
    parentSectionId: parentSectionId || undefined,
  };
  saveHabitSections([...sections, section]);
  return section;
};

export const renameHabitSection = (id: string, name: string) => {
  const sections = loadHabitSections().map((s) =>
    s.id === id ? { ...s, name: name.trim() || s.name } : s
  );
  saveHabitSections(sections);
};

export const setHabitSectionParent = (id: string, parentSectionId: string | null) => {
  // Prevent self-parenting and 2+ level nesting (parent cannot itself be a child).
  const sections = loadHabitSections();
  if (id === parentSectionId) return;
  if (parentSectionId) {
    const parent = sections.find((s) => s.id === parentSectionId);
    if (parent?.parentSectionId) return; // parent is already nested → reject to keep depth=1
    // Prevent making a parent into a child if it has children.
    const target = sections.find((s) => s.id === id);
    if (target && sections.some((s) => s.parentSectionId === id)) return;
  }
  const next = sections.map((s) =>
    s.id === id ? { ...s, parentSectionId: parentSectionId || undefined } : s
  );
  saveHabitSections(next);
};

export const deleteHabitSection = (id: string) => {
  // Re-parent any children to root so nothing is orphaned.
  const sections = loadHabitSections()
    .filter((s) => s.id !== id)
    .map((s) => (s.parentSectionId === id ? { ...s, parentSectionId: undefined } : s));
  writeLocal(sections);
  import('@/utils/cloudSync/storeBridge').then(({ pushHabitSectionDelete }) => {
    try { pushHabitSectionDelete(id); } catch {}
  }).catch(() => {});
};

export const reorderHabitSections = (ids: string[]) => {
  const map = new Map(loadHabitSections().map((s) => [s.id, s]));
  const reordered = ids
    .map((id, i) => {
      const s = map.get(id);
      return s ? { ...s, order: i } : null;
    })
    .filter(Boolean) as HabitSection[];
  saveHabitSections(reordered);
};

/** Returns sections grouped as `{ root, childrenByParent }` for nested rendering. */
export const getHabitSectionTree = (): {
  root: HabitSection[];
  childrenByParent: Record<string, HabitSection[]>;
} => {
  const all = loadHabitSections();
  const root: HabitSection[] = [];
  const childrenByParent: Record<string, HabitSection[]> = {};
  for (const s of all) {
    if (s.parentSectionId && all.some((p) => p.id === s.parentSectionId)) {
      (childrenByParent[s.parentSectionId] ||= []).push(s);
    } else {
      root.push(s);
    }
  }
  Object.values(childrenByParent).forEach((arr) => arr.sort((a, b) => a.order - b.order));
  return { root: root.sort((a, b) => a.order - b.order), childrenByParent };
};

export const DEFAULT_HABIT_SECTION_ID = 'others';
