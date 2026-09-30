import { all, col, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, stat, csrfField, field } from '../layout.js';
import { int } from '../../../core/forms.js';
import { bn, dmy, todayStr } from '../../../core/bn.js';

export default {
  perm: 'posts',
  async post(c) {
    const f = c.fields; const id = int(f.id);
    if (f.act === 'stop' && id) { await run('UPDATE posts SET is_premium = 0 WHERE id = ?', [id]); return c.go('ads', 'ok', 'বিজ্ঞাপন বন্ধ — পোস্টটি সাধারণ হিসেবে থাকবে।'); }
    if (f.act === 'extend' && id) {
      const days = Math.max(1, Math.min(365, int(f.days, 7)));
      const cur = await col('SELECT premium_until FROM posts WHERE id = ?', [id]);
      const base = cur && String(cur).slice(0, 10) >= todayStr() ? String(cur).slice(0, 10) : todayStr();
      await run('UPDATE posts SET is_premium = 1, premium_until = DATE_ADD(?, INTERVAL ? DAY) WHERE id = ?', [base, days, id]);
      return c.go('ads', 'ok', `${bn(days)} দিন বাড়ানো হয়েছে।`);
    }
    if (f.act === 'restart' && id) { await run('UPDATE posts SET is_premium = 1, premium_until = DATE_ADD(CURDATE(), INTERVAL 7 DAY) WHERE id = ?', [id]); return c.go('ads', 'ok', 'আবার চালু (৭ দিনের জন্য)।'); }
    return c.go('ads');
  },
  async get(c) {
    const act = "is_premium = 1 AND (premium_until IS NULL OR premium_until >= CURDATE())";
    const n = async (sql) => Number(await col(sql, [], 0));
    const [running, soon, expired, views] = await Promise.all([n(`SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND ${act}`),
      n("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND is_premium = 1 AND premium_until BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)"),
      n('SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND is_premium = 1 AND premium_until < CURDATE()'),
      n('SELECT COALESCE(SUM(views),0) FROM posts WHERE deleted_at IS NULL AND is_premium = 1')]);
    const rows = await all(`SELECT p.id, p.title, p.slug, p.premium_until, p.views, c.name cat, (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id AND v.day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) v7
      FROM posts p LEFT JOIN categories c ON c.id = p.cat_id WHERE p.deleted_at IS NULL AND p.is_premium = 1 ORDER BY (p.premium_until IS NULL OR p.premium_until >= CURDATE()) DESC, p.premium_until ASC LIMIT 100`);
    const today = todayStr();
    return c.page('বিজ্ঞাপন (প্রিমিয়াম পোস্ট)', html`
${soon || expired ? html`<div class="msg" style="background:var(--warn-soft);color:var(--warn)">${ic('bell')}<span>${soon ? html`<b>${bn(soon)} টি</b> বিজ্ঞাপনের মেয়াদ ৩ দিনের মধ্যে শেষ। ` : ''}${expired ? html`<b>${bn(expired)} টি</b> এর মেয়াদ শেষ হয়ে গেছে।` : ''}</span></div>` : ''}
<div class="grid stats">${stat({ icon: 'crown', tone: 'y', label: 'চলমান বিজ্ঞাপন', value: bn(running), sub: 'এখন সাইটে দেখাচ্ছে' })}${stat({ icon: 'clock', tone: 'o', label: 'শিগগির শেষ', value: bn(soon), sub: '৩ দিনের মধ্যে' })}${stat({ icon: 'x-circle', tone: 'r', label: 'মেয়াদ শেষ', value: bn(expired), sub: 'বাড়ানো যাবে' })}${stat({ icon: 'eye', tone: 'b', label: 'মোট ভিউ', value: bn(views), sub: 'বিজ্ঞাপন পোস্টে' })}</div>
${card('প্রিমিয়াম পোস্ট', 'crown', rows.length ? html`${rows.map((r) => { const until = r.premium_until ? String(r.premium_until).slice(0, 10) : null; const live = !until || until >= today; const left = until ? Math.max(0, Math.ceil((Date.parse(until) - Date.parse(today)) / 86400000)) : null; return html`
<div class="ad-row"><div class="grow"><a class="ttl" href="${c.au(`post?id=${r.id}`)}">${r.title}</a><div class="sub">${r.cat || ''} · ৭ দিনে ${bn(r.v7)} ভিউ · মোট ${bn(r.views)}</div>
<div class="ad-prog"><i style="width:${left === null ? 100 : Math.min(100, left * 10)}%;${live ? '' : 'background:var(--bad)'}"></i></div><div class="sub" style="margin-top:4px">${until ? (live ? `মেয়াদ: ${dmy(until)} (আর ${bn(left)} দিন)` : `মেয়াদ শেষ: ${dmy(until)}`) : 'মেয়াদ অনির্দিষ্ট'}</div></div>
<form method="post" class="row-act" style="align-items:center">${csrfField(c.csrf)}<input type="hidden" name="id" value="${r.id}"><select name="days" style="width:auto"><option value="7">+৭ দিন</option><option value="15">+১৫ দিন</option><option value="30">+৩০ দিন</option></select>
<button class="btn sm" name="act" value="extend">${ic('plus')}বাড়ান</button>${live ? html`<button class="btn sm dan sec" name="act" value="stop" data-confirm="বিজ্ঞাপন বন্ধ করবেন?">বন্ধ</button>` : html`<button class="btn sm sec" name="act" value="restart">আবার চালু</button>`}</form></div>`; })}` : html`<p class="sub">কোনো প্রিমিয়াম পোস্ট নেই। পোস্ট এডিটরে “প্রিমিয়াম” চালু করলে এখানে আসবে।</p>`, '')}`);
  },
};
