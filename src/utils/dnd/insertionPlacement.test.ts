import { describe, it, expect } from 'vitest';
import { computeInsertionPlacement, excludeIndex, type MeasuredRow } from './insertionPlacement';

const row = (index: number, top: number, height = 50): MeasuredRow => ({
  index,
  rect: { top, bottom: top + height, height },
  topRelativeToList: top,
});

describe('computeInsertionPlacement', () => {
  const rows = [row(0, 0), row(1, 50), row(2, 100), row(3, 150)];

  it('returns slot 0 for empty rows', () => {
    expect(computeInsertionPlacement(123, [], 0).insertionIndex).toBe(0);
  });

  it('places before a row when Y is above its midpoint', () => {
    expect(computeInsertionPlacement(60, rows, 4).insertionIndex).toBe(1);
  });

  it('places after a row when Y is below its midpoint', () => {
    expect(computeInsertionPlacement(80, rows, 4).insertionIndex).toBe(2);
  });

  it('resolves gaps between rendered rows via midpoint split', () => {
    const sparse = [row(0, 0), row(5, 250)]; // virtualized gap
    const above = computeInsertionPlacement(100, sparse, 6);
    const below = computeInsertionPlacement(200, sparse, 6);
    expect(above.insertionIndex).toBe(1);
    expect(below.insertionIndex).toBe(5);
  });

  it('snaps past the last row to the end slot', () => {
    expect(computeInsertionPlacement(500, rows, 4).insertionIndex).toBe(4);
  });
});

describe('excludeIndex', () => {
  it('removes the source row so midpoints do not shift under the pointer', () => {
    const filtered = excludeIndex([row(0, 0), row(1, 50), row(2, 100)], 1);
    expect(filtered.map((r) => r.index)).toEqual([0, 2]);
  });
});
