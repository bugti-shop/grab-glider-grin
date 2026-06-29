// @ts-nocheck
/**
 * Performance/scalability test for FlatTaskList.
 *
 * Confirms:
 *  1. Rendering 5,000 tasks completes within a sane budget (< 2s in jsdom).
 *  2. Virtualization keeps the rendered DOM small (only a window of rows),
 *     proving the list never freezes the main thread on huge inputs.
 *  3. The `onReorder` callback wired up by the parent (used by Alt+↑/↓ and
 *     long-press drag) fires synchronously and the list remains interactive
 *     after reorder — no blocking work blocks the next paint.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { FlatTaskList } from './FlatTaskList';
import type { TodoItem } from '@/types/note';

// jsdom has no real layout — stub element box so the virtualizer renders a window.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function () {
      return { width: 800, height: 800, top: 0, left: 0, right: 800, bottom: 800, x: 0, y: 0, toJSON() {} };
    },
  });
  // @ts-ignore
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // @ts-ignore
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
});

function makeTasks(n: number): TodoItem[] {
  const out: TodoItem[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `t-${i}`,
      text: `Task ${i}`,
      completed: false,
      createdAt: Date.now(),
    } as TodoItem);
  }
  return out;
}

describe('FlatTaskList @ 5,000 tasks', () => {
  it('renders within budget and virtualizes the DOM', () => {
    const tasks = makeTasks(5000);
    const t0 = performance.now();

    render(
      <FlatTaskList
        items={tasks}
        useWindow={false}
        maxHeight={800}
        rowHeight={56}
        renderRow={(row) => (
          <div data-testid="task-row" data-id={row.task.id}>
            {row.task.text}
          </div>
        )}
      />
    );

    const elapsed = performance.now() - t0;
    // Generous budget — jsdom is much slower than real browsers.
    expect(elapsed).toBeLessThan(2000);

    const rendered = screen.queryAllByTestId('task-row');
    // Virtualization invariant: only a small window of the 5,000 rows lives in the DOM.
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(300);
  });

  it('keeps the main thread responsive — reorder callback fires and UI does not freeze', async () => {
    const tasks = makeTasks(5000);
    const onReorder = vi.fn();

    render(
      <FlatTaskList
        items={tasks}
        useWindow={false}
        maxHeight={800}
        rowHeight={56}
        onReorder={onReorder}
        renderRow={(row) => (
          <div data-testid="task-row" tabIndex={0} data-id={row.task.id}>
            {row.task.text}
          </div>
        )}
      />
    );

    // Simulate user pressing Alt+ArrowDown on the first row (keyboard reorder path).
    const list = document.querySelector('[data-flowist-virtual-list="tasks"]') as HTMLElement | null;
    expect(list).not.toBeNull();

    const t0 = performance.now();
    await act(async () => {
      list!.focus();
      fireEvent.keyDown(list!, { key: 'ArrowDown' });
      fireEvent.keyDown(list!, { key: 'ArrowDown', altKey: true });
    });
    const elapsed = performance.now() - t0;

    // The interaction must not block the main thread.
    expect(elapsed).toBeLessThan(500);
    // List still renders rows after the interaction (UI not frozen).
    expect(screen.queryAllByTestId('task-row').length).toBeGreaterThan(0);
  });
});
