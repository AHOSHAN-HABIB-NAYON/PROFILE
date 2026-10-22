# Accounting rules

All money is stored as `DECIMAL` and calculated with exact decimal arithmetic (`app/Core/Decimal.php`). No floating point is used for balances. Values are kept in USD; the business timezone (default Asia/Dhaka) decides what "today" means.

## Ledger

Every financial event is a `financial_transactions` row with double-entry `ledger_entries` that **sum to exactly zero**. Balances are read from the ledger.

| Account | Meaning |
|---|---|
| `cash` | Main USD balance |
| `trading` | USD set aside for trading |
| `investment` | Crypto holdings at cost basis (market value is computed separately) |
| `loan` | Loan liabilities at book value |
| `pnl` | Realized profit and loss |
| `external` | Money entering or leaving the platform |
| `salary` | Salary paid (kept out of portfolio metrics) |
| `alloc_*` (platform) | Profit allocation buckets |

Posted transactions are never edited or deleted. Corrections are **reversals**: a new transaction with opposite entries, linked to the original, with a required reason, recorded in the audit log. Reversals go newest-first per asset, so average cost always stays consistent. Admin writes take an idempotency key (double-clicks don't post twice) and lock the user's row (no race between two admins).

## Holdings (average-cost method)

- market value = quantity × latest valid price
- unrealized P/L = market value − remaining cost basis
- return % = unrealized P/L ÷ remaining cost basis × 100
- Buying adds quantity and cost (including fees). Selling removes cost in proportion: `cost removed = cost basis × sold qty ÷ held qty`. Realized P/L = proceeds − fees − cost removed.

**Example (from the specification):** 1 SOL bought at 106.
- Price 120 → market value 120, unrealized **+14.00 (+13.21 %)**.
- Price 100 → market value 100, unrealized **−6.00 (−5.66 %)**.

These cases are covered by `tests/Integration/InvestmentValuationTest.php`.

## Dashboard figures

| Figure | Definition |
|---|---|
| All balance | cash + trading + investment balance (market value) |
| Investment balance | Σ market value of holdings |
| Trading balance | Balance of the `trading` account |
| Today's profit | Net realized P/L recorded today: closed trades, sales and loan settlements, after fees. Unrealized moves are not counted. |
| Loss balance | Σ realized losses (absolute), all time |
| Loan balance | Σ current liability of active loans |
| Net value | All balance − loan balance |

When a price is older than the stale limit (default 10 min), it stays shown with a "stale" label and the time of the last update.

## Trades (monitoring only)

- Long: gross P/L = (exit − entry) × qty; short: (entry − exit) × qty.
- Realized P/L = gross − fees, posted when the trade is closed. Open trades show unrealized P/L from the live price and post nothing.

## Loans

- USD loan: liability = outstanding USD.
- Coin loan: the borrowed **quantity** is kept; liability = outstanding quantity × current price. If the borrowed coins were added to holdings, a price move changes both sides equally, so net value is unaffected. Borrowed coins are never counted as owned equity.
- Repaying a coin loan at a different price than at origination realizes the difference as P/L.
- Interest and fees only exist when an administrator records them.

## Salary

Salary records and payments are separate from investment profit. They never change today's profit, loss balance or returns.

## Profit allocation

Only **realized** net profit of a completed period can be allocated (unrealized gains are never eligible). Rules (default 40 % retained / 30 % salary pool / 25 % reinvestment / 5 % fees) must add up to 100 %. A period can be allocated once per scope, overlaps are rejected, and every run can be reversed.

## Reconciliation

Admin → Reconciliation runs 7 checks and lists the records that differ:
1. Every transaction balances to zero.
2. Holdings match investment entries, sales and the ledger.
3. Loan book values match the ledger.
4. Closed trade P/L matches the ledger.
5. No negative cash or trading balances.
6. Paid salaries are posted to the ledger.
7. Every reversal points to a reversed original.
