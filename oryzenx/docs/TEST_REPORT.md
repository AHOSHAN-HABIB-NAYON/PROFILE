# Test report

Date: 2026-10-22. This report lists what was actually run. Anything not listed under "Tested" should be treated as **not tested**.

## Tested

### Automated PHP tests: 67 tests, 4,211 assertions, all passing

Run on GitHub Actions (`OryzenX CI`) with **PHP 8.1.34 and PHP 8.3 against MySQL 8.0.46**, and locally against MariaDB.

| Suite | What the tests check |
|---|---|
| `Unit/DecimalTest` | Exact decimal maths: arithmetic, rounding and percentages, normalisation/validation, division by zero, random cross-check against integer arithmetic |
| `Unit/CoreTest` | Holding valuation and trade P/L formulas; validator rules; secrets encrypted and tokens hashed; router method matching; SQL splitter |
| `Unit/TranslationCompletenessTest` | English/Bangla keys and placeholders match; every key used by the web apps exists |
| `Integration/InvestmentValuationTest` | SOL example 106→120 = +14.00 (+13.21 %), then 106→100 = −6.00 (−5.66 %), directly and through the dashboard API; fees in cost basis; partial sale at average cost; cannot sell more than held; cash-funded buy needs cash; idempotency key; reversals auditable and newest-first; missing price reported, not invented; stale price kept with warning |
| `Integration/TradeLoanAllocationTest` | Closed trades realize net of fees, open trades stay unrealized; duplicate trade reference rejected; coin loan revalued and never counted as equity; coin-loan repayment realizes the difference; USD loan charges only when recorded; allocation uses realized profit only, cannot repeat, rules ≤ 100 %; salary separate from profit and posted once; non-USD salary needs a rate; unbalanced ledger posting impossible; withdrawal cannot overdraw; **concurrent sales cannot oversell** (two processes) |
| `Integration/AuthAndAccessTest` | Register → verify → login → logout; password hashing and weak-password rejection; login rate limit and lockout; reset token single-use and expiring; users can't see others' records; non-admins blocked from admin API; per-action admin permissions; re-auth for sensitive actions; suspended accounts blocked; CSRF on cookie sessions; identity verification review; admin-only counts; future dates rejected |
| `Integration/NotificationsMarketWebTest` | No duplicate emails per event; log driver records status; SMTP failures retry then fail without claiming delivery; profit emails say realized, threshold emails say unrealized; 5-day reminder optional and not duplicated; preferences respected but security always sent; Bangla emails for Bangla users; push skipped and logged when Firebase is not configured; CoinGecko/Binance parsing (small prices exact) and provider errors; support form spam protection and rate limit; image compression (3.57 MB → 538 KB document, 60 KB avatar) and unsafe files rejected; landing page in both languages without mixing; no secrets in `public/` |

### Manual checks (local, headless Chromium via Playwright)

- Landing page in English, Bangla and dark mode; user app screens at 360 px width; admin screens. No horizontal overflow. The only console errors were the expected 401s before sign-in.
- Demo dashboard figures re-calculated by hand (cash 1,908.60; trading 1,509.30; realized 22.65; loss 16.00; today 2.50); reconciliation passed; ledger total 0.

### Android

ANDROID_RESULT

## Not tested (needs real accounts, devices or production hosting)

- **Live market APIs** (CoinGecko/Binance) from a production server. Tests use a fixed fake provider.
- **Real SMTP delivery.** Tests use the `log` mail driver. Inbox delivery, spam placement and SPF/DKIM were not checked.
- **Firebase push delivery** (no Firebase project was available).
- **Google sign-in** with a real Google account and client ID.
- **Android on a physical device**: no install, tap-through, push or App Links test on hardware. **120 Hz behaviour was not measured.**
- **Shared-hosting deployment** (cPanel/LiteSpeed), cron timing on the real host, HTTPS/HSTS on the real domain.
- Load and performance testing; a professional security audit or penetration test.
- Legal review of the privacy policy, terms and risk disclosure.
