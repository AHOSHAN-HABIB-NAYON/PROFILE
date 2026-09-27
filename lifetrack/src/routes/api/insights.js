'use strict';
/** Dashboard, reports and calendar — aggregated in the user's timezone and currency. */
const express = require('express');
const db = require('../../db');
const { ah, ok } = require('../../lib/http');
const { tzOffsetMinutes, localDate } = require('../../lib/time');
const { convSql, convert } = require('../../services/fx');

const r = express.Router();

async function ctx(userId) {
  const p = await db.one('SELECT currency, timezone FROM user_profiles WHERE user_id=?', [userId]);
  const tz = p?.timezone || 'Asia/Dhaka';
  return { cur: p?.currency || 'BDT', tz, off: tzOffsetMinutes(tz) };
}
const localMidnightUtc = (dateStr, off) => new Date(Date.parse(dateStr + 'T00:00:00Z') - off * 60e3);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const round2 = (n) => Math.round(n * 100) / 100;

/** Daily totals by type between two UTC instants, converted to target currency */
async function dailyTotals(userId, fromUtc, toUtc, c) {
  const conv = convSql('t.amount', 't.currency', c.cur);
  const rows = await db.q(`SELECT DATE_FORMAT(DATE_ADD(t.occurred_at, INTERVAL ? MINUTE), '%Y-%m-%d') d, t.type, SUM(${conv.sql}) total, COUNT(*) n
    FROM transactions t WHERE t.user_id=? AND t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ? GROUP BY d, t.type`,
  [c.off, ...conv.params, userId, fromUtc, toUtc]);
  return rows.map((x) => ({ ...x, total: Number(x.total), n: Number(x.n) }));
}

async function totalBalance(userId, cur) {
  const accs = await db.q('SELECT id, name, type, currency, balance, include_in_total FROM accounts WHERE user_id=? AND archived_at IS NULL ORDER BY sort_order, id', [userId]);
  const total = accs.filter((a) => a.include_in_total).reduce((s, a) => s + convert(a.balance, a.currency, cur), 0);
  return { accounts: accs, total: round2(total) };
}

async function loanTotals(userId, cur) {
  const lent = await db.q("SELECT amount-paid_amount rest, currency FROM loans_lent WHERE user_id=? AND status='open'", [userId]);
  const bor = await db.q("SELECT amount-paid_amount rest, currency FROM loans_borrowed WHERE user_id=? AND status='open'", [userId]);
  const sum = (a) => round2(a.reduce((s, x) => s + convert(x.rest, x.currency, cur), 0));
  return { receivable: sum(lent), payable: sum(bor) };
}

async function investmentTotals(userId, cur) {
  const inv = await db.q('SELECT amount, current_value, currency FROM investments WHERE user_id=? AND closed_at IS NULL', [userId]);
  const invested = round2(inv.reduce((s, x) => s + convert(x.amount, x.currency, cur), 0));
  const value = round2(inv.reduce((s, x) => s + convert(x.current_value, x.currency, cur), 0));
  return { invested, value, pnl: round2(value - invested), count: inv.length };
}

