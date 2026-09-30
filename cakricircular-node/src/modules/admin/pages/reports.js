import { all, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, csrfField } from '../layout.js';
import { str, int, arr } from '../../../core/forms.js';
import { bn, bnDateTime } from '../../../core/bn.js';

export default {
  perm: 'reports',
  async post(c) {
    const f = c.fields; let act = str(f.act); let ids = arr(f.ids).map((x) => int(x)).filter(Boolean);
    if (act.includes(':')) { const [a, o] = act.split(':'); act = a; ids = [int(o)]; }
    if (ids.length) {
      if (act === 'delete') await run('DELETE FROM reports WHERE id IN (?)', [ids]);
      else if (act === 'done') await run('UPDATE reports SET status = 1 WHERE id IN (?)', [ids]);
      else if (act === 'new') await run('UPDATE reports SET status = 0 WHERE id IN (?)', [ids]);
    }
    return c.go('reports', 'ok', 'সম্পন্ন।');
  },
  async get(c) {
    const rows = await all('SELECT * FROM reports ORDER BY status ASC, created_at DESC LIMIT 300');
    const nw = rows.filter((r) => !Number(r.status)).length;
    return c.page('রিপোর্ট', card(`রিপোর্ট ও প্রমোশন অনুরোধ (নতুন ${bn(nw)})`, 'flag', rows.length ? html`<form method="post">${csrfField(c.csrf)}
<div class="row-act" style="margin-bottom:10px"><label style="display:flex;gap:8px;align-items:center;font-size:.84rem;font-weight:700"><input type="checkbox" data-all=".rchk"> সব</label><span style="flex:1"></span><button class="btn sm ok" name="act" value="done">${ic('check')}সমাধান</button><button class="btn sm dan" name="act" value="delete" data-confirm="মুছবেন?">${ic('trash')}মুছুন</button></div>
${rows.map((r) => html`<div class="ad-row" style="${Number(r.status) ? 'opacity:.65' : ''}"><input class="rchk" type="checkbox" name="ids" value="${r.id}"><div class="grow"><b>${r.title}</b> ${Number(r.status) ? html`<span class="tag on">সমাধান</span>` : html`<span class="tag warn">নতুন</span>`}<div class="sub">${r.email} · ${bnDateTime(r.created_at)}</div><p style="margin:6px 0 0;white-space:pre-wrap;font-size:.9rem">${r.details}</p></div>
<div class="row-act"><a class="ibtn" href="${/@/.test(r.email) ? `mailto:${r.email}` : `tel:${r.email}`}" aria-label="যোগাযোগ">${ic('mail')}</a><button class="ibtn" name="act" value="${Number(r.status) ? 'new' : 'done'}:${r.id}">${ic(Number(r.status) ? 'refresh' : 'check')}</button><button class="ibtn dan" name="act" value="delete:${r.id}" data-confirm="মুছবেন?">${ic('trash')}</button></div></div>`)}</form>` : html`<p class="sub">কোনো রিপোর্ট নেই।</p>`));
  },
};
