const API_BASE = 'https://api.kaspa.org';
const TX_HASH_REGEX = /^[a-f0-9]{64}$/;
const ADDRESS_REGEX = /^kaspa:[a-z0-9]{61,63}$/;
const PAGE_SIZE = 50;
const BYBIT_BASE = 'https://api.bybit.com';

function log(...args) {
  console.log('[Kaspa Receipts]', ...args);
}

function warn(...args) {
  console.warn('[Kaspa Receipts]', ...args);
}

function error(...args) {
  console.error('[Kaspa Receipts]', ...args);
}

const $ = (id) => document.getElementById(id);

const input = $('tx-input');
const button = $('generate-btn');
const loadingEl = $('loading');
const loadingText = $('loading-text');
const errorEl = $('error');
const resultEl = $('result');
const receiptCard = $('receipt-card');
const statementCard = $('statement-card');
const fromDateInput = $('from-date');
const toDateInput = $('to-date');
const dateRangeSection = $('date-range-section');

let receiptTx = null;
let statement = null;
let priceMap = null;
let priceMapPromise = null;

function showLoading(show, text) {
  log(`${show ? 'Showing' : 'Hiding'} loading state${text ? ': ' + text : ''}`);
  loadingEl.classList.toggle('hidden', !show);
  button.classList.toggle('loading', show);
  button.disabled = show;
  if (text !== undefined) loadingText.textContent = text;
}

function showError(message) {
  warn('Showing error:', message);
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  resultEl.classList.add('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function formatDate(epochMs) {
  const d = new Date(epochMs);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short'
  });
}

function formatShortDate(epochMs) {
  const d = new Date(epochMs);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

function formatKAS(sompi) {
  const kas = Number(sompi) / 1e8;
  return kas.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }) + ' KAS';
}

function shortenHash(hash, chars = 8) {
  if (hash.length <= chars * 2) return hash;
  return hash.slice(0, chars) + '\u2026' + hash.slice(-chars);
}

function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    btnEl.textContent = 'Copied!';
    btnEl.classList.add('copied');
    setTimeout(() => {
      btnEl.textContent = 'Copy';
      btnEl.classList.remove('copied');
    }, 2000);
  });
}