r.get('/dashboard', ah(async (req, res) => {
  const uid = req.user.id; const c = await ctx(uid);
  const today = localDate(c.tz); const ym = today.slice(0, 7);
  const monthStart = localMidnightUtc(ym + '-01', c.off);
  const nextMonth = localMidnightUtc(addMonths(ym, 1) + '-01', c.off);
  const prevMonth = localMidnightUtc(addMonths(ym, -1) + '-01', c.off);
  const sixAgo = localMidnightUtc(addMonths(ym, -5) + '-01', c.off);

  const [bal, days, recent, reminders, goals, loans, inv, mood] = await Promise.all([
    totalBalance(uid, c.cur),
    dailyTotals(uid, sixAgo, nextMonth, c),
    db.q(`SELECT t.id, t.type, t.amount, t.to_amount, t.currency, t.occurred_at, t.note, a.name account_name, a.type account_type, ta.name to_account_name,
        c.name category_name, c.icon category_icon, c.color category_color
      FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts ta ON ta.id=t.to_account_id LEFT JOIN categories c ON c.id=t.category_id
      WHERE t.user_id=? AND t.deleted_at IS NULL AND t.type<>'adjustment' ORDER BY t.occurred_at DESC, t.id DESC LIMIT 6`, [uid]),
    db.q(`SELECT id, type, title, amount, due_at, ref_type, ref_id FROM reminders WHERE user_id=? AND done_at IS NULL AND due_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
      ORDER BY due_at, remind_at DESC LIMIT 12`, [uid]),
    db.q('SELECT id, name, kind, icon, color, image_path, target_amount, current_amount, currency, deadline FROM goals WHERE user_id=? AND archived_at IS NULL AND completed_at IS NULL ORDER BY deadline IS NULL, deadline LIMIT 3', [uid]),
    loanTotals(uid, c.cur),
    investmentTotals(uid, c.cur),
    db.one("SELECT mood, activity FROM moods WHERE user_id=? AND entry_date=?", [uid, today]),
  ]);

  const month = (key) => {
    const [from, to] = key === 'cur' ? [ym + '-01', addMonths(ym, 1) + '-01'] : [addMonths(ym, -1) + '-01', ym + '-01'];
    const f = days.filter((d) => d.d >= from && d.d < to);
    const s = (types) => round2(f.filter((d) => types.includes(d.type)).reduce((a, d) => a + d.total, 0));
    return { income: s(['income', 'deposit']), expense: s(['expense']), investment: s(['investment']) };
  };
  const cur = month('cur'); const prev = month('prev');
  cur.savings = round2(cur.income - cur.expense); prev.savings = round2(prev.income - prev.expense);
  const pct = (a, b) => (b ? round2(((a - b) / Math.abs(b)) * 100) : null);
  const series = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(ym, -i); const n = addMonths(m, 1);
    const f = days.filter((d) => d.d >= m + '-01' && d.d < n + '-01');
    series.push({ label: m, income: round2(f.filter((d) => ['income', 'deposit'].includes(d.type)).reduce((a, d) => a + d.total, 0)), expense: round2(f.filter((d) => d.type === 'expense').reduce((a, d) => a + d.total, 0)) });
  }
  const seen = new Set();
  const upcoming = reminders.filter((x) => { if (!x.ref_type) return true; const k = x.ref_type + x.ref_id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
  // Balance change vs start of month (from this month's flows)
  const monthFlow = days.filter((d) => d.d >= ym + '-01').reduce((a, d) => a + (['income', 'deposit', 'borrow', 'repay_in', 'adjustment'].includes(d.type) ? d.total : ['expense', 'investment', 'lend', 'repay_out'].includes(d.type) ? -d.total : 0), 0);
  const startBal = bal.total - monthFlow;
  ok(res, {
    currency: c.cur, today, totalBalance: bal.total, balanceChangePct: startBal ? round2((monthFlow / Math.abs(startBal)) * 100) : null,
    accounts: bal.accounts, month: cur, prevMonth: prev,
    change: { income: pct(cur.income, prev.income), expense: pct(cur.expense, prev.expense), savings: pct(cur.savings, prev.savings), investment: pct(cur.investment, prev.investment) },
    series, recent, reminders: upcoming, goals, loans, investments: inv, mood,
  });
}));

r.get('/reports', ah(async (req, res) => {
  const uid = req.user.id; const c = await ctx(uid);
  const period = ['daily', 'weekly', 'monthly', 'yearly'].includes(req.query.period) ? req.query.period : 'monthly';
  const today = localDate(c.tz);
  const shift = Math.max(0, Math.min(50, Number(req.query.shift) || 0)); // pages back in time
  const buckets = [];
  const d0 = new Date(today + 'T00:00:00Z');
  if (period === 'daily') {
    for (let i = 13; i >= 0; i--) { const d = new Date(d0.getTime() - (i + shift * 14) * 864e5); const s = d.toISOString().slice(0, 10); buckets.push({ start: s, end: new Date(d.getTime() + 864e5).toISOString().slice(0, 10), label: s }); }
  } else if (period === 'weekly') {
    const dow = (d0.getUTCDay() + 6) % 7; const monday = new Date(d0.getTime() - dow * 864e5);
    for (let i = 11; i >= 0; i--) { const s = new Date(monday.getTime() - (i + shift * 12) * 7 * 864e5); buckets.push({ start: s.toISOString().slice(0, 10), end: new Date(s.getTime() + 7 * 864e5).toISOString().slice(0, 10), label: s.toISOString().slice(0, 10) }); }
  } else if (period === 'monthly') {
    const ym = today.slice(0, 7);
    for (let i = 11; i >= 0; i--) { const m = addMonths(ym, -(i + shift * 12)); buckets.push({ start: m + '-01', end: addMonths(m, 1) + '-01', label: m }); }
  } else {
    const y = Number(today.slice(0, 4));
    for (let i = 4; i >= 0; i--) { const yy = y - i - shift * 5; buckets.push({ start: `${yy}-01-01`, end: `${yy + 1}-01-01`, label: String(yy) }); }
  }
  const from = localMidnightUtc(buckets[0].start, c.off); const to = localMidnightUtc(buckets[buckets.length - 1].end, c.off);
  const days = await dailyTotals(uid, from, to, c);
  const inflowT = ['income', 'deposit', 'borrow', 'repay_in', 'adjustment']; const outflowT = ['expense', 'investment', 'lend', 'repay_out'];
  const series = buckets.map((b) => {
    const f = days.filter((d) => d.d >= b.start && d.d < b.end);
    const s = (types) => round2(f.filter((d) => types.includes(d.type)).reduce((a, d) => a + d.total, 0));
    const income = s(['income', 'deposit']); const expense = s(['expense']);
    return { label: b.label, start: b.start, income, expense, investment: s(['investment']), savings: round2(income - expense),
      netFlow: round2(s(['income', 'deposit', 'adjustment']) - expense), count: f.reduce((a, d) => a + d.n, 0) };
  });
  // Net worth path: walk backwards from today's net worth using net flows
  const bal = await totalBalance(uid, c.cur); const loans = await loanTotals(uid, c.cur); const inv = await investmentTotals(uid, c.cur);
  const netWorthNow = round2(bal.total + loans.receivable - loans.payable + inv.value);
  const conv = convSql('t.amount', 't.currency', c.cur);
  const after = await db.one(`SELECT COALESCE(SUM(CASE WHEN t.type IN ('income','deposit','adjustment') THEN ${conv.sql} WHEN t.type='expense' THEN -${conv.sql} ELSE 0 END),0) f
    FROM transactions t WHERE t.user_id=? AND t.deleted_at IS NULL AND t.occurred_at >= ?`, [...conv.params, ...conv.params, uid, to]);
  let running = netWorthNow - Number(after.f);
  for (let i = series.length - 1; i >= 0; i--) { series[i].netWorth = round2(running); running -= series[i].netFlow; }

  const convC = convSql('t.amount', 't.currency', c.cur);
  const cats = await db.q(`SELECT c.id, COALESCE(c.name, 'Uncategorized') name, COALESCE(c.color, '#94A3B8') color, COALESCE(c.icon, 'tag') icon, t.type, SUM(${convC.sql}) total, COUNT(*) n
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.user_id=? AND t.deleted_at IS NULL AND t.type IN ('expense','income','investment') AND t.occurred_at >= ? AND t.occurred_at < ?
    GROUP BY c.id, c.name, c.color, c.icon, t.type ORDER BY total DESC`, [...convC.params, uid, from, to]);
  const byType = (ty) => cats.filter((x) => x.type === ty).map((x) => ({ name: x.name, color: x.color, icon: x.icon, total: round2(Number(x.total)), count: Number(x.n) }));
  const totals = series.reduce((a, s) => ({ income: a.income + s.income, expense: a.expense + s.expense, investment: a.investment + s.investment }), { income: 0, expense: 0, investment: 0 });
  totals.savings = totals.income - totals.expense;
  totals.savingsRate = totals.income ? round2((totals.savings / totals.income) * 100) : 0;
  Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });
  const accountsByType = {};
  for (const a of bal.accounts) accountsByType[a.type] = round2((accountsByType[a.type] || 0) + convert(a.balance, a.currency, c.cur));
  ok(res, { currency: c.cur, period, series, totals, expenseCategories: byType('expense'), incomeCategories: byType('income'), investmentCategories: byType('investment'),
    netWorth: { now: netWorthNow, cash: bal.total, receivable: loans.receivable, payable: loans.payable, investments: inv.value }, investments: inv, accountsByType });
}));

