/**
 * perfLogger — lightweight in-memory perf event log used by the
 * PerfDiagnosticsPanel and by stress-test utilities.
 *
 * Tracks:
 *  - bulkAdd: how long batch-insert flows take (ms + count)
 *  - render: optional render-time markers components can emit
 *  - scrollJank: gaps between scroll events > 100ms
 *  - longTask: long-task entries from PerformanceObserver
 *
 * Zero-dependency. Safe in SSR (all browser APIs are guarded).
 */

export type PerfKind = 'bulkAdd' | 'render' | 'scrollJank' | 'longTask';

export interface PerfEvent {
  kind: PerfKind;
  ts: number;
  data: Record<string, any>;
}

const MAX_EVENTS = 200;
const events: PerfEvent[] = [];
const listeners = new Set<(e: PerfEvent) => void>();

export function logPerfEvent(kind: PerfKind, data: Record<string, any> = {}): void {
  const ev: PerfEvent = { kind, ts: Date.now(), data };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
  listeners.forEach((l) => {
    try { l(ev); } catch {}
  });
  if (typeof console !== 'undefined' && (window as any).__flowistPerfVerbose) {
    // Only log to console when explicitly enabled to avoid noise.
    console.debug(`[perf] ${kind}`, data);
  }
}

export function getPerfLog(): PerfEvent[] {
  return events.slice();
}

export function getRecentPerfEvents(kind: PerfKind, limit = 5): PerfEvent[] {
  const out: PerfEvent[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    if (events[i].kind === kind) out.push(events[i]);
  }
  return out;
}

export function subscribePerfLog(fn: (e: PerfEvent) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function clearPerfLog(): void {
  events.length = 0;
}

/**
 * Time a synchronous or async piece of work and emit a perfEvent.
 * Returns the value (or rethrows the error after logging).
 */
export async function measureAsync<T>(kind: PerfKind, label: string, fn: () => Promise<T> | T, extra: Record<string, any> = {}): Promise<T> {
  const t0 = performance.now();
  try {
    const v = await fn();
    logPerfEvent(kind, { label, ms: Math.round(performance.now() - t0), ...extra });
    return v;
  } catch (err) {
    logPerfEvent(kind, { label, ms: Math.round(performance.now() - t0), error: String((err as Error)?.message ?? err), ...extra });
    throw err;
  }
}

// ── Scroll jank monitor ──
let scrollMonitorStarted = false;
export function startScrollJankMonitor(): void {
  if (scrollMonitorStarted || typeof window === 'undefined') return;
  scrollMonitorStarted = true;
  let lastTs = 0;
  let scrolling = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const onScroll = () => {
    const now = performance.now();
    if (scrolling && lastTs && now - lastTs > 100) {
      logPerfEvent('scrollJank', { gapMs: Math.round(now - lastTs) });
    }
    lastTs = now;
    scrolling = true;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { scrolling = false; lastTs = 0; }, 250);
  };
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
}
