'use strict';
const settings = require('../../settings');
const uploads = require('../../util/uploads');
const { html, raw, esc } = require('../../util/html');
const { bnNum, bnCount, bnDate, timeAgo, bnCompact } = require('../../util/bn');
const U = require('./ui');
const { icon, CATEGORY_ICONS } = require('../icons');
const { avatar } = require('./layout');
const { PERMISSIONS, ROLES } = require('../../admin/auth');
const { DIVISIONS } = require('../site/pages');

const B = () => settings.adminPath();
const dt = (d) => (d ? bnDate(d, { short: true }) : '—');

const DISTRICTS = {
  'ঢাকা': ['ঢাকা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী', 'মানিকগঞ্জ', 'মুন্সীগঞ্জ', 'টাঙ্গাইল', 'কিশোরগঞ্জ', 'ফরিদপুর', 'মাদারীপুর', 'শরীয়তপুর', 'রাজবাড়ী', 'গোপালগঞ্জ'],
  'চট্টগ্রাম': ['চট্টগ্রাম', 'কক্সবাজার', 'কুমিল্লা', 'ফেনী', 'নোয়াখালী', 'লক্ষ্মীপুর', 'চাঁদপুর', 'ব্রাহ্মণবাড়িয়া', 'রাঙ্গামাটি', 'খাগড়াছড়ি', 'বান্দরবান'],
  'রাজশাহী': ['রাজশাহী', 'বগুড়া', 'পাবনা', 'সিরাজগঞ্জ', 'নাটোর', 'নওগাঁ', 'চাঁপাইনবাবগঞ্জ', 'জয়পুরহাট'],
  'খুলনা': ['খুলনা', 'যশোর', 'সাতক্ষীরা', 'বাগেরহাট', 'কুষ্টিয়া', 'ঝিনাইদহ', 'মাগুরা', 'নড়াইল', 'চুয়াডাঙ্গা', 'মেহেরপুর'],
  'বরিশাল': ['বরিশাল', 'পটুয়াখালী', 'ভোলা', 'পিরোজপুর', 'বরগুনা', 'ঝালকাঠি'],
  'সিলেট': ['সিলেট', 'মৌলভীবাজার', 'হবিগঞ্জ', 'সুনামগঞ্জ'],
  'রংপুর': ['রংপুর', 'দিনাজপুর', 'গাইবান্ধা', 'কুড়িগ্রাম', 'লালমনিরহাট', 'নীলফামারী', 'পঞ্চগড়', 'ঠাকুরগাঁও'],
  'ময়মনসিংহ': ['ময়মনসিংহ', 'জামালপুর', 'নেত্রকোণা', 'শেরপুর'],
};
const JOB_TYPES = ['স্থায়ী', 'অস্থায়ী', 'চুক্তিভিত্তিক', 'খণ্ডকালীন', 'ইন্টার্নশিপ', 'রাজস্ব খাত', 'প্রকল্প'];
const AD_SLOTS = {
  home_top: 'হোম — ক্যাটাগরির নিচে (চওড়া)', home_feed: 'পোস্ট তালিকার মাঝে', sidebar: 'সাইডবার (ডেস্কটপ)',
  post_top: 'পোস্ট — উপরে', post_content: 'পোস্ট — কনটেন্টের মাঝে', post_bottom: 'পোস্ট — নিচে',
};

/* ----------------------------- dashboard ----------------------------- */
function dashboard(d) {
  const b = B();
  return html`<div class="a-hello"><div><h2>স্বাগতম, ${d.user.name || d.user.username}</h2><p>আজ ${bnDate(new Date())}, ${d.dayName}</p></div>
  <a class="btn btn-primary" href="${b}/posts/new">${raw(icon('plus'))}নতুন পোস্ট</a></div>
<div class="stats">
  ${U.stat('মোট পোস্ট', d.total, { ic: 'file', color: '#16a34a', delta: `${bnNum(d.week)} এই সপ্তাহে` })}
  ${U.stat('প্রকাশিত', d.published, { ic: 'checkCircle', color: '#2563eb', delta: `${bnNum(d.today)} আজ` })}
  ${U.stat('খসড়া', d.drafts, { ic: 'edit', color: '#f59e0b', delta: d.autoDrafts ? `${bnNum(d.autoDrafts)} অটো` : '' })}
  ${U.stat('মেয়াদোত্তীর্ণ', d.expired, { ic: 'clock', color: '#ef4444' })}
</div>
<div class="grid-2">
  ${U.card('সাম্প্রতিক ভিজিট', html`<div class="chart-wrap">${U.lineChart(d.visits, { id: 'v' })}</div>
    <div class="mini-stats"><span><b>${bnCount(d.todayVisits)}</b><small>আজকের ভিজিট</small></span><span><b>${bnCount(d.todayUniques)}</b><small>ইউনিক ডিভাইস</small></span><span><b>${bnCount(d.pageviews)}</b><small>পেজ ভিউ (৭ দিন)</small></span></div>`, { actions: html`<a class="link" href="${b}/analytics">বিস্তারিত ${raw(icon('right'))}</a>` })}
  ${U.card('ক্যাটাগরি অনুযায়ী পোস্ট', html`<div class="cat-stats">${d.cats.map((c) => html`<div class="cs" style="--c:${c.color}"><span class="cs-ic">${raw(icon(c.icon))}</span><span><small>${c.name}</small><b>${bnCount(c.n)}</b></span></div>`)}</div>`)}
</div>
<div class="grid-2">
  ${U.card('রিভিউয়ের অপেক্ষায় (অটোমেশন খসড়া)', d.pending.length ? html`<ul class="a-list">${d.pending.map((p) => html`<li><a href="${b}/posts/${p.id}">${p.title}</a><small>${timeAgo(p.created_at)}</small></li>`)}</ul>` : U.empty('কোনো খসড়া রিভিউয়ের অপেক্ষায় নেই', 'checkCircle'), { actions: html`<a class="link" href="${b}/posts?status=auto">সব ${raw(icon('right'))}</a>` })}
  ${U.card('সর্বশেষ রিপোর্ট', d.reports.length ? html`<ul class="a-list">${d.reports.map((r) => html`<li><span>${U.badge(r.type, 'red')} ${r.message}</span><small>${timeAgo(r.created_at)}</small></li>`)}</ul>` : U.empty('নতুন কোনো রিপোর্ট নেই', 'flag'), { actions: html`<a class="link" href="${b}/reports">সব ${raw(icon('right'))}</a>` })}
</div>
<div class="grid-2">
  ${U.card('জনপ্রিয় পোস্ট (৭ দিন)', d.top.length ? html`<ol class="a-rank">${d.top.map((p) => html`<li><a href="/post/${encodeURIComponent(p.slug)}" target="_blank">${p.title}</a><small>${raw(icon('eye'))}${bnCompact(p.views)}</small></li>`)}</ol>` : U.empty('এখনো কোনো ডেটা নেই'))}
  ${U.card('সিস্টেম', html`<ul class="kv">
    <li><span>অটোমেশন</span><b>${d.autoOn ? U.badge('চালু', 'green') : U.badge('বন্ধ', 'gray')}</b></li>
    <li><span>শেষ রান</span><b>${d.lastRun ? `${timeAgo(d.lastRun.started_at)} — ${d.lastRun.status}` : '—'}</b></li>
    <li><span>পুশ সাবস্ক্রাইবার</span><b>${bnCount(d.pushSubs)}</b></li>
    <li><span>ইমেইল সাবস্ক্রাইবার</span><b>${bnCount(d.emailSubs)}</b></li>
    <li><span>মেইনটেন্যান্স মোড</span><b>${settings.bool('maintenance') ? U.badge('চালু', 'red') : U.badge('বন্ধ', 'gray')}</b></li>
    <li><span>ইমেজ কম্প্রেশন</span><b>${uploads.hasSharp() ? U.badge('সক্রিয়', 'green') : U.badge('sharp নেই', 'red')}</b></li>
    <li><span>Node / আপটাইম</span><b>${process.version} · ${bnNum(Math.floor(process.uptime() / 3600))} ঘণ্টা</b></li>
  </ul>`)}
</div>`;
}

/* ----------------------------- posts ----------------------------- */
const STATUS_TABS = [['all', 'সব'], ['published', 'প্রকাশিত'], ['draft', 'খসড়া'], ['auto', 'অটো খসড়া'], ['premium', 'প্রিমিয়াম'], ['expired', 'মেয়াদোত্তীর্ণ'], ['trash', 'ট্র্যাশ']];

