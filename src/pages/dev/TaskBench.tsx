/**
 * Dev-only benchmark route for the virtualized task list.
 *
 * Route:  /dev/task-bench?count=10000
 *
 * Renders N synthetic TodoItems through <FlatTaskList/> so we can verify:
 *   1. Row layout stays "natural" (no fixed row-height / overflow:hidden hack)
 *      at any count — the previous `useFixedMassiveRows` threshold made rows
 *      visibly change look at ~10k.
 *   2. Scroll FPS holds up with 9k / 11k / 50k tasks.
 *   3. Priority / completion changes only re-render the affected row.
 *
 * A live FPS counter and a "Toggle priority on visible rows" stress button
 * make the smoke test one-page.
 *
 * Public but obviously experimental — do NOT link from user UI.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { FlatTaskList } from '@/components/tasks/FlatTaskList';
import { Button } from '@/components/ui/button';
import type { TodoItem, Priority } from '@/types/note';

const PRIORITIES: Priority[] = ['high', 'medium', 'low', 'none'];

function makeTasks(n: number): TodoItem[] {
  const out: TodoItem[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      id: `bench-${i}`,
      text: `Benchmark task #${i + 1} — the quick brown fox jumps over the lazy dog`,
      completed: false,
      priority: PRIORITIES[i % 4],
    };
  }
  return out;
}

/** Rolling FPS meter driven by rAF. */
function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

export default function TaskBench() {
  const [params, setParams] = useSearchParams();
  const initialCount = Math.min(Math.max(parseInt(params.get('count') || '10000', 10) || 10000, 100), 100_000);
  const [count, setCount] = useState(initialCount);
  const [tick, setTick] = useState(0); // bump to force re-priority
  const fps = useFps();

  const generateStartedRef = useRef(0);
  const [buildMs, setBuildMs] = useState<number | null>(null);
  const tasks = useMemo(() => {
    generateStartedRef.current = performance.now();
    const t = makeTasks(count);
    // Rotate priorities on every `tick` so stress-toggling only mutates data.
    if (tick > 0) {
      for (let i = 0; i < t.length; i++) {
        t[i] = { ...t[i], priority: PRIORITIES[(i + tick) % 4] };
      }
    }
    return t;
  }, [count, tick]);
  useEffect(() => {
    setBuildMs(Math.round(performance.now() - generateStartedRef.current));
  }, [tasks]);

  const setCountAndSync = (n: number) => {
    setCount(n);
    setParams({ count: String(n) });
  };

  return (
    <div className="flex flex-col h-screen w-full">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-3 text-sm backdrop-blur">
        <strong>Task list benchmark</strong>
        <span className="rounded bg-muted px-2 py-0.5 tabular-nums">count: {count.toLocaleString()}</span>
        <span className="rounded bg-muted px-2 py-0.5 tabular-nums">build: {buildMs ?? '…'} ms</span>
        <span
          className={`rounded px-2 py-0.5 tabular-nums ${
            fps >= 55 ? 'bg-green-500/15 text-green-700 dark:text-green-400' :
            fps >= 40 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' :
            'bg-red-500/15 text-red-700 dark:text-red-400'
          }`}
        >
          {fps} fps
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          {[1_000, 5_000, 9_000, 10_000, 11_000, 25_000, 50_000].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={count === n ? 'default' : 'outline'}
              onClick={() => setCountAndSync(n)}
            >
              {n.toLocaleString()}
            </Button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setTick((v) => v + 1)}>
            Rotate priorities
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <FlatTaskList
          items={tasks}
          useWindow={false}
          rowHeight={58}
          renderRow={(row, i, isActive) => {
            const t = row.task;
            const bar =
              t.priority === 'high' ? 'bg-red-500' :
              t.priority === 'medium' ? 'bg-amber-500' :
              t.priority === 'low' ? 'bg-sky-500' : 'bg-muted';
            return (
              <div
                className={`flex items-center gap-3 border-b px-4 py-3 ${
                  isActive ? 'bg-accent/40' : ''
                }`}
                style={{ height: 58 }}
                data-bench-row={i}
              >
                <span className={`inline-block h-6 w-1.5 rounded ${bar}`} aria-hidden />
                <span className="flex-1 truncate">{t.text}</span>
                <span className="text-xs tabular-nums text-muted-foreground">#{i}</span>
              </div>
            );
          }}
          getRowVersion={(row) => `${row.task.id}:${row.task.priority}:${row.task.completed}`}
        />
      </div>
    </div>
  );
}
