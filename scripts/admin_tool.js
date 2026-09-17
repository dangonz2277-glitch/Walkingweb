import readline from 'readline';
import { getAdminClient, createManagedUser, disableManagedUser, reactivateManagedUser, resetManagedUserPassword } from '../src/backend/authAdmin.js';
import { normalizeUsername } from '../src/utils/auth.js';
import { fileURLToPath } from 'url';

// Helper for hidden password input using Node.js readline
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Mute output
    let muted = false;
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (muted) {
        if (stringToWrite === '\r\n' || stringToWrite === '\n') {
          process.stdout.write(stringToWrite);
        }
        return;
      }
      process.stdout.write(stringToWrite);
    };

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function checkAdminGuard(env) {
  if (env.ALLOW_STAGING_MUTATION !== '1') {
    throw new Error('Admin Triggered: ALLOW_STAGING_MUTATION=1 is required to run administrative commands.');
  }

  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  if (!rawUrl) throw new Error('Admin Triggered: Supabase URL is missing.');

  let urlObj;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    throw new Error('Admin Triggered: URL is invalid.');
  }

  if (urlObj.hostname !== 'unctlwxbttwfumnekctx.supabase.co') {
    throw new Error(`Admin Triggered: Hostname does not match the exact expected staging project ref. Received: ${urlObj.hostname}`);
  }

  if (urlObj.username !== '' || urlObj.password !== '') {
    throw new Error('Admin Triggered: Embedded credentials in URL are forbidden.');
  }

  const secKey = env.SUPABASE_SECRET_KEY;
  if (!secKey) throw new Error('Admin Triggered: Missing SUPABASE_SECRET_KEY.');

  return { url: rawUrl, key: secKey };
}

export async function createCommand(adminClient) {
  const username = await ask('Username (will be normalized): ');
  const displayName = await ask('Display Name: ');
  const password = await askHidden('Password (min 8 chars, hidden): ');

  const normalized = normalizeUsername(username);
  const confirm = await ask(`\nWill create user:\nEmail: ${normalized}\nDisplay Name: ${displayName}\nContinue? (y/N): `);

  if (confirm.toLowerCase() === 'y') {
    await createManagedUser(adminClient, username, password, displayName);
    console.log('User created successfully.');
  } else {
    console.log('Aborted.');
  }
}

export async function listCommand(adminClient) {
  console.log('Fetching profiles...');
  const { data: profiles, error } = await adminClient.from('profiles').select('display_name, status, user_id');
  if (error) throw new Error(`Failed to list profiles: ${error.message}`);

  console.log(`\nFound ${profiles.length} profiles:`);
  profiles.forEach(p => {
    // Hide full UUID, just show first 8 chars
    const shortId = p.user_id.substring(0, 8) + '...';
    console.log(`- [${p.status.toUpperCase()}] ${p.display_name} (ID: ${shortId})`);
  });
  console.log('');
}

export async function disableCommand(adminClient) {
  const userId = await ask('Full UUID to disable: ');
  const confirm = await ask(`Disable user ${userId}? (y/N): `);
  if (confirm.toLowerCase() === 'y') {
    await disableManagedUser(adminClient, userId);
    console.log('User disabled successfully.');
  } else {
    console.log('Aborted.');
  }
}

export async function reactivateCommand(adminClient) {
  const userId = await ask('Full UUID to reactivate: ');
  const confirm = await ask(`Reactivate user ${userId}? (y/N): `);
  if (confirm.toLowerCase() === 'y') {
    await reactivateManagedUser(adminClient, userId);
    console.log('User reactivated successfully.');
  } else {
    console.log('Aborted.');
  }
}

export async function resetCommand(adminClient) {
  const userId = await ask('Full UUID for password reset: ');
  const password = await askHidden('New Password (min 8 chars, hidden): ');
  const confirm = await ask(`\nReset password for user ${userId}? (y/N): `);

  if (confirm.toLowerCase() === 'y') {
    await resetManagedUserPassword(adminClient, userId, password);
    console.log('Password reset successfully.');
  } else {
    console.log('Aborted.');
  }
}

export async function runAdminTool() {
  let config;
  try {
    config = checkAdminGuard(process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const adminClient = getAdminClient(config.url, config.key);

  console.log('--- PROFILE ADMINISTRATION TOOL ---');
  console.log('1) List profiles');
  console.log('2) Create account & profile');
  console.log('3) Disable user');
  console.log('4) Reactivate user');
  console.log('5) Reset password');
  console.log('0) Exit');

  const choice = await ask('\nSelect an option: ');

  try {
    if (choice === '1') await listCommand(adminClient);
    else if (choice === '2') await createCommand(adminClient);
    else if (choice === '3') await disableCommand(adminClient);
    else if (choice === '4') await reactivateCommand(adminClient);
    else if (choice === '5') await resetCommand(adminClient);
    else if (choice === '0') console.log('Exiting.');
    else console.log('Invalid option.');
  } catch (err) {
    console.error(`Operation failed: ${err.message}`);
  }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAdminTool();
}
