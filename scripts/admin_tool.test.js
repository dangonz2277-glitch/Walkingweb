import { describe, it, expect, vi } from 'vitest';
import { checkAdminGuard, runAdminTool, formatUsername } from './admin_tool.js';
import { getAdminClient, createManagedUser, disableManagedUser, reactivateManagedUser, resetManagedUserPassword } from '../src/backend/authAdmin.js';

vi.mock('../src/backend/authAdmin.js', () => ({
  getAdminClient: vi.fn().mockReturnValue({
    auth: { admin: { listUsers: vi.fn() } },
    from: vi.fn()
  }),
  createManagedUser: vi.fn(),
  disableManagedUser: vi.fn(),
  reactivateManagedUser: vi.fn(),
  resetManagedUserPassword: vi.fn()
}));

describe('admin_tool helpers', () => {
  it('formatUsername removes internal domain', () => {
    expect(formatUsername('juan@walkingweb.internal')).toBe('juan');
    expect(formatUsername('juan')).toBe('juan');
    expect(formatUsername(null)).toBe('desconocido');
  });
});

describe('admin_tool checkAdminGuard', () => {
  const getEnv = (overrides = {}) => ({
    ALLOW_STAGING_MUTATION: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co',
    SUPABASE_SECRET_KEY: 'test_key',
    ...overrides
  });

  it('throws if HTTP', () => {
    expect(() => checkAdminGuard(getEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://unctlwxbttwfumnekctx.supabase.co' })))
      .toThrow(/Protocol must be exactly https:/);
  });

  it('throws if port provided', () => {
    expect(() => checkAdminGuard(getEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co:54321' })))
      .toThrow(/Port must be empty/);
  });

  it('throws if path provided', () => {
    expect(() => checkAdminGuard(getEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co/path' })))
      .toThrow(/Pathname must be exactly \//);
  });
});

describe('admin_tool interactive flows', () => {
  const defaultEnv = {
    ALLOW_STAGING_MUTATION: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co',
    SUPABASE_SECRET_KEY: 'test_key'
  };

  it('resolves user on 2nd page correctly', async () => {
    const p1 = Array(100).fill({ id: 'dummy', email: 'dummy@x' });
    p1[99] = { id: 'u1', email: 'wrong@walkingweb.internal' };

    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn()
            .mockResolvedValueOnce({ data: { users: p1 }, error: null })
            .mockResolvedValueOnce({ data: { users: [{ id: 'u2', email: 'test@walkingweb.internal' }] }, error: null })
        }
      },
      from: vi.fn()
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '3';
        if (q.includes('Username')) return 'test';
        if (q.includes('¿Desactivar')) return 'y';
        return '';
      }),
      askHidden: vi.fn()
    };

    await runAdminTool(defaultEnv, mockIo);
    expect(disableManagedUser).toHaveBeenCalledWith(mockClient, 'u2');
  });

  it('throws if user not found', async () => {
    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null })
        }
      },
      from: vi.fn()
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '3';
        if (q.includes('Username')) return 'test';
        return 'y';
      }),
      askHidden: vi.fn()
    };

    await expect(runAdminTool(defaultEnv, mockIo)).rejects.toThrow(/No se encontró ningún usuario/);
  });

  it('throws on ambiguous matches across pages', async () => {
    const p1 = Array(100).fill({ id: 'dummy', email: 'dummy@x' });
    p1[99] = { id: 'u1', email: 'test@walkingweb.internal' };

    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn()
            .mockResolvedValueOnce({ data: { users: p1 }, error: null })
            .mockResolvedValueOnce({ data: { users: [{ id: 'u2', email: 'test@walkingweb.internal' }] }, error: null })
        }
      },
      from: vi.fn()
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '3';
        if (q.includes('Username')) return 'test';
        return 'y';
      }),
      askHidden: vi.fn()
    };

    await expect(runAdminTool(defaultEnv, mockIo)).rejects.toThrow(/Ambigüedad/);
  });

  it('throws on listUsers error', async () => {
    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: null, error: new Error('Network failure') })
        }
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null })
      })
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockResolvedValue('1'),
      askHidden: vi.fn()
    };

    await expect(runAdminTool(defaultEnv, mockIo)).rejects.toThrow(/Network failure/);
  });

  it('listCommand formats correctly without UUIDs or domain', async () => {
    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'u1', email: 'johndoe@walkingweb.internal' }] }, error: null })
        }
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ display_name: 'John D', status: 'active', user_id: 'u1' }], error: null })
      })
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockResolvedValue('1'),
      askHidden: vi.fn()
    };

    await runAdminTool(defaultEnv, mockIo);

    expect(mockIo.write).toHaveBeenCalledWith(expect.stringContaining('- [ACTIVE] johndoe ("John D")'));
    expect(mockIo.write).not.toHaveBeenCalledWith(expect.stringContaining('u1'));
    expect(mockIo.write).not.toHaveBeenCalledWith(expect.stringContaining('@walkingweb.internal'));
  });

  it('create command validates empty display name', async () => {
    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '2';
        if (q.includes('Username')) return 'test';
        if (q.includes('Nombre a mostrar')) return '   '; // empty
        return 'y';
      }),
      askHidden: vi.fn().mockResolvedValue('pass12345678')
    };

    await expect(runAdminTool(defaultEnv, mockIo)).rejects.toThrow(/Nombre inválido/);
  });

  it('create command cancelled', async () => {
    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '2';
        if (q.includes('Username')) return 'test';
        if (q.includes('Nombre a mostrar')) return 'Valid';
        return 'n'; // Cancel
      }),
      askHidden: vi.fn().mockResolvedValue('pass12345678')
    };

    await runAdminTool(defaultEnv, mockIo);
    expect(createManagedUser).not.toHaveBeenCalled();
    expect(mockIo.write).toHaveBeenCalledWith('Operación cancelada.\n');
  });

  it('reactivate command confirmed', async () => {
    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'u1', email: 'test@walkingweb.internal' }] }, error: null })
        }
      },
      from: vi.fn()
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '4'; // Reactivate
        if (q.includes('Username')) return 'test';
        return 'y';
      }),
      askHidden: vi.fn()
    };

    await runAdminTool(defaultEnv, mockIo);
    expect(reactivateManagedUser).toHaveBeenCalledWith(mockClient, 'u1');
  });

  it('reset command confirmed', async () => {
    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'u1', email: 'test@walkingweb.internal' }] }, error: null })
        }
      },
      from: vi.fn()
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '5'; // Reset
        if (q.includes('Username')) return 'test';
        return 'y';
      }),
      askHidden: vi.fn().mockResolvedValue('pass12345678')
    };

    await runAdminTool(defaultEnv, mockIo);
    expect(resetManagedUserPassword).toHaveBeenCalledWith(mockClient, 'u1', 'pass12345678');
  });
});
