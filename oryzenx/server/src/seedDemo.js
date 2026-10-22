// Fills an EMPTY database with sample data so you can try the app. Never run this on real data.
//   npm run seed-demo
const bcrypt = require('bcryptjs');
const migrate = require('./migrate');
const { pool, query, one, setSetting } = require('./db');

(async () => {
  await migrate();
  const n = await one('SELECT COUNT(*) AS n FROM trades');
  if (n.n > 0 && !process.argv.includes('--force')) {
    console.error('Database already has trades. Refusing to add demo data (use --force to override).');
    process.exit(1);
  }
  const hash = await bcrypt.hash('Demo12345', 12);
  const people = [
    ['Ahmed Karim', 'admin@demo.local', 'super_admin'],
    ['Rasel Hasan', 'rasel@demo.local', 'user'],
    ['Sabbir Ahmed', 'sabbir@demo.local', 'user'],
    ['Nusrat Jahan', 'nusrat@demo.local', 'user'],
  ];
  for (const [name, email, role] of people) {
    await query(
      `INSERT IGNORE INTO users (name, email, password_hash, role, status, email_verified_at, privacy_accepted_at,
         deposit_amount, deposit_date, salary, phone, address)
       VALUES (?, ?, ?, ?, 'active', NOW(), NOW(), 100000, '2027-12-31', 500, '+8801700000000', 'Dhaka, Bangladesh')`,
      [name, email, hash, role],
    );
  }
  await query("INSERT IGNORE INTO users (name, email, password_hash, status, email_verified_at) VALUES ('Tanvir Islam', 'pending@demo.local', ?, 'pending', NOW())", [hash]);
  await setSetting('balances', { main_base: 10000, trading_capital: 2540 });
  await setSetting('default_deposit', { amount: 100000, date: '2027-12-31' });

  const coins = ['BTC', 'ETH', 'SOL', 'XRP', 'SUI', 'PEPE', 'BNB'];
  for (let i = 0; i < 90; i += 1) {
    const c = coins[i % coins.length];
    const profit = Math.round((Math.random() * 160 - 45) * 100) / 100;
    await query(
      `INSERT INTO trades (coin, side, profit, fee, traded_at) VALUES (?, ?, ?, ?, NOW() - INTERVAL ? HOUR)`,
      [c, ['long', 'short', 'spot'][i % 3], profit, Math.round(Math.random() * 300) / 100, i * 9 + 1],
    );
  }
  await query(`INSERT INTO investments (coin, quantity, entry_price, invested_at) VALUES
    ('SOL', 12, 150, CURDATE() - INTERVAL 40 DAY), ('ETH', 0.8, 3100, CURDATE() - INTERVAL 30 DAY),
    ('XRP', 1500, 0.55, CURDATE() - INTERVAL 20 DAY), ('SUI', 400, 1.9, CURDATE() - INTERVAL 10 DAY),
    ('PEPE', 150000000, 0.0000095, CURDATE() - INTERVAL 5 DAY)`);
  await query(`INSERT INTO loans (kind, coin, quantity, entry_price, amount_usd, remaining_usd, lender, borrowed_at, repay_date) VALUES
    ('coin', 'ETH', 0.5, 3000, 1500, 1500, 'Binance Loan', CURDATE() - INTERVAL 15 DAY, CURDATE() + INTERVAL 20 DAY),
    ('usd', NULL, NULL, NULL, 2300, 1800, 'Friend - Rafi', CURDATE() - INTERVAL 60 DAY, CURDATE() + INTERVAL 45 DAY)`);
  const m = (await one("SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS m")).m;
  await query("INSERT IGNORE INTO payment_schedule (month, pay_date) VALUES (?, CONCAT(?, '-20'))", [m, m]);
  await query(`INSERT IGNORE INTO payments (user_id, month, amount) SELECT id, ?, salary FROM users WHERE status = 'active'`, [m]);
  await query("UPDATE payments SET status = 'paid', method = 'bkash', paid_at = NOW() WHERE month = ? ORDER BY id LIMIT 2", [m]);
  await query("INSERT INTO notifications (user_id, title, body) VALUES (NULL, 'Welcome to OryzenX BD', 'This is demo data. Log in as admin@demo.local / Demo12345.')");
  console.log('Demo data added. Admin login: admin@demo.local / Demo12345 (members use the same password).');
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