function postsList(d) {
  const b = B();
  const qs = (extra) => [d.q ? `q=${encodeURIComponent(d.q)}` : '', d.cat ? `cat=${d.cat}` : '', extra].filter(Boolean).join('&');
  return html`<div class="toolbar">
  <form class="a-search" method="get" action="${b}/posts" data-plain>
    <input type="hidden" name="status" value="${d.status}">
    ${raw(icon('search'))}<input type="search" name="q" value="${d.q}" placeholder="শিরোনাম, প্রতিষ্ঠান বা আইডি দিয়ে খুঁজুন…">
    <select name="cat" onchange="this.form.requestSubmit()"><option value="">সব ক্যাটাগরি</option>${d.cats.map((c) => html`<option value="${c.id}" ${raw(String(d.cat) === String(c.id) ? 'selected' : '')}>${c.name}</option>`)}</select>
  </form>
  <a class="btn btn-primary" href="${b}/posts/new">${raw(icon('plus'))}<span class="only-d">নতুন পোস্ট</span></a>
</div>
<div class="pills">${STATUS_TABS.map(([k, t]) => html`<a class="pill ${d.status === k ? 'on' : ''}" href="${b}/posts?${qs(`status=${k}`)}">${t} <em>${bnCount(d.counts[k] || 0)}</em></a>`)}</div>
<form data-bulk action="${b}/posts/bulk" method="post">
  <div class="bulkbar" data-bulkbar hidden>
    <span><b data-bulk-count>০</b> টি নির্বাচিত</span>
    ${d.status === 'trash'
    ? html`<button class="btn btn-soft btn-sm" name="action" value="restore">${raw(icon('refresh'))}রিস্টোর</button><button class="btn btn-danger btn-sm" name="action" value="destroy" data-confirm="স্থায়ীভাবে মুছে ফেলা হবে, আর ফেরত আনা যাবে না।">${raw(icon('trash'))}স্থায়ী ডিলিট</button>`
    : html`<button class="btn btn-soft btn-sm" name="action" value="publish">${raw(icon('check'))}প্রকাশ</button><button class="btn btn-soft btn-sm" name="action" value="draft">${raw(icon('edit'))}খসড়া</button><button class="btn btn-danger btn-sm" name="action" value="trash" data-confirm="নির্বাচিত পোস্টগুলো ট্র্যাশে যাবে।">${raw(icon('trash'))}ট্র্যাশ</button>`}
  </div>
  ${d.rows.length ? html`<div class="plist">
    <label class="plist-head"><input type="checkbox" data-check-all> সব নির্বাচন</label>
    ${d.rows.map((p) => html`<div class="prow">
      <input type="checkbox" name="ids" value="${p.id}" data-check aria-label="নির্বাচন">
      <a class="prow-img" href="${b}/posts/${p.id}">${p.thumbnail ? html`<img src="${uploads.url(p.thumbnail)}" alt="" loading="lazy">` : raw(`<span class="ph-sm" style="--c:${esc(p.cat_color || '#16a34a')}">${icon(p.cat_icon || 'file')}</span>`)}</a>
      <div class="prow-body">
        <a class="prow-title" href="${b}/posts/${p.id}">${p.title}</a>
        <div class="prow-meta">${p.cat_name ? html`<span>${p.cat_name}</span>` : ''}<span>${raw(icon('clock'))}${dt(p.published_at || p.created_at)}</span><span>${raw(icon('eye'))}${bnCompact(p.views)}</span>
          ${p.deadline ? html`<span class="${new Date(p.deadline) < new Date() ? 'txt-red' : ''}">শেষ: ${dt(p.deadline)}</span>` : ''}</div>
      </div>
      <div class="prow-status">${p.status === 'published' ? U.badge('প্রকাশিত', 'green') : p.status === 'trash' ? U.badge('ট্র্যাশ', 'red') : U.badge(p.auto_generated ? 'অটো খসড়া' : 'খসড়া', 'amber')}${p.premium ? U.badge('প্রিমিয়াম', 'violet') : ''}</div>
      <div class="prow-act">
        ${p.status === 'published' ? html`<a class="icon-btn sm" href="/post/${encodeURIComponent(p.slug)}" target="_blank" title="দেখুন">${raw(icon('external'))}</a>` : ''}
        <a class="icon-btn sm" href="${b}/posts/${p.id}" title="এডিট">${raw(icon('edit'))}</a>
      </div>
    </div>`)}
  </div>` : U.empty(d.q ? 'কোনো পোস্ট মেলেনি' : 'এখানে কোনো পোস্ট নেই')}
</form>
${U.pager(`${b}/posts`, d.page, d.total, d.perPage, qs(`status=${d.status}`))}
${d.status === 'trash' && d.rows.length ? html`<p class="muted small center">ট্র্যাশের পোস্ট ${bnNum(settings.int('trash_days', 30))} দিন পর স্বয়ংক্রিয়ভাবে মুছে যায়।</p>` : ''}
<div class="card tools-card"><div class="card-h"><h2>টুলস</h2></div><div class="row-gap">
  <form data-ajax action="${b}/posts/fix-slugs" method="post"><button class="btn btn-soft btn-sm" type="submit">${raw(icon('tools'))}ভাঙা স্লাগ ঠিক করুন</button></form>
  <form data-ajax action="${b}/cache/clear" method="post"><button class="btn btn-soft btn-sm" type="submit">${raw(icon('refresh'))}ক্যাশ পরিষ্কার</button></form>
</div></div>`;
}

