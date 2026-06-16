// Tracks the number of attachments added on the current calendar day (local time).
// Used by the Free-plan capacity gate `attachmentsPerDay`.
const KEY = 'flowist_attachments_daily';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function getAttachmentsAddedToday(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { day: string; count: number };
    if (parsed.day !== todayKey()) return 0;
    return parsed.count || 0;
  } catch {
    return 0;
  }
}

export function incrementAttachmentsAddedToday(by = 1): void {
  try {
    const current = getAttachmentsAddedToday();
    localStorage.setItem(
      KEY,
      JSON.stringify({ day: todayKey(), count: current + by })
    );
  } catch {}
}
