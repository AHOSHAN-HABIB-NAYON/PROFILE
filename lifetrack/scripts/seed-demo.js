#!/usr/bin/env node
'use strict';
/**
 * Creates a demo user with realistic data through the public API (all rules & balances enforced).
 *   BASE_URL=http://localhost:3000 DEMO_EMAIL=demo@lifetrack.app DEMO_PASSWORD=Demo12345 node scripts/seed-demo.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.DEMO_EMAIL || 'demo@lifetrack.app';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo12345';
const jar = {};
async function req(method, path, body, extra = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': jar.lt_csrf || '', Origin: BASE, Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...extra }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${j.error?.message}`);
  return j.data;
}
const day = (n, h = 12) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(h - 6, Math.floor(Math.random() * 59)); return d.toISOString(); };
const date = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

(async () => {
  await req('GET', '/api/public/config');
  try { await req('POST', '/api/auth/register', { name: 'Rakib Hasan', email: EMAIL, password: PASSWORD, timezone: 'Asia/Dhaka' }); }
  catch { await req('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD }); }
  const accs = await req('GET', '/api/accounts');
  if (accs.length > 2) { console.log('demo data already present'); return; }
  const cash = accs.find((a) => a.type === 'cash'); const bkash = accs.find((a) => a.type === 'bkash');
  await req('PATCH', `/api/accounts/${cash.id}`, { name: 'Cash' });
  const bank = await req('POST', '/api/accounts', { name: 'City Bank', type: 'bank', number_hint: '4821' });
  const nagad = await req('POST', '/api/accounts', { name: 'Nagad', type: 'nagad' });
  const rocket = await req('POST', '/api/accounts', { name: 'Rocket', type: 'rocket' });
  const card = await req('POST', '/api/accounts', { name: 'Visa Card', type: 'card', number_hint: '0912' });
  const cats = await req('GET', '/api/categories');
  const cat = (n) => cats.find((c) => c.name === n).id;
  const tx = (type, account, amount, category, when, note) => req('POST', '/api/transactions', { type, account_id: account.id, amount: String(amount), category_id: category ? cat(category) : null, occurred_at: when, note });
  for (let m = 5; m >= 0; m--) {
    const base = m * 30 + 3;
    await tx('income', bank, 80000 + m * 1500, 'Salary', day(base, 10), 'Monthly salary');
    if (m % 2 === 0) await tx('income', bkash, 12000 + m * 900, 'Freelance', day(base - 6, 15), 'Website project');
    await tx('expense', bank, 18000, 'Rent', day(base - 1, 9), 'House rent');
    await req('POST', '/api/transactions', { type: 'transfer', account_id: bank.id, to_account_id: cash.id, amount: '12000', occurred_at: day(base - 2, 17), note: 'ATM withdrawal' });
    await tx('expense', cash, 5200 + m * 300, 'Food & Dining', day(base - 4, 13), 'Groceries');
    await tx('expense', bkash, 1800 + m * 120, 'Transport', day(base - 8, 18), 'Uber & bus');
    await tx('expense', card, 6500 - m * 200, 'Shopping', day(base - 12, 19), 'Daraz order');
    await req('POST', '/api/transactions', { type: 'transfer', account_id: bank.id, to_account_id: nagad.id, amount: '3000', occurred_at: day(base - 3, 12), note: 'Nagad top-up' });
    await req('POST', '/api/transactions', { type: 'transfer', account_id: bank.id, to_account_id: rocket.id, amount: '1500', occurred_at: day(base - 3, 13), note: 'Rocket top-up' });
    await tx('expense', nagad, 1250 + m * 50, 'Bills & Utilities', day(base - 15, 11), 'Electricity bill');
    await tx('expense', rocket, 699, 'Mobile & Internet', day(base - 16, 20), 'Internet package');
    await tx('expense', cash, 2400, 'Health', day(base - 20, 16), 'Pharmacy');
  }
  await req('POST', '/api/transactions', { type: 'transfer', account_id: bank.id, to_account_id: bkash.id, amount: '8000', occurred_at: day(2), note: 'Top up' });
  await req('POST', '/api/transactions', { type: 'transfer', account_id: bank.id, to_account_id: cash.id, amount: '15000', occurred_at: day(1), note: 'ATM' });
  await req('POST', '/api/transactions', { type: 'investment', account_id: bank.id, amount: '25000', category_id: cat('Savings / FDR'), investment_name: 'FDR – City Bank', occurred_at: day(40) });
  await req('POST', '/api/transactions', { type: 'investment', account_id: bank.id, amount: '10000', category_id: cat('Stocks'), investment_name: 'DSE shares', occurred_at: day(20) });
  const inv = await req('GET', '/api/investments');
  await req('PATCH', `/api/investments/${inv.find((x) => x.name.startsWith('DSE')).id}`, { current_value: '11850' });
  await req('PATCH', `/api/investments/${inv.find((x) => x.name.startsWith('FDR')).id}`, { current_value: '25780' });
  await tx('expense', cash, 420, 'Food & Dining', day(0, 13), 'Lunch');
  await tx('income', bkash, 25000, 'Freelance', day(0, 10), 'Client payment');
  await req('POST', '/api/loans', { kind: 'lent', person_name: 'Rahim', contact: '01711-000000', amount: '5000', account_id: bkash.id, given_at: date(-10), due_date: date(9) });
  await req('POST', '/api/loans', { kind: 'lent', person_name: 'Karim', amount: '3000', account_id: cash.id, given_at: date(-25), due_date: date(4) });
  const b = await req('POST', '/api/loans', { kind: 'borrowed', person_name: 'Sadia', amount: '8000', account_id: bank.id, given_at: date(-30), due_date: date(20) });
  await req('POST', `/api/loans/borrowed/${b.id}/payments`, { amount: '3000', account_id: bank.id, paid_at: date(-5) });
  await req('POST', '/api/goals', { name: 'New Phone', kind: 'phone', icon: 'phone', color: '#2F62F0', target_amount: '50000', current_amount: '16000', deadline: date(95) });
  await req('POST', '/api/goals', { name: 'Bike', kind: 'bike', icon: 'bike', color: '#E0434B', target_amount: '150000', current_amount: '18000', deadline: date(270) });
  await req('POST', '/api/goals', { name: 'Emergency Fund', kind: 'emergency', icon: 'umbrella', color: '#12A150', target_amount: '100000', current_amount: '40000', deadline: date(180) });
  await req('POST', '/api/reminders', { title: 'Electricity bill', type: 'bill', amount: '1250', due_at: new Date(Date.now() + 2 * 864e5).toISOString(), remind_before_min: 1440, repeat_rule: 'monthly' });
  await req('POST', '/api/reminders', { title: 'Credit card payment', type: 'payment', amount: '6500', due_at: new Date(Date.now() + 6 * 864e5).toISOString(), repeat_rule: 'monthly' });
  for (let i = 0; i < 20; i++) await req('POST', '/api/moods', { mood: [4, 5, 3, 4, 5, 2, 4, 4, 3, 5][i % 10], date: date(-i), activity: ['Work', 'Family', 'Exercise', 'Friends', 'Rest'][i % 5] });
  await req('POST', '/api/notes', { title: 'Eid shopping list', body: 'Panjabi, shoes, gifts for family', pinned: true });
  console.log('demo data created for', EMAIL);
})().catch((e) => { console.error(e.message); process.exit(1); });
