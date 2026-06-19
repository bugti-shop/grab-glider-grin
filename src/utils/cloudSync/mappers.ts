/**
 * Field mappers between local models and Supabase sync tables.
 *
 * Each mapper picks the subset of fields the cloud schema actually owns and
 * coerces date types. Extra fields stay local — this keeps the mirror
 * non-destructive: we never erase local data because the cloud row was
 * missing a field.
 */
import type { Note, TodoItem, TaskSection } from '@/types/note';
import type { Habit } from '@/types/habit';
import type { SyncTable } from './syncTables';

const iso = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') { const d = new Date(v); return isNaN(+d) ? null : d.toISOString(); }
  return null;
};
const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const reviveDates = <T extends Record<string, any>>(value: T | null | undefined, keys: string[]): T | null => {
  if (!value || typeof value !== 'object') return null;
  const next: Record<string, any> = { ...value };
  for (const key of keys) if (next[key]) next[key] = new Date(next[key]);
  if (Array.isArray(next.subtasks)) next.subtasks = next.subtasks.map((item: any) => reviveDates(item, keys) ?? item);
  if (Array.isArray(next.voiceRecordings)) {
    next.voiceRecordings = next.voiceRecordings.map((item: any) => ({ ...item, timestamp: item?.timestamp ? new Date(item.timestamp) : new Date() }));
  }
  return next as T;
};

const payloadObject = (r: any): Record<string, any> | null =>
  r?.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : null;

