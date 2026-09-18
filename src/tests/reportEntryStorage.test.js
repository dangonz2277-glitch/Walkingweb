import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadDraft, saveDraft } from '../backend/reportEntryStorage.js';

describe('reportEntryStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('valid load and format', () => {
    const draft = { calls: 1, emails: 2, liveChats: 3, clientEntryId: '00000000-0000-0000-0000-000000000000' };
    saveDraft('user1', draft);
    expect(loadDraft('user1')).toEqual(draft);
  });

  it('rejects invalid uuid in loadDraft', () => {
    const draft = { calls: 1, emails: 2, liveChats: 3, clientEntryId: 'not-uuid' };
    window.localStorage.setItem('draft_report_entry_user1', JSON.stringify(draft));
    expect(loadDraft('user1')).toBeNull();
  });

  it('rejects invalid uuid in saveDraft and does not write to localStorage', () => {
    const res = saveDraft('user1', { calls: 1, emails: 2, liveChats: 3, clientEntryId: 'not-uuid' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('UUID inválido');
    expect(window.localStorage.getItem('draft_report_entry_user1')).toBeNull();
  });

  it('rejects invalid counters in saveDraft and does not write', () => {
    const res = saveDraft('user1', { calls: -1, emails: 2, liveChats: 3, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.success).toBe(false);
    expect(window.localStorage.getItem('draft_report_entry_user1')).toBeNull();
  });

  it('clears draft when zeroes saved', () => {
    saveDraft('user1', { calls: 1, emails: 1, liveChats: 1, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(loadDraft('user1')).not.toBeNull();

    saveDraft('user1', { calls: 0, emails: 0, liveChats: 0, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(loadDraft('user1')).toBeNull();
  });

  it('preserves corruption without overwriting silently and increments suffix', () => {
    window.localStorage.setItem('draft_report_entry_user1', '{ bad json 1 }');
    window.localStorage.setItem('draft_report_entry_user1_corrupted_1', '{ pre-existing corrupted }');
    expect(loadDraft('user1')).toBeNull();

    let corruptKeys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('draft_report_entry_user1_corrupted_')) {
        corruptKeys.push(k);
      }
    }

    expect(corruptKeys.length).toBe(2);
    expect(window.localStorage.getItem('draft_report_entry_user1_corrupted_1')).toBe('{ pre-existing corrupted }');
    expect(window.localStorage.getItem('draft_report_entry_user1_corrupted_2')).toBe('{ bad json 1 }');
  });

  it('handles quota exceeded safely', () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });

    const res = saveDraft('user1', { calls: 1, emails: 1, liveChats: 1, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();

    vi.restoreAllMocks();
  });
});
