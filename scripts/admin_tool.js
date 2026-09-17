import readline from 'readline';
import { getAdminClient, createManagedUser, disableManagedUser, reactivateManagedUser, resetManagedUserPassword } from '../src/backend/authAdmin.js';
import { normalizeUsername } from '../src/utils/auth.js';
import { fileURLToPath } from 'url';

// Default IO implementation using Node.js readline
const defaultIo = {
  write: (msg) => process.stdout.write(msg),
  ask: (question) => {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  },
  askHidden: (question) => {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

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
};

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

  if (urlObj.protocol !== 'https:') {
    throw new Error('Admin Triggered: Protocol must be exactly https:');
  }

  if (urlObj.hostname !== 'unctlwxbttwfumnekctx.supabase.co') {
    throw new Error(`Admin Triggered: Hostname does not match exactly. Received: ${urlObj.hostname}`);
  }

  if (urlObj.port !== '') {
    throw new Error('Admin Triggered: Port must be empty.');
  }

  if (urlObj.pathname !== '/') {
    throw new Error('Admin Triggered: Pathname must be exactly /');
  }

  if (urlObj.search !== '' || urlObj.hash !== '') {
    throw new Error('Admin Triggered: Query and hash must be empty.');
  }

  if (urlObj.username !== '' || urlObj.password !== '') {
    throw new Error('Admin Triggered: Embedded credentials in URL are forbidden.');
  }

  const secKey = env.SUPABASE_SECRET_KEY;
  if (!secKey) throw new Error('Admin Triggered: Missing SUPABASE_SECRET_KEY.');

  return { url: rawUrl, key: secKey };
}

async function resolveUserByUsername(adminClient, username) {
  const emailToFind = normalizeUsername(username);
  let page = 1;
  const perPage = 100;
  let match = null;

  while (true) {
    const { data: usersData, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);

    const users = usersData.users;
    if (!users || users.length === 0) break;

    const pageMatches = users.filter(u => u.email === emailToFind);
    if (pageMatches.length > 1) throw new Error(`Ambigüedad: se encontraron múltiples usuarios con email exacto ${emailToFind}`);
    if (pageMatches.length === 1) {
      if (match) throw new Error(`Ambigüedad: se encontraron múltiples usuarios con email exacto ${emailToFind} a lo largo de las páginas`);
      match = pageMatches[0];
    }

    if (users.length < perPage) break;
    page++;
  }

  if (!match) throw new Error(`No se encontró ningún usuario con el username (email normalizado) exacto: ${emailToFind}`);
  return match.id;
}

export async function createCommand(adminClient, io) {
  const username = await io.ask('Username (será normalizado): ');
  const displayNameRaw = await io.ask('Nombre a mostrar (display_name): ');

  const displayName = displayNameRaw.trim();
  if (!displayName || displayName.length > 100) {
    throw new Error('Nombre inválido. Debe contener entre 1 y 100 caracteres luego de recortar espacios.');
  }

  const password = await io.askHidden('Contraseña (mín 8 caracteres, oculta): ');
  if (password.length < 8) {
    throw new Error('La contraseña debe tener mínimo 8 caracteres.');
  }

  const pwdConfirm = await io.askHidden('Confirme contraseña (oculta): ');
  if (password !== pwdConfirm) {
    throw new Error('Las contraseñas no coinciden.');
  }

  const normalized = normalizeUsername(username);
  const confirm = await io.ask(`\nSe creará el usuario:\nUsername: ${normalized}\nDisplay Name: ${displayName}\n¿Continuar? (y/N): `);

  if (confirm.toLowerCase() === 'y') {
    await createManagedUser(adminClient, username, password, displayName);
    io.write('Usuario creado satisfactoriamente.\n');
  } else {
    io.write('Operación cancelada.\n');
  }
}

