import { describe, it, expect, vi } from 'vitest';
import { createManagedUser, disableManagedUser, reactivateManagedUser } from './authAdmin.js';

describe('authAdmin.js compensations and limits', () => {
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

  it('createManagedUser rolls back if profile fails', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'uuid-1234' } }, error: null });

    const mockInsert = vi.fn().mockResolvedValue({ error: new Error('Profile insert failed') });
    adminClient.from.mockReturnValue({ insert: mockInsert });

    adminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });

    await expect(createManagedUser(adminClient, 'testuser', 'password123', 'Test Name'))
      .rejects.toThrow(/usuario descartado de forma segura: Profile insert failed/);

    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith('uuid-1234');
  });

  it('disableManagedUser reverts ban if profile update fails', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockResolvedValue({ error: null }); // ban succeeds first time

    // profile update fails
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('Update failed') }) });
    adminClient.from.mockReturnValue({ update: mockUpdate });

    await expect(disableManagedUser(adminClient, 'uuid-1234'))
      .rejects.toThrow(/ban revertido de forma segura: Update failed/);

    // Should have called update twice, once to ban, once to unban
    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
    expect(adminClient.auth.admin.updateUserById).toHaveBeenLastCalledWith('uuid-1234', { ban_duration: 'none' });
  });

  it('reactivateManagedUser reapplies ban if profile update fails', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockResolvedValue({ error: null }); // unban succeeds

    // profile update fails
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('Reactivate failed') }) });
    adminClient.from.mockReturnValue({ update: mockUpdate });

    await expect(reactivateManagedUser(adminClient, 'uuid-1234'))
      .rejects.toThrow(/ban re-aplicado de forma segura: Reactivate failed/);

    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
    expect(adminClient.auth.admin.updateUserById).toHaveBeenLastCalledWith('uuid-1234', { ban_duration: '876600h' });
  });

  it('throws CRÍTICO if compensation fails without exposing full UUID', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockImplementation(async (id, payload) => {
      if (payload.ban_duration === '876600h') return { error: null }; // ban succeeds
      if (payload.ban_duration === 'none') return { error: new Error('Unban crashed') }; // compensation fails
    });

    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('Update failed') }) });
    adminClient.from.mockReturnValue({ update: mockUpdate });

    await expect(disableManagedUser(adminClient, '00000000-0000-0000-0000-000000001234'))
      .rejects.toThrow(/CRÍTICO.*para el usuario \.\.\.1234.*Compensación: Unban crashed/);
  });

  it('disableManagedUser reverts ban if profile count === 0', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockResolvedValue({ error: null });

    // profile update succeeds but updates 0 rows
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null, count: 0 }) });
    adminClient.from.mockReturnValue({ update: mockUpdate });

    await expect(disableManagedUser(adminClient, 'uuid-1234'))
      .rejects.toThrow(/ban revertido de forma segura: Ningún perfil actualizado/);

    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
    expect(adminClient.auth.admin.updateUserById).toHaveBeenLastCalledWith('uuid-1234', { ban_duration: 'none' });
  });

  it('reactivateManagedUser reapplies ban if profile count === 0', async () => {
    const adminClient = getMockAdminClient();
    adminClient.auth.admin.updateUserById.mockResolvedValue({ error: null });

    // profile update succeeds but updates 0 rows
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null, count: 0 }) });
    adminClient.from.mockReturnValue({ update: mockUpdate });

    await expect(reactivateManagedUser(adminClient, 'uuid-1234'))
      .rejects.toThrow(/ban re-aplicado de forma segura: Ningún perfil actualizado/);

    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledTimes(2);
    expect(adminClient.auth.admin.updateUserById).toHaveBeenLastCalledWith('uuid-1234', { ban_duration: '876600h' });
  });
});
