import { getAdminClient, createManagedUser, disableManagedUser, resetManagedUserPassword } from '../../../src/backend/authAdmin.js';
import { normalizeUsername } from '../../../src/utils/auth.js';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

// Guard de Seguridad
export function checkSecurityGuard(env) {
  if (env.ALLOW_STAGING_MUTATION !== '1') {
    throw new Error('Guard Triggered: ALLOW_STAGING_MUTATION=1 is required to run staging tests.');
  }

  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  if (!rawUrl) {
    throw new Error('Guard Triggered: Supabase URL is missing.');
  }

  let urlObj;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    throw new Error('Guard Triggered: URL is invalid.');
  }

  if (urlObj.protocol !== 'https:') {
    throw new Error('Guard Triggered: HTTPS protocol is strictly required.');
  }

  if (urlObj.hostname !== 'unctlwxbttwfumnekctx.supabase.co') {
    throw new Error(`Guard Triggered: Hostname does not match the exact expected staging project ref (unctlwxbttwfumnekctx.supabase.co). Received: ${urlObj.hostname}`);
  }

  if (urlObj.username !== '' || urlObj.password !== '') {
    throw new Error('Guard Triggered: Embedded credentials in URL are forbidden.');
  }
}

export async function runStagingSmokeTest() {
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
  const email1 = normalizeUsername(user1);
  const email2 = normalizeUsername(user2);
  const pass1 = `SsmkTest#1_${timestamp}`;
  const pass2 = `SsmkTest#2_${timestamp}`;
  let uid1 = null;
  let uid2 = null;

  let testError = null;

  try {
    // 2. Crear Usuarios Sintéticos
    console.log('Creating synthetic users...');
    uid1 = await createManagedUser(adminClient, user1, pass1, 'Smoke One');
    uid2 = await createManagedUser(adminClient, user2, pass2, 'Smoke Two');
    console.log(`Users created successfully.`);

    // 3. Comprobar login individual
    const client1 = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const client2 = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

    const { error: login1Err } = await client1.auth.signInWithPassword({ email: email1, password: pass1 });
    if (login1Err) throw new Error(`Login failed for user 1: ${login1Err.message}`);

    const { error: login2Err } = await client2.auth.signInWithPassword({ email: email2, password: pass2 });
    if (login2Err) throw new Error(`Login failed for user 2: ${login2Err.message}`);

    console.log('Logins successful.');

    // 4. Comprobar guardado atómico y mismo día/mismo total (Atomic save + RLS isolation)
    console.log('Testing atomic save and RLS...');
    const testDate = new Date().toISOString().split('T')[0];

    const { data: rpcData1, error: rpcErr1 } = await client1.rpc('set_daily_report', {
      p_work_date: testDate,
      p_resolved_count: 5,
      p_expected_revision: 0
    });
    if (rpcErr1) throw new Error(`set_daily_report failed for client 1: ${rpcErr1.message}`);
    if (!rpcData1 || rpcData1.success !== true || rpcData1.revision !== 1) {
      throw new Error(`set_daily_report invalid creation response: ${JSON.stringify(rpcData1)}`);
    }

    const { data: rpcData2, error: rpcErr2 } = await client2.rpc('set_daily_report', {
      p_work_date: testDate,
      p_resolved_count: 5, // SAME TOTAL
      p_expected_revision: 0
    });
    if (rpcErr2) throw new Error(`set_daily_report failed for client 2: ${rpcErr2.message}`);
    if (!rpcData2 || rpcData2.success !== true || rpcData2.revision !== 1) {
      throw new Error(`set_daily_report invalid creation response for client 2: ${JSON.stringify(rpcData2)}`);
    }

    // Verify isolation: Client 2 should only see their own report, not Client 1's
    const { data: c2Reports, error: readErr } = await client2.from('daily_reports').select('*').eq('work_date', testDate);
    if (readErr) throw new Error(`Read failed: ${readErr.message}`);
    if (c2Reports.length !== 1) throw new Error(`RLS Failure: Client 2 sees ${c2Reports.length} reports for the date.`);
    if (c2Reports[0].user_id !== uid2) throw new Error('RLS Failure: Client 2 sees report belonging to someone else.');

    // Mismo día/mismo total (Conflict testing on client 1)
    const { data: rpcDataConflict, error: rpcConflictErr } = await client1.rpc('set_daily_report', {
      p_work_date: testDate,
      p_resolved_count: 10,
      p_expected_revision: 0 // Expected 0, but it is actually 1 now.
    });
    if (rpcConflictErr) throw new Error(`set_daily_report conflict threw exception instead of returning conflict object: ${rpcConflictErr.message}`);
    if (rpcDataConflict.success !== false || rpcDataConflict.conflict !== true || rpcDataConflict.current_revision !== 1) {
      throw new Error(`set_daily_report conflict response invalid: ${JSON.stringify(rpcDataConflict)}`);
    }

    console.log('RLS and Atomic saves verified.');

    // 5. Desactivar uno y confirmar bloqueo
    console.log('Testing user disable...');
    await disableManagedUser(adminClient, uid1);

    // Auth ban blocks NEW logins
    const { error: login1BlockedErr } = await client1.auth.signInWithPassword({ email: email1, password: pass1 });
    if (!login1BlockedErr) throw new Error('Disable failure: User 1 could still log in.');

    // Client with previous token fails to read reports (RLS status check)
    const { error: readBlockedErr, data: readBlockedData } = await client1.from('daily_reports').select('*');
    if (readBlockedErr) console.log('Read blocked as expected:', readBlockedErr.message);
    if (readBlockedData && readBlockedData.length > 0) throw new Error('Disable failure: User 1 can still read reports.');

    // Client with previous token fails to RPC (inactive profile check)
    const { error: rpcBlockedErr } = await client1.rpc('set_daily_report', {
      p_work_date: testDate,
      p_resolved_count: 15,
      p_expected_revision: 1
    });
    if (!rpcBlockedErr || !rpcBlockedErr.message.includes('No se encontró el perfil activo para el usuario.')) {
      throw new Error(`Disable failure: User 1 RPC did not fail correctly. Error: ${rpcBlockedErr?.message}`);
    }

    console.log('Disable user verified.');

    // 6. Restablecimiento de contraseña
    console.log('Testing password reset...');
    const newPass2 = `NewSsmkTest#2_${timestamp}`;
    await resetManagedUserPassword(adminClient, uid2, newPass2);

    const { error: login2OldErr } = await client2.auth.signInWithPassword({ email: email2, password: pass2 });
    if (!login2OldErr) throw new Error('Password reset failure: could still log in with old password.');

    const { error: login2NewErr } = await client2.auth.signInWithPassword({ email: email2, password: newPass2 });
    if (login2NewErr) throw new Error(`Password reset failure: could not log in with new password: ${login2NewErr.message}`);

    console.log('Password reset verified.');

  } catch (err) {
    testError = err;
  }

  // 7. Eliminar usuarios sintéticos
  console.log('Cleaning up synthetic data...');
  const cleanupErrors = [];

  const cleanupUser = async (uid) => {
    if (!uid) return;
    try {
      await adminClient.auth.admin.deleteUser(uid);

      // Verification: ensure no profile or reports exist
      const { data: profs } = await adminClient.from('profiles').select('*').eq('user_id', uid);
      if (profs && profs.length > 0) cleanupErrors.push(`Profile for ${uid} was not cascade-deleted.`);

      const { data: reps } = await adminClient.from('daily_reports').select('*').eq('user_id', uid);
      if (reps && reps.length > 0) cleanupErrors.push(`Reports for ${uid} were not cascade-deleted.`);
    } catch (e) {
      cleanupErrors.push(`Failed to clean up user ${uid}: ${e.message}`);
    }
  };

  await cleanupUser(uid1);
  await cleanupUser(uid2);

  if (cleanupErrors.length > 0) {
    if (testError) console.error('Original error before cleanup failure:', testError);
    testError = new Error('Cleanup failed with errors:\n' + cleanupErrors.join('\n'));
  }

  console.log('Cleanup complete.');

  if (testError) throw testError;
  console.log('Smoke test completed successfully.');
}

// Only execute if called directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runStagingSmokeTest().catch(err => {
    console.error('Smoke test failed:', err);
    process.exit(1);
  });
}
