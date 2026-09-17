import { describe, it, expect, vi } from 'vitest';
import { checkPreviewSecurityGuard, performCleanupWithRetries } from '../../supabase/tests/preview/auth_smoke_test.js';

describe('checkPreviewSecurityGuard', () => {
  const validEnv = {
    ALLOW_PREVIEW_SMOKE: '1',
    SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-pub',
    SUPABASE_SECRET_KEY: 'test-sec'
  };

  it('permite proyecto exacto permitido', () => {
    const res = checkPreviewSecurityGuard(validEnv);
    expect(res.SUPABASE_URL).toBe('https://unctlwxbttwfumnekctx.supabase.co');
  });

  it('rechaza guard desactivado', () => {
    expect(() => checkPreviewSecurityGuard({ ...validEnv, ALLOW_PREVIEW_SMOKE: '0' }))
      .toThrow(/ALLOW_PREVIEW_SMOKE=1 is required/);
    expect(() => checkPreviewSecurityGuard({ ...validEnv, ALLOW_PREVIEW_SMOKE: undefined }))
      .toThrow(/ALLOW_PREVIEW_SMOKE=1 is required/);
  });

  it('rechaza hostname parecido pero malicioso', () => {
    expect(() => checkPreviewSecurityGuard({ ...validEnv, SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co.evil.com' }))
      .toThrow(/exclusively to the unctlwxbttwfumnekctx project/);
    expect(() => checkPreviewSecurityGuard({ ...validEnv, SUPABASE_URL: 'https://other-unctlwxbttwfumnekctx.supabase.co' }))
      .toThrow(/exclusively to the unctlwxbttwfumnekctx project/);
  });

  it('rechaza protocolo incorrecto', () => {
    expect(() => checkPreviewSecurityGuard({ ...validEnv, SUPABASE_URL: 'http://unctlwxbttwfumnekctx.supabase.co' }))
      .toThrow(/must use https protocol/);
  });

  it('rechaza credenciales embebidas', () => {
    expect(() => checkPreviewSecurityGuard({ ...validEnv, SUPABASE_URL: 'https://admin:password@unctlwxbttwfumnekctx.supabase.co' }))
      .toThrow(/Embedded credentials/);
  });
});

describe('performCleanupWithRetries', () => {
  const uid = '12345678-1234-1234-1234-12345678abcd';
  const shortId = 'abcd';

  const mockAdminClient = () => ({
    auth: {
      admin: {
        deleteUser: vi.fn(),
        getUserById: vi.fn()
      }
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn()
      })
    })
  });

  it('reintento seguido de limpieza exitosa', async () => {
    const admin = mockAdminClient();
    
    // First attempt fails, second succeeds
    let attempt = 0;
    admin.auth.admin.deleteUser.mockImplementation(async () => {
      attempt++;
      if (attempt === 1) return { error: new Error('Simulated network error') };
      return { error: null };
    });
    
    admin.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404, message: 'User not found' } });
    
    admin.from.mockImplementation(() => ({
      select: () => ({
        eq: async () => ({ data: [], error: null })
      })
    }));

    const result = await performCleanupWithRetries(admin, uid);
    expect(result).toBe(true);
    expect(attempt).toBe(2);
  });

  it('fallo de limpieza (siempre falla)', async () => {
    const admin = mockAdminClient();
    
    admin.auth.admin.deleteUser.mockResolvedValue({ error: new Error('Permanent error') });
    admin.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404, message: 'User not found' } });
    admin.from.mockImplementation(() => ({
      select: () => ({
        eq: async () => ({ data: [], error: null })
      })
    }));

    await expect(performCleanupWithRetries(admin, uid)).rejects.toThrow(/Cleanup failed after 3 attempts/);
    await expect(performCleanupWithRetries(admin, uid)).rejects.toThrow(shortId);
  });

  it('usuario Auth todavía presente aunque las tablas estén vacías', async () => {
    const admin = mockAdminClient();
    
    admin.auth.admin.deleteUser.mockResolvedValue({ error: null });
    // User is still present
    admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: uid } }, error: null });
    
    admin.from.mockImplementation(() => ({
      select: () => ({
        eq: async () => ({ data: [], error: null })
      })
    }));

    await expect(performCleanupWithRetries(admin, uid)).rejects.toThrow(/Auth user still exists/);
  });
});
