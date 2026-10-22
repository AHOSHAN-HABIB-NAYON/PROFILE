// Daily reminder jobs. Runs inside the API process (checked every 10 minutes) and records what
// it already sent, so restarts never send duplicates.
const { query, one, getSetting, setSetting } = require('./db');
const { sendEmail, esc } = require('./lib/mail');
const notify = require('./lib/notify');
const { money } = require('./lib/util');

const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

async function oncePerKey(key, fn) {
  const done = await getSetting('jobs_done', {});
  if (done[key]) return;
  await fn();
  done[key] = new Date().toISOString();
  // Keep the record small: drop keys older than ~60 days.
  const cutoff = Date.now() - 60 * 864e5;
  for (const k of Object.keys(done)) if (Date.parse(done[k]) < cutoff) delete done[k];
  await setSetting('jobs_done', done);
}

async function paymentReminders() {
  const today = (await one('SELECT CURDATE() AS d')).d;
  const s = await one("SELECT * FROM payment_schedule WHERE month = DATE_FORMAT(CURDATE(), '%Y-%m')");
  if (!s) return;
  const daysLeft = Math.round((Date.parse(s.pay_date) - Date.parse(today)) / 864e5);
  if (![3, 1, 0].includes(daysLeft)) return;
  await oncePerKey(`pay-${s.month}-${s.pay_date}-${daysLeft}`, async () => {
    const when = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in 3 days (${fmt(s.pay_date)})`;
    await notify(null, 'Payment reminder', `This month's payment is ${when}.`);
    const users = await query(
      `SELECT u.*, p.amount, p.status AS pay_status FROM users u
         LEFT JOIN payments p ON p.user_id = u.id AND p.month = ? WHERE u.status IN ('active','restricted')`, [s.month],
    );
    for (const u of users) {
      if (u.pay_status === 'paid') continue;
      await sendEmail(u, 'payment_reminder', {
        subject: `Reminder: payment ${when}`, title: 'Payment reminder',
        body: `Hi ${esc(u.name)},<br>This month's payment is <b>${when}</b>${u.amount ? ` (${money(u.amount)})` : ''}.`,
      });
    }
  });
}

async function loanReminders() {
  const loans = await query(
    `SELECT *, DATEDIFF(repay_date, CURDATE()) AS days_left FROM loans
      WHERE status = 'open' AND repay_date IS NOT NULL AND DATEDIFF(repay_date, CURDATE()) IN (7, 3, 1, 0)`,
  );
  for (const l of loans) {
    await oncePerKey(`loan-${l.id}-${l.repay_date}-${l.days_left}`, async () => {
      const what = l.kind === 'coin' ? `${l.quantity} ${l.coin}` : money(l.remaining_usd);
      const when = l.days_left === 0 ? 'today' : `in ${l.days_left} day${l.days_left > 1 ? 's' : ''}`;
      await notify(null, 'Loan repayment reminder', `Loan ${what}${l.lender ? ` from ${l.lender}` : ''} is due ${when}.`);
      const admins = await query("SELECT * FROM users WHERE role IN ('admin','super_admin') AND status = 'active'");
      for (const a of admins) {
        await sendEmail(a, 'loan_reminder', {
          subject: `Loan repayment due ${when}`, title: 'Loan repayment reminder',
          body: `Loan <b>${esc(what)}</b>${l.lender ? ` from ${esc(l.lender)}` : ''} is due <b>${when}</b> (${fmt(l.repay_date)}). Remaining: ${money(l.remaining_usd)}.`,
        });
      }
    });
  }
}

async function depositReminders() {
  // Remind members who have not paid their deposit 30 and 7 days before the deposit date.
  const users = await query(
    `SELECT *, DATEDIFF(deposit_date, CURDATE()) AS days_left FROM users
      WHERE status = 'active' AND deposit_received_at IS NULL AND deposit_date IS NOT NULL
        AND DATEDIFF(deposit_date, CURDATE()) IN (30, 7)`,
  );
  for (const u of users) {
    await oncePerKey(`dep-${u.id}-${u.deposit_date}-${u.days_left}`, () => sendEmail(u, 'deposit', {
      subject: `Deposit due in ${u.days_left} days`, title: 'Deposit reminder',
      body: `Hi ${esc(u.name)},<br>Your deposit of <b>${money(u.deposit_amount)}</b> is due on <b>${fmt(u.deposit_date)}</b>.`,
    }));
  }
}

async function runAll() {
  for (const job of [paymentReminders, loanReminders, depositReminders]) {
    try { await job(); } catch (err) { console.error(`job ${job.name} failed`, err.message); }
  }
}

function startJobs() {
  setTimeout(runAll, 20000).unref();
  setInterval(runAll, 10 * 60 * 1000).unref();
}

module.exports = { startJobs, runAll };
