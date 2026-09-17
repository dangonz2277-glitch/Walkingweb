import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;
const CONNECTION_STRING = process.env.PG_CONN_STRING || 'postgresql://postgres:postgres@localhost:54322/postgres';

async function runConcurrentAppendRace() {
  const adminClient = new Client({ connectionString: CONNECTION_STRING });
  
  // Clients for concurrent requests
  const clients = Array.from({ length: 5 }, () => new Client({ connectionString: CONNECTION_STRING }));

  try {
    await adminClient.connect();
    for (const c of clients) await c.connect();

    const testUserId = crypto.randomUUID();
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
    for (const res of results) {
      if (res.status === 'rejected') {
        console.error('Request failed:', res.reason);
        failed++;
      } else {
        const row = res.value.rows[0];
        if (row.calls !== 10 || row.total !== 17) {
          throw new Error('Data returned from RPC is incorrect');
        }
      }
    }

    if (failed > 0) {
      throw new Error(`${failed} concurrent requests failed. Expected all to succeed idempotently.`);
    }

    const { rows } = await adminClient.query(`SELECT * FROM public.report_entries WHERE client_entry_id = $1`, [clientEntryId]);
    if (rows.length !== 1) {
      throw new Error(`Expected exactly 1 row to be created due to idempotency, found ${rows.length}`);
    }

    console.log(`Concurrent append test passed. 5 identical requests resulted in exactly ${rows.length} row without errors.`);

    await adminClient.query(`DELETE FROM auth.users WHERE id = $1`, [testUserId]);
  } finally {
    await adminClient.end();
    for (const c of clients) await c.end();
  }
}

runConcurrentAppendRace().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
