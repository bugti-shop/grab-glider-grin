/**
 * Duplicates should keep the original name as-is — the user explicitly asked
 * for NO "(Copy)" suffix. We still strip any legacy "(Copy)" tokens that may
 * have been saved before this rule existed, so older data cleans itself up
 * the next time it gets duplicated.
 */
const COPY_SUFFIX_RE = /(?:\s*\(Copy(?:\s*\d+)?\))+\s*$/i;

export function withCopySuffix(name: string | undefined | null): string {
  const base = (name ?? '').replace(COPY_SUFFIX_RE, '').trimEnd();
  return base;
}
