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

  it('rejects invalid uuid', () => {
    const draft = { calls: 1, emails: 2, liveChats: 3, clientEntryId: 'not-uuid' };
    window.localStorage.setItem('draft_report_entry_user1', JSON.stringify(draft));
    expect(loadDraft('user1')).toBeNull();
  });

  it('clears draft when zeroes saved', () => {
    saveDraft('user1', { calls: 1, emails: 1, liveChats: 1, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(loadDraft('user1')).not.toBeNull();
    
    saveDraft('user1', { calls: 0, emails: 0, liveChats: 0, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(loadDraft('user1')).toBeNull();
  });

  it('preserves corruption without overwriting silently', () => {
    window.localStorage.setItem('draft_report_entry_user1', '{ bad json');
    expect(loadDraft('user1')).toBeNull();
    
    let corruptKeys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('draft_report_entry_user1_corrupted_')) {
        corruptKeys.push(k);
      }
    }
    
    expect(corruptKeys.length).toBe(1);
    expect(window.localStorage.getItem(corruptKeys[0])).toBe('{ bad json');
  });
  
  it('handles quota exceeded safely', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    
    const res = saveDraft('user1', { calls: 1, emails: 1, liveChats: 1, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    
    vi.restoreAllMocks();
  });
});
