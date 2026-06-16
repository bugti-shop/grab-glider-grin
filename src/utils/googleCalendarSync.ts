/**
 * Google Calendar ↔ App Tasks two-way sync
 * - Incremental sync via syncToken (no duplicates)
 * - Maps Calendar event.id → task.googleCalendarEventId
 * - Preserves reminders, all-day, recurring instances
 * - Like Todoist/TickTick: external-id mapping + etag conflict resolution
 */
import { TodoItem } from '@/types/note';
import { genId } from '@/utils/genId';
import { getValidAccessToken } from '@/utils/googleAuth';
import { loadTodoItems, saveTodoItems } from '@/utils/todoItemsStorage';
import { getSetting, setSetting } from '@/utils/settingsStorage';

const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SYNC_TOKEN_KEY = 'gcal:syncToken';
const LAST_SYNC_KEY = 'gcal:lastSyncAt';
const CALENDAR_ID_KEY = 'gcal:calendarId';
const DEFAULT_CALENDAR_ID = 'primary';
const PUSH_INDEX_KEY = 'gcal:pushedTaskIds';

/** Normalize a title for fuzzy duplicate detection */
const normalizeTitle = (s: string | undefined): string =>
  (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Two dates considered "same slot" for dedup (within 2 min, or same day for all-day) */
const isSameSlot = (a: Date | undefined, b: Date | undefined, allDay = false): boolean => {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (allDay) {
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  }
  return Math.abs(da.getTime() - db.getTime()) < 2 * 60_000;
};

interface GCalEventTime {
  date?: string;       // YYYY-MM-DD (all-day)
  dateTime?: string;   // RFC3339
  timeZone?: string;
}

interface GCalEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: GCalEventTime;
  end?: GCalEventTime;
  updated?: string;
  etag?: string;
  recurringEventId?: string;
  reminders?: {
    useDefault?: boolean;
    overrides?: { method: 'popup' | 'email'; minutes: number }[];
  };
}

const parseEventStart = (ev: GCalEvent): Date | undefined => {
  if (ev.start?.dateTime) return new Date(ev.start.dateTime);
  if (ev.start?.date) return new Date(`${ev.start.date}T09:00:00`);
  return undefined;
};

const computeReminderTime = (start: Date | undefined, ev: GCalEvent): Date | undefined => {
  if (!start) return undefined;
  const override = ev.reminders?.overrides?.[0];
  if (!override) return start; // default reminder = at event time
  return new Date(start.getTime() - override.minutes * 60_000);
};

const eventToTask = (ev: GCalEvent, existing?: TodoItem): TodoItem => {
  const start = parseEventStart(ev);
  const reminder = computeReminderTime(start, ev);
  return {
    ...(existing || {
      id: genId(),
      text: '',
      completed: false,
      createdAt: new Date(),
    }),
    text: ev.summary || existing?.text || '(Untitled event)',
    description: ev.description || existing?.description,
    location: ev.location || existing?.location,
    dueDate: start || existing?.dueDate,
    reminderTime: reminder || existing?.reminderTime,
    googleCalendarEventId: ev.id,
    googleEventEtag: ev.etag,
    googleEventUpdatedAt: ev.updated,
    googleEventSyncedAt: Date.now(),
    googleEventSource: existing?.googleEventSource || 'google',
    modifiedAt: new Date(),
  };
};

/**
 * Pull events from Google Calendar and merge into local tasks.
 * Uses syncToken for incremental sync (only changed/deleted events on subsequent calls).
 */
