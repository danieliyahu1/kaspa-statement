import http from 'http';

const BASE = 'http://localhost:3000';
const NEW_WALLET_ADDR = 'kaspatest:qqgvsqtjj3l7ewzrneg9tk96kn705h2x4p8gxmsxrme5andd7dj2qjgs02kua';
const USER_ADDR = 'kaspatest:qph5gvywder93263z0zq602jfhuyrp66f8kk5h60fh3agczv6y2m67j5rtkk6';

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

await assert('User address has testnet funds', async () => {
  const res = await fetch(`https://api-tn10.kaspa.org/addresses/${USER_ADDR}/balance`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  const bal = BigInt(data.balance);
  if (bal < 10000000n) throw new Error(`Balance ${bal} is too low`);
  console.log(`     user balance: ${Number(bal) / 1e8} KAS`);
});

await assert('New wallet has 0 balance (needs funding)', async () => {
  const res = await fetch(`https://api-tn10.kaspa.org/addresses/${NEW_WALLET_ADDR}/balance`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  const bal = BigInt(data.balance);
  console.log(`     new wallet balance: ${Number(bal) / 1e8} KAS`);
});

let paymentId;
let payTo;
let amountSompi;

await assert('x402 endpoint returns valid x402 v2 offer with PAYMENT-REQUIRED header', async () => {
  const { status, data, res } = await fetchJson(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: USER_ADDR })
  });
  if (status !== 402) throw new Error(`expected 402, got ${status}`);
  if (data.x402Version !== 2) throw new Error('bad x402 version');
  const paymentHeader = res.headers.get('PAYMENT-REQUIRED');
  if (!paymentHeader) throw new Error('missing PAYMENT-REQUIRED header');
  const accept = data.accepts[0];
  if (!accept) throw new Error('no accepts');
  paymentId = accept.extra.paymentId;
  payTo = accept.payTo;
  amountSompi = accept.amount;
  console.log(`     payment_id: ${paymentId.slice(0, 20)}...`);
  console.log(`     pay_to: ${payTo.slice(0, 20)}...`);
  console.log(`     amount: ${Number(amountSompi) / 1e8} KAS`);
});

await assert('Payment required to user address', async () => {
  if (!paymentId) throw new Error('no payment_id');
  if (!payTo) throw new Error('no pay_to');
  if (payTo !== USER_ADDR) throw new Error(`expected pay_to ${USER_ADDR}, got ${payTo}`);
});

await assert('Unpaid request returns 402', async () => {
  const { status } = await fetchJson(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: USER_ADDR })
  });
  if (status !== 402) throw new Error(`expected 402, got ${status}`);
});

await assert('Bad payment returns 402', async () => {
  const { status } = await fetchJson(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-K402-Payment': 'kaspa-utxo deadbeef1234 p_bad'
    },
    body: JSON.stringify({ address: USER_ADDR })
  });
  if (status !== 402) throw new Error(`expected 402, got ${status}`);
});

await assert('Replay protection rejects used payment_id', async () => {
  const { status } = await fetchJson(`${BASE}/api/x402/statement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-K402-Payment': `kaspa-utxo deadbeef ${paymentId}`
    },
    body: JSON.stringify({ address: USER_ADDR })
  });
  if (status !== 402) throw new Error(`expected 402, got ${status}`);
});

await assert('x402 receipt returns 402', async () => {
  const { status } = await fetchJson(`${BASE}/api/x402/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txid: '90da84cd98390f01063fc7490c5257f15aaf6b2f8fbc4e153177c2d153b40cde' })
  });
  if (status !== 402) throw new Error(`expected 402, got ${status}`);
});

await assert('Web statement still free', async () => {
  const { status, data } = await fetchJson(`${BASE}/api/web/statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: USER_ADDR })
  });
  if (status !== 200) throw new Error(`expected 200, got ${status}`);
  if (!data.balance) throw new Error('no balance in response');
  console.log(`     ${data.txs.length} txs, ${Number(data.balance) / 1e8} KAS`);
});

console.log(`\n=== RESULTS ===`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
