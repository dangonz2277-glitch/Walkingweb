import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

// Local environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxMjg2MDI4NSwiZXhwIjoxOTI4NDM2Mjg1fQ.4A2M09Q9Z2yvD8xR3Wp_6e5U4-q_v7I5tG8h6lP3i6Q';
const PG_CONN_STRING = process.env.PG_CONN_STRING || 'postgresql://postgres:postgres@localhost:54322/postgres';

async function runApiTests() {
  console.log('--- Iniciando pruebas de API HTTP locales ---');
  let exitCode = 0;
  
  // Clients
  const adminPg = new Client({ connectionString: PG_CONN_STRING });
  
  const aliceEmail = `alice_${crypto.randomUUID()}@example.com`;
  const bobEmail = `bob_${crypto.randomUUID()}@example.com`;
  const password = 'TestPassword123!';

  // Supabase client (used directly for anon)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const aliceClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const bobClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    await adminPg.connect();

    // 1. Setup synthetic users
    console.log('[Setup] Creando usuarios...');
    
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

    // Bob is disabled
    await adminPg.query(`UPDATE public.profiles SET status = 'disabled' WHERE user_id = $1`, [bobId]);

    console.log(`[Setup] Alice: ${aliceId}`);
    console.log(`[Setup] Bob (disabled): ${bobId}`);

    // 2. Test Anon access
    console.log('\n[Prueba] Anónimo no lee/escribe...');
    const { data: anonRead, error: anonReadErr } = await anonClient.from('daily_reports').select('*');
    if (!anonReadErr || anonReadErr.code !== '42501') {
      throw new Error(`Anónimo logró leer o no dio 42501: ${JSON.stringify(anonReadErr || anonRead)}`);
    }
    const { data: anonWrite, error: anonWriteErr } = await anonClient.from('daily_reports').insert({ work_date: '2026-09-12', resolved_count: 5 });
    if (!anonWriteErr || anonWriteErr.code !== '42501') {
      throw new Error(`Anónimo logró escribir o no dio 42501: ${JSON.stringify(anonWriteErr || anonWrite)}`);
    }
    const { data: _anonRpc, error: anonRpcErr } = await anonClient.rpc('set_daily_report', { p_work_date: '2026-09-12', p_resolved_count: 5, p_expected_revision: 0 });
    // Function grant revoked -> PostgREST returns 42501 or similar
    if (!anonRpcErr) {
       throw new Error(`Anónimo logró llamar a la RPC.`);
    }
    console.log('✅ Bloqueo a anónimo confirmado.');

    // 3. Alice direct INSERT/UPDATE fails
    console.log('\n[Prueba] Alice: INSERT/UPDATE directo falla...');
    const { error: aliceInsertErr } = await aliceClient.from('daily_reports').insert({ work_date: '2026-09-13', resolved_count: 10 });
    if (!aliceInsertErr || aliceInsertErr.code !== '42501') {
      throw new Error(`Alice logró hacer INSERT directo: ${JSON.stringify(aliceInsertErr)}`);
    }
    console.log('✅ INSERT directo bloqueado.');

    // 4. Alice successful RPC
    console.log('\n[Prueba] Alice: llama a RPC y crea reporte...');
    const { data: rpcData1, error: rpcErr1 } = await aliceClient.rpc('set_daily_report', { 
      p_work_date: '2026-09-13', p_resolved_count: 10, p_expected_revision: 0 
    });
    if (rpcErr1) throw new Error(`RPC falló: ${rpcErr1.message}`);
    if (!rpcData1.success) throw new Error(`RPC devolvió error: ${JSON.stringify(rpcData1)}`);
    console.log('✅ RPC de creación exitoso.');

    // 5. Alice obsolete revision conflict
    console.log('\n[Prueba] Alice: RPC con revisión obsoleta...');
    const { data: rpcData2, error: rpcErr2 } = await aliceClient.rpc('set_daily_report', { 
      p_work_date: '2026-09-13', p_resolved_count: 20, p_expected_revision: 0 // Debería ser 1
    });
    if (rpcErr2) throw new Error(`RPC falló inesperadamente: ${rpcErr2.message}`);
    if (!rpcData2.conflict) throw new Error(`RPC no devolvió conflicto para revisión obsoleta: ${JSON.stringify(rpcData2)}`);
    console.log('✅ Conflicto de revisión detectado.');

    // 6. Alice cannot elevate profile
    console.log('\n[Prueba] Alice: no puede elevar perfil...');
    const { error: profileErr } = await aliceClient.from('profiles').update({ status: 'admin' }).eq('user_id', aliceId);
    if (!profileErr || profileErr.code !== '42501') {
      throw new Error(`Alice logró elevar perfil o no dio 42501: ${JSON.stringify(profileErr)}`);
    }
    console.log('✅ Elevación de perfil bloqueada.');

    // 7. Bob reads empty and fails to save
    console.log('\n[Prueba] Bob (desactivado) no lee de Alice ni guarda...');
    const { data: bobRead } = await bobClient.from('daily_reports').select('*');
    if (bobRead && bobRead.length > 0) throw new Error(`Bob leyó datos: ${JSON.stringify(bobRead)}`);
    
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
      console.log('\n[Limpieza] Borrando usuarios...');
      await adminPg.query(`DELETE FROM auth.users WHERE email IN ($1, $2)`, [aliceEmail, bobEmail]);
    } catch(e) {
      console.error('Error durante la limpieza:', e.message);
      exitCode = 1;
    }
    await adminPg.end().catch(()=>{});
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  } else {
    console.log('\n✅ Todas las pruebas de API HTTP finalizaron correctamente.');
  }
}

runApiTests();
