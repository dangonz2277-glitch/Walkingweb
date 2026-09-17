import { describe, it, expect, vi } from 'vitest';
import { checkAdminGuard } from './admin_tool.js';

describe('Admin Tool', () => {
  describe('checkAdminGuard', () => {
    it('throws if ALLOW_STAGING_MUTATION=1 is missing', () => {
      expect(() => checkAdminGuard({
        NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co',
        SUPABASE_SECRET_KEY: 'test_key'
      })).toThrow(/ALLOW_STAGING_MUTATION=1 is required/);
    });

    it('throws if host is invalid', () => {
      expect(() => checkAdminGuard({
        ALLOW_STAGING_MUTATION: '1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://wrong.supabase.co',
        SUPABASE_SECRET_KEY: 'test_key'
      })).toThrow(/Hostname does not match/);
    });

    it('returns config if valid', () => {
      const config = checkAdminGuard({
        ALLOW_STAGING_MUTATION: '1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co',
        SUPABASE_SECRET_KEY: 'test_key'
      });
      expect(config.url).toBe('https://unctlwxbttwfumnekctx.supabase.co');
      expect(config.key).toBe('test_key');
    });
  });
});

import { createManagedUser, disableManagedUser, reactivateManagedUser, resetManagedUserPassword } from '../src/backend/authAdmin.js';

describe('Admin Tool Operations (Mocked Client)', () => {
  const getMockAdminClient = () => {
    return {
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
          updateUserById: vi.fn()
        }
      },
      from: vi.fn()
    };
  };

  it('createManagedUser performs rollback if profile creation fails', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'uuid-123' } }, error: null });

    // Mock the from().insert() to fail
    const mockInsert = vi.fn().mockResolvedValue({ error: new Error('Profile insert failed') });
    adminClient.from.mockReturnValue({ insert: mockInsert });

    // Mock deleteUser to succeed (rollback success)
    adminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });

    await expect(createManagedUser(adminClient, 'testuser', 'password123', 'Test Name'))
      .rejects.toThrow(/usuario descartado de forma segura: Profile insert failed/);

    expect(adminClient.auth.admin.createUser).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith('uuid-123');
  });

  it('createManagedUser throws critical error if rollback fails', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'uuid-123' } }, error: null });

    const mockInsert = vi.fn().mockResolvedValue({ error: new Error('Profile fail') });
    adminClient.from.mockReturnValue({ insert: mockInsert });

    adminClient.auth.admin.deleteUser.mockResolvedValue({ error: new Error('Delete fail') });

    await expect(createManagedUser(adminClient, 'testuser', 'password123', 'Test Name'))
      .rejects.toThrow(/CRÍTICO: Falló la creación de perfil y también falló el rollback/);
  });

  it('disableManagedUser bans in auth and updates profile', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockResolvedValue({ error: null });

    const mockEq = vi.fn().mockResolvedValue({ error: null, count: 1 });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    adminClient.from.mockReturnValue({ update: mockUpdate });

    await disableManagedUser(adminClient, 'uuid-123');

    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('uuid-123', { ban_duration: '876600h' });
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'disabled' }, { count: 'exact' });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'uuid-123');
  });

  it('reactivateManagedUser removes ban and updates profile', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockResolvedValue({ error: null });

    const mockEq = vi.fn().mockResolvedValue({ error: null, count: 1 });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    adminClient.from.mockReturnValue({ update: mockUpdate });

    await reactivateManagedUser(adminClient, 'uuid-123');

    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('uuid-123', { ban_duration: 'none' });
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'active' }, { count: 'exact' });
  });

  it('resetManagedUserPassword updates password in auth', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await resetManagedUserPassword(adminClient, 'uuid-123', 'newpassword123');

    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('uuid-123', { password: 'newpassword123' });
  });

  it('resetManagedUserPassword throws if password is short', async () => {
    const adminClient = getMockAdminClient();
    await expect(resetManagedUserPassword(adminClient, 'uuid-123', 'short'))
      .rejects.toThrow(/La contraseña debe tener mínimo 8 caracteres/);
  });
});
