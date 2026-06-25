/**
 * Lightweight perf benchmark utility for task-list rendering and scroll FPS.
 *
 * Enable in production by setting `localStorage.setItem('perf:benchmark','1')`.
 * Logs to console.group with timing data and exposes window.__perfBench for
 * runtime inspection.
 */

const isEnabled = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('perf:benchmark') === '1';
  } catch {
    return false;
  }
};

export interface RenderBenchmark {
  label: string;
  itemCount: number;
  durationMs: number;
  timestamp: number;
}

const history: RenderBenchmark[] = [];

export function benchmarkRender(label: string, itemCount: number, fn: () => void): void {
  if (!isEnabled()) {
    fn();
    return;
  }
  const start = performance.now();
  fn();
  const durationMs = performance.now() - start;
  const entry: RenderBenchmark = { label, itemCount, durationMs, timestamp: Date.now() };
  history.push(entry);
  // eslint-disable-next-line no-console
  console.log(`[perf:render] ${label} items=${itemCount} ${durationMs.toFixed(2)}ms`);
}

export function markRenderStart(label: string): (extra?: { itemCount?: number }) => void {
  if (!isEnabled()) return () => {};
  const start = performance.now();
  return (extra?: { itemCount?: number }) => {
    const durationMs = performance.now() - start;
    const itemCount = extra?.itemCount ?? 0;
    history.push({ label, itemCount, durationMs, timestamp: Date.now() });
    // eslint-disable-next-line no-console
    console.log(`[perf:render] ${label} items=${itemCount} ${durationMs.toFixed(2)}ms`);
  };
}

/** Track scroll FPS on a given element until `stop()` is called. */
export function trackScrollFps(el: HTMLElement, label = 'scroll'): () => void {
  if (!isEnabled()) return () => {};
  let frames = 0;
  let lastSecond = performance.now();
  let rafId: number | null = null;
  let scrolling = false;
  let scrollTimer: number | null = null;

  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - lastSecond >= 1000) {
      // eslint-disable-next-line no-console
      console.log(`[perf:fps] ${label} ${frames} fps`);
      frames = 0;
      lastSecond = now;
    }
    if (scrolling) rafId = requestAnimationFrame(tick);
  };

  const onScroll = () => {
    if (!scrolling) {
      scrolling = true;
      lastSecond = performance.now();
      frames = 0;
      rafId = requestAnimationFrame(tick);
    }
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      scrolling = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    }, 250);
  };

  el.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    el.removeEventListener('scroll', onScroll);
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (scrollTimer) window.clearTimeout(scrollTimer);
  };
}

export function getBenchmarkHistory(): RenderBenchmark[] {
  return history.slice();
}

if (typeof window !== 'undefined') {
  (window as any).__perfBench = {
    history: getBenchmarkHistory,
    enable: () => window.localStorage.setItem('perf:benchmark', '1'),
    disable: () => window.localStorage.removeItem('perf:benchmark'),
  };
}
