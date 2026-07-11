import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── fetchTransaction ─────────────────────────────────────────

describe('fetchTransaction', () => {
  const txId = 'a'.repeat(64);
  const mockTx = { transaction_id: txId, is_accepted: true, block_time: 1704067200000, inputs: [], outputs: [] };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns transaction data on success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTx),
    });

    const result = await fetchTransaction(txId);
    expect(result).toEqual(mockTx);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/transactions/')
    );
  });

  it('throws "Transaction not found" on 404', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchTransaction(txId)).rejects.toThrow('Transaction not found');
  });

  it('throws "Invalid transaction hash" on 422', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 422 });
    await expect(fetchTransaction(txId)).rejects.toThrow('Invalid transaction hash');
  });

  it('throws generic error on other status', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchTransaction(txId)).rejects.toThrow('The Kaspa network is currently unavailable');
  });

  it('includes required query parameters', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTx),
    });

    await fetchTransaction(txId);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('inputs=true');
    expect(url).toContain('outputs=true');
    expect(url).toContain('resolve_previous_outpoints=light');
  });
});

// ─── fetchAddressBalance ──────────────────────────────────────

describe('fetchAddressBalance', () => {
  const address = 'kaspa:' + 'a'.repeat(61);

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns balance on success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ balance: '123456789' }),
    });
    const balance = await fetchAddressBalance(address);
    expect(balance).toBe('123456789');
  });

  it('throws on error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchAddressBalance(address)).rejects.toThrow('Could not fetch address balance');
  });
});

// ─── fetchAddressTxs ──────────────────────────────────────────

describe('fetchAddressTxs', () => {
  const address = 'kaspa:' + 'a'.repeat(61);

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns transaction list', async () => {
    const mockData = [{ transaction_id: 'abc' }];
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    const result = await fetchAddressTxs(address, 0);
    expect(result).toEqual(mockData);
  });

  it('throws on 404', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchAddressTxs(address, 0)).rejects.toThrow('Address not found');
  });

  it('includes pagination params', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    await fetchAddressTxs(address, 100);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=100');
  });
});

// ─── fetchAddressTxCount ──────────────────────────────────────

describe('fetchAddressTxCount', () => {
  const address = 'kaspa:' + 'a'.repeat(61);

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns total count on success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 42 }),
    });
    const count = await fetchAddressTxCount(address);
    expect(count).toBe(42);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/transactions-count')
    );
  });

  it('throws on error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchAddressTxCount(address)).rejects.toThrow('Could not fetch transaction count');
  });
});

// ─── fetchAddressTxsPage ──────────────────────────────────────

describe('fetchAddressTxsPage', () => {
  const address = 'kaspa:' + 'a'.repeat(61);

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns txs and nextBefore header', async () => {
    const mockTxs = [{ transaction_id: 'abc' }];
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTxs),
      headers: { get: (name) => name === 'X-Next-Page-Before' ? '1780000000000' : null },
    });
    const result = await fetchAddressTxsPage(address);
    expect(result.txs).toEqual(mockTxs);
    expect(result.nextBefore).toBe('1780000000000');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/full-transactions-page')
    );
  });

  it('omits before param on first page', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: { get: () => null },
    });
    await fetchAddressTxsPage(address);
    const url = fetch.mock.calls[0][0];
    expect(url).not.toContain('before=');
  });

  it('includes before param on subsequent pages', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: { get: () => null },
    });
    await fetchAddressTxsPage(address, '1780000000000');
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('before=1780000000000');
  });

  it('returns null nextBefore when header is missing', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: { get: () => null },
    });
    const result = await fetchAddressTxsPage(address);
    expect(result.nextBefore).toBeNull();
  });

  it('throws on 404', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchAddressTxsPage(address)).rejects.toThrow('Address not found');
  });

  it('uses limit=500', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
      headers: { get: () => null },
    });
    await fetchAddressTxsPage(address);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('limit=500');
  });
});

// ─── fetchPriceMap ────────────────────────────────────────────