function formatUSD(amount) {
  return '$' + Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getKasAmount(sompi) {
  return Number(sompi) / 1e8;
}

function getDateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function fetchTransaction(txId) {
  log('Fetching transaction:', txId);
  const params = new URLSearchParams({
    inputs: 'true',
    outputs: 'true',
    resolve_previous_outpoints: 'light'
  });
  const url = `${API_BASE}/transactions/${txId}?${params}`;

  const res = await fetch(url);
  if (!res.ok) {
    error('Transaction fetch failed:', res.status, res.statusText);
    if (res.status === 404) throw new Error('Transaction not found. Check the hash and try again.');
    if (res.status === 422) throw new Error('Invalid transaction hash format.');
    throw new Error('The Kaspa network is currently unavailable. Please try again.');
  }
  const data = await res.json();
  log('Transaction fetched:', txId, 'accepted:', data.is_accepted, 'time:', data.block_time);
  return data;
}

async function fetchAddressBalance(address) {
  log('Fetching balance for address:', address);
  const res = await fetch(`${API_BASE}/addresses/${address}/balance`);
  if (!res.ok) {
    error('Balance fetch failed:', res.status, res.statusText);
    throw new Error('Could not fetch address balance.');
  }
  const data = await res.json();
  log('Address balance:', address, 'balance:', data.balance);
  return data.balance;
}

async function fetchAddressTxs(address, offset = 0) {
  const url = `${API_BASE}/addresses/${address}/full-transactions?limit=${PAGE_SIZE}&offset=${offset}&resolve_previous_outpoints=light`;
  log('Fetching address txs:', address, 'offset:', offset);
  const res = await fetch(url);
  if (!res.ok) {
    error('Address txs fetch failed:', res.status, res.statusText);
    if (res.status === 404) throw new Error('Address not found. Check the address and try again.');
    throw new Error('The Kaspa network is currently unavailable. Please try again.');
  }
  const data = await res.json();
  log('Address txs page:', offset, 'count:', data.length);
  return data;
}

async function fetchAddressTxCount(address) {
  log('Fetching tx count for address:', address);
  const res = await fetch(`${API_BASE}/addresses/${address}/transactions-count`);
  if (!res.ok) {
    error('Tx count fetch failed:', res.status, res.statusText);
    throw new Error('Could not fetch transaction count.');
  }
  const data = await res.json();
  log('Address tx count:', address, 'total:', data.total);
  return data.total;
}

async function fetchAddressTxsPage(address, before) {
  let url;
  if (before) {
    url = `${API_BASE}/addresses/${address}/full-transactions-page?after=0&before=${before}&limit=500&resolve_previous_outpoints=light`;
  } else {
    url = `${API_BASE}/addresses/${address}/full-transactions-page?after=0&limit=500&resolve_previous_outpoints=light`;
  }
  log('Fetching address txs page', before ? 'before: ' + before : '(first page)');
  const res = await fetch(url);
  if (!res.ok) {
    error('Address txs page fetch failed:', res.status, res.statusText);
    if (res.status === 404) throw new Error('Address not found. Check the address and try again.');
    throw new Error('The Kaspa network is currently unavailable. Please try again.');
  }
  const txs = await res.json();
  const nextBefore = res.headers.get('X-Next-Page-Before');
  log('Address txs page count:', txs.length, 'nextBefore:', nextBefore);
  return { txs, nextBefore: nextBefore || null };
}

async function fetchPriceMap() {
  log('Fetching price map from Bybit...');
  try {
    const res = await fetch(`${BYBIT_BASE}/v5/market/kline?category=spot&symbol=KASUSDT&interval=D&limit=1000`);
    if (!res.ok) {
      warn('Price fetch returned', res.status);
      return null;
    }
    const json = await res.json();
    if (json.retCode !== 0 || !json.result?.list) {
      warn('Price API returned unexpected response:', json.retCode);
      return null;
    }
    const map = {};
    const todayKey = getDateKey(Date.now());
    let earliestTs = Infinity;
    json.result.list.forEach(candle => {
      const ts = parseInt(candle[0]);
      const key = getDateKey(ts);
      map[key] = key === todayKey ? parseFloat(candle[1]) : parseFloat(candle[4]);
      if (ts < earliestTs) earliestTs = ts;
    });
    if (earliestTs !== Infinity) map._earliest = earliestTs;
    log('Price map loaded. Entries:', Object.keys(map).length, 'earliest:', map._earliest ? formatShortDate(map._earliest) : 'N/A');
    return map;
  } catch (e) {
    warn('Price map fetch failed:', e.message);
    return null;
  }
}

function getTxDirection(tx, address) {
  const isSender = tx.inputs && tx.inputs.some(i => i.previous_outpoint_address === address);
  const hasExternalOutput = tx.outputs && tx.outputs.some(o => o.script_public_key_address !== address);
  const direction = isSender && hasExternalOutput ? 'sent' : isSender ? 'self' : 'received';
  log('Tx direction:', direction, 'for tx', tx.transaction_id?.slice(0, 12));
  return direction;
}

function getCounterparty(tx, address, direction) {
  if (direction === 'received') {
    const sender = tx.inputs && tx.inputs.find(i => i.previous_outpoint_address && i.previous_outpoint_address !== address);
    return sender ? sender.previous_outpoint_address : 'Coinbase';
  }
  if (direction === 'sent') {
    const receiver = tx.outputs && tx.outputs.find(o => o.script_public_key_address !== address);
    return receiver ? receiver.script_public_key_address : 'Unknown';
  }
  return address;
}

function getTxAmount(tx, address, direction) {
  if (direction === 'received') {
    return tx.outputs
      .filter(o => o.script_public_key_address === address)
      .reduce((sum, o) => sum + Number(o.amount), 0);
  }
  if (direction === 'sent') {
    return tx.outputs
      .filter(o => o.script_public_key_address !== address)
      .reduce((sum, o) => sum + Number(o.amount), 0);
  }
  return tx.outputs
    .filter(o => o.script_public_key_address === address)
    .reduce((sum, o) => sum + Number(o.amount), 0);
}

async function fetchAllTxsFromGenesis(address) {
  log('Fetching all txs from genesis for address:', address);
  const total = await fetchAddressTxCount(address);
  if (total === 0) {
    log('No transactions found for address');
    return [];
  }

  const allTxs = [];
  let before = null;
  let pageNum = 0;
  const totalPages = Math.ceil(total / 500);

  do {
    pageNum++;
    showLoading(true, `Fetching transactions\u2026 page ${pageNum} of ${totalPages}`);
    const { txs, nextBefore } = await fetchAddressTxsPage(address, before);
    allTxs.push(...txs);
    before = nextBefore;
    log('Fetched page, collected:', allTxs.length, 'total:', total);
  } while (before);

  allTxs.reverse();
  log('All txs fetched from genesis and reversed. Total:', allTxs.length);
  return allTxs;
}

function buildFIFOQueue(txs, address, priceMap) {
  log('Building FIFO queue from', txs.length, 'transactions');
  const lots = [];
  const txGains = {};

  for (const tx of txs) {
    const direction = getTxDirection(tx, address);
    if (direction === 'self') continue;

    const amount = getTxAmount(tx, address, direction);
    const price = priceMap ? priceMap[getDateKey(tx.block_time)] : null;

    if (direction === 'received') {
      lots.push({
        amount,
        costBasisPerKas: price || 0,
        timestamp: tx.block_time,
        txId: tx.transaction_id
      });
    } else if (direction === 'sent') {
      let remaining = amount;
      let totalSaleValue = 0;
      let totalCostBasis = 0;

      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(remaining, lot.amount);
        const kasConsumed = getKasAmount(consumed);
        const salePrice = price || 0;

        totalSaleValue += kasConsumed * salePrice;
        totalCostBasis += kasConsumed * lot.costBasisPerKas;

        lot.amount -= consumed;
        remaining -= consumed;
        if (lot.amount === 0) lots.shift();
      }

      if (remaining > 0) {
        warn('FIFO: insufficient lots for tx', tx.transaction_id?.slice(0, 12), 'remaining:', getKasAmount(remaining), 'KAS');
      }

      txGains[tx.transaction_id] = {
        gain: totalSaleValue - totalCostBasis,
        saleValue: totalSaleValue,
        costBasis: totalCostBasis
      };
    }
  }

  log('FIFO queue built. Lots remaining:', lots.length, 'txs with gains:', Object.keys(txGains).length);
  return txGains;
}

