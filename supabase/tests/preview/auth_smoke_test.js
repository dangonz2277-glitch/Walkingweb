import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createManagedUser } from '../../../src/backend/authAdmin.js';

export function checkPreviewSecurityGuard(env) {
  if (env.ALLOW_PREVIEW_SMOKE !== '1') {
    throw new Error('ALLOW_PREVIEW_SMOKE=1 is required to run the preview smoke test.');
  }

  const urlStr = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  if (!urlStr) {
    throw new Error('Supabase URL is missing.');
  }

  let url;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error('Supabase URL is invalid.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Supabase URL must use https protocol.');
  }

  if (url.hostname !== 'unctlwxbttwfumnekctx.supabase.co') {
    throw new Error('Smoke test must point exclusively to the unctlwxbttwfumnekctx project.');
  }

  if (url.username !== '' || url.password !== '') {
    throw new Error('Embedded credentials in Supabase URL are strictly forbidden.');
  }

  const pubKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const secKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!pubKey || !secKey) {
    throw new Error('Missing Supabase credentials.');
  }

  return { SUPABASE_URL: urlStr, SUPABASE_PUBLISHABLE_KEY: pubKey, SUPABASE_SECRET_KEY: secKey };
}

// Export for unit testing the cleanup logic
export async function performCleanupWithRetries(adminClient, uid) {
  const shortId = uid.substring(uid.length - 4);
  let lastErrorStr = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const cleanupErrors = [];
    try {
      // 1. Delete user from Auth
      const { error: delErr } = await adminClient.auth.admin.deleteUser(uid);
      if (delErr && delErr.status !== 404 && !delErr.message.toLowerCase().includes('not found')) {
        cleanupErrors.push(`deleteUser failed: ${delErr.message}`);
      }

      // 2. Verify Auth User doesn't exist
      const { data: user, error: userErr } = await adminClient.auth.admin.getUserById(uid);
      if (userErr && userErr.status !== 404 && !userErr.message.toLowerCase().includes('not found')) {
        cleanupErrors.push(`getUserById error: ${userErr.message}`);
      } else if (user && user.user) {
        cleanupErrors.push(`Auth user still exists`);
      }

      // 3. Verify 0 rows in profiles
      const { data: profs, error: profErr } = await adminClient.from('profiles').select('user_id').eq('user_id', uid);
      if (profErr) {
        cleanupErrors.push(`profiles check failed: ${profErr.message}`);
      } else if (profs && profs.length > 0) {
        cleanupErrors.push(`profiles has ${profs.length} rows left`);
      }

      // 4. Verify 0 rows in daily_reports
      const { data: reps, error: repErr } = await adminClient.from('daily_reports').select('id').eq('user_id', uid);
      if (repErr) {
        cleanupErrors.push(`daily_reports check failed: ${repErr.message}`);
      } else if (reps && reps.length > 0) {
        cleanupErrors.push(`daily_reports has ${reps.length} rows left`);
      }

      if (cleanupErrors.length === 0) {
        return true; // Cleanup completely successful
      }
      
      lastErrorStr = cleanupErrors.join(' | ');

    } catch (e) {
      lastErrorStr = `Unexpected exception: ${e.message}`;
    }

    if (attempt < 3) {
      await new Promise(res => setTimeout(res, 500 * attempt)); // incremental backoff
    }
  }

  throw new Error(`Cleanup failed after 3 attempts for test user [..${shortId}]: ${lastErrorStr}`);
}

export async function runPreviewSmokeTest(env) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = checkPreviewSecurityGuard(env);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const fullUuid = crypto.randomUUID();
  const email = `preview_smoke_${fullUuid}@walkingweb.internal`;
  const username = `preview_smoke_${fullUuid}`;
  const pass = crypto.randomBytes(16).toString('hex') + 'A1!';
  
  let uid = null;
  let testError = null;

  try {
    uid = await createManagedUser(adminClient, username, pass, 'Preview Smoke');
    
    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { error: loginErr } = await client.auth.signInWithPassword({ email, password: pass });
    if (loginErr) throw new Error(`Login failed: ${loginErr.message}`);
    
    const { data: rpcData, error: rpcErr } = await client.rpc('set_daily_report', {
      p_work_date: new Date().toISOString().split('T')[0],
      p_resolved_count: 3,
      p_expected_revision: 0
    });
    if (rpcErr) throw new Error(`set_daily_report failed: ${rpcErr.message}`);
    if (!rpcData || rpcData.success !== true) {
      throw new Error('set_daily_report invalid response.');
    }
    
  } catch (err) {
    testError = err;
  } finally {
    if (uid) {
      try {
        await performCleanupWithRetries(adminClient, uid);
      } catch (cleanupErr) {
        if (testError) {
          testError = new Error(`${testError.message}\n${cleanupErr.message}`);
        } else {
          testError = cleanupErr;
        }
      }
    }
  }

  if (testError) {
    throw testError;
  }
}

// Only execute if called directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPreviewSmokeTest(process.env).then(() => {
    console.log('Preview smoke test completed and cleaned up successfully.');
  }).catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
