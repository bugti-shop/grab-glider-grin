import { describe, it, expect } from 'vitest';
import { rankBetween, needsRebalance, rebalanceRanks, arrayMove, RANK_STEP } from './fractionalRank';

describe('rankBetween', () => {
  it('returns 0 when both neighbors are absent (empty list)', () => {
    expect(rankBetween(undefined, undefined)).toBe(0);
  });
  it('places before an item when there is no predecessor', () => {
    expect(rankBetween(undefined, 0)).toBeLessThan(0);
  });
  it('places after an item when there is no successor', () => {
    expect(rankBetween(0, undefined)).toBeGreaterThan(0);
  });
  it('returns the midpoint between two ranks', () => {
    expect(rankBetween(0, 1024)).toBe(512);
  });
  it('keeps producing strictly-between values across repeated bisection', () => {
    let lo = 0;
    let hi = 1024;
    for (let i = 0; i < 30; i += 1) {
      const mid = rankBetween(lo, hi);
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      hi = mid;
    }
  });
});

describe('needsRebalance', () => {
  it('returns false for normal gaps', () => {
    expect(needsRebalance(0, 1024)).toBe(false);
  });
  it('returns true when neighbors are within float precision', () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
  });
});

describe('rebalanceRanks', () => {
  it('respaces ids at RANK_STEP intervals', () => {
    const ranks = rebalanceRanks(['a', 'b', 'c']);
    expect(ranks).toEqual({ a: 0, b: RANK_STEP, c: RANK_STEP * 2 });
  });
});

describe('arrayMove', () => {
  it('moves an item without mutating the source', () => {
    const src = ['a', 'b', 'c', 'd'];
    const next = arrayMove(src, 0, 2);
    expect(next).toEqual(['b', 'c', 'a', 'd']);
    expect(src).toEqual(['a', 'b', 'c', 'd']);
  });
});