function renderReceipt(tx, price) {
  log('Rendering receipt for tx:', tx.transaction_id?.slice(0, 12), 'price:', price);
  receiptTx = { tx, price };
  receiptCard.classList.remove('hidden');
  const accepted = tx.is_accepted;
  const blockTime = tx.block_time;
  const inputs = tx.inputs || [];
  const outputs = tx.outputs || [];

  const fromAddresses = [...new Set(
    inputs.map(i => i.previous_outpoint_address).filter(Boolean)
  )];

  const totalSompi = outputs.reduce((sum, o) => sum + Number(o.amount), 0);
  const totalKas = getKasAmount(totalSompi);
  const usdTotal = price ? totalKas * price : null;

  receiptCard.innerHTML = `
    <div class="receipt-header">
      <h2>Kaspa Receipt</h2>
    </div>

    <div class="receipt-status">
      <span class="status-badge ${accepted ? 'accepted' : 'pending'}">
        ${accepted ? '<span class="check">&#10003;</span> Confirmed' : '<span class="check">&#9679;</span> Pending'}
      </span>
    </div>

    <div class="receipt-meta">
      <div class="meta-row">
        <span class="meta-label">Date &amp; Time</span>
        <span class="meta-value">${formatDate(blockTime)}</span>
      </div>
    </div>

    <div class="receipt-section">
      <div class="section-label">From</div>
      ${fromAddresses.length
        ? fromAddresses.map(addr => `
            <div class="address-block">
              <span class="address">${shortenHash(addr, 12)}</span>
              <button class="copy-btn" data-copy="${escapeHtml(addr)}">Copy</button>
            </div>
          `).join('')
        : '<span class="address" style="color:#aeaeb2">Coinbase (new block reward)</span>'
      }
    </div>

    <div class="receipt-section">
      <div class="section-label">To</div>
      <div class="output-list">
        ${outputs.map(o => `
          <div class="output-row">
            <span class="output-address">
              ${shortenHash(o.script_public_key_address, 12)}
              <button class="copy-btn" data-copy="${escapeHtml(o.script_public_key_address)}">Copy</button>
            </span>
            <span class="output-amount">${formatKAS(o.amount)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="receipt-total">
      <span class="total-label">Total</span>
      <div class="total-values">
        <span class="total-amount">${formatKAS(totalSompi)}</span>
        ${usdTotal !== null ? `<span class="total-usd">≈ ${formatUSD(usdTotal)} USD</span>` : `<span class="total-usd na">$N/A</span>${priceMap?._earliest ? `<div class="receipt-note">No price data prior to ${formatShortDate(priceMap._earliest)}</div>` : ''}`}
      </div>
    </div>

    <div class="receipt-ref">
      ${shortenHash(tx.transaction_id, 12)}
      <button class="copy-btn" data-copy="${escapeHtml(tx.transaction_id)}">Copy</button>
    </div>

    <div class="receipt-actions">
      ${statement ? '<button class="btn-back" id="back-btn">Back to History</button>' : ''}
      <button class="btn-new" id="new-receipt-btn">New Receipt</button>
    </div>
  `;
}

function renderProfitSummary(txs, address, txGains) {
  if (!txs.length) return '';

  let receivedSompi = 0, sentSompi = 0;
  let totalGain = 0, totalSaleValue = 0, totalCostBasis = 0;
  let hadMissingPrice = false;

  txs.forEach(tx => {
    const direction = getTxDirection(tx, address);
    const amount = getTxAmount(tx, address, direction);
    const price = priceMap ? priceMap[getDateKey(tx.block_time)] : null;
    if (!price && priceMap) hadMissingPrice = true;

    if (direction === 'received') {
      receivedSompi += amount;
    } else if (direction === 'sent') {
      sentSompi += amount;
      const g = txGains ? txGains[tx.transaction_id] : null;
      if (g) {
        totalGain += g.gain;
        totalSaleValue += g.saleValue;
        totalCostBasis += g.costBasis;
      }
    } else if (direction === 'self') {
      receivedSompi += amount;
      sentSompi += amount;
    }
  });

  const netSompi = receivedSompi - sentSompi;
  const hasUsd = priceMap !== null;

  return `
    <div class="net-summary">
      <div class="summary-title">Summary</div>
      <div class="summary-row">
        <span class="summary-label">Received</span>
        <div class="summary-values">
          <div class="summary-kas">${formatKAS(receivedSompi)}</div>
        </div>
      </div>
      <div class="summary-row">
        <span class="summary-label">Sent</span>
        <div class="summary-values">
          <div class="summary-kas">${formatKAS(sentSompi)}</div>
        </div>
      </div>
      <div class="summary-row summary-net">
        <span class="summary-label">Change</span>
        <div class="summary-values">
          <div class="summary-kas">${formatKAS(netSompi)}</div>
        </div>
      </div>
      ${hasUsd ? `
      <div class="summary-divider"></div>
      <div class="summary-row ${totalGain >= 0 ? 'summary-profit' : 'summary-loss'}">
        <span class="summary-label">Profit</span>
        <div class="summary-values">
          <div class="summary-usd profit-value">${totalGain >= 0 ? formatUSD(totalGain) : '-' + formatUSD(Math.abs(totalGain))}</div>
        </div>
      </div>
      <div class="summary-row">
        <span class="summary-label">Cost Basis</span>
        <div class="summary-values">
          <div class="summary-usd">${formatUSD(totalCostBasis)}</div>
        </div>
      </div>
      <div class="summary-row">
        <span class="summary-label">Sale Value</span>
        <div class="summary-values">
          <div class="summary-usd">${formatUSD(totalSaleValue)}</div>
        </div>
      </div>` : ''}
      ${hadMissingPrice ? `<div class="summary-note">Some prices estimated prior to ${formatShortDate(priceMap._earliest)}</div>` : ''}
    </div>
  `;
}

function exportCSV() {
  if (!statement) { warn('exportCSV called but statement is null'); return; }
  const { address, txs, fromDate, toDate, txGains } = statement;

  const headers = ['Date', 'Direction', 'Amount (KAS)', 'USD Value', 'Counterparty', 'Transaction ID', 'Status', 'Cost Basis (USD)', 'Realized Gain (USD)'];
  const rows = txs.map(tx => {
    const direction = getTxDirection(tx, address);
    const counterparty = getCounterparty(tx, address, direction);
    const amount = getTxAmount(tx, address, direction);
    const kas = getKasAmount(amount);
    const price = priceMap ? priceMap[getDateKey(tx.block_time)] : null;
    const usd = price ? formatUSD(kas * price) : '';
    const status = tx.is_accepted ? 'Confirmed' : 'Pending';
    const gain = direction === 'sent' && txGains ? txGains[tx.transaction_id] : null;
    return [
      formatShortDate(tx.block_time),
      direction === 'sent' ? 'Sent' : (direction === 'self' ? 'Self' : 'Received'),
      kas,
      usd,
      counterparty,
      tx.transaction_id,
      status,
      gain ? formatUSD(gain.costBasis) : '',
      gain ? formatUSD(gain.gain) : ''
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => {
      const str = String(cell);
      return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `kaspa-history-${fromDate}-${toDate}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  log('CSV exported:', link.download);
}

function buildPagination(current, total) {
  if (total <= 1) return '';

  let html = '<div class="pagination">';

  html += `<button class="page-btn" data-page="${current - 1}" ${current === 0 ? 'disabled' : ''}>&#171; Prev</button>`;

  const maxVisible = 7;
  let start = Math.max(0, current - Math.floor(maxVisible / 2));
  let end = Math.min(total - 1, start + maxVisible - 1);
  if (end - start < maxVisible - 1) {
    start = Math.max(0, end - maxVisible + 1);
  }

  if (start > 0) {
    html += `<button class="page-btn" data-page="0">1</button>`;
    if (start > 1) html += '<span class="page-ellipsis">&#8230;</span>';
  }

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn${i === current ? ' active' : ''}" data-page="${i}">${i + 1}</button>`;
  }

  if (end < total - 1) {
    if (end < total - 2) html += '<span class="page-ellipsis">&#8230;</span>';
    html += `<button class="page-btn" data-page="${total - 1}">${total}</button>`;
  }

  html += `<button class="page-btn" data-page="${current + 1}" ${current >= total - 1 ? 'disabled' : ''}>Next &#187;</button>`;

  html += '</div>';
  return html;
}

