import { describe, it, expect } from 'vitest';
import { checkSecurityGuard } from './auth_smoke_test.js';

describe('auth_smoke_test security guard', () => {
  it('throws if ALLOW_STAGING_MUTATION is not set to 1', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '0',
      NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co'
    })).toThrow('Guard Triggered: ALLOW_STAGING_MUTATION=1 is required to run staging tests.');

    expect(() => checkSecurityGuard({
      NEXT_PUBLIC_SUPABASE_URL: 'https://unctlwxbttwfumnekctx.supabase.co'
    })).toThrow('Guard Triggered: ALLOW_STAGING_MUTATION=1 is required to run staging tests.');
  });

  it('throws if Supabase URL is missing', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1'
    })).toThrow('Guard Triggered: Supabase URL is missing.');
  });

  it('throws if URL is localhost or 127.0.0.1', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321'
    })).toThrow('Guard Triggered: Local URLs are forbidden in staging tests.');

    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      SUPABASE_URL: 'http://127.0.0.1:54321'
    })).toThrow('Guard Triggered: Local URLs are forbidden in staging tests.');
  });

  it('throws if URL does not contain the expected project ref', () => {
    expect(() => checkSecurityGuard({
      ALLOW_STAGING_MUTATION: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://wrongprojectref.supabase.co'
    })).toThrow('Guard Triggered: URL does not match the expected staging project ref (unctlwxbttwfumnekctx).');
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
