import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendReportEntry, listRecentReportEntries } from '../backend/reportEntryRepository.js';
import { supabase } from '../data/supabaseClient.js';

vi.mock('../data/supabaseClient.js', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

describe('reportEntryRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appendReportEntry validates payload before rpc', async () => {
    const res = await appendReportEntry({ calls: -1, emails: 0, liveChats: 0, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.success).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('appendReportEntry normalizes output', async () => {
    supabase.rpc.mockResolvedValue({
      data: { id: 1, calls: 5, emails: 0, live_chats: 0, total: 5, work_date: '2026-09-17', created_at: '2026-09-17T20:00:00Z' },
      error: null
    });
    const res = await appendReportEntry({ calls: 5, emails: 0, liveChats: 0, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.success).toBe(true);
    expect(res.data.liveChats).toBe(0);
    expect(res.data.id).toBe(1);
  });

  it('handles null data', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    const res = await appendReportEntry({ calls: 5, emails: 0, liveChats: 0, clientEntryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('El servidor no devolvió datos al guardar.');
  });
  
  it('listRecentReportEntries normalizes list and handles null', async () => {
    const mockOrder = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: null, error: null }) });
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
    supabase.from.mockReturnValue({ select: mockSelect });
    
    const res = await listRecentReportEntries();
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
  });
});
