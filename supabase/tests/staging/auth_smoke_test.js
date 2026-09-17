import { getAdminClient, createManagedUser, disableManagedUser, resetManagedUserPassword } from '../../../src/backend/authAdmin.js';
import { createClient } from '@supabase/supabase-js';

// Guard de Seguridad
export function checkSecurityGuard(env) {
  if (env.ALLOW_STAGING_MUTATION !== '1') {
    throw new Error('Guard Triggered: ALLOW_STAGING_MUTATION=1 is required to run staging tests.');
  }
  
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  if (!url) {
    throw new Error('Guard Triggered: Supabase URL is missing.');
  }

  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    throw new Error('Guard Triggered: Local URLs are forbidden in staging tests.');
  }

  const expectedRef = 'unctlwxbttwfumnekctx';
  if (!url.includes(expectedRef)) {
    throw new Error(`Guard Triggered: URL does not match the expected staging project ref (${expectedRef}).`);
  }
}

async function runStagingSmokeTest() {
  console.log('--- STAGING SMOKE TEST ---');
  
  // 1. Verificación del Guard
  checkSecurityGuard(process.env);
  console.log('Security guard passed. Proceeding with remote staging mutations...');

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
    throw new Error('Missing keys for smoke test.');
  }

  const adminClient = getAdminClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
  
  const timestamp = Date.now();
  const user1 = `smoke1_${timestamp}`;
  const user2 = `smoke2_${timestamp}`;
  const pass1 = `SsmkTest#1_${timestamp}`;
  const pass2 = `SsmkTest#2_${timestamp}`;
  let uid1 = null;
  let uid2 = null;

  try {
    // 2. Crear Usuarios Sintéticos
    console.log('Creating synthetic users...');
    uid1 = await createManagedUser(adminClient, user1, pass1, 'Smoke One');
    uid2 = await createManagedUser(adminClient, user2, pass2, 'Smoke Two');
    console.log(`Users created successfully.`);

    // 3. Comprobar login individual
    const client1 = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const client2 = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

    const { error: login1Err } = await client1.auth.signInWithPassword({ email: `${user1}@walkingweb.local`, password: pass1 });
    if (login1Err) throw new Error(`Login failed for user 1: ${login1Err.message}`);

    const { error: login2Err } = await client2.auth.signInWithPassword({ email: `${user2}@walkingweb.local`, password: pass2 });
    if (login2Err) throw new Error(`Login failed for user 2: ${login2Err.message}`);
    
    console.log('Logins successful.');

    // 4. Comprobar guardado atómico y mismo día/mismo total (Atomic save + RLS isolation)
    console.log('Testing atomic save and RLS...');
    const testDate = new Date().toISOString().split('T')[0];

    const { error: rpcErr } = await client1.rpc('set_daily_report', {
      p_work_date: testDate,
      p_resolved_count: 5,
      p_expected_revision: 0
    });
    if (rpcErr) throw new Error(`set_daily_report failed: ${rpcErr.message}`);

    // Verify isolation: Client 2 should not see Client 1's report
    const { data: c2Reports, error: readErr } = await client2.from('daily_reports').select('*');
    if (readErr) throw new Error(`Read failed: ${readErr.message}`);
    if (c2Reports.length > 0) throw new Error('RLS Failure: Client 2 can read Client 1 data.');

    // Mismo día/mismo total (Conflict testing on client 1)
    const { error: rpcConflictErr } = await client1.rpc('set_daily_report', {
      p_work_date: testDate,
      p_resolved_count: 10,
      p_expected_revision: 0 // Expected 0, but it is actually 1 now.
    });
    if (!rpcConflictErr || !rpcConflictErr.message.includes('concurrent modification')) {
       throw new Error('Atomic save failure: did not reject concurrent modification properly.');
    }

    console.log('RLS and Atomic saves verified.');

    // 5. Desactivar uno y confirmar bloqueo
    console.log('Testing user disable...');
    await disableManagedUser(adminClient, uid1);
    
    // Auth ban blocks NEW logins
    const { error: login1BlockedErr } = await client1.auth.signInWithPassword({ email: `${user1}@walkingweb.local`, password: pass1 });
    if (!login1BlockedErr) throw new Error('Disable failure: User 1 could still log in.');
    
    console.log('Disable user verified.');

    // 6. Restablecimiento de contraseña
    console.log('Testing password reset...');
    const newPass2 = `NewSsmkTest#2_${timestamp}`;
    await resetManagedUserPassword(adminClient, uid2, newPass2);

    const { error: login2NewErr } = await client2.auth.signInWithPassword({ email: `${user2}@walkingweb.local`, password: newPass2 });
    if (login2NewErr) throw new Error(`Password reset failure: could not log in with new password: ${login2NewErr.message}`);
    
    console.log('Password reset verified.');

  } finally {
    // 7. Eliminar usuarios sintéticos
    console.log('Cleaning up synthetic data...');
    if (uid1) {
      // Deletes cascade to profiles and daily_reports due to foreign key / ON DELETE CASCADE (if configured)
      // Wait, we should explicitly delete from auth.users (which cascades to profiles in standard setups)
      await adminClient.auth.admin.deleteUser(uid1);
      // Failsafe cleanup from tables just in case
      await adminClient.from('profiles').delete().eq('user_id', uid1);
      await adminClient.from('daily_reports').delete().eq('user_id', uid1);
    }
    if (uid2) {
      await adminClient.auth.admin.deleteUser(uid2);
      await adminClient.from('profiles').delete().eq('user_id', uid2);
      await adminClient.from('daily_reports').delete().eq('user_id', uid2);
    }
    console.log('Cleanup complete.');
  }

  console.log('Smoke test completed successfully.');
}

// Only execute if called directly
if (process.argv[1] && process.argv[1].endsWith('auth_smoke_test.js')) {
  runStagingSmokeTest().catch(err => {
    console.error('Smoke test failed:', err);
    process.exit(1);
  });
}
