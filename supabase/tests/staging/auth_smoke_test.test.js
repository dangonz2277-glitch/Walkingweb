import { describe, it, expect } from 'vitest';
import { checkSecurityGuard } from './auth_smoke_test.js';

describe('auth_smoke_test security guard', () => {
  it('throws if ALLOW_STAGING_MUTATION is not set to 1', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '0',
      NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co'
    })).toThrow(/ALLOW_STAGING_MUTATION=1 is required/);

    expect(() => checkSecurityGuard({
      NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co'
    })).toThrow(/ALLOW_STAGING_MUTATION=1 is required/);
  });

  it('throws if Supabase URL is missing', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1'
    })).toThrow(/Supabase URL is missing/);
  });

  it('throws if URL is invalid', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-valid-url'
    })).toThrow(/URL is invalid/);
  });

  it('throws if protocol is not HTTPS (HTTP or others)', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://unctlwxbttwfumnekctx.supabase.co'
    })).toThrow(/HTTPS protocol is strictly required/);

    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'ftp://unctlwxbttwfumnekctx.supabase.co'
    })).toThrow(/HTTPS protocol is strictly required/);
  });

  it('throws if URL contains embedded credentials', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://user:pass@unctlwxbttwfumnekctx.supabase.co'
    })).toThrow(/Embedded credentials in URL are forbidden/);
  });

  it('throws if hostname is malicious, similar, or subdomain', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://my-unctlwxbttwfumnekctx.supabase.co'
    })).toThrow(/Hostname does not match the exact expected/);

    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co.evil.com'
    })).toThrow(/Hostname does not match the exact expected/);

    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://evil.unctlwxbttwfumnekctx.supabase.co'
    })).toThrow(/Hostname does not match the exact expected/);
  });

  it('throws if URL is localhost or 127.0.0.1', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://localhost:54321'
    })).toThrow(/Hostname does not match the exact expected/);

    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      SUPABASE_URL: 'https://127.0.0.1:54321'
    })).toThrow(/Hostname does not match the exact expected/);
  });

  it('passes when all conditions are met', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co'
    })).not.toThrow();

    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co'
    })).not.toThrow();
  });
});