function renderStatement() {
  if (!statement) { warn('renderStatement called but statement is null'); return; }
  const { address, balance, txs, fromDate, toDate, page } = statement;
  const startIdx = page * PAGE_SIZE;
  const pageTxs = txs.slice(startIdx, startIdx + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(txs.length / PAGE_SIZE));

  const summaryHtml = renderProfitSummary(txs, address, statement.txGains);

  let txRows = '';
  pageTxs.forEach((tx) => {
    const direction = getTxDirection(tx, address);
    const counterparty = getCounterparty(tx, address, direction);
    const amount = getTxAmount(tx, address, direction);
    const price = priceMap ? priceMap[getDateKey(tx.block_time)] : null;
    const usdAmount = price ? getKasAmount(amount) * price : null;

    const isSent = direction === 'sent';
    const symbol = isSent ? '&#8599;' : '&#8600;';
    const label = isSent ? 'Sent' : (direction === 'self' ? 'Self' : 'Received');
    const amtClass = direction === 'self' ? 'amt-self' : (isSent ? 'amt-sent' : 'amt-received');

    const counterShort = counterparty.length > 30
      ? counterparty.slice(0, 16) + '\u2026' + counterparty.slice(-6)
      : counterparty;

    const status = !tx.is_accepted
      ? '<span class="tx-status unconfirmed">Pending</span>'
      : '';

    const gainInfo = isSent && statement.txGains && statement.txGains[tx.transaction_id];

    txRows += `
      <div class="tx-row" data-tx-id="${tx.transaction_id}">
        <div class="tx-left">
          <span class="tx-date">${formatShortDate(tx.block_time)}</span>
          <span class="tx-counter">${escapeHtml(counterShort)}</span>
        </div>
        <div class="tx-right">
          <span class="tx-direction ${amtClass}">${symbol} ${label}</span>
          <span class="tx-amount ${amtClass}">${formatKAS(amount)}</span>
          ${usdAmount !== null ? `<span class="tx-usd">${formatUSD(usdAmount)}</span>` : '<span class="tx-usd na">$N/A</span>'}
          ${gainInfo && gainInfo.gain >= 0 ? `<span class="tx-gain gain-positive">Gain: ${formatUSD(gainInfo.gain)}</span>` : ''}
          ${status}
        </div>
      </div>
    `;
  });

  statementCard.innerHTML = `
    <div class="statement-header">
      <h2>Kaspa History</h2>
      <div class="statement-address">
        ${shortenHash(address, 12)}
        <button class="copy-btn" data-copy="${escapeHtml(address)}">Copy</button>
      </div>
      <div class="statement-balance">Balance: <strong>${formatKAS(balance)}</strong></div>
      ${summaryHtml}
    </div>
    <div class="receipt-actions">
      <button class="btn-export" id="export-csv-btn">Export</button>
      <button class="btn-new" id="search-btn">New Search</button>
    </div>
    <div class="tx-list">
      <div class="tx-list-header">
        <span>${txs.length} transaction${txs.length !== 1 ? 's' : ''}</span>
        <span class="loading-txs">${fromDate} to ${toDate}</span>
      </div>
      ${txRows || '<div class="tx-empty">No transactions found in this date range.</div>'}
    </div>
    ${buildPagination(page, totalPages)}
  `;

  receiptCard.classList.add('hidden');
  statementCard.classList.remove('hidden');
}

