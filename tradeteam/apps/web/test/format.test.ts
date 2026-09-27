import { describe, expect, it } from 'vitest';
import { fmtNum, fmtPct, fmtUsd, fmtCompact, signClass } from '../lib/format';
import { createKeyedStore } from '../lib/store';

describe('display formatting (decimal strings, no float drift)', () => {
  it('formats numbers with separators and precision', () => {
    expect(fmtNum('1234567.891', 2)).toBe('1,234,567.89');
    expect(fmtNum('0.1', 8)).toBe('0.1');
    expect(fmtNum('0.30000000000000004', 8)).toBe('0.3');
    expect(fmtNum(null)).toBe('—');
    expect(fmtUsd('-12.5')).toBe('-$12.50');
    expect(fmtPct('3.456')).toBe('+3.46%');
    expect(fmtCompact('1250000')).toBe('1.25M');
    expect(signClass('-1')).toBe('text-down');
  });
});

describe('keyed store', () => {
  it('notifies only subscribers of the changed key', () => {
    const s = createKeyedStore<number>();
    let a = 0;
    let b = 0;
    s.subscribe('A', () => a++);
    s.subscribe('B', () => b++);
    s.set('A', 1);
    s.set('A', 2);
    expect([a, b]).toEqual([2, 0]);
    expect(s.get('A')).toBe(2);
  });
});