export const mappers = {
  folders: {
    toCloud(f: any, store: 'notes' | 'tasks' = 'notes') {
      if (!isUuid(f.id)) return null;
      return {
        id: f.id,
        name: f.name,
        color: f.color ?? null,
        icon: f.icon ?? null,
        parent_folder_id: isUuid(f.parentId) ? f.parentId : null,
        order_index: typeof f.order === 'number' ? f.order : 0,
        payload: { ...f, __flowistFolderStore: store },
        is_deleted: false,
        created_at: iso(f.createdAt),
        updated_at: iso(f.updatedAt) ?? iso(f.modifiedAt) ?? iso(f.createdAt) ?? new Date().toISOString(),
      };
    },
    fromCloud(r: any): any | null {
      if (!r?.id) return null;
      const payload = reviveDates(payloadObject(r), ['createdAt', 'updatedAt', 'modifiedAt']);
      return {
        ...(payload ?? {}),
        id: r.id,
        name: r.name ?? '',
        color: r.color ?? undefined,
        icon: r.icon ?? undefined,
        parentId: r.parent_folder_id ?? payload?.parentId,
        isDefault: payload?.isDefault ?? false,
        createdAt: new Date(r.created_at ?? Date.now()),
        updatedAt: new Date(r.updated_at ?? Date.now()),
      };
    },
  },

  notes: {
    toCloud(n: Note) {
      if (!isUuid(n.id)) return null;
      return {
        id: n.id,
        title: n.title ?? null,
        body: n.content ?? null,
        folder_id: isUuid(n.folderId) ? n.folderId : null,
        is_pinned: !!n.isPinned,
        tags: Array.isArray(n.tagIds) ? n.tagIds : [],
        payload: n,
        is_deleted: !!n.isDeleted,
        created_at: iso(n.createdAt),
        updated_at: iso(n.updatedAt) ?? new Date().toISOString(),
      };
    },
    /** Partial merge — only fields the cloud row owns. */
    mergeCloud(local: Note | undefined, r: any): Partial<Note> & { id: string } {
      const payload = reviveDates(payloadObject(r), ['createdAt', 'updatedAt', 'archivedAt', 'deletedAt', 'reminderTime']);
      return {
        ...(local ?? {}),
        ...(payload ?? {}),
        id: r.id,
        title: r.title ?? local?.title ?? '',
        content: r.body ?? local?.content ?? '',
        folderId: r.folder_id ?? local?.folderId,
        isPinned: !!r.is_pinned,
        tagIds: Array.isArray(r.tags) ? r.tags : (local?.tagIds ?? []),
        isDeleted: !!r.is_deleted,
        updatedAt: new Date(r.updated_at ?? Date.now()),
        createdAt: local?.createdAt ?? new Date(r.created_at ?? Date.now()),
      } as Partial<Note> & { id: string };
    },
  },

  tasks: {
    toCloud(t: TodoItem & { folderId?: string; listId?: string; orderIndex?: number; priorityNum?: number }) {
      if (!isUuid(t.id)) return null;
      const prio = ({ high: 3, medium: 2, low: 1, none: 0 } as Record<string, number>)[String((t as any).priority)] ?? 0;
      return {
        id: t.id,
        title: (t as any).text ?? (t as any).title ?? '',
        due_date: iso((t as any).dueDate),
        is_completed: !!(t as any).completed,
        completed_at: iso((t as any).completedAt),
        priority: prio,
        list_id: isUuid((t as any).listId) ? (t as any).listId : null,
        parent_task_id: isUuid((t as any).parentId) ? (t as any).parentId : null,
        order_index: typeof (t as any).order === 'number' ? (t as any).order : 0,
        notes: (t as any).notes ?? null,
        reminder_at: iso((t as any).reminderTime),
        is_deleted: !!(t as any).isDeleted,
        created_at: iso((t as any).createdAt),
        updated_at: iso((t as any).updatedAt) ?? new Date().toISOString(),
      };
    },
    mergeCloud(local: TodoItem | undefined, r: any): Partial<TodoItem> & { id: string } {
      const prioMap = ['none', 'low', 'medium', 'high'] as const;
      return {
        ...(local ?? {}),
        id: r.id,
        text: r.title ?? (local as any)?.text ?? '',
        completed: !!r.is_completed,
        completedAt: r.completed_at ? new Date(r.completed_at) : (local as any)?.completedAt,
        dueDate: r.due_date ? new Date(r.due_date) : (local as any)?.dueDate,
        priority: prioMap[Math.max(0, Math.min(3, r.priority ?? 0))],
        notes: r.notes ?? (local as any)?.notes,
        reminderTime: r.reminder_at ? new Date(r.reminder_at) : (local as any)?.reminderTime,
        isDeleted: !!r.is_deleted,
        updatedAt: new Date(r.updated_at ?? Date.now()),
      } as Partial<TodoItem> & { id: string };
    },
  },

  habits: {
    toCloud(h: Habit) {
      if (!isUuid(h.id)) return null;
      return {
        id: h.id,
        name: (h as any).name ?? (h as any).title ?? '',
        frequency: (h as any).frequency ?? 'daily',
        frequency_config: (h as any).frequencyConfig ?? {},
        current_streak: (h as any).currentStreak ?? 0,
        longest_streak: (h as any).longestStreak ?? 0,
        color: (h as any).color ?? null,
        icon: (h as any).icon ?? null,
        is_deleted: !!(h as any).isDeleted,
        created_at: iso((h as any).createdAt),
        updated_at: iso((h as any).updatedAt) ?? new Date().toISOString(),
      };
    },
    mergeCloud(local: Habit | undefined, r: any): Partial<Habit> & { id: string } {
      return {
        ...(local ?? {}),
        id: r.id,
        name: r.name,
        frequency: r.frequency,
        currentStreak: r.current_streak ?? 0,
        longestStreak: r.longest_streak ?? 0,
        color: r.color ?? undefined,
        icon: r.icon ?? undefined,
        isDeleted: !!r.is_deleted,
        updatedAt: new Date(r.updated_at ?? Date.now()),
      } as unknown as Partial<Habit> & { id: string };
    },
  },
};

export type MappedTable = Extract<SyncTable, 'folders' | 'notes' | 'tasks' | 'habits'>;
