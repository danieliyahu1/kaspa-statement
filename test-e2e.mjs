import { fetchStatement, fetchReceipt } from './kaspa-fetcher.js';
import { generateOffer, verifyPayment, paymentIdFromHeader, getPaymentAddress, getNetwork, getPriceSompi } from './x402-handler.js';

const ADDR = 'kaspatest:qph5gvywder93263z0zq602jfhuyrp66f8kk5h60fh3agczv6y2m67j5rtkk6';
const NET = 'kaspa:testnet-10';

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

await assert('GenerateOffer returns valid x402 v2 format', async () => {
  const offer = await generateOffer({ payTo: ADDR, amountSompi: 10000000, network: NET });
  if (offer.x402Version !== 2) throw new Error('expected x402Version 2');
  if (!offer.resource) throw new Error('expected resource');
  if (!offer.resource.url) throw new Error('expected resource.url');
  if (!offer.accepts || offer.accepts.length !== 1) throw new Error('expected 1 accept');
  const a = offer.accepts[0];
  if (a.scheme !== 'exact') throw new Error('expected exact scheme');
  if (a.amount !== '10000000') throw new Error('expected 10000000 amount');
  if (a.asset !== 'KAS') throw new Error('expected KAS asset');
  if (a.payTo !== ADDR) throw new Error('wrong payTo');
  if (!a.maxTimeoutSeconds) throw new Error('missing maxTimeoutSeconds');
  if (!a.extra) throw new Error('missing extra');
  if (a.extra.binding !== 'kaspa-exact-v2') throw new Error('wrong binding');
});

await assert('GenerateOffer creates unique payment IDs', async () => {
  const o1 = await generateOffer({ payTo: ADDR, amountSompi: 10000000, network: NET });
  const o2 = await generateOffer({ payTo: ADDR, amountSompi: 10000000, network: NET });
  if (o1.accepts[0].extra.paymentId === o2.accepts[0].extra.paymentId) {
    throw new Error('payment IDs should be unique');
  }
});

await assert('paymentIdFromHeader parses valid header', async () => {
  const result = paymentIdFromHeader('kaspa-utxo abc123def456 p_test123');
  if (!result) throw new Error('returned null');
  if (result.scheme !== 'kaspa-utxo') throw new Error('wrong scheme');
  if (result.txid !== 'abc123def456') throw new Error('wrong txid');
  if (result.paymentId !== 'p_test123') throw new Error('wrong payment_id');
});

await assert('paymentIdFromHeader rejects invalid header', async () => {
  if (paymentIdFromHeader(null) !== null) throw new Error('null header');
  if (paymentIdFromHeader('') !== null) throw new Error('empty header');
  if (paymentIdFromHeader('invalid stuff') !== null) throw new Error('bad scheme');
});

await assert('Config functions', async () => {
  const addr = getPaymentAddress();
  if (!addr.startsWith('kaspatest:')) throw new Error('expected testnet address');
  if (getNetwork() !== 'kaspa:testnet-10') throw new Error('expected testnet-10');
  if (getPriceSompi() !== 10000000) throw new Error('expected 10000000 sompi');
});

await assert('fetchStatement returns statement data', async () => {
  const result = await fetchStatement(ADDR);
  if (!result.address) throw new Error('no address');
  if (!result.balance) throw new Error('no balance');
  if (!Array.isArray(result.txs)) throw new Error('txs not array');
  if (result.txs.length > 11000) throw new Error(`expected max ~10000 txs, got ${result.txs.length}`);
  if (result.txs.length > 0 && result.txs[0].transaction_id) {
    console.log(`     ${result.txs.length} transactions fetched`);
    console.log(`     balance: ${result.balance}`);
  }
});

await assert('verifyPayment rejects unknown payment_id', async () => {
  const result = await verifyPayment('p_nonexistent', 'deadbeef');
  if (result.valid) throw new Error('should be invalid');
});

await assert('Static files exist', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const dir = path.dirname(fileURLToPath(import.meta.url));
  if (!fs.existsSync(path.join(dir, 'public', 'index.html'))) throw new Error('index.html missing');
  if (!fs.existsSync(path.join(dir, 'public', 'app.js'))) throw new Error('app.js missing');
  if (!fs.existsSync(path.join(dir, 'public', 'style.css'))) throw new Error('style.css missing');
});

await assert('fetchReceipt with testnet tx', async () => {
  const result = await fetchReceipt('90da84cd98390f01063fc7490c5257f15aaf6b2f8fbc4e153177c2d153b40cde');
  if (!result.tx) throw new Error('no tx');
  if (!result.tx.transaction_id) throw new Error('no transaction_id');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