function goToPage(page) {
  if (!statement) { warn('goToPage called but statement is null'); return; }
  const totalPages = Math.ceil(statement.txs.length / PAGE_SIZE);
  if (page < 0 || page >= totalPages) { warn('goToPage: invalid page', page, 'totalPages:', totalPages); return; }
  log('Going to page:', page);
  statement.page = page;
  renderStatement();
}

async function showTxDetail(txId) {
  log('Showing tx detail:', txId);
  showLoading(true);
  try {
    const tx = await fetchTransaction(txId);
    const price = priceMap ? priceMap[getDateKey(tx.block_time)] : null;
    statementCard.classList.add('hidden');
    receiptCard.classList.remove('hidden');
    renderReceipt(tx, price);
  } catch (err) {
    error('showTxDetail error:', err.message);
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function refreshUSD() {
  if (!priceMap) { log('refreshUSD: no price map, skipping'); return; }
  log('refreshUSD: refreshing USD values');
  if (receiptTx) {
    const price = priceMap[getDateKey(receiptTx.tx.block_time)] ?? null;
    renderReceipt(receiptTx.tx, price);
  } else if (statement) {
    if (statement.allTxs && !statement._gainsComputed) {
      log('refreshUSD: re-computing FIFO gains with price data');
      statement.txGains = buildFIFOQueue(statement.allTxs, statement.address, priceMap);
      statement._gainsComputed = true;
    }
    renderStatement();
  }
}

function setDefaultDateRange() {
  const today = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(today.getFullYear() - 1);
  fromDateInput.value = yearAgo.toISOString().split('T')[0];
  toDateInput.value = today.toISOString().split('T')[0];
  toDateInput.max = today.toISOString().split('T')[0];
}

function resetForm() {
  log('Resetting form');
  input.value = '';
  input.focus();
  resultEl.classList.add('hidden');
  receiptCard.classList.add('hidden');
  statementCard.classList.add('hidden');
  receiptTx = null;
  statement = null;
  dateRangeSection.classList.add('hidden');
  hideError();
}

async function handleGenerate() {
  const raw = input.value.trim().toLowerCase();
  log('handleGenerate triggered with input:', raw);
  hideError();
  resultEl.classList.add('hidden');
  receiptCard.classList.add('hidden');
  statementCard.classList.add('hidden');

  if (!raw) {
    input.classList.add('error');
    showError('Please enter a transaction ID or wallet address.');
    input.focus();
    return;
  }

  input.classList.remove('error');
  showLoading(true);

  try {
    if (priceMapPromise) {
      log('Waiting for price map to load...');
      await priceMapPromise;
      log('Price map ready:', !!priceMap);
    }

    if (TX_HASH_REGEX.test(raw)) {
      log('Input matched TX hash pattern');
      receiptTx = null;
      statement = null;
      const tx = await fetchTransaction(raw);
      const price = priceMap ? priceMap[getDateKey(tx.block_time)] : null;
      renderReceipt(tx, price);
    } else if (ADDRESS_REGEX.test(raw)) {
      log('Input matched address pattern');
      statement = null;
      const fromDate = fromDateInput.value;
      const toDate = toDateInput.value;
      log('Date range:', fromDate, 'to', toDate);
      if (!fromDate || !toDate) {
        showError('Please select a date range for address lookups.');
        showLoading(false);
        return;
      }
      if (fromDate > toDate) {
        showError('The "From" date must be before the "To" date.');
        showLoading(false);
        return;
      }
      const fromMs = new Date(fromDate + 'T00:00:00').getTime();
      const toMs = new Date(toDate + 'T23:59:59').getTime();
      log('Date range in ms:', fromMs, 'to', toMs);
      const [bal, allTxs] = await Promise.all([
        fetchAddressBalance(raw),
        fetchAllTxsFromGenesis(raw)
      ]);
      log('All txs from genesis:', allTxs.length);
      const txGains = buildFIFOQueue(allTxs, raw, priceMap);
      const txs = allTxs.filter(tx => tx.block_time >= fromMs && tx.block_time <= toMs);
      txs.reverse();
      log('Display txs in range:', txs.length);
      statement = { address: raw, balance: bal, txs, allTxs, txGains, fromDate, toDate, page: 0, _gainsComputed: true };
      renderStatement();
    } else {
      warn('Input did not match TX hash or address pattern');
      showError('That doesn\'t look like a Kaspa transaction or address. Try again.');
      showLoading(false);
      return;
    }
    resultEl.classList.remove('hidden');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    error('handleGenerate error:', err.message);
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function handleInput() {
  const val = input.value.trim().toLowerCase();
  log('Input changed:', val);
  input.classList.remove('error');
  hideError();
  if (val.startsWith('kaspa:')) {
    dateRangeSection.classList.remove('hidden');
  } else {
    dateRangeSection.classList.add('hidden');
  }
}

function initEventListeners() {
  log('Initializing event listeners');
  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGenerate(); });
  button.addEventListener('click', handleGenerate);

  receiptCard.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn && copyBtn.dataset.copy) { log('Copy clicked:', copyBtn.dataset.copy.slice(0, 12)); copyToClipboard(copyBtn.dataset.copy, copyBtn); return; }

    if (e.target.closest('#back-btn') && statement) {
      log('Back to statement clicked');
      renderStatement();
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (e.target.closest('#new-receipt-btn')) {
      log('New receipt clicked');
      resetForm();
    }
  });

  statementCard.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn && copyBtn.dataset.copy) { copyToClipboard(copyBtn.dataset.copy, copyBtn); return; }

    const row = e.target.closest('.tx-row');
    if (row && row.dataset.txId) { log('Tx row clicked:', row.dataset.txId); showTxDetail(row.dataset.txId); return; }

    const pageBtn = e.target.closest('.page-btn');
    if (pageBtn && !pageBtn.disabled && pageBtn.dataset.page !== undefined) {
      const page = parseInt(pageBtn.dataset.page);
      log('Page button clicked:', page);
      goToPage(page);
      return;
    }

    if (e.target.closest('#export-csv-btn')) {
      log('Export CSV clicked');
      exportCSV();
      return;
    }

    if (e.target.closest('#search-btn')) {
      log('New search clicked');
      resetForm();
    }
  });
}

log('App starting...');
setDefaultDateRange();
priceMapPromise = fetchPriceMap().then(map => {
  log('Price map initialization complete. Available:', !!map);
  priceMap = map;
  refreshUSD();
  return map;
});
initEventListeners();
log('App initialized.');
