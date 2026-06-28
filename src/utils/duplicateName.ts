/**
 * Duplicates should keep the original name as-is — the user explicitly asked
 * for NO "(Copy)" suffix. We still strip any legacy "(Copy)" tokens that may
 * have been saved before this rule existed, so older data cleans itself up
 * the next time it gets duplicated.
 */
export const COPY_SUFFIX_RE = /(?:\s*\(Copy(?:\s*\d+)?\))+\s*$/i;

export function withCopySuffix(name: string | undefined | null): string {
  const base = (name ?? '').replace(COPY_SUFFIX_RE, '').trimEnd();
  return base;
}

/**
 * Defensive UI-side sanitizer — strips "(Copy)" from a single display string.
 * Use anywhere a task / note / folder name is rendered to guarantee the token
 * never reaches the screen, even if older or third-party data carries it.
 */
export function sanitizeDisplayName(name: string | undefined | null): string {
  return withCopySuffix(name);
}

/**
 * Walks a list of items (tasks, notes, folders, sections, subtasks) and strips
 * any persisted "(Copy)" suffix from common name fields. Returns the cleaned
 * array plus a `changed` flag so callers can decide whether to re-persist.
 *
 * Safe to run at load time — does not mutate input.
 */
export function sanitizeCopySuffixes<T extends Record<string, any>>(items: T[]): { items: T[]; changed: boolean } {
  let changed = false;
  const NAME_KEYS = ['text', 'name', 'title'] as const;

  const walk = (item: any): any => {
    if (!item || typeof item !== 'object') return item;
    let next = item;
    for (const key of NAME_KEYS) {
      const val = item?.[key];
      if (typeof val === 'string' && COPY_SUFFIX_RE.test(val)) {
        if (next === item) next = { ...item };
        next[key] = withCopySuffix(val);
        changed = true;
      }
    }
    if (Array.isArray(item.subtasks)) {
      const subs = item.subtasks.map(walk);
      if (subs.some((s: any, i: number) => s !== item.subtasks[i])) {
        if (next === item) next = { ...item };
        next.subtasks = subs;
      }
    }
    return next;
  };

  const out = items.map(walk);
  return { items: out, changed };
}