describe('fetchPriceMap', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses Bybit kline response into date-keyed map', async () => {
    const now = Date.now();
    const todayKey = getDateKey(now);
    const yesterdayKey = getDateKey(now - 86400000);

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        retCode: 0,
        result: {
          list: [
            [(now - 86400000).toString(), '100', '110', '90', '105', '1000'],
            [now.toString(), '200', '210', '190', '205', '2000'],
          ],
        },
      }),
    });

    const map = await fetchPriceMap();
    // For past dates, uses close price (index 4)
    expect(map[yesterdayKey]).toBe(105);
    // For today, uses open price (index 1)
    expect(typeof map[todayKey]).toBe('number');
    expect(map._earliest).toBe(now - 86400000);
  });

  it('returns null on API error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const map = await fetchPriceMap();
    expect(map).toBeNull();
  });

  it('returns null on non-zero retCode', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ retCode: 10001, result: null }),
    });
    const map = await fetchPriceMap();
    expect(map).toBeNull();
  });

  it('returns null on fetch throw', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));
    const map = await fetchPriceMap();
    expect(map).toBeNull();
  });
});

// ─── fetchAllTxsFromGenesis (adaptive batch + retry) ─────────

describe('fetchAllTxsFromGenesis adaptive batch', () => {
  const address = 'kaspa:' + 'a'.repeat(61);
  const makeTx = (id) => ({
    transaction_id: id,
    is_accepted: true,
    block_time: 1704067200000,
    inputs: [],
    outputs: [],
  });

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    showLoading(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches all pages successfully with adaptive batch', async () => {
    // Mock: 5000 total txs → 10 pages
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 5000 }),
    });
    // Mock first page (offset 0)
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(
        Array.from({ length: 500 }, (_, i) => makeTx(`first_${i}`))
      ),
      headers: { get: (name) => name === 'X-Next-Page-Before' ? '1780000000000' : null },
    });
    // Mock remaining 9 offset pages (500, 1000, ..., 4500) — all succeed
    for (let i = 0; i < 9; i++) {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(
          Array.from({ length: 500 }, (_, j) => makeTx(`page_${i}_${j}`))
        ),
      });
    }

    const txs = await fetchAllTxsFromGenesis(address);
    expect(txs.length).toBe(5000);
  });

  it('retries failed offsets at reduced batch size', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 3000 }),
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(
        Array.from({ length: 500 }, (_, i) => makeTx(`first_${i}`))
      ),
      headers: { get: (name) => name === 'X-Next-Page-Before' ? '1780000000000' : null },
    });

    // Pages at offsets 500, 1000, 1500, 2000, 2500 (5 pages)
    // First 3 succeed, offset 1500 fails once then succeeds, rest succeed
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(Array.from({ length: 500 }, (_, i) => makeTx(`p500_${i}`))),
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(Array.from({ length: 500 }, (_, i) => makeTx(`p1000_${i}`))),
    });
    // offset 1500 fails on first attempt
    fetch.mockRejectedValueOnce(new Error('Rate limited'));
    // offset 2000 succeeds
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(Array.from({ length: 500 }, (_, i) => makeTx(`p2000_${i}`))),
    });
    // offset 2500 succeeds
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(Array.from({ length: 500 }, (_, i) => makeTx(`p2500_${i}`))),
    });
    // Retry of offset 1500 succeeds
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(Array.from({ length: 500 }, (_, i) => makeTx(`p1500_${i}`))),
    });

    const txs = await fetchAllTxsFromGenesis(address);
    expect(txs.length).toBe(3000);
  });

  it('retries indefinitely until all pages succeed', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 1500 }),
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(
        Array.from({ length: 500 }, (_, i) => makeTx(`first_${i}`))
      ),
      headers: { get: (name) => name === 'X-Next-Page-Before' ? '1780000000000' : null },
    });

    // offset 1000 fails 3 times, succeeds on 4th
    fetch.mockRejectedValueOnce(new Error('Rate limited'));
    fetch.mockRejectedValueOnce(new Error('Rate limited'));
    fetch.mockRejectedValueOnce(new Error('Rate limited'));
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(Array.from({ length: 500 }, (_, i) => makeTx(`p1000_4th_${i}`))),
    });
    // offset 500 succeeds
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(Array.from({ length: 500 }, (_, i) => makeTx(`p500_${i}`))),
    });

    const txs = await fetchAllTxsFromGenesis(address);
    expect(txs.length).toBe(1500);
  });

  it('returns only first page when no nextBefore header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 500 }),
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(
        Array.from({ length: 500 }, (_, i) => makeTx(`only_${i}`))
      ),
      headers: { get: () => null },
    });

    const txs = await fetchAllTxsFromGenesis(address);
    expect(txs.length).toBe(500);
  });
});
