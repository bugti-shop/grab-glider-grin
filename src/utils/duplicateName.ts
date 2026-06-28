/**
 * Append a clean " (Copy)" suffix to a name without recursing.
 * Strips any existing trailing "(Copy)" / "(Copy)(Copy)" / "(Copy 2)" tokens
 * so repeated duplication yields a single, stable suffix.
 */
const COPY_SUFFIX_RE = /(?:\s*\(Copy(?:\s*\d+)?\))+\s*$/i;

export function withCopySuffix(name: string | undefined | null): string {
  const base = (name ?? '').replace(COPY_SUFFIX_RE, '').trimEnd();
  return base.length > 0 ? `${base} (Copy)` : '(Copy)';
}
