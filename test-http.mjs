const BASE = 'http://localhost:3000';
const ADDR = 'kaspatest:qph5gvywder93263z0zq602jfhuyrp66f8kk5h60fh3agczv6y2m67j5rtkk6';

let passed = 0;
let failed = 0;

async function assert(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL ${name}: ${e.message}`);
    failed++;
  }
}

await assert('GET / returns HTML', async () => {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const text = await res.text();
  if (!text.includes('Kaspa Statement')) throw new Error('missing title');
});

await assert('POST /api/web/statement returns statement', async () => {
  const res = await fetch(`${BASE}/api/web/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: ADDR })
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const data = await res.json();
  if (!data.address) throw new Error('no address');
  if (!data.balance) throw new Error('no balance');
  if (!Array.isArray(data.txs)) throw new Error('txs not array');
  console.log(`     ${data.txs.length} txs, balance: ${data.balance}`);
});

await assert('POST /api/web/receipt returns receipt', async () => {
  const txid = '90da84cd98390f01063fc7490c5257f15aaf6b2f8fbc4e153177c2d153b40cde';
  const res = await fetch(`${BASE}/api/web/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txid })
  });
  if (!res.ok) throw new Error(`status ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.tx) throw new Error('no tx');
  if (!data.tx.transaction_id) throw new Error('no transaction_id');
  if (!data.price) throw new Error('no price');
  console.log(`     tx: ${txid.slice(0, 16)}..., price: ${data.price}`);
});

await assert('POST /api/x402/statement returns 402 with PAYMENT-REQUIRED header', async () => {
  const res = await fetch(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: ADDR })
  });
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
  const paymentHeader = res.headers.get('PAYMENT-REQUIRED');
  if (!paymentHeader) throw new Error('missing PAYMENT-REQUIRED header');
  const data = await res.json();
  if (data.x402Version !== 2) throw new Error('wrong x402 version');
  if (!data.accepts || data.accepts.length === 0) throw new Error('no accepts');
  if (data.accepts[0].scheme !== 'exact') throw new Error('wrong scheme');
  if (data.accepts[0].amount !== '10000000') throw new Error('wrong amount');
  console.log(`     paymentId: ${data.accepts[0].extra.paymentId.slice(0, 16)}...`);
});

await assert('POST /api/x402/receipt returns 402', async () => {
  const res = await fetch(`${BASE}/api/x402/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txid: '90da84cd98390f01063fc7490c5257f15aaf6b2f8fbc4e153177c2d153b40cde' })
  });
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
  const data = await res.json();
  if (data.x402Version !== 2) throw new Error('wrong x402 version');
});

await assert('POST /api/x402/statement with bad payment returns 402', async () => {
  const res = await fetch(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-K402-Payment': 'kaspa-utxo deadbeef p_nonexistent'
    },
    body: JSON.stringify({ address: ADDR })
  });
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
});

await assert('POST /api/web/statement with bad address returns 400', async () => {
  const res = await fetch(`${BASE}/api/web/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: 'not-an-address' })
  });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

await assert('POST /api/web/receipt with bad txid returns 400', async () => {
  const res = await fetch(`${BASE}/api/web/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txid: 'not-a-txid' })
  });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
