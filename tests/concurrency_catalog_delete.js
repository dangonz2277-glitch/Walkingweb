import pg from 'pg';

async function run() {
  const connStr = process.env.PG_CONN_STRING || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const ident = "concurrent_test_ident_" + Date.now();
  
  const adminClient = new pg.Client({ connectionString: connStr });
  
  try {
    await adminClient.connect();
  } catch (e) {
    console.error("No se pudo conectar a la BD local:", e);
    process.exitCode = 1;
    return;
  }

  const clients = [];
  try {
    for (let i = 0; i < 10; i++) {
      const c = new pg.Client({ connectionString: connStr });
      try {
        await c.connect();
        await c.query('SET ROLE service_role');
        clients.push(c);
      } catch (e) {
        console.error("Fallo al conectar cliente concurrente:", e);
        try {
          await c.end();
        } catch(ce) {
          console.error("Fallo cerrando cliente tras error:", ce);
          process.exitCode = 1;
        }
        process.exitCode = 1;
        throw e;
      }
    }

    const promises = clients.map(c => 
      c.query(`SELECT public.check_catalog_delete_rate_limit($1, 5, '1 minute'::interval) as allowed`, [ident])
    );

    let allowed = 0;
    let blocked = 0;

    const results = await Promise.all(promises);
    for (const res of results) {
      if (res.rows[0].allowed === true) allowed++;
      else blocked++;
    }

    console.log(`Concurrencia completada. Ident: ${ident}`);
    console.log(`Allowed: ${allowed}, Blocked: ${blocked}`);

    const dbRes = await adminClient.query(`SELECT attempts FROM public.catalog_delete_rate_limit WHERE ident_hash = $1`, [ident]);
    const dbAttempts = dbRes.rows.length > 0 ? dbRes.rows[0].attempts : null;
    console.log(`Attempts on DB: ${dbAttempts}`);

    if (allowed !== 5 || blocked !== 5 || dbAttempts !== 10) {
      console.error("❌ Prueba de concurrencia fallida.");
      process.exitCode = 1;
    } else {
      console.log("✅ Prueba de concurrencia exitosa.");
    }
  } catch (e) {
    console.error("❌ Error RPC/SQL no esperado:", e);
    process.exitCode = 1;
  } finally {
    try {
      await adminClient.query('SELECT public.reset_catalog_delete_rate_limit($1)', [ident]);
    } catch (e) {
      console.error("Error limpiando con adminClient:", e);
      process.exitCode = 1;
    }

    for (const c of clients) {
      try {
        await c.end();
      } catch (e) {
        console.error("Error cerrando cliente:", e);
        process.exitCode = 1;
      }
    }
    try {
      await adminClient.end();
    } catch (e) {
      console.error("Error cerrando adminClient:", e);
      process.exitCode = 1;
    }
  }
}

run();
