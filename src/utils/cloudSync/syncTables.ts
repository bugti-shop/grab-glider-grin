/**
 * Registry of synced tables. Each table follows the same shape:
 *   id (uuid), user_id (uuid), updated_at (timestamptz), is_deleted (bool)
 *
 * Listeners can subscribe to per-table change events to refresh their local
 * caches. The engine itself does not know about app-specific storage — it
 * just emits events with the changed rows.
 */
export const SYNC_TABLES = [
  'notes',
  'note_versions',
  'tasks',
  'habits',
  'habit_logs',
  'habit_certificates',
  'folders',
  'lists',
  'sections',
  'user_settings',
  'subscription_status',
  'file_attachments',
] as const;

export type SyncTable = typeof SYNC_TABLES[number];

export interface SyncRow {
  id: string;
  user_id: string;
  updated_at: string;
  is_deleted: boolean;
  [key: string]: unknown;
}
