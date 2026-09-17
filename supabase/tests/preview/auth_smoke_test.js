import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createManagedUser } from '../../../src/backend/authAdmin.js';

async function runPreviewSmokeTest() {
  if (process.env.ALLOW_PREVIEW_SMOKE !== '1') {
    console.error('Error: ALLOW_PREVIEW_SMOKE=1 is required to run the preview smoke test.');
    process.exit(1);
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_URL.includes('unctlwxbttwfumnekctx.supabase.co')) {
    console.error('Error: Smoke test must point exclusively to the unctlwxbttwfumnekctx project.');
    process.exit(1);
  }

  if (!SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
    console.error('Error: Missing Supabase credentials.');
    process.exit(1);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const timestamp = Date.now();
  const shortId = crypto.randomUUID().split('-')[0]; // only for safe error logs
  const email = `preview_smoke_${timestamp}@walkingweb.internal`;
  const username = `preview_smoke_${timestamp}`;
  const pass = crypto.randomBytes(16).toString('hex') + 'A1!';
  
  let uid = null;
  let testError = null;

  try {
    // 1. Create synthetic user
    uid = await createManagedUser(adminClient, username, pass, 'Preview Smoke');
    
    // 2. Test login
    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { error: loginErr } = await client.auth.signInWithPassword({ email, password: pass });
    if (loginErr) throw new Error(`Login failed: ${loginErr.message}`);
    
    // 3. Test insert report
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
        const cleanupErrors = [];
        const { error: delErr } = await adminClient.auth.admin.deleteUser(uid);
        if (delErr) cleanupErrors.push(`Admin deleteUser failed: ${delErr.message}`);
        
        // Verify cascade deletes
        const { data: profs, error: profErr } = await adminClient.from('profiles').select('user_id').eq('user_id', uid);
        if (profErr) cleanupErrors.push(`Profile check failed: ${profErr.message}`);
        if (profs && profs.length > 0) cleanupErrors.push(`Profile was not cascade-deleted.`);
        
        const { data: reps, error: repErr } = await adminClient.from('daily_reports').select('id').eq('user_id', uid);
        if (repErr) cleanupErrors.push(`Reports check failed: ${repErr.message}`);
        if (reps && reps.length > 0) cleanupErrors.push(`Reports were not cascade-deleted.`);
        
        if (cleanupErrors.length > 0) {
          const cleanupErrorStr = `Cleanup failed for test user [${shortId}]: ${cleanupErrors.join(', ')}`;
          if (testError) {
            testError = new Error(`${testError.message}\n${cleanupErrorStr}`);
          } else {
            testError = new Error(cleanupErrorStr);
          }
        }
      } catch (cleanupErr) {
        const cleanupErrorStr = `Cleanup failed for test user [${shortId}]: ${cleanupErr.message}`;
        if (testError) {
          testError = new Error(`${testError.message}\n${cleanupErrorStr}`);
        } else {
          testError = new Error(cleanupErrorStr);
        }
      }
    }
  }

  if (testError) {
    console.error(`Preview smoke test failed [ID: ${shortId}]:`, testError.message);
    process.exit(1);
  } else {
    console.log('Preview smoke test completed and cleaned up successfully.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runPreviewSmokeTest().catch(err => {
    console.error('Unhandled smoke test error:', err.message);
    process.exit(1);
  });
}
