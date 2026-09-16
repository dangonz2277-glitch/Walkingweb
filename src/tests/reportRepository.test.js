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

  // Session absent tests
  it('returns unauthenticated error when no user is logged in', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    expect((await getTodayReport('2026-09-15')).success).toBe(false);
    expect((await setResolvedCount('2026-09-15', 5, 0)).success).toBe(false);
    expect((await listMyReports()).success).toBe(false);
  });

  // getTodayReport
  it('getTodayReport returns data when successful', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { resolved_count: 5, revision: 2 }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    supabase.from.mockReturnValue({ select });

    const res = await getTodayReport('2026-09-15');
    expect(res.success).toBe(true);
    expect(res.data.resolvedCount).toBe(5);
  });

  it('getTodayReport handles read errors', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('Read failed') });
    const eq = vi.fn(() => ({ maybeSingle }));
    supabase.from.mockReturnValue({ select: () => ({ eq }) });

    const res = await getTodayReport('2026-09-15');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Read failed');
  });

  it('getTodayReport returns null data if no record exists', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    supabase.from.mockReturnValue({ select: () => ({ eq }) });

    const res = await getTodayReport('2026-09-15');
    expect(res.success).toBe(true);
    expect(res.data).toBeNull();
  });

  // setResolvedCount
  it('setResolvedCount handles network/rpc error', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    supabase.rpc.mockRejectedValue(new Error('Network down'));

    const res = await setResolvedCount('2026-09-15', 10, 1);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Network down');
  });

  it('handles lost response after save, and a retry produces conflict without duplication', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    // First call: actually saved in DB, but network drops before response reaches client.
    supabase.rpc.mockRejectedValueOnce(new Error('Network drop after save'));

    const res1 = await setResolvedCount('2026-09-15', 10, 1);
    expect(res1.success).toBe(false);
    expect(res1.error).toBe('Network drop after save');

    // Client retries with the same old expected_revision (1).
    // The RPC fails with conflict because it's already at revision 2 now.
    supabase.rpc.mockResolvedValueOnce({ data: { success: false, conflict: true, current_revision: 2 }, error: null });

    const res2 = await setResolvedCount('2026-09-15', 10, 1);

    // The conflict is returned to the UI. The UI will then fetch current value.
    expect(res2.success).toBe(false);
    expect(res2.conflict).toBe(true);
    expect(res2.currentRevision).toBe(2);
  });

  it('setResolvedCount handles successful save', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    supabase.rpc.mockResolvedValue({ data: { success: true, revision: 2 }, error: null });

    const res = await setResolvedCount('2026-09-15', 10, 1);
    expect(res.success).toBe(true);
    expect(res.data.revision).toBe(2);
    expect(res.data.resolvedCount).toBe(10);
  });

  // listMyReports
  it('listMyReports returns history', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const limit = vi.fn().mockResolvedValue({ data: [{ work_date: '2026-09-15', resolved_count: 5, revision: 1 }], error: null });
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    supabase.from.mockReturnValue({ select });

    const res = await listMyReports();
    expect(res.success).toBe(true);
    expect(res.data[0].workDate).toBe('2026-09-15');
    expect(res.data[0].resolvedCount).toBe(5);
  });

  it('listMyReports handles errors', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const limit = vi.fn().mockResolvedValue({ data: null, error: new Error('History failed') });
    supabase.from.mockReturnValue({ select: () => ({ order: () => ({ limit }) }) });

    const res = await listMyReports();
    expect(res.success).toBe(false);
    expect(res.error).toBe('History failed');
  });

  // getProfile
  it('getProfile returns profile data', async () => {
    const single = vi.fn().mockResolvedValue({ data: { display_name: 'Test', status: 'active' }, error: null });
    const select = vi.fn(() => ({ single }));
    supabase.from.mockReturnValue({ select });

    const res = await getProfile();
    expect(res.success).toBe(true);
    expect(res.data.display_name).toBe('Test');
  });

  it('getProfile handles errors (e.g. disabled block via RLS)', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: new Error('RLS blocked') });
    const select = vi.fn(() => ({ single }));
    supabase.from.mockReturnValue({ select });

    const res = await getProfile();
    expect(res.success).toBe(false);
    expect(res.error).toBe('RLS blocked');
  });
});
