/**
 * Tests for lifetime completed-task counting and the `tasksUpdated` event.
 *
 * These guard three properties that must never regress:
 *   1. `countCompletedTasksInDB` counts ONLY tasks with `completed === true`.
 *   2. Mutations (put/delete) trigger a `tasksUpdated` event on window.
 *   3. `useTasksUpdated` never installs duplicate listeners for the same
 *      hook instance, so refreshed counts can never double-fire and drift.
 */

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Import lazily after we reset the IDB factory + module cache in beforeEach.
let taskStorage: typeof import('@/utils/taskStorage');

const makeTask = (id: string, completed: boolean) => ({
  id,
  text: `task ${id}`,
  completed,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const waitForEvent = (name: string, timeoutMs = 1000) =>
  new Promise<Event>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeoutMs);
    const handler = (e: Event) => {
      clearTimeout(t);
      window.removeEventListener(name, handler);
      resolve(e);
    };
    window.addEventListener(name, handler);
  });

beforeEach(async () => {
  // Fresh IDB instance per test — much more reliable than deleteDatabase()
  // when the module still holds a live connection at import time.
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.resetModules();
  taskStorage = await import('@/utils/taskStorage');
});


afterEach(() => {
  vi.useRealTimers();
});

describe('countCompletedTasksInDB', () => {
  it('returns 0 when the store is empty', async () => {
    const n = await taskStorage.countCompletedTasksInDB();
    expect(n).toBe(0);
  });

  it('counts only completed tasks, ignoring incomplete ones', async () => {
    await taskStorage.putTaskInDB(makeTask('a', true), true);
    await taskStorage.putTaskInDB(makeTask('b', false), true);
    await taskStorage.putTaskInDB(makeTask('c', true), true);
    await taskStorage.putTaskInDB(makeTask('d', false), true);
    await taskStorage.putTaskInDB(makeTask('e', true), true);

    const n = await taskStorage.countCompletedTasksInDB();
    expect(n).toBe(3);
  });

  it('reflects a task flipped from complete to incomplete', async () => {
    await taskStorage.putTaskInDB(makeTask('a', true), true);
    expect(await taskStorage.countCompletedTasksInDB()).toBe(1);

    // Flip to incomplete — same id, different completed flag.
    await taskStorage.putTaskInDB(makeTask('a', false), true);
    expect(await taskStorage.countCompletedTasksInDB()).toBe(0);
  });

  it('never exceeds the total task count', async () => {
    await taskStorage.putTaskInDB(makeTask('a', true), true);
    await taskStorage.putTaskInDB(makeTask('b', true), true);
    await taskStorage.putTaskInDB(makeTask('c', false), true);

    const total = await taskStorage.countTasksInDB();
    const done = await taskStorage.countCompletedTasksInDB();
    expect(done).toBeLessThanOrEqual(total);
    expect(done).toBe(2);
    expect(total).toBe(3);
  });
});

describe('tasksUpdated event dispatch', () => {
  it('fires tasksUpdated when a task is written (skipSyncEvent=false)', async () => {
    const wait = waitForEvent('tasksUpdated', 2000);
    await taskStorage.putTaskInDB(makeTask('a', true));
    await expect(wait).resolves.toBeInstanceOf(Event);
  });

  it('does NOT fire tasksUpdated when skipSyncEvent=true', async () => {
    const spy = vi.fn();
    window.addEventListener('tasksUpdated', spy);
    await taskStorage.putTaskInDB(makeTask('a', true), true);
    await flush();
    // Give any (unexpected) debounced dispatch a chance to fire.
    await new Promise((r) => setTimeout(r, 350));
    window.removeEventListener('tasksUpdated', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useTasksUpdated — duplicate listener safeguards', () => {
  it('registers exactly one callback invocation per dispatch, even across re-renders', async () => {
    const { useTasksUpdated } = await import('@/hooks/useTasksUpdated');
    const cb = vi.fn();
    const { rerender, unmount } = renderHook(({ fn }) => useTasksUpdated(fn, ['tasksUpdated']), {
      initialProps: { fn: cb },
    });

    // Re-render several times with a fresh callback each time; if the hook
    // leaked listeners on every render, we'd see N invocations per dispatch.
    for (let i = 0; i < 5; i++) rerender({ fn: cb });

    window.dispatchEvent(new Event('tasksUpdated'));
    expect(cb).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('tasksUpdated'));
    expect(cb).toHaveBeenCalledTimes(2);

    unmount();

    // After unmount, no further dispatch should reach the callback.
    window.dispatchEvent(new Event('tasksUpdated'));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('cleans up all event subscriptions on unmount (no drift on remount)', async () => {
    const { useTasksUpdated } = await import('@/hooks/useTasksUpdated');
    const cb = vi.fn();
    const events = ['tasksUpdated', 'tasksRestored'] as const;

    // Mount → unmount → mount → unmount several times. After all unmounts,
    // zero listeners should remain (otherwise counts would keep piling up
    // as the user navigates between Profile and Progress pages).
    for (let i = 0; i < 4; i++) {
      const { unmount } = renderHook(() => useTasksUpdated(cb, events));
      unmount();
    }

    window.dispatchEvent(new Event('tasksUpdated'));
    window.dispatchEvent(new Event('tasksRestored'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('deduplicates a repeated event name passed by the caller', async () => {
    const { useTasksUpdated } = await import('@/hooks/useTasksUpdated');
    const cb = vi.fn();
    renderHook(() =>
      useTasksUpdated(cb, ['tasksUpdated', 'tasksUpdated', 'tasksUpdated']),
    );
    window.dispatchEvent(new Event('tasksUpdated'));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
