import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;
const CONNECTION_STRING = process.env.PG_CONN_STRING || 'postgresql://postgres:postgres@localhost:54322/postgres';

async function runConcurrentRace(adminClient, client1, client2, iteration) {
  let testUserId = crypto.randomUUID();
  let createdUsers = [];

  try {
    // 1. Setup as postgres (admin)
    await adminClient.query(`INSERT INTO auth.users (id) VALUES ($1)`, [testUserId]);
    await adminClient.query(`INSERT INTO public.profiles (user_id, display_name, status) VALUES ($1, 'ConcurrentTestUser', 'active')`, [testUserId]);
    createdUsers.push(testUserId);
    console.log(`\n[Iteración ${iteration}] Usuario de prueba creado: ${testUserId}`);

    // 2. Setup standard authenticated sessions for both clients
    const setupClient = async (client) => {
      await client.query(`SET ROLE authenticated`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: testUserId })]);
    };

    await setupClient(client1);
    await setupClient(client2);

    // 3. Test concurrent creation
    console.log(`[Iteración ${iteration} - Prueba 1] Creación concurrente (expected_revision = 0)...`);
    const dateStr = `2026-09-${(iteration + 10).toString().padStart(2, '0')}`;
    const createPromises = [
      client1.query(`SELECT public.set_daily_report($1, 10, 0) AS res`, [dateStr]),
      client2.query(`SELECT public.set_daily_report($1, 10, 0) AS res`, [dateStr])
    ];
    const createResults = await Promise.all(createPromises);

    let successes = 0;
    let conflicts = 0;
    for (const res of createResults) {
      const data = res.rows[0].res;
      if (data.success) successes++;
      if (data.conflict) conflicts++;
    }

    if (successes !== 1 || conflicts !== 1) {
      throw new Error(`Fallo en exclusión de creación concurrente. Éxitos: ${successes}, Conflictos: ${conflicts}`);
    }

    // 4. Test concurrent update
    console.log(`[Iteración ${iteration} - Prueba 2] Actualización concurrente (expected_revision = 1)...`);
    // Pass 15 from client1, 20 from client2. The winner's value should persist.
    const updatePromises = [
      client1.query(`SELECT public.set_daily_report($1, 15, 1) AS res`, [dateStr]),
      client2.query(`SELECT public.set_daily_report($1, 20, 1) AS res`, [dateStr])
    ];
    const updateResults = await Promise.all(updatePromises);

    successes = 0;
    conflicts = 0;
    let expectedFinalValue = null;

    for (let i = 0; i < updateResults.length; i++) {
      const data = updateResults[i].rows[0].res;
      if (data.success) {
        successes++;
        expectedFinalValue = i === 0 ? 15 : 20; // client1 was 15, client2 was 20
      }
      if (data.conflict) conflicts++;
    }

    if (successes !== 1 || conflicts !== 1) {
      throw new Error(`Fallo en exclusión de actualización concurrente. Éxitos: ${successes}, Conflictos: ${conflicts}`);
    }

    // 5. Retry test (Obsolete revision)
    console.log(`[Iteración ${iteration} - Prueba 3] Reintento con revisión obsoleta (esperado: 1)...`);
    const retryResult = await client1.query(`SELECT public.set_daily_report($1, 30, 1) AS res`, [dateStr]);
    const retryData = retryResult.rows[0].res;
    if (!retryData.conflict) {
       throw new Error(`Fallo en reintento: sobrescribió los datos con revisión obsoleta.`);
    }

    // 5.5 Prueba 4: Respuesta perdida y reintento idéntico
    console.log(`[Iteración ${iteration} - Prueba 4] Simulación de respuesta perdida tras guardado exitoso...`);

    // El cliente manda una actualización exitosa a la revisión 2 con el valor 25
    const simSuccessRes = await client1.query(`SELECT public.set_daily_report($1, 25, 2) AS res`, [dateStr]);
    if (!simSuccessRes.rows[0].res.success) {
      throw new Error(`La actualización base falló, no se pudo preparar la prueba 4.`);
    }

    // SIMULACIÓN: El cliente pierde la conexión de red justo antes de recibir "simSuccessRes".
    // El cliente asume que falló, y dado que la red vuelve, REINTENTA exactamente la misma petición.
    // Envía el valor 25 con la revisión que conocía: 2.
    const lostResponseRetry = await client1.query(`SELECT public.set_daily_report($1, 25, 2) AS res`, [dateStr]);
    const lostData = lostResponseRetry.rows[0].res;

    if (lostData.success || !lostData.conflict) {
      throw new Error(`El reintento debió producir conflicto porque la BD ya avanzó a la revisión 3.`);
    }
    if (lostData.current_revision !== 3) {
      throw new Error(`El reintento por pérdida de respuesta no devolvió la revisión actual 3, devolvió ${lostData.current_revision}`);
    }

    expectedFinalValue = 25; // actualizamos el valor esperado para la validación final

    // 6. Verify final database state
    console.log(`[Iteración ${iteration} - Validación] Comprobando el estado final en base de datos...`);
    const dbState = await adminClient.query(`SELECT resolved_count, revision FROM public.daily_reports WHERE user_id = $1 AND work_date = $2`, [testUserId, dateStr]);
    const finalRow = dbState.rows[0];

    // Ahora esperamos la revisión 3 porque hicimos un guardado exitoso (Prueba 4) y un reintento fallido.
    if (finalRow.revision !== 3) {
      throw new Error(`La revisión final es incorrecta. Esperada: 3, Actual: ${finalRow.revision}`);
    }
    if (finalRow.resolved_count !== expectedFinalValue) {
      throw new Error(`El valor final es incorrecto. Se esperaba el valor del ganador (${expectedFinalValue}), pero es: ${finalRow.resolved_count}`);
    }
    console.log(`✅ Iteración ${iteration} superada. El cliente ganador guardó ${expectedFinalValue}.`);

  } finally {
    // 7. Cleanup
    try {
      if (createdUsers.length > 0) {
        await adminClient.query(`DELETE FROM auth.users WHERE id = ANY($1)`, [createdUsers]);
      }
    } catch(e) {
      console.error('Error durante la limpieza en la iteración:', e.message);
      process.exitCode = 1;
    }
  }
}

async function runAll() {
  console.log('--- Iniciando prueba de concurrencia de revisiones ---');

  const adminClient = new Client({ connectionString: CONNECTION_STRING });
  const client1 = new Client({ connectionString: CONNECTION_STRING });
  const client2 = new Client({ connectionString: CONNECTION_STRING });

  try {
    await adminClient.connect();
    await client1.connect();
    await client2.connect();

    // Repeat 5 times
    for (let i = 1; i <= 5; i++) {
      await runConcurrentRace(adminClient, client1, client2, i);
    }

    console.log('\n✅ Todas las pruebas de concurrencia finalizaron correctamente.');
  } catch (err) {
    console.error('\n❌ ERROR EN LA PRUEBA:', err.message);
    process.exitCode = 1;
  } finally {
    console.log('\n[Limpieza] Cerrando conexiones...');
    await client1.end().catch(()=>{});
    await client2.end().catch(()=>{});
    await adminClient.end().catch(()=>{});
  }
}

runAll();
