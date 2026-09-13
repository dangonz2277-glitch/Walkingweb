import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import crypto from 'crypto';
import { execSync } from 'child_process';

const { Client } = pg;

async function runApiTests() {
  console.log('--- Iniciando pruebas de API HTTP locales ---');
  let exitCode = 0;
  
  // Get credentials securely
  let SUPABASE_URL = process.env.SUPABASE_URL;
  let SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const PG_CONN_STRING = process.env.PG_CONN_STRING || 'postgresql://postgres:postgres@localhost:54322/postgres';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    try {
      console.log('Obteniendo credenciales de la CLI de Supabase...');
      const statusJson = execSync('npx supabase status -o json', { stdio: 'pipe' }).toString();
      const status = JSON.parse(statusJson);
      SUPABASE_URL = SUPABASE_URL || status.API_URL;
      SUPABASE_ANON_KEY = SUPABASE_ANON_KEY || status.ANON_KEY;
    } catch {
      console.error('No se pudieron obtener las credenciales de Supabase automáticamente. Usa SUPABASE_URL y SUPABASE_ANON_KEY.');
      process.exit(1);
    }
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing API URL or ANON KEY');
    process.exit(1);
  }

  // Clients
  const adminPg = new Client({ connectionString: PG_CONN_STRING });
  
  const aliceEmail = `alice_${crypto.randomUUID()}@example.com`;
  const bobEmail = `bob_${crypto.randomUUID()}@example.com`;
  const password = 'TestPassword123!';

  // Supabase client (used directly for anon)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const aliceClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const bobClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let pgConnected = false;

  try {
    await adminPg.connect();
    pgConnected = true;

    // 1. Setup synthetic users
    console.log('[Setup] Creando usuarios y perfiles sintéticos...');
    
    // Create Alice
    const { data: aliceAuth, error: aliceErr } = await aliceClient.auth.signUp({
      email: aliceEmail,
      password: password
    });
    if (aliceErr) throw new Error(`Fallo signup Alice: ${aliceErr.message}`);
    const aliceId = aliceAuth.user.id;
    
    // Create Bob
    const { data: bobAuth, error: bobErr } = await bobClient.auth.signUp({
      email: bobEmail,
      password: password
    });
    if (bobErr) throw new Error(`Fallo signup Bob: ${bobErr.message}`);
    const bobId = bobAuth.user.id;

    // Insert profiles explicitly (Alice is active, Bob is disabled)
    await adminPg.query(`INSERT INTO public.profiles (user_id, display_name, status) VALUES ($1, 'Alice API', 'active')`, [aliceId]);
    await adminPg.query(`INSERT INTO public.profiles (user_id, display_name, status) VALUES ($1, 'Bob API', 'disabled')`, [bobId]);

    console.log(`[Setup] Alice: ${aliceId}`);
    console.log(`[Setup] Bob (disabled): ${bobId}`);

    // 2. Test Anon access
    console.log('\n[Prueba] Anónimo no lee/escribe/invoca...');
    const { data: anonRead, error: anonReadErr } = await anonClient.from('daily_reports').select('*');
    if (!anonReadErr || anonReadErr.code !== '42501') {
      throw new Error(`Anónimo logró leer o no dio 42501: ${JSON.stringify(anonReadErr || anonRead)}`);
    }
    const { data: anonWrite, error: anonWriteErr } = await anonClient.from('daily_reports').insert({ work_date: '2026-09-12', resolved_count: 5 });
    if (!anonWriteErr || anonWriteErr.code !== '42501') {
      throw new Error(`Anónimo logró escribir o no dio 42501: ${JSON.stringify(anonWriteErr || anonWrite)}`);
    }
    const { data: _anonRpc, error: anonRpcErr } = await anonClient.rpc('set_daily_report', { p_work_date: '2026-09-12', p_resolved_count: 5, p_expected_revision: 0 });
    if (!anonRpcErr || (anonRpcErr.code !== '42501' && !anonRpcErr.message.includes('permission denied'))) {
       throw new Error(`Anónimo RPC devolvió error inesperado (no fue de permisos): ${JSON.stringify(anonRpcErr || _anonRpc)}`);
    }
    console.log('✅ Bloqueos a anónimo confirmados.');

    // 3. Alice direct INSERT/UPDATE fails
    console.log('\n[Prueba] Alice: INSERT/UPDATE directo falla...');
    const { error: aliceInsertErr } = await aliceClient.from('daily_reports').insert({ work_date: '2026-09-13', resolved_count: 10 });
    if (!aliceInsertErr || aliceInsertErr.code !== '42501') {
      throw new Error(`Alice logró hacer INSERT directo: ${JSON.stringify(aliceInsertErr)}`);
    }
    const { error: aliceUpdateErr } = await aliceClient.from('daily_reports').update({ resolved_count: 100 }).eq('work_date', '2026-09-13');
    if (!aliceUpdateErr || aliceUpdateErr.code !== '42501') {
      throw new Error(`Alice logró hacer UPDATE directo: ${JSON.stringify(aliceUpdateErr)}`);
    }
    console.log('✅ INSERT/UPDATE directo de Alice bloqueados.');

    // 4. Alice successful RPC
    console.log('\n[Prueba] Alice: llama a RPC y crea reporte...');
    const { data: rpcData1, error: rpcErr1 } = await aliceClient.rpc('set_daily_report', { 
      p_work_date: '2026-09-13', p_resolved_count: 10, p_expected_revision: 0 
    });
    if (rpcErr1) throw new Error(`RPC falló: ${rpcErr1.message}`);
    if (!rpcData1.success) throw new Error(`RPC devolvió error: ${JSON.stringify(rpcData1)}`);
    console.log('✅ RPC de creación exitoso.');

    // 5. Alice obsolete revision conflict
    console.log('\n[Prueba] Alice: RPC con revisión obsoleta no altera los datos...');
    const { data: rpcData2, error: rpcErr2 } = await aliceClient.rpc('set_daily_report', { 
      p_work_date: '2026-09-13', p_resolved_count: 20, p_expected_revision: 0 // Debería ser 1
    });
    if (rpcErr2) throw new Error(`RPC falló inesperadamente: ${rpcErr2.message}`);
    if (!rpcData2.conflict) throw new Error(`RPC no devolvió conflicto para revisión obsoleta: ${JSON.stringify(rpcData2)}`);
    
    // Validate nothing changed
    const { data: aliceRead } = await aliceClient.from('daily_reports').select('resolved_count, revision').eq('work_date', '2026-09-13').single();
    if (aliceRead.resolved_count !== 10 || aliceRead.revision !== 1) {
      throw new Error(`Los datos fueron alterados a pesar del conflicto: ${JSON.stringify(aliceRead)}`);
    }
    console.log('✅ Conflicto de revisión detectado y datos inalterados.');

    // 6. Alice cannot elevate profile
    console.log('\n[Prueba] Alice: no puede elevar perfil...');
    const { error: profileErr } = await aliceClient.from('profiles').update({ status: 'admin' }).eq('user_id', aliceId);
    if (!profileErr || profileErr.code !== '42501') {
      throw new Error(`Alice logró elevar perfil o no dio 42501: ${JSON.stringify(profileErr)}`);
    }
    console.log('✅ Elevación de perfil bloqueada.');

    // 7. Bob reads empty and fails to save
    console.log('\n[Prueba] Bob (desactivado) no lee de Alice ni guarda...');
    const { data: bobRead, error: bobReadErr } = await bobClient.from('daily_reports').select('*');
    if (bobReadErr) throw new Error(`Error inesperado en SELECT de Bob: ${bobReadErr.message}`);
    if (!bobRead || bobRead.length > 0) throw new Error(`Bob leyó datos incorrectamente: ${JSON.stringify(bobRead)}`);
    
    const { data: bobRpcData, error: bobRpcErr } = await bobClient.rpc('set_daily_report', { 
      p_work_date: '2026-09-13', p_resolved_count: 10, p_expected_revision: 0 
    });
    if (!bobRpcErr) {
       throw new Error(`Bob logró guardar a pesar de estar desactivado: ${JSON.stringify(bobRpcData)}`);
    }
    if (!bobRpcErr.message.includes('Profile is not active')) {
       throw new Error(`Bob recibió error incorrecto: ${bobRpcErr.message}`);
    }
    console.log('✅ Bob bloqueado correctamente.');

  } catch(e) {
    console.error('\n❌ ERROR EN LA PRUEBA:', e.message);
    exitCode = 1;
  } finally {
    // 8. Cleanup
    try {
      if (pgConnected) {
        console.log('\n[Limpieza] Borrando usuarios generados...');
        const res = await adminPg.query(`DELETE FROM auth.users WHERE email IN ($1, $2)`, [aliceEmail, bobEmail]);
        if (res.rowCount === 0) {
           console.log('⚠️ Aviso: No se borraron usuarios (es posible que no se hayan creado).');
        } else {
           console.log(`✅ Limpieza completada: ${res.rowCount} usuario(s) borrados.`);
        }
      }
    } catch(e) {
      console.error('❌ Error durante la limpieza:', e.message);
      exitCode = 1;
    }
    if (pgConnected) {
      await adminPg.end().catch(()=>{});
    }
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  } else {
    console.log('\n✅ Todas las pruebas de API HTTP finalizaron correctamente.');
  }
}

runApiTests();
