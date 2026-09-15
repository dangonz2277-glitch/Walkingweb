import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTodayReport, setResolvedCount, listMyReports, getProfile } from '../data/reportRepository.js';
import { supabase } from '../data/supabaseClient.js';

vi.mock('../data/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  }
}));

describe('reportRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTodayReport returns data', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { resolved_count: 5, revision: 2 }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ select });

    const res = await getTodayReport('2026-09-15');
    expect(res.success).toBe(true);
    expect(res.data.resolvedCount).toBe(5);
  });

  it('setResolvedCount handles network error', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    supabase.rpc.mockRejectedValue(new Error('Network down'));

    const res = await setResolvedCount('2026-09-15', 10, 1);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Network down');
  });

  it('setResolvedCount handles conflict response', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    supabase.rpc.mockResolvedValue({ data: { success: false, conflict: true, current_revision: 5 }, error: null });

    const res = await setResolvedCount('2026-09-15', 10, 1);
    expect(res.success).toBe(false);
    expect(res.conflict).toBe(true);
    expect(res.currentRevision).toBe(5);
  });
});
