import { describe, it, expect } from 'vitest';
import { filterAndSortTasks, filterTasks, sortTasks } from '@/utils/tasks/filterAndSortTasks';
import type { TodoItem } from '@/types/note';

const t = (over: Partial<TodoItem> & { id: string; text: string }): TodoItem =>
  ({ completed: false, ...over }) as TodoItem;

const sample: TodoItem[] = [
  t({ id: '1', text: 'Alpha', priority: 'low', status: 'not_started', dueDate: new Date('2026-07-10') as any }),
  t({ id: '2', text: 'Bravo', priority: 'high', status: 'in_progress', tagIds: ['work'] }),
  t({ id: '3', text: 'Charlie', priority: 'medium', status: 'almost_done', dueDate: new Date('2026-07-05') as any, tagIds: ['home'] }),
  t({ id: '4', text: 'Delta', priority: 'none', status: 'not_started', isPinned: true }),
];

describe('shared task filter + sort', () => {
  it('filters by priority the same way for tasks and subtasks', () => {
    const r = filterTasks(sample, { priorityFilter: 'high' });
    expect(r.map((x) => x.id)).toEqual(['2']);
  });

  it('filters by status', () => {
    const r = filterTasks(sample, { statusFilter: 'in_progress' });
    expect(r.map((x) => x.id)).toEqual(['2']);
  });

  it('filters by has-date and no-date', () => {
    expect(filterTasks(sample, { dateFilter: 'has-date' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(filterTasks(sample, { dateFilter: 'no-date' }).map((x) => x.id)).toEqual(['2', '4']);
  });

  it('filters by tag intersection', () => {
    expect(filterTasks(sample, { tagFilter: ['work'] }).map((x) => x.id)).toEqual(['2']);
    expect(filterTasks(sample, { tagFilter: ['work', 'home'] }).map((x) => x.id)).toEqual(['2', '3']);
  });

  it('pins float to top regardless of sort', () => {
    for (const s of ['date', 'priority', 'name', 'created'] as const) {
      expect(sortTasks(sample, s)[0].id).toBe('4');
    }
  });

  it('sorts by priority high→low', () => {
    const r = sortTasks(sample.filter((x) => !x.isPinned), 'priority').map((x) => x.id);
    expect(r).toEqual(['2', '3', '1']);
  });

  it('sorts by name', () => {
    const r = sortTasks(sample.filter((x) => !x.isPinned), 'name').map((x) => x.id);
    expect(r).toEqual(['1', '2', '3']);
  });

  it('sorts by date, undated last', () => {
    const r = sortTasks(sample.filter((x) => !x.isPinned), 'date').map((x) => x.id);
    expect(r).toEqual(['3', '1', '2']);
  });

  it('combined filter + sort is deterministic across every filter combo', () => {
    const opts = [
      { priorityFilter: 'high' as const },
      { statusFilter: 'not_started' as const },
      { dateFilter: 'has-date' as const, sortBy: 'date' as const },
      { tagFilter: ['home'], sortBy: 'name' as const },
      { priorityFilter: 'medium' as const, dateFilter: 'has-date' as const, sortBy: 'priority' as const },
    ];
    for (const o of opts) {
      const a = filterAndSortTasks(sample, o);
      const b = filterAndSortTasks(sample, o);
      expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    }
  });

  it('applies identical result to a subtask array as a main-task array', () => {
    const parent = t({ id: '10', text: 'Parent', subtasks: sample });
    const mainRun = filterAndSortTasks(sample, { priorityFilter: 'high' });
    const subRun = filterAndSortTasks(parent.subtasks as TodoItem[], { priorityFilter: 'high' });
    expect(subRun.map((x) => x.id)).toEqual(mainRun.map((x) => x.id));
  });
});