r.get('/calendar', ah(async (req, res) => {
  const uid = req.user.id; const c = await ctx(uid);
  const ym = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : localDate(c.tz).slice(0, 7);
  const from = localMidnightUtc(ym + '-01', c.off); const to = localMidnightUtc(addMonths(ym, 1) + '-01', c.off);
  const [days, rem, lent, bor, goals, moods] = await Promise.all([
    dailyTotals(uid, from, to, c),
    db.q(`SELECT id, type, title, amount, due_at, done_at, ref_type, ref_id FROM reminders WHERE user_id=? AND due_at >= ? AND due_at < ? ORDER BY due_at, remind_at DESC`, [uid, from, to]),
    db.q("SELECT id, person_name, amount-paid_amount rest, currency, DATE_FORMAT(due_date,'%Y-%m-%d') d FROM loans_lent WHERE user_id=? AND status='open' AND due_date >= ? AND due_date < ?", [uid, ym + '-01', addMonths(ym, 1) + '-01']),
    db.q("SELECT id, person_name, amount-paid_amount rest, currency, DATE_FORMAT(due_date,'%Y-%m-%d') d FROM loans_borrowed WHERE user_id=? AND status='open' AND due_date >= ? AND due_date < ?", [uid, ym + '-01', addMonths(ym, 1) + '-01']),
    db.q("SELECT id, name, DATE_FORMAT(deadline,'%Y-%m-%d') d FROM goals WHERE user_id=? AND archived_at IS NULL AND deadline >= ? AND deadline < ?", [uid, ym + '-01', addMonths(ym, 1) + '-01']),
    db.q("SELECT mood, DATE_FORMAT(entry_date,'%Y-%m-%d') d FROM moods WHERE user_id=? AND entry_date >= ? AND entry_date < ?", [uid, ym + '-01', addMonths(ym, 1) + '-01']),
  ]);
  const map = {};
  const day = (d) => (map[d] = map[d] || { income: 0, expense: 0, count: 0, events: [] });
  for (const x of days) {
    const o = day(x.d); o.count += x.n;
    if (['income', 'deposit'].includes(x.type)) o.income = round2(o.income + x.total);
    if (x.type === 'expense') o.expense = round2(o.expense + x.total);
  }
  const seen = new Set();
  for (const x of rem) {
    if (x.ref_type) { const k = x.ref_type + x.ref_id; if (seen.has(k)) continue; seen.add(k); }
    if (['lent', 'borrowed'].includes(x.ref_type)) continue; // shown from loans below
    const d = new Date(new Date(x.due_at).getTime() + c.off * 60e3).toISOString().slice(0, 10);
    day(d).events.push({ kind: 'reminder', type: x.type, title: x.title, amount: x.amount, done: !!x.done_at, id: x.id });
  }
  for (const x of lent) day(x.d).events.push({ kind: 'lent', title: x.person_name, amount: x.rest, currency: x.currency, id: x.id });
  for (const x of bor) day(x.d).events.push({ kind: 'borrowed', title: x.person_name, amount: x.rest, currency: x.currency, id: x.id });
  for (const x of goals) day(x.d).events.push({ kind: 'goal', title: x.name, id: x.id });
  for (const x of moods) day(x.d).mood = x.mood;
  ok(res, { month: ym, currency: c.cur, offset: c.off, days: map });
}));

module.exports = r;
