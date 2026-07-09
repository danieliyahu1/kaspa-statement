# Kaspa Receipts

Generate printable receipts and transaction history for Kaspa wallet addresses.

A pure client-side single-page app. No backend, no database, no build step — just a static HTML file you can open in a browser or deploy anywhere.

## Features

- **Transaction Receipt** — Paste a Kaspa TX hash to see a paper-style receipt with from/to addresses, amounts, confirmation status, and USD value.
- **Wallet History** — Enter a `kaspa:` address with a date range to get a paginated transaction history with net summary.
- **USD Pricing** — Fetches daily KAS/USDT rates from Bybit. USD equivalents shown on receipts, statement rows, net summary, and CSV export.
- **Transaction Classification** — Automatically detects `Received`, `Sent`, or `Self` (self-transfer) transactions.
- **CSV Export** — Download transaction history as a CSV file.
- **Dark Mode** — Full dark theme with Kaspa brand colors.

## Usage

Open `index.html` in a browser, serve it with any static file server, or use the hosted version at **[kaspa-receipts.onrender.com](https://kaspa-receipts.onrender.com/)**.

### Single Transaction

1. Paste a 64-character transaction hash (hex) into the input.
2. Click **Look Up**.
3. View the receipt showing from/to addresses, amounts, and USD value.

### Wallet History

1. Paste a `kaspa:` wallet address (61–63 characters).
2. Select a date range (defaults to the last 12 months).
3. Click **Look Up**.
4. Browse the paginated transaction list. Click any row to drill into its receipt.

## Run Tests

```bash
npm install
npm test
```

Uses [Vitest](https://vitest.dev/) with [jsdom](https://github.com/jsdom/jsdom). 80+ tests covering API, DOM rendering, and utility functions.

## API

All data is fetched live from:

- **Kaspa public API** — `api.kaspa.org` for transactions, balances, and address history.
- **Bybit v5 API** — `api.bybit.com` for daily KAS/USDT klines (up to 1000 days).

No data is stored locally. No server-side components.

## Tech Stack

- Vanilla JavaScript (ES modules)
- CSS custom properties
- Vitest + jsdom for testing

No frameworks, no bundlers, no build step.

## License

MIT
