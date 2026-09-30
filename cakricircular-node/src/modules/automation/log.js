import { run } from '../../db.js';
export async function log(msg, level = 'info') {
  try {
    await run('INSERT INTO auto_log (level, msg, created_at) VALUES (?,?,NOW())', [level, String(msg).slice(0, 2000)]);
    if (Math.random() < 0.03) await run('DELETE FROM auto_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
  } catch { /* লগ ব্যর্থ হলেও কাজ থামবে না */ }
  if (process.env.AUTO_DEBUG) console.log(`[auto:${level}] ${msg}`);
}
