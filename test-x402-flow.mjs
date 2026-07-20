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

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  return { status: res.status, data: await res.json(), res };
}

await assert('No payment header returns 402 with PAYMENT-REQUIRED header', async () => {
  const { status, data, res } = await fetchJson(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: ADDR })
  });
  if (status !== 402) throw new Error(`expected 402, got ${status}`);
  if (data.x402Version !== 2) throw new Error('not x402 v2');
  const paymentHeader = res.headers.get('PAYMENT-REQUIRED');
  if (!paymentHeader) throw new Error('missing PAYMENT-REQUIRED header');
  console.log(`     paymentId: ${data.accepts[0].extra.paymentId.slice(0, 20)}...`);
});

await assert('Bypass header returns statement data', async () => {
  const { status, data } = await fetchJson(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Bypass': 'bypass'
    },
    body: JSON.stringify({ address: ADDR })
  });
  if (status !== 200) throw new Error(`expected 200, got ${status}`);
  if (!data.address) throw new Error('no address');
  if (!data.balance) throw new Error('no balance');
  if (!Array.isArray(data.txs)) throw new Error('txs not array');
  if (data.txs.length === 0) throw new Error('no transactions');
  console.log(`     ${data.txs.length} txs, ${Number(data.balance) / 1e8} KAS`);
  if (data.fifoSummary) console.log(`     FIFO cost basis: $${data.fifoSummary.remainingCostBasis?.toFixed(2)}`);
});

await assert('Bypass header returns receipt data', async () => {
  const txid = '90da84cd98390f01063fc7490c5257f15aaf6b2f8fbc4e153177c2d153b40cde';
  const { status, data } = await fetchJson(`${BASE}/api/x402/receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Bypass': 'bypass'
    },
    body: JSON.stringify({ txid })
  });
  if (status !== 200) throw new Error(`expected 200, got ${status}`);
  if (!data.tx) throw new Error('no tx');
  if (!data.price) throw new Error('no price');
  console.log(`     tx: ${txid.slice(0, 16)}..., price: $${data.price}`);
});

await assert('Web statement still free', async () => {
  const { status, data } = await fetchJson(`${BASE}/api/web/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: ADDR })
  });
  if (status !== 200) throw new Error(`expected 200, got ${status}`);
  if (!data.balance) throw new Error('no balance');
  console.log(`     ${data.txs.length} txs`);
});

await assert('x402 receipt without payment returns 402', async () => {
  const { status } = await fetchJson(`${BASE}/api/x402/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txid: '90da84cd98390f01063fc7490c5257f15aaf6b2f8fbc4e153177c2d153b40cde' })
  });
  if (status !== 402) throw new Error(`expected 402, got ${status}`);
});

await assert('x402 with bad address returns 400', async () => {
  const { status } = await fetchJson(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Bypass': 'bypass'
    },
    body: JSON.stringify({ address: 'not-an-address' })
  });
  if (status !== 400) throw new Error(`expected 400, got ${status}`);
});

console.log(`\n=== RESULTS ===`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
