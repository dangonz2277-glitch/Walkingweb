import { describe, it, expect } from 'vitest';
import { validateReportEntry } from '../domain/reportEntry.js';

describe('validateReportEntry', () => {
  it('accepts finite integers within 0-9999', () => {
    const val = validateReportEntry({ calls: 0, emails: 50, liveChats: 9999 });
    expect(val.valid).toBe(true);
    expect(val.data.total).toBe(10049);
  });

  it('rejects strings, NaN, Infinity, fractions', () => {
    expect(validateReportEntry({ calls: "5", emails: 0, liveChats: 0 }).valid).toBe(false);
    expect(validateReportEntry({ calls: 5.5, emails: 0, liveChats: 0 }).valid).toBe(false);
    expect(validateReportEntry({ calls: NaN, emails: 0, liveChats: 0 }).valid).toBe(false);
    expect(validateReportEntry({ calls: Infinity, emails: 0, liveChats: 0 }).valid).toBe(false);
  });

  it('rejects negatives and >9999 without clamping silently', () => {
    expect(validateReportEntry({ calls: -1, emails: 0, liveChats: 0 }).valid).toBe(false);
    expect(validateReportEntry({ calls: 10000, emails: 0, liveChats: 0 }).valid).toBe(false);
  });
});