function postForm(d) {
  const b = B();
  const p = d.post || {};
  const isNew = !p.id;
  const val = (k) => (p[k] === null || p[k] === undefined ? '' : p[k]);
  const dateVal = (v) => { if (!v) return ''; const x = new Date(v); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const dtVal = (v) => { if (!v) return ''; const x = new Date(v); return `${dateVal(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const districts = Object.values(DISTRICTS).flat();
  return html`<form class="post-form" data-ajax action="${b}/posts/${isNew ? 'new' : p.id}" method="post" enctype="multipart/form-data" data-post-form>
  <div class="pf-top">
    <a class="icon-btn" href="${b}/posts" aria-label="ফিরে যান">${raw(icon('back'))}</a>
    <div class="pf-title"><h2>${isNew ? 'পোস্ট যোগ' : 'পোস্ট এডিট'}</h2>${!isNew ? html`<small>#${bnNum(p.id)} · ${p.status === 'published' ? 'প্রকাশিত' : p.status === 'trash' ? 'ট্র্যাশে' : 'খসড়া'}${p.auto_generated ? ' · অটোমেশন' : ''}</small>` : ''}</div>
    ${!isNew && p.status === 'published' ? html`<a class="btn btn-soft btn-sm only-d" href="/post/${encodeURIComponent(p.slug)}" target="_blank">${raw(icon('external'))}দেখুন</a>` : ''}
    <button class="btn btn-primary btn-sm" type="submit" name="status" value="published">${raw(icon('check'))}${p.status === 'published' ? 'আপডেট' : 'প্রকাশ'}</button>
  </div>
  ${p.auto_generated && p.status === 'draft' ? html`<div class="alert alert-info">${raw(icon('bot'))} এই খসড়াটি অটোমেশন তৈরি করেছে। তথ্য যাচাই করে প্রকাশ করুন।${p.source_url ? html` <a href="${p.source_url}" target="_blank" rel="noopener">মূল সোর্স দেখুন</a>` : ''}</div>` : ''}
  <div class="tabs a-tabs" data-tabs><button type="button" class="on" data-tab="basic">বেসিক তথ্য</button><button type="button" data-tab="content">বিজ্ঞপ্তি</button><button type="button" data-tab="seo">SEO</button><button type="button" data-tab="more">অন্যান্য</button></div>
  <div class="pf-grid">
    <div class="pf-main">
      <div data-pane="basic" class="card">
        ${U.field('title', 'শিরোনাম *', val('title'), { attrs: 'required maxlength="500" data-slug-src' })}
        ${U.field('slug', 'স্লাগ (URL)', val('slug'), { attrs: 'maxlength="180" data-slug-out placeholder="খালি রাখলে শিরোনাম থেকে তৈরি হবে"', hint: 'বাংলা স্লাগ সমর্থিত। পরিবর্তন করলে পুরোনো লিংক স্বয়ংক্রিয়ভাবে নতুনটিতে রিডাইরেক্ট হবে।' })}
        <div class="grid2">
          ${U.select('category_id', 'ক্যাটাগরি *', [['', 'নির্বাচন করুন'], ...d.cats.map((c) => [c.id, c.name])], val('category_id'), { attrs: 'required' })}
          ${U.field('organization', 'প্রতিষ্ঠান', val('organization'), { attrs: 'maxlength="250" list="orgList"' })}
        </div>
        <div class="grid2">
          ${U.field('vacancies', 'পদসংখ্যা', val('vacancies'), { attrs: 'maxlength="100" placeholder="যেমন: ১,২০০"' })}
          ${U.field('salary', 'বেতন স্কেল', val('salary'), { attrs: 'maxlength="180" placeholder="১১,০০০ - ২৬,৫৯০ টাকা"' })}
        </div>
        <div class="grid2">
          ${U.select('division', 'বিভাগ', [['', '—'], ['সারা দেশ', 'সারা দেশ'], ...DIVISIONS.map((x) => [x, x])], val('division'))}
          ${U.field('district', 'জেলা', val('district'), { attrs: 'maxlength="80" list="districtList" placeholder="জেলা লিখুন বা বেছে নিন"' })}
        </div>
        <div class="grid2">
          ${U.field('job_type', 'চাকরির ধরন', val('job_type'), { attrs: 'list="jobTypes" maxlength="80"' })}
          ${U.field('education', 'শিক্ষাগত যোগ্যতা', val('education'), { attrs: 'maxlength="250"' })}
        </div>
        <div class="grid2">
          ${U.field('start_date', 'আবেদন শুরু', dateVal(p.start_date), { type: 'date' })}
          ${U.field('deadline', 'শেষ তারিখ ও সময়', dtVal(p.deadline), { type: 'datetime-local', hint: 'সময় না দিলে দিনের শেষে (রাত ১১:৫৯) ধরা হবে' })}
        </div>
        ${U.field('apply_url', 'আবেদনের লিংক', val('apply_url'), { type: 'url', attrs: 'placeholder="https://"' })}
      </div>
      <div data-pane="content" class="card" hidden>
        <div class="editor" data-editor>
          <div class="ed-bar">
            <button type="button" data-cmd="bold" title="বোল্ড"><b>B</b></button><button type="button" data-cmd="italic" title="ইটালিক"><i>I</i></button><button type="button" data-cmd="underline" title="আন্ডারলাইন"><u>U</u></button>
            <button type="button" data-cmd="formatBlock" data-arg="H2">H2</button><button type="button" data-cmd="formatBlock" data-arg="H3">H3</button><button type="button" data-cmd="formatBlock" data-arg="P">¶</button>
            <button type="button" data-cmd="insertUnorderedList" title="তালিকা">•</button><button type="button" data-cmd="insertOrderedList" title="ক্রমিক তালিকা">১.</button>
            <button type="button" data-cmd="createLink" title="লিংক">${raw(icon('link'))}</button><button type="button" data-cmd="table" title="টেবিল">${raw(icon('grid'))}</button>
            <button type="button" data-cmd="removeFormat" title="ফরম্যাট মুছুন">${raw(icon('x'))}</button><button type="button" data-cmd="html" title="HTML">&lt;/&gt;</button>
          </div>
          <div class="ed-area content" contenteditable="true" data-ed-area>${raw(val('content'))}</div>
          <textarea name="content" class="ed-src" hidden>${val('content')}</textarea>
        </div>
        ${U.field('excerpt', 'সংক্ষিপ্ত বিবরণ', val('excerpt'), { type: 'textarea', attrs: 'rows="3" maxlength="600"' })}
      </div>
      <div data-pane="seo" class="card" hidden>
        ${U.field('meta_title', 'মেটা শিরোনাম', val('meta_title'), { attrs: 'maxlength="250" data-count="60"', hint: 'খালি রাখলে পোস্টের শিরোনাম ব্যবহার হবে' })}
        ${U.field('meta_desc', 'মেটা বিবরণ', val('meta_desc'), { type: 'textarea', attrs: 'rows="3" maxlength="500" data-count="160"' })}
        ${U.field('keywords', 'কিওয়ার্ড (কমা দিয়ে)', val('keywords'), { attrs: 'maxlength="500"' })}
        <div class="serp"><small>গুগলে যেমন দেখাবে</small><b data-serp-title>${val('meta_title') || val('title') || 'শিরোনাম'}</b><span>${settings.get('site_domain')} › post › ${val('slug')}</span><p data-serp-desc>${val('meta_desc') || val('excerpt')}</p></div>
      </div>
      <div data-pane="more" class="card" hidden>
        ${U.field('source_url', 'সোর্স লিংক', val('source_url'), { type: 'url' })}
        ${U.field('published_at', 'প্রকাশের সময়', dtVal(p.published_at), { type: 'datetime-local', hint: 'ভবিষ্যতের সময় দিলে তখন প্রকাশ হবে (শিডিউল)' })}
        ${!isNew ? html`<p class="muted small">তৈরি: ${bnDate(p.created_at, { time: true })} · শেষ আপডেট: ${bnDate(p.updated_at, { time: true })} · ভিউ: ${bnCount(p.views)}</p>` : ''}
      </div>
    </div>
    <aside class="pf-side">
      <div class="card">
        <h3>প্রকাশ</h3>
        <div class="row-gap"><button class="btn btn-primary btn-block" type="submit" name="status" value="published">${raw(icon('check'))}${p.status === 'published' ? 'আপডেট করুন' : 'প্রকাশ করুন'}</button>
        <button class="btn btn-soft btn-block" type="submit" name="status" value="draft">${raw(icon('edit'))}খসড়া সেভ</button></div>
        ${U.toggle('is_premium', 'প্রিমিয়াম পোস্ট', !!p.is_premium, { hint: 'হোমে বিশেষভাবে ও মাঝে মাঝে দেখাবে' })}
        ${U.field('premium_until', 'প্রিমিয়ামের মেয়াদ', dtVal(p.premium_until), { type: 'datetime-local', hint: 'খালি = মেয়াদহীন' })}
        ${!isNew ? html`<div class="row-gap">${p.status === 'trash'
    ? html`<button class="btn btn-soft btn-sm" type="button" data-post-action="restore" data-id="${p.id}">${raw(icon('refresh'))}রিস্টোর</button>`
    : html`<button class="btn btn-ghost-danger btn-sm" type="button" data-post-action="trash" data-id="${p.id}">${raw(icon('trash'))}ট্র্যাশে পাঠান</button>`}</div>` : ''}
      </div>
      <div class="card">
        <h3>থাম্বনেইল ছবি</h3>
        ${U.fileField('thumbnail', '', p.thumbnail ? uploads.url(p.thumbnail) : '', { hint: 'স্বয়ংক্রিয় কম্প্রেস: ১MB→~১০০KB, ৫MB→~৪৫০KB (WebP)' })}
      </div>
      <div class="card">
        <h3>PDF বিজ্ঞপ্তি</h3>
        ${U.fileField('pdf', '', p.pdf ? uploads.url(p.pdf) : '', { accept: 'application/pdf', preview: false, hint: 'সর্বোচ্চ ১৫MB' })}
      </div>
    </aside>
  </div>
  <datalist id="districtList">${districts.map((x) => html`<option value="${x}">`)}</datalist>
  <datalist id="jobTypes">${JOB_TYPES.map((x) => html`<option value="${x}">`)}</datalist>
  <datalist id="orgList">${(d.orgs || []).map((x) => html`<option value="${x}">`)}</datalist>
</form>`;
}

/* ----------------------------- categories ----------------------------- */
function categories(d) {
  const b = B();
  const form = (c = {}) => html`<form class="cat-form" data-ajax action="${b}/categories/${c.id || 'new'}" method="post">
    <div class="grid2">${U.field('name', 'নাম *', c.name || '', { attrs: 'required maxlength="120"' })}${U.field('slug', 'স্লাগ', c.slug || '', { attrs: 'maxlength="180" placeholder="অটো"' })}</div>
    <div class="grid3">${U.select('icon', 'আইকন', CATEGORY_ICONS.map((i) => [i, i]), c.icon || 'briefcase')}${U.field('color', 'রং', c.color || '#16a34a', { type: 'color' })}${U.field('sort', 'ক্রম', c.sort || 0, { type: 'number' })}</div>
    ${U.field('description', 'বিবরণ', c.description || '', { attrs: 'maxlength="500"' })}
    <div class="grid2">${U.field('meta_title', 'মেটা শিরোনাম', c.meta_title || '')}${U.field('meta_desc', 'মেটা বিবরণ', c.meta_desc || '')}</div>
    ${U.toggle('active', 'সক্রিয়', c.id ? !!c.active : true)}
    <div class="row-gap end">${c.id ? html`<button class="btn btn-ghost-danger btn-sm" type="button" data-delete="${b}/categories/${c.id}/delete" data-confirm="ক্যাটাগরিটি মুছে ফেলা হবে। এর পোস্টগুলো ক্যাটাগরিহীন হয়ে যাবে।">${raw(icon('trash'))}মুছুন</button>` : ''}<button class="btn btn-primary btn-sm" type="submit">সেভ করুন</button></div>
  </form>`;
  return html`<div class="toolbar"><p class="muted">ক্যাটাগরি তৈরি, এডিট ও ক্রম ঠিক করুন</p><button class="btn btn-primary" type="button" data-toggle-el="#newCat">${raw(icon('plus'))}নতুন ক্যাটাগরি যোগ</button></div>
<div id="newCat" class="card" hidden><div class="card-h"><h2>নতুন ক্যাটাগরি</h2></div>${form()}</div>
<div class="item-list">${d.cats.map((c) => html`<details class="item" style="--c:${c.color}">
  <summary><span class="it-ic">${raw(icon(c.icon))}</span><span class="it-txt"><b>${c.name}</b><small>${c.slug} · ${bnCount(c.n)} টি পোস্ট</small></span>
    <form data-ajax action="${b}/categories/${c.id}/toggle" method="post" class="inline"><input type="checkbox" class="tgl" ${raw(c.active ? 'checked' : '')} data-autosubmit aria-label="সক্রিয়"></form>${raw(icon('edit', 'it-edit'))}</summary>
  <div class="item-body">${form(c)}</div></details>`)}</div>`;
}

/* ----------------------------- banners ----------------------------- */
function banners(d) {
  const b = B();
  return html`<div class="toolbar"><p class="muted">হোম পেজের স্লাইডার (সর্বোচ্চ ১০টি)। ছবি স্বয়ংক্রিয়ভাবে ৮৫৬×২৯২ সাইজে ক্রপ ও ~২০০KB তে কম্প্রেস হবে।</p>
  <button class="btn btn-primary" type="button" data-toggle-el="#newBanner" ${raw(d.rows.length >= 10 ? 'disabled' : '')}>${raw(icon('plus'))}নতুন ব্যানার</button></div>
<div id="newBanner" class="card" hidden><form data-ajax action="${b}/banners/new" method="post" enctype="multipart/form-data">
  ${U.fileField('image', 'ব্যানার ছবি *', '', { hint: 'যেকোনো সাইজের ছবি দিন, অটো ক্রপ হবে' })}
  <div class="grid2">${U.field('title', 'শিরোনাম (alt)', '')}${U.field('link', 'লিংক', '', { attrs: 'placeholder="/category/... বা https://..."' })}</div>
  <div class="row-gap end"><button class="btn btn-primary btn-sm" type="submit">যোগ করুন</button></div></form></div>
<div class="banner-list">${d.rows.length ? d.rows.map((r, i) => html`<div class="banner-item">
  <img src="${uploads.url(r.image)}" alt="" loading="lazy">
  <form class="banner-meta" data-ajax action="${b}/banners/${r.id}" method="post" enctype="multipart/form-data">
    <span class="num">${bnNum(i + 1)}</span>
    <input name="title" value="${r.title}" placeholder="শিরোনাম"><input name="link" value="${r.link}" placeholder="লিংক">
    <input name="sort" type="number" value="${r.sort}" class="w-sort" title="ক্রম">
    <label class="tgl-inline"><input type="hidden" name="active" value="0"><input type="checkbox" class="tgl" name="active" value="1" ${raw(r.active ? 'checked' : '')}></label>
    <label class="icon-btn sm" title="ছবি বদলান">${raw(icon('image'))}<input type="file" name="image" accept="image/*" hidden data-autosubmit></label>
    <button class="icon-btn sm" type="submit" title="সেভ">${raw(icon('check'))}</button>
    <button class="icon-btn sm danger" type="button" data-delete="${b}/banners/${r.id}/delete" data-confirm="ব্যানারটি মুছে ফেলা হবে।" title="মুছুন">${raw(icon('trash'))}</button>
  </form></div>`) : U.empty('এখনো কোনো ব্যানার নেই', 'image')}</div>`;
}

/* ----------------------------- ads ----------------------------- */
function ads(d) {
  const b = B();
  const form = (a = {}) => html`<form data-ajax action="${b}/ads/${a.id || 'new'}" method="post" enctype="multipart/form-data">
    <div class="grid2">${U.select('slot', 'স্লট', Object.entries(AD_SLOTS), a.slot || 'home_top')}${U.select('type', 'ধরন', [['image', 'ছবি + লিংক'], ['html', 'HTML / AdSense কোড']], a.type || 'image', { attrs: 'data-ad-type' })}</div>
    <div class="grid2">${U.field('title', 'শিরোনাম', a.title || '')}${U.field('link', 'লিংক', a.link || '', { type: 'url' })}</div>
    ${U.fileField('image', 'বিজ্ঞাপনের ছবি', a.image ? uploads.url(a.image) : '')}
    ${U.field('html', 'HTML কোড', a.html || '', { type: 'textarea', attrs: 'rows="4" spellcheck="false" class="mono"', hint: 'শুধু বিশ্বস্ত বিজ্ঞাপন নেটওয়ার্কের কোড দিন' })}
    <div class="grid2">${U.field('sort', 'ক্রম', a.sort || 0, { type: 'number' })}${U.toggle('active', 'চালু', a.id ? !!a.active : true)}</div>
    <div class="row-gap end">${a.id ? html`<button class="btn btn-ghost-danger btn-sm" type="button" data-delete="${b}/ads/${a.id}/delete" data-confirm="বিজ্ঞাপনটি মুছে ফেলা হবে।">${raw(icon('trash'))}মুছুন</button>` : ''}<button class="btn btn-primary btn-sm" type="submit">সেভ করুন</button></div>
  </form>`;
  return html`<div class="toolbar"><p class="muted">স্লট অনুযায়ী বিজ্ঞাপন যোগ, এডিট ও চালু/বন্ধ করুন</p><button class="btn btn-primary" type="button" data-toggle-el="#newAd">${raw(icon('plus'))}নতুন বিজ্ঞাপন</button></div>
<div id="newAd" class="card" hidden>${form()}</div>
${Object.entries(AD_SLOTS).map(([slot, name]) => {
    const list = d.rows.filter((a) => a.slot === slot);
    return html`<div class="slot-group"><h3>${name} <small>${bnNum(list.length)} টি</small></h3>${list.length ? html`<div class="item-list">${list.map((a) => html`<details class="item">
    <summary><span class="it-thumb">${a.image ? html`<img src="${uploads.url(a.image)}" alt="">` : raw(icon('ad'))}</span><span class="it-txt"><b>${a.title || (a.type === 'html' ? 'HTML বিজ্ঞাপন' : 'বিজ্ঞাপন')}</b><small>${a.type === 'html' ? 'HTML কোড' : a.link}</small></span>
    <form data-ajax action="${b}/ads/${a.id}/toggle" method="post" class="inline"><input type="checkbox" class="tgl" ${raw(a.active ? 'checked' : '')} data-autosubmit aria-label="চালু"></form>${raw(icon('edit', 'it-edit'))}</summary>
    <div class="item-body">${form(a)}</div></details>`)}</div>` : html`<p class="muted small">এই স্লটে কোনো বিজ্ঞাপন নেই</p>`}</div>`;
  })}`;
}

/* ----------------------------- notices ----------------------------- */
function notices(d) {
  const b = B();
  const dtVal = (v) => { if (!v) return ''; const x = new Date(v); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const form = (n = {}) => html`<form data-ajax action="${b}/notices/${n.id || 'new'}" method="post">
    ${U.field('title', 'শিরোনাম *', n.title || '', { attrs: 'required maxlength="500"' })}
    ${U.field('body', 'বিস্তারিত', n.body || '', { type: 'textarea', attrs: 'rows="3"' })}
    <div class="grid2">${U.field('link', 'লিংক', n.link || '')}${U.field('expires_at', 'মেয়াদ শেষ', dtVal(n.expires_at), { type: 'datetime-local', hint: 'মেয়াদ শেষে স্বয়ংক্রিয়ভাবে মুছে যাবে' })}</div>
    <div class="grid2">${U.toggle('pinned', 'উপরে পিন করুন', !!n.pinned)}${U.toggle('active', 'সক্রিয়', n.id ? !!n.active : true)}</div>
    <div class="row-gap end">${n.id ? html`<button class="btn btn-ghost-danger btn-sm" type="button" data-delete="${b}/notices/${n.id}/delete" data-confirm="নোটিশটি মুছে ফেলা হবে।">${raw(icon('trash'))}মুছুন</button>` : ''}<button class="btn btn-primary btn-sm" type="submit">সেভ করুন</button></div>
  </form>`;
  const isNew = (n) => Date.now() - new Date(n.created_at) < 3 * 86400000;
  return html`<div class="toolbar"><p class="muted">সাইটে দেখানো হবে সর্বশেষ ${bnNum(settings.int('notice_limit', 50))} টি নোটিশ</p><button class="btn btn-primary" type="button" data-toggle-el="#newNotice">${raw(icon('plus'))}নতুন নোটিশ</button></div>
<div id="newNotice" class="card" hidden>${form()}</div>
<div class="item-list">${d.rows.length ? d.rows.map((n) => html`<details class="item">
  <summary><span class="it-ic" style="--c:${isNew(n) ? '#ef4444' : '#16a34a'}">${raw(icon('bell'))}</span><span class="it-txt"><b>${isNew(n) ? html`<span class="badge b-red">নতুন</span> ` : ''}${n.title}</b><small>${dt(n.created_at)}${n.expires_at ? html` · <span class="${new Date(n.expires_at) < new Date() ? 'txt-red' : ''}">${new Date(n.expires_at) < new Date() ? 'মেয়াদোত্তীর্ণ' : `${bnNum(Math.ceil((new Date(n.expires_at) - Date.now()) / 86400000))} দিন বাকি`}</span>` : ''}</small></span>${raw(icon('edit', 'it-edit'))}</summary>
  <div class="item-body">${form(n)}</div></details>`) : U.empty('কোনো নোটিশ নেই', 'bell')}</div>`;
}

/* ----------------------------- reports ----------------------------- */
function reports(d) {
  const b = B();
  return html`<div class="pills">${[['all', 'সব'], ['new', 'নতুন'], ['done', 'সমাধান']].map(([k, t]) => html`<a class="pill ${d.status === k ? 'on' : ''}" href="${b}/reports?status=${k}">${t} <em>${bnNum(d.counts[k] || 0)}</em></a>`)}</div>
<div class="item-list">${d.rows.length ? d.rows.map((r) => html`<div class="report-item ${r.status === 'new' ? 'is-new' : ''}">
  <div class="ri-top"><span class="ri-ic">${raw(icon('alert'))}</span><div><b>${r.type}</b><small>${bnDate(r.created_at, { time: true })}${r.contact ? ` · ${r.contact}` : ''}</small></div>${r.status === 'new' ? U.badge('নতুন', 'red') : U.badge('সমাধান', 'green')}</div>
  <p>${r.message}</p>
  ${r.post_title ? html`<a class="ri-post" href="${b}/posts/${r.post_id}">${raw(icon('file'))}${r.post_title}</a>` : r.url ? html`<small class="muted">${r.url}</small>` : ''}
  <div class="row-gap end">
    ${r.status === 'new' ? html`<form data-ajax action="${b}/reports/${r.id}/done" method="post" class="inline"><button class="btn btn-soft btn-sm" type="submit">${raw(icon('check'))}সমাধান হয়েছে</button></form>` : ''}
    <button class="btn btn-ghost-danger btn-sm" type="button" data-delete="${b}/reports/${r.id}/delete" data-confirm="রিপোর্টটি মুছে ফেলা হবে।">${raw(icon('trash'))}</button>
  </div></div>`) : U.empty('কোনো রিপোর্ট নেই', 'flag')}</div>
${d.rows.length ? html`<form data-ajax action="${b}/reports/clear" method="post" class="center"><button class="btn btn-danger" type="submit" data-confirm="সব রিপোর্ট মুছে ফেলা হবে।">${raw(icon('trash'))}সব রিপোর্ট মুছে ফেলুন</button></form>` : ''}`;
}

/* ----------------------------- automation ----------------------------- */
const AUTO_STEPS = ['সোর্স সাইট স্ক্র্যাপ', 'আগে করা হয়েছে কিনা যাচাই', 'শুধু নতুনটা OpenAI তে পাঠানো', 'AI দিয়ে কনটেন্ট লেখা', 'খসড়া হিসেবে সংরক্ষণ', 'এডমিনকে মেইল'];

function automation(d) {
  const b = B();
  const s = settings;
  const run = d.lastRun;
  const step = run ? run.step : 0;
  return html`<div class="grid-2 auto-grid">
  ${U.card('অটোমেশন চালু', html`
    <form data-ajax action="${b}/automation/toggle" method="post" class="auto-switch">${U.toggle('auto_enabled', s.bool('auto_enabled') ? 'চালু আছে' : 'বন্ধ আছে', s.bool('auto_enabled'), { attrs: 'data-autosubmit', hint: `প্রতি ${bnNum(s.int('auto_interval_min', 60))} মিনিটে চলে · কখনো নিজে প্রকাশ করে না` })}</form>
    <ol class="steps" data-steps data-run="${run ? run.id : ''}" data-status="${run ? run.status : ''}">${AUTO_STEPS.map((t, i) => {
    const n = i + 1;
    const st = !run ? '' : run.status === 'running' ? (n < step ? 'done' : n === step ? 'active' : '') : (n <= step ? (run.status === 'failed' && n === step ? 'fail' : 'done') : '');
    return html`<li class="${st}" data-step="${n}"><span class="st-n">${bnNum(n)}</span><span>${t}</span><span class="st-ic">${raw(icon(st === 'fail' ? 'x' : 'check'))}</span></li>`;
  })}</ol>
    <div class="auto-stats">
      <span><b>${bnNum(d.today.ai)}<small> / ${bnNum(s.int('auto_daily_limit', 40))}</small></b><small>আজ AI কল</small></span>
      <span><b>${bnNum(d.today.drafts)}</b><small>আজ খসড়া</small></span>
      <span><b>$${Number(d.today.cost || 0).toFixed(3)}</b><small>আজকের খরচ</small></span>
      <span><b>$${Number(d.month.cost || 0).toFixed(2)}</b><small>এই মাসে</small></span>
    </div>
    <form data-ajax action="${b}/automation/run" method="post"><button class="btn btn-blue btn-block btn-lg" type="submit" data-run-now ${raw(d.locked ? 'disabled' : '')}>${raw(icon('play'))}${d.locked ? 'চলছে…' : 'এখনই চালান'}</button></form>
    ${d.locked ? html`<form data-ajax action="${b}/automation/unlock" method="post" class="center"><button class="link-btn small" type="submit" data-confirm="চলমান কাজটি আটকে গেছে মনে হলে লক মুক্ত করুন (১০ মিনিট পর স্বয়ংক্রিয়ভাবেও মুক্ত হয়)।">লক মুক্ত করুন</button></form>` : ''}
  `)}
  ${U.card('লাইভ লগ', html`<div class="log" data-log data-since="${d.logs.length ? d.logs[d.logs.length - 1].id : 0}">${d.logs.map((l) => logLine(l))}</div>
    <p class="muted small">${run ? html`শেষ রান: ${bnDate(run.started_at, { time: true })} · পাওয়া ${bnNum(run.found)} · নতুন ${bnNum(run.fresh)} · বাদ ${bnNum(run.skipped)} · খসড়া ${bnNum(run.drafts)}` : 'এখনো কোনো রান হয়নি'}</p>`, { actions: html`<span class="live-dot" data-live hidden>লাইভ</span>` })}
</div>
${U.card('সেটিংস', html`<form data-ajax action="${b}/automation/settings" method="post" class="auto-settings">
  <div class="grid2">
    ${U.field('openai_key', 'OpenAI API Key', s.get('openai_key') ? '••••••••' + s.get('openai_key').slice(-4) : '', { type: 'password', attrs: 'autocomplete="off" placeholder="sk-..."', hint: 'পরিবর্তন না করলে আগের কী থাকবে' })}
    ${U.field('openai_model', 'মডেল', s.get('openai_model'), { attrs: 'list="models"' })}
  </div>
  ${U.field('auto_sources', 'সোর্স URL (প্রতি লাইনে একটি WordPress সাইট)', s.get('auto_sources'), { type: 'textarea', attrs: 'rows="3" placeholder="https://example.com" spellcheck="false"', hint: 'সাইটের WordPress REST API (/wp-json/wp/v2/posts) ব্যবহার করা হবে' })}
  <div class="grid3">
    ${U.field('auto_start_date', 'শুরুর তারিখ', s.get('auto_start_date'), { type: 'date', hint: 'এর আগের পোস্ট বাদ' })}
    ${U.field('auto_batch', 'ব্যাচ সাইজ', s.get('auto_batch'), { type: 'number', attrs: 'min="1" max="50"' })}
    ${U.field('auto_daily_limit', 'দৈনিক AI সীমা', s.get('auto_daily_limit'), { type: 'number', attrs: 'min="0" max="1000"' })}
  </div>
  <div class="grid3">
    ${U.select('auto_parallel', 'সমান্তরাল কল', [['1', '১'], ['2', '২'], ['3', '৩']], s.get('auto_parallel'))}
    ${U.field('auto_interval_min', 'চলার বিরতি (মিনিট)', s.get('auto_interval_min'), { type: 'number', attrs: 'min="10" max="1440"' })}
    ${U.select('auto_default_category', 'ডিফল্ট ক্যাটাগরি', [['', 'AI ঠিক করবে'], ...d.cats.map((c) => [c.id, c.name])], s.get('auto_default_category'))}
  </div>
  <div class="grid3">
    ${U.field('auto_price_in', 'ইনপুট মূল্য ($/১M টোকেন)', s.get('auto_price_in'), { attrs: 'inputmode="decimal"' })}
    ${U.field('auto_price_out', 'আউটপুট মূল্য ($/১M টোকেন)', s.get('auto_price_out'), { attrs: 'inputmode="decimal"' })}
    ${U.field('auto_notify_email', 'নোটিফাই ইমেইল', s.get('auto_notify_email'), { type: 'email' })}
  </div>
  ${U.field('openai_base', 'API বেস URL', s.get('openai_base'), { hint: 'সাধারণত পরিবর্তন করার দরকার নেই' })}
  ${U.field('auto_prompt_extra', 'AI-কে অতিরিক্ত নির্দেশনা (ঐচ্ছিক)', s.get('auto_prompt_extra'), { type: 'textarea', attrs: 'rows="2"' })}
  <datalist id="models"><option value="gpt-4o-mini"><option value="gpt-4.1-mini"><option value="gpt-4.1-nano"><option value="gpt-4o"><option value="gpt-5-mini"></datalist>
  <div class="row-gap end"><button class="btn btn-soft" type="submit" name="_test" value="1">${raw(icon('zap'))}কী যাচাই</button><button class="btn btn-primary" type="submit">সেভ করুন</button></div>
</form>
<div class="cron-box"><b>${raw(icon('link'))}Cron লিংক (ঐচ্ছিক)</b><p class="muted small">ইন-অ্যাপ শিডিউলার নিজেই চালায়। চাইলে Hostinger cron থেকেও এই লিংক কল করতে পারেন:</p>
<code class="copy" data-copy>${d.cronUrl}</code><p class="muted small">উদাহরণ: <code>*/30 * * * * curl -s "${d.cronUrl}" &gt;/dev/null</code></p></div>`)}
${U.card('সাম্প্রতিক আইটেম', d.items.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>শিরোনাম</th><th>অবস্থা</th><th>কারণ</th><th>সময়</th></tr></thead><tbody>${d.items.map((it) => html`<tr>
  <td data-l="শিরোনাম">${it.post_id ? html`<a href="${b}/posts/${it.post_id}">${it.title}</a>` : html`<a href="${it.link}" target="_blank" rel="noopener">${it.title}</a>`}</td>
  <td data-l="অবস্থা">${U.badge(ITEM_STATUS[it.status] || it.status, it.status === 'processed' ? 'green' : it.status === 'failed' ? 'red' : it.status === 'new' ? 'blue' : 'gray')}</td>
  <td data-l="কারণ"><small>${it.reason}</small></td><td data-l="সময়"><small>${timeAgo(it.updated_at)}</small></td></tr>`)}</tbody></table></div>` : U.empty('এখনো কোনো আইটেম নেই', 'bot'))}`;
}
const ITEM_STATUS = { new: 'অপেক্ষমাণ', processed: 'খসড়া তৈরি', skipped: 'বাদ', duplicate: 'ডুপ্লিকেট', failed: 'ব্যর্থ', expired: 'মেয়াদোত্তীর্ণ' };

function logLine(l) {
  const t = new Date(l.created_at);
  return html`<div class="ll ll-${l.level}" data-id="${l.id}"><time>${bnNum(String(t.getHours()).padStart(2, '0'))}:${bnNum(String(t.getMinutes()).padStart(2, '0'))}</time><span>${l.message}</span></div>`;
}

/* ----------------------------- analytics ----------------------------- */
function analytics(d) {
  const b = B();
  const pct = (a, c) => (c ? `${a >= c ? '+' : ''}${bnNum(Math.round(((a - c) / c) * 100))}%` : '');
  return html`<div class="toolbar"><div class="pills">${[[7, '৭ দিন'], [30, '৩০ দিন'], [90, '৯০ দিন']].map(([n, t]) => html`<a class="pill ${d.days === n ? 'on' : ''}" href="${b}/analytics?days=${n}">${t}</a>`)}</div></div>
<div class="stats">
  ${U.stat('মোট ভিজিট', d.sum.visits, { ic: 'globe', color: '#16a34a', delta: pct(d.sum.visits, d.prev.visits), deltaDown: d.sum.visits < d.prev.visits })}
  ${U.stat('ইউনিক ডিভাইস', d.sum.uniques, { ic: 'phone', color: '#2563eb', delta: pct(d.sum.uniques, d.prev.uniques), deltaDown: d.sum.uniques < d.prev.uniques })}
  ${U.stat('মোট পেজ ভিউ', d.sum.pageviews, { ic: 'eye', color: '#7c3aed', delta: pct(d.sum.pageviews, d.prev.pageviews), deltaDown: d.sum.pageviews < d.prev.pageviews })}
  ${U.stat('টপ পেজ', d.pages[0] ? d.pages[0].path : '—', { ic: 'star', color: '#f59e0b' })}
</div>
${U.card('ভিজিট গ্রাফ', html`<div class="chart-wrap">${U.lineChart(d.series, { id: 'a' })}</div>`)}
<div class="grid-2">
  ${U.card('লোকেশন (দেশ)', d.geo.length ? U.bars(d.geo.map((g) => ({ label: g.country, value: Number(g.v) }))) : U.empty(settings.bool('geo_lookup') ? 'এখনো কোনো ডেটা নেই' : 'লোকেশন ট্র্যাকিং বন্ধ আছে (সেটিংস → সিস্টেম)', 'globe'))}
  ${U.card('টপ পেজ', d.pages.length ? html`<ol class="a-rank">${d.pages.map((p) => html`<li><a href="${p.path}" target="_blank">${decodeSafe(p.path)}</a><small>${bnCount(p.v)}</small></li>`)}</ol>` : U.empty('এখনো কোনো ডেটা নেই'))}
</div>
${U.card('সর্বাধিক দেখা পোস্ট', d.posts.length ? html`<ol class="a-rank">${d.posts.map((p) => html`<li><a href="${b}/posts/${p.id}">${p.title}</a><small>${raw(icon('eye'))}${bnCount(p.views)}</small></li>`)}</ol>` : U.empty('এখনো কোনো ডেটা নেই'))}
${U.card('জনপ্রিয় সার্চ', d.searches.length ? html`<div class="chips">${d.searches.map((s) => html`<span class="chip">${s.q} <em>${bnNum(s.hits)}</em></span>`)}</div>` : U.empty('এখনো কোনো সার্চ হয়নি', 'search'))}`;
}
function decodeSafe(p) { try { return decodeURIComponent(p); } catch (_) { return p; } }

/* ----------------------------- pages & team ----------------------------- */
function pagesTeam(d) {
  const b = B();
  const pform = (p = {}) => html`<form data-ajax action="${b}/pages/${p.id || 'new'}" method="post">
    <div class="grid2">${U.field('title', 'শিরোনাম *', p.title || '', { attrs: 'required' })}${U.field('slug', 'স্লাগ', p.slug || '', { attrs: 'placeholder="অটো"' })}</div>
    <div class="editor" data-editor><div class="ed-bar"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="formatBlock" data-arg="H2">H2</button><button type="button" data-cmd="insertUnorderedList">•</button><button type="button" data-cmd="createLink">${raw(icon('link'))}</button><button type="button" data-cmd="html">&lt;/&gt;</button></div>
      <div class="ed-area content" contenteditable="true" data-ed-area>${raw(p.content || '')}</div><textarea name="content" class="ed-src" hidden>${p.content || ''}</textarea></div>
    <div class="grid3">${U.field('sort', 'ক্রম', p.sort || 0, { type: 'number' })}${U.toggle('in_footer', 'ফুটারে দেখান', p.id ? !!p.in_footer : true)}${U.toggle('active', 'সক্রিয়', p.id ? !!p.active : true)}</div>
    <div class="row-gap end">${p.id ? html`<button class="btn btn-ghost-danger btn-sm" type="button" data-delete="${b}/pages/${p.id}/delete" data-confirm="পেজটি মুছে ফেলা হবে।">${raw(icon('trash'))}মুছুন</button>` : ''}<button class="btn btn-primary btn-sm" type="submit">সেভ করুন</button></div></form>`;
  const tform = (m = {}) => html`<form data-ajax action="${b}/team/${m.id || 'new'}" method="post" enctype="multipart/form-data">
    ${U.fileField('photo', 'ছবি', m.photo ? uploads.url(m.photo) : '', { hint: '৪০০×৪০০ এ অটো ক্রপ' })}
    <div class="grid2">${U.field('name', 'নাম *', m.name || '', { attrs: 'required' })}${U.field('role', 'পদবি', m.role || '')}</div>
    ${U.field('bio', 'সংক্ষিপ্ত পরিচিতি', m.bio || '', { attrs: 'maxlength="500"' })}
    <div class="grid3">${U.field('link', 'প্রোফাইল লিংক', m.link || '')}${U.field('sort', 'ক্রম', m.sort || 0, { type: 'number' })}${U.toggle('active', 'সক্রিয়', m.id ? !!m.active : true)}</div>
    <div class="row-gap end">${m.id ? html`<button class="btn btn-ghost-danger btn-sm" type="button" data-delete="${b}/team/${m.id}/delete" data-confirm="সদস্যকে মুছে ফেলা হবে।">${raw(icon('trash'))}মুছুন</button>` : ''}<button class="btn btn-primary btn-sm" type="submit">সেভ করুন</button></div></form>`;
  return html`<div class="tabs a-tabs" data-tabs><button type="button" class="on" data-tab="pages">ইনফো পেজ</button><button type="button" data-tab="team">টিম পরিচিতি</button></div>
<div data-pane="pages">
  <div class="toolbar"><p class="muted">আমাদের সম্পর্কে, গোপনীয়তা নীতি ইত্যাদি</p><button class="btn btn-primary" type="button" data-toggle-el="#newPage">${raw(icon('plus'))}নতুন পেজ</button></div>
  <div id="newPage" class="card" hidden>${pform()}</div>
  <div class="item-list">${d.pages.map((p) => html`<details class="item"><summary><span class="it-ic">${raw(icon('file'))}</span><span class="it-txt"><b>${p.title}</b><small>/page/${p.slug}</small></span>${p.active ? '' : U.badge('নিষ্ক্রিয়', 'gray')}${raw(icon('edit', 'it-edit'))}</summary><div class="item-body">${pform(p)}</div></details>`)}</div>
</div>
<div data-pane="team" hidden>
  <div class="toolbar"><p class="muted">ফুটারে "আমাদের টিম" অংশে দেখাবে</p><button class="btn btn-primary" type="button" data-toggle-el="#newMember">${raw(icon('plus'))}নতুন সদস্য</button></div>
  <div id="newMember" class="card" hidden>${tform()}</div>
  <div class="item-list">${d.team.length ? d.team.map((m) => html`<details class="item"><summary><span class="it-thumb round">${m.photo ? html`<img src="${uploads.url(m.photo)}" alt="">` : raw(icon('user'))}</span><span class="it-txt"><b>${m.name}</b><small>${m.role}</small></span>${raw(icon('edit', 'it-edit'))}</summary><div class="item-body">${tform(m)}</div></details>`) : U.empty('এখনো কোনো সদস্য যোগ করা হয়নি', 'users')}</div>
</div>`;
}

/* ----------------------------- subscribers ----------------------------- */
function subscribers(d) {
  const b = B();
  return html`<div class="stats">
  ${U.stat('পুশ সাবস্ক্রাইবার', d.push, { ic: 'bell', color: '#16a34a' })}
  ${U.stat('ইমেইল (নিশ্চিত)', d.emailConfirmed, { ic: 'mail', color: '#2563eb' })}
  ${U.stat('ইমেইল (অপেক্ষমাণ)', d.emailPending, { ic: 'clock', color: '#f59e0b' })}
</div>
<div class="grid-2">
${U.card('পুশ নোটিফিকেশন পাঠান', html`<form data-ajax action="${b}/subscribers/push" method="post">
  ${U.field('title', 'শিরোনাম *', '', { attrs: 'required maxlength="120"' })}
  ${U.field('body', 'বার্তা', '', { attrs: 'maxlength="240"' })}
  ${U.field('url', 'লিংক', '/', {})}
  <button class="btn btn-primary" type="submit" data-confirm="সকল সাবস্ক্রাইবারকে নোটিফিকেশন যাবে।">${raw(icon('send'))}পাঠান</button></form>
  <p class="muted small">নতুন পোস্ট প্রকাশ হলে স্বয়ংক্রিয়ভাবে পুশ যায়।</p>`)}
${U.card('দৈনিক সারসংক্ষেপ মেইল', html`<p class="muted">প্রতিদিন ${bnNum(settings.int('digest_hour', 20))}টায় সেদিনের নতুন পোস্টের তালিকা নিশ্চিত সাবস্ক্রাইবারদের কাছে যায়।</p>
  <form data-ajax action="${b}/subscribers/digest" method="post"><button class="btn btn-soft" type="submit" data-confirm="এখনই সবাইকে আজকের সারসংক্ষেপ পাঠানো হবে।">${raw(icon('mail'))}এখনই পাঠান</button></form>`)}
</div>
${U.card('ইমেইল সাবস্ক্রাইবার', d.emails.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>ইমেইল</th><th>অবস্থা</th><th>তারিখ</th><th></th></tr></thead><tbody>${d.emails.map((e) => html`<tr><td data-l="ইমেইল">${e.email}</td><td data-l="অবস্থা">${e.confirmed ? U.badge('নিশ্চিত', 'green') : U.badge('অপেক্ষমাণ', 'amber')}</td><td data-l="তারিখ">${dt(e.created_at)}</td>
  <td><button class="icon-btn sm danger" type="button" data-delete="${b}/subscribers/email/${e.id}/delete" data-confirm="সাবস্ক্রাইবার মুছে ফেলা হবে।">${raw(icon('trash'))}</button></td></tr>`)}</tbody></table></div>` : U.empty('এখনো কোনো ইমেইল সাবস্ক্রাইবার নেই', 'mail'))}`;
}

/* ----------------------------- users ----------------------------- */
function users(d) {
  const b = B();
  const form = (u = {}) => html`<form data-ajax action="${b}/users/${u.id || 'new'}" method="post">
    <div class="grid2">${U.field('name', 'নাম', u.name || '')}${U.field('username', 'ইউজারনেম *', u.username || '', { attrs: 'required pattern="[A-Za-z0-9_.-]{3,64}"' })}</div>
    <div class="grid2">${U.field('email', 'ইমেইল *', u.email || '', { type: 'email', attrs: 'required' })}${U.field('password', u.id ? 'নতুন পাসওয়ার্ড (ঐচ্ছিক)' : 'পাসওয়ার্ড *', '', { type: 'password', attrs: `${u.id ? '' : 'required'} minlength="8" autocomplete="new-password"` })}</div>
    ${U.select('role', 'ভূমিকা', Object.entries(ROLES), u.role || 'moderator', { attrs: 'data-role-select' })}
    <fieldset class="perms" data-perms ${raw((u.role || 'moderator') !== 'moderator' ? 'hidden' : '')}><legend>মডারেটরের অনুমতি</legend>
      ${Object.entries(PERMISSIONS).filter(([k]) => k !== 'users').map(([k, t]) => html`<label class="check"><input type="checkbox" name="perms" value="${k}" ${raw((u.permsArr || ['posts', 'notices']).includes(k) ? 'checked' : '')}> ${t}</label>`)}</fieldset>
    ${U.toggle('active', 'সক্রিয়', u.id ? !!u.active : true)}
    <div class="row-gap end">${u.id && u.id !== d.me ? html`<button class="btn btn-ghost-danger btn-sm" type="button" data-delete="${b}/users/${u.id}/delete" data-confirm="ইউজারটি মুছে ফেলা হবে।">${raw(icon('trash'))}মুছুন</button>` : ''}<button class="btn btn-primary btn-sm" type="submit">সেভ করুন</button></div></form>`;
  return html`<div class="toolbar"><p class="muted">২য় এডমিন ও মডারেটর যোগ করুন, অনুমতি ঠিক করুন</p><button class="btn btn-primary" type="button" data-toggle-el="#newUser">${raw(icon('plus'))}নতুন ইউজার</button></div>
<div id="newUser" class="card" hidden>${form()}</div>
<div class="item-list">${d.rows.map((u) => html`<details class="item"><summary>${avatar(u, 40)}<span class="it-txt"><b>${u.name || u.username}</b><small>${u.email}</small></span>
  ${U.badge(ROLES[u.role] || u.role, u.role === 'admin' ? 'green' : u.role === 'admin2' ? 'blue' : 'violet')}
  <form data-ajax action="${b}/users/${u.id}/toggle" method="post" class="inline"><input type="checkbox" class="tgl" ${raw(u.active ? 'checked' : '')} ${raw(u.id === d.me ? 'disabled' : '')} data-autosubmit aria-label="সক্রিয়"></form>${raw(icon('edit', 'it-edit'))}</summary>
  <div class="item-body">${form(u)}<p class="muted small">শেষ লগইন: ${u.last_login ? bnDate(u.last_login, { time: true }) : 'কখনো না'}</p></div></details>`)}</div>`;
}

/* ----------------------------- profile ----------------------------- */
function profile(d) {
  const b = B();
  const u = d.user;
  return html`<div class="profile-head card">${avatar(u, 72)}<div><h2>${u.name || u.username}</h2><p class="muted">${u.email}</p>${U.badge(ROLES[u.role], 'green')}</div></div>
<div class="grid-2">
${U.card('প্রোফাইল তথ্য', html`<form data-ajax action="${b}/profile" method="post" enctype="multipart/form-data">
  ${U.fileField('avatar', 'প্রোফাইল ছবি', u.avatar ? uploads.url(u.avatar) : '')}
  ${U.field('name', 'নাম পরিবর্তন', u.name)}${U.field('email', 'ইমেইল', u.email, { type: 'email', attrs: 'required' })}
  <button class="btn btn-primary btn-block" type="submit">আপডেট করুন</button></form>`)}
${U.card('পাসওয়ার্ড পরিবর্তন', html`<form data-ajax action="${b}/profile/password" method="post">
  ${U.field('current', 'বর্তমান পাসওয়ার্ড', '', { type: 'password', attrs: 'required autocomplete="current-password"' })}
  <div class="grid2">${U.field('password', 'নতুন পাসওয়ার্ড', '', { type: 'password', attrs: 'required minlength="8" autocomplete="new-password"' })}${U.field('confirm', 'নিশ্চিত করুন', '', { type: 'password', attrs: 'required minlength="8" autocomplete="new-password"' })}</div>
  <button class="btn btn-primary btn-block" type="submit">পাসওয়ার্ড আপডেট</button></form>
  <form data-ajax action="${b}/profile/logout-all" method="post" class="mt"><button class="btn btn-ghost-danger btn-sm" type="submit" data-confirm="অন্যান্য সকল ডিভাইস থেকে লগআউট হবে।">${raw(icon('logout'))}অন্য সব ডিভাইস থেকে লগআউট</button></form>`)}
</div>`;
}

/* ----------------------------- notifications ----------------------------- */
function notifications(d) {
  const b = B();
  const ic = { report: 'flag', automation: 'bot', system: 'settings', post: 'file' };
  return html`<div class="toolbar"><div class="pills">${[['all', 'সব'], ['automation', 'অটোমেশন'], ['report', 'রিপোর্ট'], ['system', 'সিস্টেম']].map(([k, t]) => html`<a class="pill ${d.type === k ? 'on' : ''}" href="${b}/notifications?type=${k}">${t}</a>`)}</div>
<form data-ajax action="${b}/notifications/read" method="post"><button class="btn btn-soft btn-sm" type="submit">${raw(icon('check'))}সব পড়া হয়েছে</button></form></div>
<div class="item-list">${d.rows.length ? d.rows.map((n) => html`<a class="notif ${n.is_read ? '' : 'unread'}" href="${n.link ? b + n.link : '#'}"><span class="it-ic n-${n.type}">${raw(icon(ic[n.type] || 'bell'))}</span><span class="it-txt"><b>${n.title}</b><small>${n.body}</small><small>${bnDate(n.created_at, { time: true })}</small></span></a>`) : U.empty('কোনো নোটিফিকেশন নেই', 'bell')}</div>`;
}

/* ----------------------------- settings ----------------------------- */
function settingsPage(d) {
  const b = B();
  const s = settings;
  const g = (k) => s.get(k);
  return html`<div class="tabs a-tabs" data-tabs>
  <button type="button" class="on" data-tab="site">সাইট</button><button type="button" data-tab="home">হোম ও কনটেন্ট</button><button type="button" data-tab="seo">SEO</button>
  <button type="button" data-tab="social">সোশ্যাল</button><button type="button" data-tab="mail">ইমেইল</button><button type="button" data-tab="system">সিস্টেম</button></div>
<form data-ajax action="${b}/settings" method="post" enctype="multipart/form-data" class="settings-form">
<div data-pane="site" class="card">
  <div class="grid2">${U.field('site_name', 'সাইটের নাম', g('site_name'), { attrs: 'required' })}${U.field('app_name', 'অ্যাপের নাম', g('app_name'))}</div>
  <div class="grid2">${U.field('tagline', 'ট্যাগলাইন', g('tagline'))}${U.field('site_domain', 'ডোমেইন', g('site_domain'))}</div>
  <div class="grid2">${U.fileField('logo', 'লোগো', g('logo') ? uploads.url(g('logo')) : '', { hint: 'বর্গাকার PNG/SVG ভালো; অ্যাপ আইকনও এখান থেকে তৈরি হবে' })}${U.fileField('favicon', 'ফেভিকন', g('favicon') ? uploads.url(g('favicon')) : '')}</div>
  <div class="grid2">${U.field('theme_color', 'থিম রং', g('theme_color'), { type: 'color' })}${U.field('contact_email', 'যোগাযোগ ইমেইল', g('contact_email'), { type: 'email' })}</div>
  ${U.field('footer_about', 'ফুটার বিবরণ', g('footer_about'), { type: 'textarea', attrs: 'rows="3"' })}
  <div class="grid2">${U.field('copyright', 'কপিরাইট টেক্সট', g('copyright'), { hint: '{year} লিখলে বর্তমান বছর বসবে' })}${U.field('footer_slogan', 'স্লোগান', g('footer_slogan'))}</div>
</div>
<div data-pane="home" class="card" hidden>
  ${U.field('hero_title', 'হিরো শিরোনাম (প্রতি লাইনে আলাদা)', g('hero_title'), { type: 'textarea', attrs: 'rows="3"' })}
  ${U.field('hero_subtitle', 'হিরো সাবটাইটেল', g('hero_subtitle'))}
  ${U.fileField('hero_image', 'হিরো ব্যাকগ্রাউন্ড ছবি', g('hero_image') ? uploads.url(g('hero_image')) : '', { hint: 'চওড়া ছবি দিন (১৬:৯)। খালি রাখলে ডিফল্ট ছবি দেখাবে' })}
  <div class="grid3">${U.field('per_page', 'প্রতি পেজে পোস্ট', g('per_page'), { type: 'number', attrs: 'min="4" max="60"' })}${U.field('notice_limit', 'নোটিশ লিমিট', g('notice_limit'), { type: 'number', attrs: 'min="5" max="500"' })}${U.field('promo_gap', 'প্রিমিয়াম বিরতি (promo_gap)', g('promo_gap'), { type: 'number', attrs: 'min="2" max="30"', hint: 'প্রতি কয়টি পোস্ট পর একটি প্রিমিয়াম' })}</div>
  <div class="grid3">${U.field('related_count', 'সম্পর্কিত পোস্ট', g('related_count'), { type: 'number', attrs: 'min="0" max="24"' })}${U.field('trash_days', 'ট্র্যাশ অটো-মুছবে (দিন)', g('trash_days'), { type: 'number' })}${U.field('report_limit_per_hour', 'রিপোর্ট লিমিট/ঘণ্টা', g('report_limit_per_hour'), { type: 'number' })}</div>
  <h3>নোটিফিকেশন</h3>
  ${U.toggle('push_enabled', 'পুশ নোটিফিকেশন', s.bool('push_enabled'), { hint: 'নতুন পোস্ট প্রকাশ হলে সাবস্ক্রাইবারদের পুশ যাবে' })}
  <div class="grid2">${U.field('push_prompt_delay', 'Allow পপআপ দেখানোর দেরি (সেকেন্ড)', g('push_prompt_delay'), { type: 'number' })}${U.field('digest_hour', 'দৈনিক মেইলের সময় (ঘণ্টা ০-২৩)', g('digest_hour'), { type: 'number', attrs: 'min="0" max="23"' })}</div>
  ${U.toggle('digest_enabled', 'দৈনিক সারসংক্ষেপ মেইল', s.bool('digest_enabled'))}
  ${U.toggle('reminder_enabled', 'ডেডলাইন রিমাইন্ডার (পুশ)', s.bool('reminder_enabled'))}
  ${U.toggle('install_screenshots', 'ইনস্টল শিটে স্ক্রিনশট', s.bool('install_screenshots'))}
</div>
<div data-pane="seo" class="card" hidden>
  ${U.field('meta_title', 'মেটা শিরোনাম', g('meta_title'), { attrs: 'data-count="60"' })}
  ${U.field('meta_desc', 'মেটা বিবরণ', g('meta_desc'), { type: 'textarea', attrs: 'rows="3" data-count="160"' })}
  ${U.field('meta_keywords', 'কিওয়ার্ড', g('meta_keywords'))}
  ${U.fileField('og_image', 'ডিফল্ট OG ছবি (১২০০×৬৩০)', g('og_image') ? uploads.url(g('og_image')) : '')}
  <div class="grid2">${U.field('google_verification', 'Google verification কোড', g('google_verification'), { hint: 'শুধু content="..." এর মান' })}${U.field('bing_verification', 'Bing verification কোড', g('bing_verification'))}</div>
  ${U.field('head_code', 'কাস্টম <head> কোড (Analytics/AdSense)', g('head_code'), { type: 'textarea', attrs: 'rows="4" spellcheck="false" class="mono"' })}
</div>
<div data-pane="social" class="card" hidden>
  <div class="grid2">${U.field('social_facebook', 'Facebook', g('social_facebook'), { type: 'url' })}${U.field('social_youtube', 'YouTube', g('social_youtube'), { type: 'url' })}</div>
  <div class="grid2">${U.field('social_x', 'X (Twitter)', g('social_x'), { type: 'url' })}${U.field('social_telegram', 'Telegram', g('social_telegram'), { type: 'url' })}</div>
  <div class="grid2">${U.field('social_whatsapp', 'WhatsApp', g('social_whatsapp'), { type: 'url' })}${U.field('social_linkedin', 'LinkedIn', g('social_linkedin'), { type: 'url' })}</div>
</div>
<div data-pane="mail" class="card" hidden>
  <div class="grid3">${U.field('smtp_host', 'SMTP হোস্ট', g('smtp_host'), { attrs: 'placeholder="smtp.hostinger.com"' })}${U.field('smtp_port', 'পোর্ট', g('smtp_port'), { type: 'number' })}${U.select('smtp_secure', 'এনক্রিপশন', [['1', 'SSL (465)'], ['0', 'STARTTLS/None (587)']], g('smtp_secure'))}</div>
  <div class="grid2">${U.field('smtp_user', 'ইউজারনেম', g('smtp_user'), { attrs: 'autocomplete="off"' })}${U.field('smtp_pass', 'পাসওয়ার্ড', g('smtp_pass') ? '••••••••' : '', { type: 'password', attrs: 'autocomplete="new-password"', hint: 'পরিবর্তন না করলে আগেরটি থাকবে' })}</div>
  <div class="grid2">${U.field('mail_from', 'প্রেরকের ইমেইল', g('mail_from'), { type: 'email' })}${U.field('mail_from_name', 'প্রেরকের নাম', g('mail_from_name'))}</div>
  <div class="test-mail"><input type="email" name="_test_to" placeholder="পরীক্ষামূলক মেইলের ঠিকানা" value="${d.me.email}"><button class="btn btn-soft btn-sm" type="submit" name="_testmail" value="1">${raw(icon('send'))}পরীক্ষামূলক মেইল পাঠান</button></div>
</div>
<div data-pane="system" class="card" hidden>
  ${U.toggle('maintenance', 'মেইনটেন্যান্স মোড', s.bool('maintenance'), { hint: 'লগইন করা এডমিন সবসময় আসল সাইট দেখবে' })}
  <div class="grid2">${U.field('maintenance_title', 'মেইনটেন্যান্স শিরোনাম', g('maintenance_title'))}${U.field('maintenance_text', 'মেইনটেন্যান্স লেখা', g('maintenance_text'))}</div>
  ${U.field('admin_path', 'এডমিন প্যানেলের পথ', g('admin_path'), { attrs: 'pattern="[A-Za-z0-9_-]{3,40}" required', hint: 'পরিবর্তন করলে নতুন পথে রিডাইরেক্ট হবে। মনে রাখুন!' })}
  ${U.toggle('analytics_enabled', 'অ্যানালিটিক্স', s.bool('analytics_enabled'))}
  ${U.toggle('geo_lookup', 'লোকেশন (geo lookup)', s.bool('geo_lookup'), { hint: 'ভিজিটরের দেশ শনাক্ত (ip-api.com / Cloudflare হেডার)' })}
  <ul class="kv"><li><span>ডাটা ফোল্ডার</span><b class="mono small">${d.dataDir}</b></li><li><span>আপলোড ফোল্ডার</span><b class="mono small">${d.uploadsDir}</b></li><li><span>DB স্কিমা ভার্সন</span><b>${bnNum(d.schema)}</b></li><li><span>অ্যাপ ভার্সন</span><b>${d.version}</b></li></ul>
</div>
<div class="save-bar"><button class="btn btn-primary btn-lg" type="submit">${raw(icon('check'))}সেভ করুন</button></div>
</form>`;
}

module.exports = {
  dashboard, postsList, postForm, categories, banners, ads, notices, reports, automation, logLine, analytics,
  pagesTeam, subscribers, users, profile, notifications, settingsPage, AD_SLOTS, AUTO_STEPS,
};
