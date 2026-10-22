const { query, one, getSetting } = require('../db');

const DEFAULT_WATCHLIST = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'SUI', 'ZEC', 'PEPE', 'DOGE', 'ADA'];

const thisMonth = async () => (await one("SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS m")).m;

// Net trade result in a window: profit (winning trades), loss (losing trades, positive number), net.
async function pnl(whereSql, params = []) {
  const r = await one(
    `SELECT COALESCE(SUM(GREATEST(profit - fee, 0)), 0) AS profit,
            COALESCE(SUM(GREATEST(fee - profit, 0)), 0) AS loss,
            COALESCE(SUM(profit - fee), 0) AS net,
            COUNT(*) AS trades
       FROM trades WHERE ${whereSql}`, params,
  );
  return { profit: r.profit, loss: r.loss, net: r.net, trades: r.trades };
}

async function profitPeriods() {
  const [today, yesterday, d7, d30, y1, all] = await Promise.all([
    pnl('traded_at >= CURDATE()'),
    pnl('traded_at >= CURDATE() - INTERVAL 1 DAY AND traded_at < CURDATE()'),
    pnl('traded_at >= CURDATE() - INTERVAL 6 DAY'),
    pnl('traded_at >= CURDATE() - INTERVAL 29 DAY'),
    pnl('traded_at >= CURDATE() - INTERVAL 364 DAY'),
    pnl('1 = 1'),
  ]);
  return { today, yesterday, d7, d30, y1, all };
}

// Balances that do not depend on live prices. Live parts (investment and coin-loan value)
// are computed in the app from Binance prices so they move in real time.
async function balances() {
  const cfg = await getSetting('balances', { main_base: 0, trading_capital: 0 });
  const [all, paid, inv, loans] = await Promise.all([
    pnl('1 = 1'),
    one("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid'"),
    one("SELECT COALESCE(SUM(quantity * entry_price), 0) AS cost FROM investments WHERE status = 'open'"),
    one("SELECT COALESCE(SUM(remaining_usd), 0) AS usd FROM loans WHERE status = 'open' AND kind = 'usd'"),
  ]);
  return {
    main_base: Number(cfg.main_base || 0),
    // Main Balance = starting pool + all trade results (after fees) - salaries already paid out.
    main_balance: Number(cfg.main_base || 0) + all.net - paid.total,
    trading_balance: Number(cfg.trading_capital || 0),
    investment_cost: inv.cost,
    usd_loan_remaining: loans.usd,
    loss_balance: all.loss,
    net_trade_result: all.net,
    salaries_paid: paid.total,
  };
}

async function openInvestments() {
  return query("SELECT id, coin, quantity, entry_price, invested_at FROM investments WHERE status = 'open' ORDER BY invested_at DESC, id DESC");
}

async function openCoinLoans() {
  return query("SELECT id, coin, quantity, entry_price, remaining_usd, repay_date FROM loans WHERE status = 'open' AND kind = 'coin'");
}

async function watchlist() {
  const base = await getSetting('watchlist', DEFAULT_WATCHLIST);
  const used = await query(
    `SELECT coin FROM investments WHERE status = 'open'
     UNION SELECT coin FROM loans WHERE status = 'open' AND kind = 'coin'
     UNION SELECT coin FROM (SELECT coin FROM trades ORDER BY traded_at DESC LIMIT 200) t`,
  );
  return [...new Set([...base, ...used.map((r) => r.coin).filter(Boolean)])].slice(0, 40);
}

module.exports = { thisMonth, pnl, profitPeriods, balances, openInvestments, openCoinLoans, watchlist, DEFAULT_WATCHLIST };
