import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCatalogAdminClient } from './catalogSupabaseAdmin.js';
import * as envUtils from '../utils/envUtils.js';

describe('getCatalogAdminClient', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    
    // Restauración meticulosa sin dejar "undefined" string
    const keysToRestore = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
    for (const key of keysToRestore) {
      if (originalEnv.hasOwnProperty(key)) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('falla explícitamente si faltan variables', () => {
    process.env.SUPABASE_URL = '';
    vi.spyOn(envUtils, 'getSecretKey').mockReturnValue('');
    
    expect(() => getCatalogAdminClient()).toThrow('CONFIG_ERROR: Missing Supabase credentials for Catalog');
  });

  it('crea el cliente si las variables existen', () => {
    process.env.SUPABASE_URL = 'http://localhost';
    vi.spyOn(envUtils, 'getSecretKey').mockReturnValue('dummy-key');
    
    const client = getCatalogAdminClient();
    expect(client).toBeDefined();
  });
});
