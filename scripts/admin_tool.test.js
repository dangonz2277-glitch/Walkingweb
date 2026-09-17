import { describe, it, expect, vi } from 'vitest';
import { checkAdminGuard, runAdminTool } from './admin_tool.js';
import { getAdminClient, createManagedUser, disableManagedUser } from '../src/backend/authAdmin.js';

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

  it('throws if query or hash provided', () => {
    expect(() => checkAdminGuard(getEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co?q=1' })))
      .toThrow(/Query and hash must be empty/);
    expect(() => checkAdminGuard(getEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co#hash' })))
      .toThrow(/Query and hash must be empty/);
  });

  it('throws if credentials in url', () => {
    expect(() => checkAdminGuard(getEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://user:pass@unctlwxbttwfumnekctx.supabase.co' })))
      .toThrow(/Embedded credentials in URL are forbidden/);
  });
});

describe('admin_tool interactive flows', () => {
  const defaultEnv = {
    ALLOW_STAGING_MUTATION: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co',
    SUPABASE_SECRET_KEY: 'test_key'
  };

  it('exits throwing if choice fails (testing IO)', async () => {
    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockResolvedValue('0'), // select Exit
      askHidden: vi.fn()
    };
    await runAdminTool(defaultEnv, mockIo);
    expect(mockIo.write).toHaveBeenCalledWith('Saliendo.\n');
  });

  it('create command validates password mismatch and aborts', async () => {
    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '2';
        if (q.includes('Username')) return 'test';
        if (q.includes('Nombre a mostrar')) return 'Test User';
        return 'y';
      }),
      askHidden: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Confirme')) return 'pass87654321'; // mismatch
        return 'pass12345678';
      })
    };

    await expect(runAdminTool(defaultEnv, mockIo)).rejects.toThrow(/Las contraseñas no coinciden/);
    expect(createManagedUser).not.toHaveBeenCalled();
  });

  it('disable requires exact username resolution', async () => {
    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn()
            .mockResolvedValue({ data: { users: [{ id: 'u1', email: 'wrong@walkingweb.internal' }, { id: 'u2', email: 'test@walkingweb.internal' }] }, error: null })
        }
      }
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

  it('reset rejects short passwords', async () => {
    const mockClient = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'u2', email: 'test@walkingweb.internal' }] }, error: null })
        }
      }
    };
    getAdminClient.mockReturnValue(mockClient);

    const mockIo = {
      write: vi.fn(),
      ask: vi.fn().mockImplementation(async (q) => {
        if (q.includes('Seleccione')) return '5';
        if (q.includes('Username')) return 'test';
        return '';
      }),
      askHidden: vi.fn().mockResolvedValue('short')
    };

    await expect(runAdminTool(defaultEnv, mockIo)).rejects.toThrow(/mínimo 8 caracteres/);
  });
});
