import { all, one, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, csrfField } from '../layout.js';
import { str, int, arr } from '../../../core/forms.js';
import { bn, bnDateTime } from '../../../core/bn.js';
import { pruneNotices, noticeLimit } from '../../site/data.js';
import { sendPush } from '../../notify/push.js';

export default {
  perm: 'notices',
  async post(c) {
    const f = c.fields;
    if (f.do === 'add') {
      const t = str(f.title, 255); const id = int(f.id);
      if (!t) return c.go('notices', 'err', 'নোটিশের শিরোনাম দিন।');
      if (id) { await run('UPDATE notices SET title=?, body=?, link=? WHERE id=?', [t, str(f.body, 3000), str(f.link, 500), id]); return c.go('notices', 'ok', 'নোটিশ আপডেট হয়েছে।'); }
      await run('INSERT INTO notices (title, body, link, is_active, created_at) VALUES (?,?,?,1,NOW())', [t, str(f.body, 3000), str(f.link, 500)]);
      await pruneNotices();
      let pushed = 0;
      if (f.push === '1') { const subs = await all('SELECT * FROM push_subscriptions WHERE fails < 5 LIMIT 500'); for (const s of subs) if ((await sendPush(s, { title: t, body: str(f.body, 140) || 'নতুন নোটিশ', url: str(f.link, 300) || '/notices', tag: 'notice' })) === 'ok') pushed += 1; }
      return c.go('notices', 'ok', `নোটিশ পাঠানো হয়েছে${pushed ? ` · ${bn(pushed)} জনকে নোটিফিকেশন` : ''}।`);
    }
    if (f.do === 'bulk') {
      let act = str(f.act); let ids = arr(f.ids).map((x) => int(x)).filter(Boolean);
      if (act.includes(':')) { const [a, o] = act.split(':'); act = a; ids = [int(o)]; }
      if (ids.length) {
        if (act === 'delete') await run('DELETE FROM notices WHERE id IN (?)', [ids]);
        else if (act === 'off') await run('UPDATE notices SET is_active = 0 WHERE id IN (?)', [ids]);
        else if (act === 'on') await run('UPDATE notices SET is_active = 1 WHERE id IN (?)', [ids]);
        return c.go('notices', 'ok', 'সম্পন্ন।');
      }
    }
    return c.go('notices');
  },
  async get(c) {
    await pruneNotices();
    const edit = c.query.edit ? await one('SELECT * FROM notices WHERE id = ?', [int(c.query.edit)]) : null;
    const rows = await all('SELECT * FROM notices ORDER BY created_at DESC, id DESC LIMIT 200'); const e = edit || {};
    return c.page('নোটিশ', html`
${card(edit ? 'নোটিশ এডিট' : 'নতুন নোটিশ', 'megaphone', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="add"><input type="hidden" name="id" value="${e.id || ''}"><div class="grid">
${field('শিরোনাম *', input('title', e.title, { req: true, max: 255 }))}${field('বিস্তারিত', html`<textarea name="body" style="min-height:90px">${e.body || ''}</textarea>`)}${field('লিংক (ঐচ্ছিক)', input('link', e.link, { ph: '/post/… বা https://…' }))}
${edit ? '' : html`<label style="display:flex;gap:8px;align-items:center;font-weight:700;font-size:.88rem"><input type="checkbox" name="push" value="1">নোটিফিকেশন সাবস্ক্রাইবারদেরও পাঠান</label>`}</div>
<div style="display:flex;gap:10px;margin-top:10px"><button class="btn" type="submit">${ic('send')}${edit ? 'আপডেট' : 'পাঠান'}</button>${edit ? html`<a class="btn sec" href="${c.au('notices')}">বাতিল</a>` : ''}</div></form>
<p class="hint">সর্বশেষ ${bn(noticeLimit())}টি নোটিশ থাকে; পুরোনোগুলো অটো মুছে যায় (সেটিংসে বদলানো যায়)।</p>`)}
${card('সব নোটিশ', 'list', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="bulk"><div class="row-act" style="margin-bottom:10px"><label style="display:flex;gap:8px;align-items:center;font-size:.84rem;font-weight:700"><input type="checkbox" data-all=".nchk"> সব</label><span style="flex:1"></span><button class="btn sm sec" name="act" value="on">চালু</button><button class="btn sm sec" name="act" value="off">বন্ধ</button><button class="btn sm dan" name="act" value="delete" data-confirm="মুছবেন?">মুছুন</button></div>
<div class="tbl-wrap"><table class="tbl cards"><tbody>${rows.length ? rows.map((n) => html`<tr><td style="width:30px"><input class="nchk" type="checkbox" name="ids" value="${n.id}"></td><td><b class="ttl">${n.title}</b><span class="sub">${bnDateTime(n.created_at)}</span></td><td>${Number(n.is_active) ? html`<span class="tag on">চালু</span>` : html`<span class="tag off">বন্ধ</span>`}</td><td><a class="ibtn" href="${c.au(`notices?edit=${n.id}`)}">${ic('edit')}</a></td></tr>`) : html`<tr><td class="sub">কোনো নোটিশ নেই।</td></tr>`}</tbody></table></div></form>`)}`);
  },
};