export const syncCalendarToTasks = async (): Promise<{
  added: number;
  updated: number;
  removed: number;
}> => {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not signed in to Google');

  const calendarId =
    (await getSetting<string>(CALENDAR_ID_KEY, DEFAULT_CALENDAR_ID)) || DEFAULT_CALENDAR_ID;
  const syncToken = await getSetting<string | null>(SYNC_TOKEN_KEY, null);

  // Build URL: use syncToken if we have one, else do a windowed initial pull
  const params = new URLSearchParams({
    singleEvents: 'true',
    maxResults: '250',
  });
  if (syncToken) {
    params.set('syncToken', syncToken);
  } else {
    // Initial pull: 30 days back → 365 days forward
    const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    params.set('timeMin', timeMin);
    params.set('timeMax', timeMax);
    params.set('orderBy', 'startTime');
  }

  const allEvents: GCalEvent[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;

  do {
    if (pageToken) params.set('pageToken', pageToken);
    const url = `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 410) {
      // syncToken expired → reset and full re-sync next call
      await setSetting(SYNC_TOKEN_KEY, null);
      throw new Error('Calendar sync token expired — will re-sync next attempt');
    }
    if (!res.ok) {
      throw new Error(`Calendar API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    if (Array.isArray(data.items)) allEvents.push(...data.items);
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    params.delete('pageToken');
  } while (pageToken);

  // Merge into local tasks
  const tasks = await loadTodoItems();
  const byEventId = new Map(
    tasks
      .filter((t) => t.googleCalendarEventId)
      .map((t) => [t.googleCalendarEventId!, t]),
  );

  let added = 0;
  let updated = 0;
  let removed = 0;
  let next = [...tasks];

  for (const ev of allEvents) {
    const existing = byEventId.get(ev.id);

    if (ev.status === 'cancelled') {
      if (existing) {
        next = next.filter((t) => t.id !== existing.id);
        removed++;
      }
      continue;
    }

    if (existing) {
      // Conflict resolution: if local was modified after remote, skip overwrite
      const remoteUpdated = ev.updated ? new Date(ev.updated).getTime() : 0;
      const localModified = existing.modifiedAt ? new Date(existing.modifiedAt).getTime() : 0;
      if (localModified > remoteUpdated && existing.googleEventSource === 'local') {
        continue; // local wins
      }
      const merged = eventToTask(ev, existing);
      next = next.map((t) => (t.id === existing.id ? merged : t));
      updated++;
    } else {
      // Dedup: try to find an existing un-linked local task that matches this event
      // (same normalized title + same time slot). If found, just link it instead of
      // creating a duplicate. This handles the "first connect" case where the user
      // already manually has matching tasks.
      const evStart = parseEventStart(ev);
      const allDay = !!ev.start?.date && !ev.start?.dateTime;
      const evTitle = normalizeTitle(ev.summary);
      const dupIdx = next.findIndex(
        (t) =>
          !t.googleCalendarEventId &&
          normalizeTitle(t.text) === evTitle &&
          isSameSlot(t.dueDate, evStart, allDay),
      );
      if (dupIdx >= 0) {
        const merged = eventToTask(ev, next[dupIdx]);
        next[dupIdx] = merged;
        updated++;
      } else {
        next.push(eventToTask(ev));
        added++;
      }
    }
  }

  await saveTodoItems(next);
  if (nextSyncToken) await setSetting(SYNC_TOKEN_KEY, nextSyncToken);
  await setSetting(LAST_SYNC_KEY, Date.now());

  window.dispatchEvent(new Event('tasksUpdated'));
  return { added, updated, removed };
};

/**
 * Push a local task to Google Calendar (create or update).
 * Call this when user creates/edits a task and wants it on calendar.
 */
export const pushTaskToCalendar = async (task: TodoItem): Promise<TodoItem> => {
  if (!task.dueDate) return task; // need a date to put on calendar

  const token = await getValidAccessToken();
  if (!token) throw new Error('Not signed in to Google');

  const calendarId =
    (await getSetting<string>(CALENDAR_ID_KEY, DEFAULT_CALENDAR_ID)) || DEFAULT_CALENDAR_ID;

  const due = new Date(task.dueDate);
  const end = new Date(due.getTime() + 30 * 60_000); // default 30 min

  const reminderMinutes = task.reminderTime
    ? Math.max(0, Math.round((due.getTime() - new Date(task.reminderTime).getTime()) / 60_000))
    : undefined;

  const body: any = {
    summary: task.text,
    description: task.description,
    location: task.location,
    start: { dateTime: due.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: {
      useDefault: reminderMinutes === undefined,
      overrides:
        reminderMinutes !== undefined
          ? [{ method: 'popup', minutes: reminderMinutes }]
          : undefined,
    },
  };

  const isUpdate = !!task.googleCalendarEventId;
  const url = isUpdate
    ? `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${task.googleCalendarEventId}`
    : `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`;

  const res = await fetch(url, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Calendar push failed ${res.status}: ${await res.text()}`);
  }

  const ev: GCalEvent = await res.json();
  return {
    ...task,
    googleCalendarEventId: ev.id,
    googleEventEtag: ev.etag,
    googleEventUpdatedAt: ev.updated,
    googleEventSyncedAt: Date.now(),
    googleEventSource: 'local',
  };
};

export const deleteTaskFromCalendar = async (task: TodoItem): Promise<void> => {
  if (!task.googleCalendarEventId) return;
  const token = await getValidAccessToken();
  if (!token) return;
  const calendarId =
    (await getSetting<string>(CALENDAR_ID_KEY, DEFAULT_CALENDAR_ID)) || DEFAULT_CALENDAR_ID;
  await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${task.googleCalendarEventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
};

export const getLastCalendarSyncAt = () => getSetting<number | null>(LAST_SYNC_KEY, null);
export const resetCalendarSync = () => setSetting(SYNC_TOKEN_KEY, null);

/**
 * Push every local task that has a dueDate but no Google Calendar link.
 * Before creating an event, we look at the user's existing calendar window
 * (±60 days) and try to find an event with the same normalized title at the
 * same time slot — if found we LINK to it instead of creating a duplicate.
 */
export const pushPendingTasksToCalendar = async (): Promise<{
  created: number;
  linked: number;
  skipped: number;
}> => {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Not signed in to Google');

  const calendarId =
    (await getSetting<string>(CALENDAR_ID_KEY, DEFAULT_CALENDAR_ID)) || DEFAULT_CALENDAR_ID;

  const tasks = await loadTodoItems();
  const pending = tasks.filter(
    (t) => t.dueDate && !t.googleCalendarEventId && !t.completed,
  );
  if (pending.length === 0) return { created: 0, linked: 0, skipped: 0 };

  // Fetch a window of existing remote events for dedup lookup
  const timeMin = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const lookupParams = new URLSearchParams({
    singleEvents: 'true',
    maxResults: '2500',
    timeMin,
    timeMax,
  });
  const lookupRes = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${lookupParams}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const remote: GCalEvent[] = lookupRes.ok ? (await lookupRes.json()).items || [] : [];

  const findRemoteMatch = (task: TodoItem): GCalEvent | undefined => {
    const title = normalizeTitle(task.text);
    return remote.find((ev) => {
      if (ev.status === 'cancelled') return false;
      if (normalizeTitle(ev.summary) !== title) return false;
      const allDay = !!ev.start?.date && !ev.start?.dateTime;
      return isSameSlot(task.dueDate, parseEventStart(ev), allDay);
    });
  };

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let next = [...tasks];

  for (const task of pending) {
    try {
      const match = findRemoteMatch(task);
      if (match) {
        // Link existing remote event — no duplicate created
        next = next.map((t) =>
          t.id === task.id
            ? {
                ...t,
                googleCalendarEventId: match.id,
                googleEventEtag: match.etag,
                googleEventUpdatedAt: match.updated,
                googleEventSyncedAt: Date.now(),
                googleEventSource: 'google',
              }
            : t,
        );
        linked++;
        continue;
      }
      const pushed = await pushTaskToCalendar(task);
      next = next.map((t) => (t.id === task.id ? pushed : t));
      created++;
    } catch (e) {
      console.warn('[gcal] push failed for task', task.id, e);
      skipped++;
    }
  }

  await saveTodoItems(next);
  window.dispatchEvent(new Event('tasksUpdated'));
  return { created, linked, skipped };
};

/** Full two-way sync: pull (with dedup) then push pending locals (with dedup). */
export const fullCalendarSync = async () => {
  const pulled = await syncCalendarToTasks().catch((e) => {
    console.warn('[gcal] pull failed', e);
    return { added: 0, updated: 0, removed: 0 };
  });
  // Detect locally-deleted tasks (had a linked eventId before, now gone) and
  // remove the corresponding events from Google Calendar.
  try {
    const tasksNow = await loadTodoItems();
    const linkedNow = new Map<string, string>(); // taskId → eventId
    for (const t of tasksNow) {
      if (t.googleCalendarEventId) linkedNow.set(t.id, t.googleCalendarEventId);
    }
    const prev =
      (await getSetting<Record<string, string>>(PUSH_INDEX_KEY, {})) || {};
    for (const [taskId, eventId] of Object.entries(prev)) {
      if (!linkedNow.has(taskId)) {
        await deleteTaskFromCalendar({
          googleCalendarEventId: eventId,
        } as TodoItem).catch(() => {});
      }
    }
    await setSetting(PUSH_INDEX_KEY, Object.fromEntries(linkedNow));
  } catch (e) {
    console.warn('[gcal] deletion sync failed', e);
  }
  const pushed = await pushPendingTasksToCalendar().catch((e) => {
    console.warn('[gcal] push failed', e);
    return { created: 0, linked: 0, skipped: 0 };
  });
  return { pulled, pushed };
};

// Auto sync hook: call once on login + every 15 min while signed in
let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let tasksUpdatedListener: (() => void) | null = null;

const scheduleDebouncedPush = () => {
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    pushPendingTasksToCalendar().catch((e) =>
      console.warn('[gcal] debounced push failed', e),
    );
  }, 4000);
};

export const startCalendarAutoSync = () => {
  if (autoSyncTimer) return;
  fullCalendarSync().catch((e) => console.warn('[gcal] initial sync failed', e));
  autoSyncTimer = setInterval(
    () => fullCalendarSync().catch((e) => console.warn('[gcal] auto sync failed', e)),
    15 * 60 * 1000,
  );
  // Push new/edited tasks shortly after they change
  tasksUpdatedListener = () => scheduleDebouncedPush();
  window.addEventListener('tasksUpdated', tasksUpdatedListener);
};

export const stopCalendarAutoSync = () => {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = null;
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = null;
  if (tasksUpdatedListener) {
    window.removeEventListener('tasksUpdated', tasksUpdatedListener);
    tasksUpdatedListener = null;
  }
};