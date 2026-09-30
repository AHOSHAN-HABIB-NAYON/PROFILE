import { all, col } from '../../../db.js';
import { html } from '../../../core/html.js';
import { card, stat } from '../layout.js';
import { bn, dmy } from '../../../core/bn.js';
import { ic } from '../../../ui/icons.js';
import { int } from '../../../core/forms.js';

const bars = (rows, nameKey, valKey, fmt = (x) => x) => { const max = Math.max(1, ...rows.map((r) => Number(r[valKey]))); return html`${rows.length ? rows.map((r) => html`<div class="pbar"><i class="fill" style="width:${Math.round(Number(r[valKey]) / max * 100)}%"></i><span class="nm">${fmt(r[nameKey])}</span><span class="vl">${bn(r[valKey])}</span></div>`) : html`<p class="sub">ডেটা নেই</p>`}`; };
const DEV = { mobile: 'মোবাইল', desktop: 'কম্পিউটার', tablet: 'ট্যাবলেট', unknown: 'অজানা' };

export default {
  perm: 'analytics',
  async get(c) {
    let days = int(c.query.days, 30); if (![7, 30, 90, 365].includes(days)) days = 30;
    const n = async (sql, a = []) => Number(await col(sql, a, 0));
    const [uniqTotal, uniqRange, pvRange, pvTotal, today] = await Promise.all([n('SELECT COUNT(*) FROM visitors'), n('SELECT COUNT(DISTINCT vid) FROM visits WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]), n('SELECT COUNT(*) FROM visits WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [days]), n('SELECT COUNT(*) FROM visits'), n('SELECT COUNT(DISTINCT vid) FROM visits WHERE day = CURDATE()')]);
    const daily = await all('SELECT day, COUNT(*) pv, COUNT(DISTINCT vid) uv FROM visits WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY day ORDER BY day DESC LIMIT 14', [days]);
    const top = await all('SELECT path, COUNT(*) n FROM visits WHERE day >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY path ORDER BY n DESC LIMIT 15', [days]);
    const regions = await all("SELECT COALESCE(NULLIF(region,''),'অজানা') r, COUNT(*) n FROM visitors GROUP BY r ORDER BY n DESC LIMIT 12");
    const devices = await all("SELECT COALESCE(NULLIF(device,''),'unknown') d, COUNT(*) n FROM visitors GROUP BY d ORDER BY n DESC");
    const posts = await all('SELECT p.title, COUNT(v.vid) n FROM post_views v JOIN posts p ON p.id = v.post_id WHERE v.day >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY p.id ORDER BY n DESC LIMIT 12', [days]);
    const searches = await all('SELECT term, hits FROM searches ORDER BY hits DESC LIMIT 12');
    const chartRows = [...daily].reverse(); const max = Math.max(1, ...chartRows.map((d) => Number(d.pv)));
    return c.page('অ্যানালিটিকস', html`
<div class="a-card"><div class="seg2">${[[7, '৭ দিন'], [30, '৩০ দিন'], [90, '৯০ দিন'], [365, '১ বছর']].map(([k, l]) => html`<a class="${days === k ? 'on' : ''}" href="${c.au(`analytics?days=${k}`)}">${l}</a>`)}</div></div>
<div class="grid stats">${stat({ icon: 'users', tone: 'b', label: 'ইউনিক ভিজিটর', value: bn(uniqTotal), sub: `এই সময়ে ${bn(uniqRange)}` })}${stat({ icon: 'eye', tone: 'p', label: 'মোট পেজ ভিউ', value: bn(pvTotal), sub: `এই সময়ে ${bn(pvRange)}` })}${stat({ icon: 'calendar', tone: 'g', label: 'আজকের ভিজিটর', value: bn(today), sub: 'ইউনিক' })}${stat({ icon: 'activity', tone: 'y', label: 'এই সময়ে ভিউ', value: bn(pvRange), sub: `গত ${bn(days)} দিন` })}</div>
${card('দৈনিক ভিজিট (শেষ ১৪ দিন)', 'chart', html`<div class="chart">${chartRows.map((d) => html`<div class="col"><div class="bar" style="height:${Math.max(3, Math.round(Number(d.pv) / max * 100))}%" title="${bn(d.pv)} ভিউ · ${bn(d.uv)} ভিজিটর"></div><small>${bn(String(d.day).slice(8, 10))}</small></div>`)}</div>`)}
<div class="grid g2">${card('সবচেয়ে দেখা পেজ', 'file-text', bars(top, 'path', 'n'))}${card('সবচেয়ে পঠিত পোস্ট', 'flame', bars(posts, 'title', 'n'))}${card('এলাকা অনুযায়ী', 'pin', bars(regions, 'r', 'n'))}${card('ডিভাইস', 'phone2', bars(devices, 'd', 'n', (x) => DEV[x] || x))}${card('জনপ্রিয় সার্চ', 'search', bars(searches, 'term', 'hits'))}</div>`);
  },
};
