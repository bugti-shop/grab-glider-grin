/**
 * Flat task row UI consistency check.
 *
 * The flat task list renders through two code paths:
 *  1) DnD path (small lists): native section + Draggable rows.
 *  2) Virtualized path (large lists): windowed FlatTaskList rows.
 *
 * Both paths MUST produce visually identical rows so the UI doesn't
 * "jump" when a list crosses the virtualization threshold. This helper
 * samples a row from each path at runtime (dev only) and warns when
 * their measured layout signatures diverge.
 */

// Shared row wrapper classes — single source of truth for both paths.
export const FLAT_ROW_WRAPPER_CLASS = 'border-b border-border/50 bg-background';

type RowSignature = {
  height: number;
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  borderBottomWidth: number;
  fontSize: number;
};

const signatureOf = (el: HTMLElement): RowSignature => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    height: Math.round(r.height),
    paddingTop: parseFloat(cs.paddingTop) || 0,
    paddingBottom: parseFloat(cs.paddingBottom) || 0,
    paddingLeft: parseFloat(cs.paddingLeft) || 0,
    paddingRight: parseFloat(cs.paddingRight) || 0,
    borderBottomWidth: parseFloat(cs.borderBottomWidth) || 0,
    fontSize: parseFloat(cs.fontSize) || 0,
  };
};

const TOLERANCE_PX = 1;
const diffs = (a: RowSignature, b: RowSignature): string[] => {
  const out: string[] = [];
  (Object.keys(a) as (keyof RowSignature)[]).forEach((k) => {
    if (Math.abs(a[k] - b[k]) > TOLERANCE_PX) out.push(`${k}: ${a[k]} vs ${b[k]}`);
  });
  return out;
};

let lastBaseline: RowSignature | null = null;
let lastWarnedAt = 0;

/**
 * Call after the flat list renders. Samples the first row marked with
 * `data-flat-row` and compares its layout signature against the baseline
 * captured on the first render of the session. Warns at most once / 3s.
 */
export const checkFlatRowConsistency = (root: HTMLElement | null, context: string) => {
  if (!root || typeof window === 'undefined') return;
  if (!import.meta.env.DEV) return;
  const row = root.querySelector<HTMLElement>('[data-flat-row]');
  if (!row) return;
  const sig = signatureOf(row);
  if (!lastBaseline) {
    lastBaseline = sig;
    return;
  }
  const mismatches = diffs(lastBaseline, sig);
  if (mismatches.length === 0) return;
  const now = Date.now();
  if (now - lastWarnedAt < 3000) return;
  lastWarnedAt = now;
  // eslint-disable-next-line no-console
  console.warn(
    `[flat-row-consistency] ${context}: row layout drifted from baseline`,
    { baseline: lastBaseline, current: sig, mismatches }
  );
};

/** Test hook — clear the captured baseline (e.g. after a theme change). */
export const resetFlatRowBaseline = () => {
  lastBaseline = null;
  lastWarnedAt = 0;
};
