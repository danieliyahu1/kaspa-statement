"""Check if standard test mnemonics have testnet balances."""
import asyncio
import kaspa
from k402.wallet import PnnBackend


async def check():
    be = PnnBackend("testnet-10")

    phrases = [
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        "test test test test test test test test test test test junk",
        "myth like bonus scare over problem client lizard pioneer submit female collect",
    ]

    for phrase in phrases:
        try:
            m = kaspa.Mnemonic(phrase=phrase)
            seed = m.to_seed()
            xprv = kaspa.XPrv(seed)

            for account in range(3):
                path = f"m/44'/111111'/{account}'/0/0"
                try:
                    key = xprv.derive_path(path)
                    addr = key.to_address("testnet")
                    addr_str = addr.to_string() if hasattr(addr, "to_string") else str(addr)
                    bal = await be.address_received_sompi(addr_str)
                    print(f"[{path}] {addr_str}: {bal} sompi ({bal / 1e8} KAS)")
                except Exception as e:
                    print(f"[{path}] error: {e}")

            # Also try without BIP44 derivation - just use raw key
            priv = kaspa.PrivateKey(seed.hex()[:64])
            kp = priv.to_keypair()
            addr = kp.to_address("testnet")
            addr_str = addr.to_string() if hasattr(addr, "to_string") else str(addr)
            bal = await be.address_received_sompi(addr_str)
            print(f"  raw: {addr_str}: {bal} sompi ({bal / 1e8} KAS)")

        except Exception as e:
            print(f"Mnemonic '{phrase[:20]}...' error: {e}")

    # Generate a fresh wallet and check
    m = kaspa.Mnemonic.random()
    seed = m.to_seed()
    xprv = kaspa.XPrv(seed)
    key = xprv.derive_path("m/44'/111111'/0'/0/0")
    addr = key.to_address("testnet")
    addr_str = addr.to_string() if hasattr(addr, "to_string") else str(addr)
    print(f"\nFresh wallet: {addr_str}")


asyncio.run(check())
