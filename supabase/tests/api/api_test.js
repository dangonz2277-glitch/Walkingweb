import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { 
  getAdminClient, 
  createManagedUser, 
  disableManagedUser, 
  reactivateManagedUser, 
  resetManagedUserPassword 
} from '../../src/backend/authAdmin.js';

async function runApiTests() {
  console.log('--- Iniciando pruebas de API HTTP locales (Orden 05) ---');
  let exitCode = 0;
  
  // Get credentials securely
  let SUPABASE_URL = process.env.SUPABASE_URL;
  let SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    try {
      console.log('Obteniendo credenciales de la CLI de Supabase...');
      const statusJson = execSync('npx supabase status -o json', { stdio: 'pipe' }).toString();
      const status = JSON.parse(statusJson);
      SUPABASE_URL = SUPABASE_URL || status.API_URL;
      SUPABASE_ANON_KEY = SUPABASE_ANON_KEY || status.ANON_KEY;
      SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY || status.SERVICE_ROLE_KEY;
    } catch {
      console.error('No se pudieron obtener las credenciales de Supabase automáticamente.');
      process.exit(1);
    }
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan claves de API (URL, ANON_KEY o SERVICE_ROLE_KEY).');
    process.exit(1);
  }

  const aliceEmail = `alice_${crypto.randomUUID()}@example.com`;
  const bobEmail = `bob_${crypto.randomUUID()}@example.com`;
  const password = 'TestPassword123!';

  const adminClient = getAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const aliceClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const bobClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let createdUsers = [];

  try {
    // 1. Registro público cerrado
    console.log('\n[Prueba 1] Registro público cerrado...');
    const { error: signUpError } = await anonClient.auth.signUp({
      email: `anon_${crypto.randomUUID()}@example.com`,
      password: 'SomePassword123!'
    });
    if (!signUpError || !signUpError.message.toLowerCase().includes('signup requires a valid password') && !signUpError.message.toLowerCase().includes('signups not allowed')) {
      // NOTE: With enable_signup = false, it should return an error saying signups not allowed.
      throw new Error(`Anónimo logró registrarse o no dio el error esperado: ${signUpError?.message}`);
    }
    console.log('✅ Registro anónimo bloqueado por configuración.');

    // 2. Alta Administrada Consistente
    console.log('\n[Prueba 2] Alta administrada (Alice y Bob)...');
    
    // Alice (Active)
    const aliceId = await createManagedUser(adminClient, aliceEmail, password, 'Alice Admin');
    createdUsers.push(aliceId);
    
    // Bob (Disabled)
    const bobId = await createManagedUser(adminClient, bobEmail, password, 'Bob Admin');
    createdUsers.push(bobId);
    await disableManagedUser(adminClient, bobId);

    console.log(`✅ Cuentas administradas creadas (Alice: ${aliceId}, Bob: ${bobId}).`);

    // 3. Acceso individual y rechazo de contraseñas incorrectas
    console.log('\n[Prueba 3] Acceso individual y contraseña incorrecta...');
    const { error: badAuthErr } = await aliceClient.auth.signInWithPassword({ email: aliceEmail, password: 'WrongPassword' });
    if (!badAuthErr) throw new Error('Se permitió el login con contraseña incorrecta.');
    
    const { error: aliceAuthErr } = await aliceClient.auth.signInWithPassword({ email: aliceEmail, password });
    if (aliceAuthErr) throw new Error(`Alice no pudo loguearse con contraseña correcta: ${aliceAuthErr.message}`);
    
    const { error: bobAuthErr } = await bobClient.auth.signInWithPassword({ email: bobEmail, password });
    if (bobAuthErr) throw new Error(`Bob no pudo loguearse: ${bobAuthErr.message}`);
    console.log('✅ Auth correcta: Acceso denegado con mala clave, permitido con la correcta.');

    // 4. Bob (desactivado) tiene token vigente, pero API bloqueada
    console.log('\n[Prueba 4] Perfil desactivado no puede leer/escribir...');
    const { data: bobRead, error: bobReadErr } = await bobClient.from('daily_reports').select('*');
    if (bobReadErr) throw new Error(`Error inesperado en SELECT de Bob: ${bobReadErr.message}`);
    if (!bobRead || bobRead.length > 0) throw new Error(`Bob leyó datos incorrectamente.`);
    
    const { error: bobRpcErr } = await bobClient.rpc('set_daily_report', { p_work_date: '2026-09-13', p_resolved_count: 10, p_expected_revision: 0 });
    if (!bobRpcErr || !bobRpcErr.message.includes('Profile is not active')) {
       throw new Error(`Bob logró llamar RPC pese a estar desactivado.`);
    }
    console.log('✅ Bob está desactivado y bloqueado en la API.');

    // 5. Elevación de perfil bloqueada y auto-creación prohibida
    console.log('\n[Prueba 5] Alice no puede cambiar su status ni crear su perfil...');
    const { error: aliceProfileUpdateErr } = await aliceClient.from('profiles').update({ status: 'admin' }).eq('user_id', aliceId);
    if (!aliceProfileUpdateErr || aliceProfileUpdateErr.code !== '42501') {
      throw new Error(`Alice logró actualizar su profile status.`);
    }
    const { error: aliceProfileInsertErr } = await aliceClient.from('profiles').insert({ user_id: aliceId, display_name: 'Fake', status: 'admin' });
    if (!aliceProfileInsertErr || aliceProfileInsertErr.code !== '42501') {
      throw new Error(`Alice logró crear un registro en profiles directamente.`);
    }
    console.log('✅ Manipulación autónoma de perfiles prohibida.');

    // 6. Reactivación por administración
    console.log('\n[Prueba 6] Reactivación de Bob por administración...');
    await reactivateManagedUser(adminClient, bobId);
    
    // Ahora Bob (con su token original aún vigente) debería poder invocar la RPC
    const { data: bobRpcReactivated, error: bobRpcReactivatedErr } = await bobClient.rpc('set_daily_report', { 
      p_work_date: '2026-09-14', p_resolved_count: 2, p_expected_revision: 0 
    });
    if (bobRpcReactivatedErr) {
       throw new Error(`Bob reactivado falló al invocar RPC: ${bobRpcReactivatedErr.message}`);
    }
    if (!bobRpcReactivated.success) throw new Error(`RPC de Bob reactivado devolvió error: ${JSON.stringify(bobRpcReactivated)}`);
    console.log('✅ Bob reactivado administrado pudo operar exitosamente.');

    // 7. Reset Password
    console.log('\n[Prueba 7] Reset administrado de contraseña (Alice)...');
    const newPassword = 'NewAlicePassword456!';
    await resetManagedUserPassword(adminClient, aliceId, newPassword);
    
    // Verificar que Alice no puede loguearse con la vieja
    const { error: oldPassErr } = await aliceClient.auth.signInWithPassword({ email: aliceEmail, password });
    if (!oldPassErr) throw new Error('Alice pudo loguearse con la contraseña antigua tras el reset.');
    
    // Y sí con la nueva (requiere nueva instancia para no mezclar sesiones)
    const aliceClientNew = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: newPassErr } = await aliceClientNew.auth.signInWithPassword({ email: aliceEmail, password: newPassword });
    if (newPassErr) throw new Error(`Alice no pudo loguearse con la nueva contraseña: ${newPassErr.message}`);
    console.log('✅ Reset administrado de contraseña comprobado.');

  } catch(e) {
    console.error('\n❌ ERROR EN LA PRUEBA:', e.message);
    exitCode = 1;
  } finally {
    // 8. Cleanup
    try {
      if (createdUsers.length > 0) {
        console.log('\n[Limpieza] Borrando usuarios administrados generados...');
        for (const uid of createdUsers) {
          const { error } = await adminClient.auth.admin.deleteUser(uid);
          if (error) console.error(`⚠️ Aviso: Fallo al borrar usuario ${uid}: ${error.message}`);
        }
        console.log(`✅ Limpieza completada.`);
      }
    } catch(e) {
      console.error('❌ Error durante la limpieza:', e.message);
      exitCode = 1;
    }
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  } else {
    console.log('\n✅ Todas las pruebas de Cuentas Administradas (Orden 05) finalizaron correctamente.');
  }
}

runApiTests();
