"""
Full x402 payment test using real testnet KAS.
Server must be running: npm start

Flow:
  1. Call x402 endpoint -> get payment offer
  2. Pay 0.1 KAS from buyer wallet to server's address
  3. Retry with payment header -> server verifies on-chain -> returns statement
"""

import asyncio
import httpx
from k402 import HotWallet, PnnBackend, UtxoOffer

BUYER_PKEY = "9697293a33f87b136e63d34c5ce53e903bfc4edf3e804d8d251e47e0c186cb64"
BUYER_ADDR = "kaspatest:qqgvsqtjj3l7ewzrneg9tk96kn705h2x4p8gxmsxrme5andd7dj2qjgs02kua"
SERVER = "http://localhost:3000"

async def main():
    wallet = HotWallet(BUYER_PKEY, network="testnet", backend=PnnBackend("testnet-10"))
    wallet.network = "testnet-10"
    balance = await wallet.balance_sompi()
    print(f"Buyer wallet: {BUYER_ADDR}")
    print(f"Balance: {balance / 1e8} KAS")

    if balance < 10000000:
        raise SystemExit("Need at least 0.1 KAS in buyer wallet")

    async with httpx.AsyncClient() as http:
        print("\n1) Getting x402 offer from server...")
        r = await http.post(
            f"{SERVER}/api/x402/statement",
            json={"address": BUYER_ADDR},
        )
        assert r.status_code == 402, f"Expected 402, got {r.status_code}"
        offer = r.json()
        accept = offer["accepts"][0]
        print(f"   payment_id: {accept['payment_id'][:24]}...")
        print(f"   pay_to:     {accept['pay_to'][:24]}...")
        print(f"   amount:     {int(accept['amount_sompi']) / 1e8} KAS")

        print("\n2) Broadcasting 0.1 KAS payment to seller...")
        utxo_offer = UtxoOffer(
            network="testnet-10",
            amount_sompi=str(accept["amount_sompi"]),
            pay_to=accept["pay_to"],
            payment_id=accept["payment_id"],
            expires=int(accept["expires"]),
            description=accept.get("description", ""),
        )
        txid = await wallet.pay(utxo_offer)
        print(f"   Transaction broadcast! txid: {txid}")

        await asyncio.sleep(3)

        print("\n3) Retrying x402 call with payment proof...")
        header = f"kaspa-utxo {txid} {accept['payment_id']}"
        r = await http.post(
            f"{SERVER}/api/x402/statement",
            headers={"X-K402-Payment": header},
            json={"address": BUYER_ADDR},
        )

        if r.status_code == 200:
            data = r.json()
            print(f"   [OK] PAYMENT ACCEPTED! Server returned statement data.")
            print(f"   Transactions: {len(data['txs'])}")
            print(f"   Balance: {int(data['balance']) / 1e8} KAS")
            if data.get('fifoSummary'):
                print(f"   Cost Basis: ${data['fifoSummary'].get('remainingCostBasis', 0):.2f}")
        elif r.status_code == 402:
            err = r.json()
            print(f"   [FAIL] Payment rejected: {err.get('reason', 'unknown')}")
        else:
            print(f"   [FAIL] Unexpected response: {r.status_code}")
            print(f"   {r.text}")

        new_balance = await wallet.balance_sompi()
        print(f"\nBuyer wallet now: {new_balance / 1e8} KAS (spent 0.1 KAS + fees)")


asyncio.run(main())
