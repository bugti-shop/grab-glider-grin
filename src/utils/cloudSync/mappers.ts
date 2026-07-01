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
        notes: (t as any).description ?? (t as any).notes ?? null,
        reminder_at: iso((t as any).reminderTime),
        folder_id: isUuid((t as any).folderId) ? (t as any).folderId : null,
        section_id: isUuid((t as any).sectionId) ? (t as any).sectionId : null,
        payload: t,
        is_deleted: !!(t as any).isDeleted,
        created_at: iso((t as any).createdAt),
        updated_at: iso((t as any).modifiedAt) ?? iso((t as any).updatedAt) ?? iso((t as any).createdAt) ?? new Date().toISOString(),
      };
    },
    mergeCloud(local: TodoItem | undefined, r: any): Partial<TodoItem> & { id: string } {
      const prioMap = ['none', 'low', 'medium', 'high'] as const;
      const payload = reviveDates(payloadObject(r), ['createdAt', 'modifiedAt', 'updatedAt', 'completedAt', 'dueDate', 'scheduledDate', 'deadline', 'reminderTime', 'extraReminderTime']);
      return {
        ...(local ?? {}),
        ...(payload ?? {}),
        id: r.id,
        text: r.title ?? (local as any)?.text ?? '',
        completed: !!r.is_completed,
        completedAt: r.completed_at ? new Date(r.completed_at) : (local as any)?.completedAt,
        dueDate: r.due_date ? new Date(r.due_date) : (local as any)?.dueDate,
        priority: prioMap[Math.max(0, Math.min(3, r.priority ?? 0))],
        description: r.notes ?? (payload as any)?.description ?? (local as any)?.description,
        reminderTime: r.reminder_at ? new Date(r.reminder_at) : (local as any)?.reminderTime,
        folderId: r.folder_id ?? (payload as any)?.folderId ?? (local as any)?.folderId,
        sectionId: r.section_id ?? (payload as any)?.sectionId ?? (local as any)?.sectionId,
        isDeleted: !!r.is_deleted,
        modifiedAt: new Date(r.updated_at ?? Date.now()),
      } as Partial<TodoItem> & { id: string };
    },
  },

  sections: {
    toCloud(s: TaskSection) {
      if (!isUuid(s.id)) return null;
      return {
        id: s.id,
        name: s.name,
        order_index: typeof s.order === 'number' ? s.order : 0,
        folder_id: isUuid(s.folderId) ? s.folderId : null,
        payload: s,
        is_deleted: false,
        updated_at: new Date().toISOString(),
      };
    },
    fromCloud(r: any): TaskSection | null {
      if (!r?.id) return null;
      const payload = payloadObject(r) as Partial<TaskSection> | null;
      return {
        ...(payload ?? {}),
        id: r.id,
        name: r.name ?? payload?.name ?? '',
        color: payload?.color ?? '#3b82f6',
        isCollapsed: payload?.isCollapsed ?? false,
        order: typeof r.order_index === 'number' ? r.order_index : (payload?.order ?? 0),
        folderId: r.folder_id ?? payload?.folderId,
      };
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
        longest_streak: (h as any).bestStreak ?? (h as any).longestStreak ?? 0,
        color: (h as any).color ?? null,
        icon: (h as any).emoji ?? (h as any).icon ?? null,
        payload: h,
        is_deleted: !!(h as any).isArchived || !!(h as any).isDeleted,
        created_at: iso((h as any).createdAt),
        updated_at: iso((h as any).updatedAt) ?? new Date().toISOString(),
      };
    },
    mergeCloud(local: Habit | undefined, r: any): Partial<Habit> & { id: string } {
      const payload = (payloadObject(r) ?? {}) as any;
      return {
        ...(local ?? {}),
        ...payload,
        id: r.id,
        name: r.name ?? local?.name ?? payload.name ?? '',
        frequency: r.frequency ?? local?.frequency ?? payload.frequency,
        currentStreak: r.current_streak ?? payload.currentStreak ?? local?.currentStreak ?? 0,
        bestStreak: r.longest_streak ?? payload.bestStreak ?? local?.bestStreak ?? 0,
        color: r.color ?? payload.color ?? local?.color,
        emoji: payload.emoji ?? r.icon ?? (local as any)?.emoji,
        isArchived: !!r.is_deleted,
        updatedAt: new Date(r.updated_at ?? Date.now()).toISOString(),
      } as unknown as Partial<Habit> & { id: string };
    },
  },

  countdowns: {
    toCloud(c: any) {
      if (!isUuid(c.id)) return null;
      return {
        id: c.id,
        name: c.name ?? '',
        event_date: c.date ?? null,
        event_type: c.type ?? null,
        repeat: c.repeat ?? 'none',
        payload: c,
        is_deleted: false,
        created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
      };
    },
    mergeCloud(local: any | undefined, r: any): any {
      const payload = (payloadObject(r) ?? {}) as any;
      return {
        ...(local ?? {}),
        ...payload,
        id: r.id,
        name: r.name ?? payload.name ?? local?.name ?? '',
        date: r.event_date ?? payload.date ?? local?.date,
        type: r.event_type ?? payload.type ?? local?.type ?? 'countdown',
        repeat: r.repeat ?? payload.repeat ?? local?.repeat ?? 'none',
        createdAt: r.created_at ? +new Date(r.created_at) : (local?.createdAt ?? Date.now()),
        updatedAt: r.updated_at ? +new Date(r.updated_at) : Date.now(),
      };
    },
  },

  habitSections: {
    toCloud(s: any) {
      if (!isUuid(s.id)) return null;
      return {
        id: s.id,
        name: s.name ?? '',
        order_index: typeof s.order === 'number' ? s.order : 0,
        payload: s,
        is_deleted: false,
        updated_at: new Date().toISOString(),
      };
    },
    fromCloud(r: any): any | null {
      if (!r?.id) return null;
      const payload = (payloadObject(r) ?? {}) as any;
      return {
        ...payload,
        id: r.id,
        name: r.name ?? payload.name ?? '',
        order: typeof r.order_index === 'number' ? r.order_index : (payload.order ?? 0),
      };
    },
  },
};

export type MappedTable = Extract<SyncTable, 'folders' | 'notes' | 'tasks' | 'sections' | 'habits'>;
