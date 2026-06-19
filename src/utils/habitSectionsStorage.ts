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

export const addHabitSection = (name: string): HabitSection => {
  const sections = loadHabitSections();
  const section: HabitSection = {
    id: genId(),
    name: name.trim() || 'Section',
    order: sections.length,
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

export const deleteHabitSection = (id: string) => {
  const sections = loadHabitSections().filter((s) => s.id !== id);
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

export const DEFAULT_HABIT_SECTION_ID = 'others';
