import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;
const CONNECTION_STRING = process.env.PG_CONN_STRING || 'postgresql://postgres:postgres@localhost:54322/postgres';

async function runConcurrentAppendRace() {
  let testUserId = null;
  let originalError = null;
  const cleanupErrors = [];

  const adminClient = new Client({ connectionString: CONNECTION_STRING });
  const clients = Array.from({ length: 5 }, () => new Client({ connectionString: CONNECTION_STRING }));

  const connectedClients = [];

  try {
    await adminClient.connect();
    connectedClients.push(adminClient);

    for (const c of clients) {
      await c.connect();
      connectedClients.push(c);
    }

    testUserId = crypto.randomUUID();
    await adminClient.query(`INSERT INTO auth.users (id) VALUES ($1)`, [testUserId]);
    await adminClient.query(`INSERT INTO public.profiles (user_id, display_name, status) VALUES ($1, 'ConcurrentAppendTester', 'active')`, [testUserId]);

    const setupClient = async (client) => {
      await client.query(`SET ROLE authenticated`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: testUserId })]);
    };

    for (const c of clients) await setupClient(c);

    const clientEntryId = crypto.randomUUID();
    console.log('Sending 5 concurrent append requests with the same client_entry_id...');

    const promises = clients.map(c =>
      c.query(`SELECT * FROM public.append_report_entry(10, 5, 2, $1)`, [clientEntryId])
    );

    const results = await Promise.allSettled(promises);

    let failed = 0;
    const returnedIds = new Set();

    for (const res of results) {
      if (res.status === 'rejected') {
        console.error('Request failed:', res.reason);
        failed++;
      } else {
        const row = res.value.rows[0];
        if (row.calls !== 10 || row.total !== 17) {
          throw new Error('Data returned from RPC is incorrect');
        }
        returnedIds.add(row.id);
      }
    }

    if (failed > 0) {
      throw new Error(`${failed} concurrent requests failed. Expected all to succeed idempotently.`);
    }

    if (returnedIds.size !== 1) {
      throw new Error(`Expected exactly 1 identical ID across all responses, found ${returnedIds.size}`);
    }

    const { rows } = await adminClient.query(`SELECT * FROM public.report_entries WHERE client_entry_id = $1`, [clientEntryId]);
    if (rows.length !== 1) {
      throw new Error(`Expected exactly 1 row to be created due to idempotency, found ${rows.length}`);
    }

    console.log(`Concurrent append test passed. 5 identical requests returned the exact same row ID: ${[...returnedIds][0]}`);

  } catch (err) {
    originalError = err;
  } finally {
    if (testUserId && adminClient && connectedClients.includes(adminClient)) {
      try {
        await adminClient.query(`DELETE FROM auth.users WHERE id = $1`, [testUserId]);
      } catch (cleanupErr) {
        cleanupErrors.push(new Error('Cleanup failed (user deletion): ' + cleanupErr.message));
      }
    }

    for (const c of connectedClients) {
      try {
        await c.end();
      } catch (endErr) {
        cleanupErrors.push(new Error('Failed to close client: ' + endErr.message));
      }
    }
  }

  if (originalError && cleanupErrors.length > 0) {
    throw new AggregateError([originalError, ...cleanupErrors], 'Multiple errors occurred during test and cleanup');
  } else if (originalError) {
    throw originalError;
  } else if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Test passed but cleanup failed');
  }
}

runConcurrentAppendRace().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