export async function listCommand(adminClient, io) {
  io.write('Obteniendo perfiles...\n');
  const { data: profiles, error } = await adminClient.from('profiles').select('display_name, status, user_id');
  if (error) throw new Error(`Falló la consulta de profiles: ${error.message}`);

  // Also get emails to show usernames
  let allUsers = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (listErr) throw new Error(`Failed to list auth users: ${listErr.message}`);
    const users = usersData.users;
    if (!users || users.length === 0) break;
    allUsers = allUsers.concat(users);
    if (users.length < perPage) break;
    page++;
  }

  const emailMap = {};
  allUsers.forEach(u => emailMap[u.id] = u.email);

  io.write(`\nSe encontraron ${profiles.length} perfiles:\n`);
  profiles.forEach(p => {
    const email = emailMap[p.user_id] || 'Desconocido';
    io.write(`- [${p.status.toUpperCase()}] ${email} ("${p.display_name}")\n`);
  });
  io.write('\n');
}

export async function disableCommand(adminClient, io) {
  const username = await io.ask('Username exacto a desactivar: ');
  const userId = await resolveUserByUsername(adminClient, username);
  const confirm = await io.ask(`¿Desactivar usuario ${normalizeUsername(username)}? (y/N): `);
  if (confirm.toLowerCase() === 'y') {
    await disableManagedUser(adminClient, userId);
    io.write('Usuario desactivado de forma segura.\n');
  } else {
    io.write('Operación cancelada.\n');
  }
}

export async function reactivateCommand(adminClient, io) {
  const username = await io.ask('Username exacto a reactivar: ');
  const userId = await resolveUserByUsername(adminClient, username);
  const confirm = await io.ask(`¿Reactivar usuario ${normalizeUsername(username)}? (y/N): `);
  if (confirm.toLowerCase() === 'y') {
    await reactivateManagedUser(adminClient, userId);
    io.write('Usuario reactivado de forma segura.\n');
  } else {
    io.write('Operación cancelada.\n');
  }
}

export async function resetCommand(adminClient, io) {
  const username = await io.ask('Username exacto para reseteo: ');
  const userId = await resolveUserByUsername(adminClient, username);

  const password = await io.askHidden('Nueva contraseña (mín 8 caracteres, oculta): ');
  if (password.length < 8) {
    throw new Error('La contraseña debe tener mínimo 8 caracteres.');
  }

  const pwdConfirm = await io.askHidden('Confirme contraseña (oculta): ');
  if (password !== pwdConfirm) {
    throw new Error('Las contraseñas no coinciden.');
  }

  const confirm = await io.ask(`\n¿Restablecer contraseña para ${normalizeUsername(username)}? (y/N): `);

  if (confirm.toLowerCase() === 'y') {
    await resetManagedUserPassword(adminClient, userId, password);
    io.write('Contraseña restablecida satisfactoriamente.\n');
  } else {
    io.write('Operación cancelada.\n');
  }
}

export async function runAdminTool(env = process.env, io = defaultIo) {
  try {
    const config = checkAdminGuard(env);
    const adminClient = getAdminClient(config.url, config.key);

    io.write('--- HERRAMIENTA ADMINISTRATIVA LOCAL ---\n');
    io.write('1) Listar perfiles\n');
    io.write('2) Crear cuenta\n');
    io.write('3) Desactivar usuario\n');
    io.write('4) Reactivar usuario\n');
    io.write('5) Restablecer contraseña\n');
    io.write('0) Salir\n');

    const choice = await io.ask('\nSeleccione una opción: ');

    if (choice === '1') await listCommand(adminClient, io);
    else if (choice === '2') await createCommand(adminClient, io);
    else if (choice === '3') await disableCommand(adminClient, io);
    else if (choice === '4') await reactivateCommand(adminClient, io);
    else if (choice === '5') await resetCommand(adminClient, io);
    else if (choice === '0') io.write('Saliendo.\n');
    else io.write('Opción inválida.\n');
  } catch (err) {
    io.write(`Operación fallida: ${err.message}\n`);
    throw err; // Propagate error for testing/process exit
  }
}

// Entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAdminTool().catch(() => {
    process.exitCode = 1;
  });
}
