import { describe, it, expect, vi, afterEach } from 'vitest';
import { getWorkDate } from '../utils/date.js';

describe('date utils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves date in America/La_Paz correctly before midnight UTC', () => {
    // 2026-09-15T03:59:59Z is 23:59:59 in La Paz (UTC-4) on 2026-09-14
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T03:59:59Z'));
    expect(getWorkDate()).toBe('2026-09-14');
  });

  it('resolves date in America/La_Paz correctly after midnight UTC', () => {
    // 2026-09-15T04:00:01Z is 00:00:01 in La Paz (UTC-4) on 2026-09-15
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T04:00:01Z'));
    expect(getWorkDate()).toBe('2026-09-15');
  });
});
