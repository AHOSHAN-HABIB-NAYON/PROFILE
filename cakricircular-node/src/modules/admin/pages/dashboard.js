import { all, col } from '../../../db.js';
import { html } from '../../../core/html.js';
import { bn, bnDate, deadlineInfo, timeAgo } from '../../../core/bn.js';
import { ic } from '../../../ui/icons.js';
import { card, stat } from '../layout.js';
import { categories } from '../../site/data.js';

export default {
  perm: '',
  async get(c) {
    const n = async (sql) => Number(await col(sql, [], 0));
    const [totalPosts, live, todayV, allV, pv, newRep, notices, open, review, pushN, mailN] = await Promise.all([
      n('SELECT COUNT(*) FROM posts'), n('SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 1'),
      n('SELECT COUNT(*) FROM visitors WHERE DATE(last_seen) = CURDATE()'), n('SELECT COUNT(*) FROM visitors'), n('SELECT COUNT(*) FROM visits'),
      n('SELECT COUNT(*) FROM reports WHERE status = 0'), n('SELECT COUNT(*) FROM notices WHERE is_active = 1'),
      n('SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 1 AND deadline >= CURDATE()'),
      n('SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL'),
      n('SELECT COUNT(*) FROM push_subscriptions'), n('SELECT COUNT(*) FROM email_subscribers WHERE confirmed = 1 AND unsub_at IS NULL'),
    ]);
    const recent = await all('SELECT p.id, p.title, p.published_at, p.views, p.status, p.review_pending, c.name cat FROM posts p LEFT JOIN categories c ON c.id = p.cat_id WHERE p.deleted_at IS NULL ORDER BY p.id DESC LIMIT 8');
    const expiring = await all('SELECT id, title, deadline FROM posts WHERE status = 1 AND deleted_at IS NULL AND deadline BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY) ORDER BY deadline ASC LIMIT 6');
    const days = await all('SELECT day, COUNT(*) pv FROM visits WHERE day >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) GROUP BY day ORDER BY day');
    const max = Math.max(1, ...days.map((d) => Number(d.pv)));
    const au = c.au;
    const cats = await categories();
    return c.page('ড্যাশবোর্ড', html`
${review ? html`<a class="msg info" href="${au('posts?review=1')}">${ic('bot')}<span style="flex:1">${bn(review)}টি নতুন পোস্ট রিভিউর অপেক্ষায় — দেখে প্রকাশ করুন</span>${ic('chev-r')}</a>` : ''}
<div class="grid stats">
  ${stat({ icon: 'file-text', tone: 'g', label: 'প্রকাশিত পোস্ট', value: bn(live), sub: `মোট ${bn(totalPosts)} টি`, href: au('posts') })}
  ${stat({ icon: 'clock', tone: 'y', label: 'আবেদন চলমান', value: bn(open), sub: 'সময় বাকি আছে' })}
  ${stat({ icon: 'users', tone: 'b', label: 'ইউনিক ভিজিটর', value: bn(allV), sub: `আজ ${bn(todayV)} জন`, href: au('analytics') })}
  ${stat({ icon: 'eye', tone: 'p', label: 'মোট পেজ ভিউ', value: bn(pv), sub: 'সব পেজ মিলিয়ে', href: au('analytics') })}
</div>
<div class="grid stats">
  ${stat({ icon: 'flag', tone: 'r', label: 'নতুন রিপোর্ট', value: bn(newRep), sub: 'যাচাই বাকি', href: au('reports') })}
  ${stat({ icon: 'megaphone', tone: 'o', label: 'সক্রিয় নোটিশ', value: bn(notices), sub: 'চালু আছে', href: au('notices') })}
  ${stat({ icon: 'bell', tone: '', label: 'পুশ সাবস্ক্রাইবার', value: bn(pushN), sub: 'নোটিফিকেশন', href: au('notify') })}
  ${stat({ icon: 'mail', tone: 'b', label: 'ইমেইল সাবস্ক্রাইবার', value: bn(mailN), sub: 'নিশ্চিত', href: au('notify') })}
</div>
<div class="grid g2">
${card('দৈনিক ভিজিট (১৪ দিন)', 'activity', html`<div class="chart">${days.length ? days.map((d) => html`<div class="col"><div class="bar" style="height:${Math.max(3, Math.round((Number(d.pv) / max) * 100))}%" title="${bn(d.pv)}"></div><small>${bn(String(d.day).slice(8, 10))}</small></div>`) : html`<div class="sub">এখনো ডেটা নেই</div>`}</div>`)}
${card('শেষ হয়ে আসছে (৩ দিন)', 'clock', expiring.length ? html`${expiring.map((x) => { const dl = deadlineInfo(x.deadline); return html`<a class="pbar" href="${au(`post?id=${x.id}`)}"><span class="nm">${x.title}</span><span class="vl">${dl.text.replace('আবেদনের ', '')}</span></a>`; })}` : html`<p class="sub">৩ দিনের মধ্যে শেষ হচ্ছে এমন পোস্ট নেই।</p>`)}
</div>
${card('সাম্প্রতিক পোস্ট', 'file-text', html`<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>শিরোনাম</th><th>ক্যাটাগরি</th><th>ভিউ</th><th>সময়</th><th></th></tr></thead><tbody>
${recent.map((p) => html`<tr><td><a class="ttl" href="${au(`post?id=${p.id}`)}">${p.title}</a>${p.review_pending ? html`<span class="tag auto">রিভিউ বাকি</span>` : ''}${!p.status && !p.review_pending ? html`<span class="tag">খসড়া</span>` : ''}</td><td data-l="ক্যাটাগরি">${p.cat || '—'}</td><td data-l="ভিউ">${bn(p.views)}</td><td data-l="সময়"><span class="sub">${timeAgo(p.published_at)}</span></td><td><a class="ibtn" href="${au(`post?id=${p.id}`)}" aria-label="এডিট">${ic('edit')}</a></td></tr>`)}
</tbody></table></div>`)}
<div class="grid g3 keep" style="margin-top:4px"><a class="btn" href="${au('post')}">${ic('plus')}নতুন পোস্ট</a><a class="btn sec" href="${au('notices')}">${ic('megaphone')}নোটিশ দিন</a><a class="btn sec" href="${au('automation')}">${ic('bot')}অটোমেশন</a></div>
<p class="sub" style="margin-top:14px">ক্যাটাগরি: ${cats.map((x) => x.name).join(' · ')}</p>`);
  },
};
