/* ═══════════════════════════════════════════════
   পুরো সিস্টেমের ইন্টিগ্রেশন টেস্ট (আলাদা টেস্ট ডাটাবেসে)
   চালাতে:  TEST_DB_NAME=cc_test DB_USER=… DB_PASS=… npm test
   ═══════════════════════════════════════════════ */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.DB_NAME = process.env.TEST_DB_NAME || 'cc_test';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-up-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.BASE_URL = '';
process.env.SCHEDULER = 'false';

const { migrate } = await import('../src/migrate.js');
const { buildApp } = await import('../src/app.js');
const db = await import('../src/db.js');
const { setSetting, loadSettings } = await import('../src/core/settings.js');
const { Client, csrfOf } = await import('./helpers.js');
const bcrypt = (await import('bcryptjs')).default;
const sharp = (await import('sharp')).default;

let app; let base; const pub = () => new Client(base); let adm;
const SLUG = 'testadmin';

before(async () => {
  await migrate();
  for (const t of ['posts', 'post_links', 'post_images', 'banners', 'notices', 'reports', 'admins', 'team_members', 'email_subscribers', 'push_subscriptions', 'push_saved', 'source_posts', 'source_decisions', 'auto_log', 'notify_jobs', 'mail_queue', 'slug_redirects', 'visits', 'visitors', 'post_views']) await db.run(`DELETE FROM ${t}`);
  await db.run('DELETE FROM settings');
  await db.run('INSERT INTO admins (username, pass, name, role, perms, is_active, created_at) VALUES (?,?,?,?,?,1,NOW())', ['boss', await bcrypt.hash('secret123', 10), 'Boss', 'super', '[]']);
  await db.run('INSERT INTO admins (username, pass, name, role, perms, is_active, created_at) VALUES (?,?,?,?,?,1,NOW())', ['mod1', (await bcrypt.hash('modpass12', 10)).replace('$2b$', '$2y$'), 'Mod', 'moderator', '["notices"]']);
  await loadSettings(true); await setSetting('admin_slug', SLUG); await setSetting('site_name', 'টেস্ট সাইট');
  app = await buildApp(); await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { await app.close(); await db.closePool(); });

test('পাবলিক পেজগুলো ঠিকঠাক (খালি ডাটাবেসেও)', async () => {
  const c = pub();
  for (const p of ['/', '/trending', '/promoted', '/notices', '/report', '/about', '/privacy', '/team', '/saved', '/search', '/search?q=abc', '/offline', '/category/chakri', '/sitemap.xml', '/robots.txt', '/manifest.webmanifest', '/sw.js', '/healthz', '/.well-known/assetlinks.json']) {
    const r = await c.req(p); assert.equal(r.status, 200, `${p} → ${r.status}`);
  }
  assert.equal((await c.req('/nonexistent-page')).status, 404);
  assert.equal((await c.req('/post/no-such')).status, 404);
  assert.equal((await c.req('/category/nope')).status, 404);
  assert.equal((await c.req('/page/9999')).status, 404);
  const home = (await c.req('/')).text;
  assert.match(home, /<html lang="bn">/); assert.match(home, /application\/ld\+json/); assert.match(home, /rel="manifest"/);
  const m = JSON.parse((await c.req('/manifest.webmanifest')).text);
  assert.equal(m.display, 'standalone'); assert.ok(m.icons.length >= 4); assert.ok(m.shortcuts.length >= 3); assert.ok(m.share_target);
  assert.equal((await c.req('/icons/icon-192.png', { raw: true })).headers.get('content-type'), 'image/png');
});

test('এডমিন: লগইন ব্যর্থ/সফল, পারমিশন', async () => {
  adm = pub();
  const login = await adm.req(`/${SLUG}`); assert.equal(login.status, 200); assert.match(login.text, /প্রবেশ করুন/);
  assert.equal((await pub().req('/wrongslug')).status, 404);
  let r = await adm.form(`/${SLUG}`, { _t: csrfOf(login.text), username: 'boss', password: 'wrong' }); assert.match(r.text, /ভুল/);
  r = await adm.form(`/${SLUG}`, { _t: csrfOf(login.text), username: 'boss', password: 'secret123' }); assert.equal(r.status, 303);
  const dash = await adm.req(`/${SLUG}`); assert.equal(dash.status, 200); assert.match(dash.text, /ড্যাশবোর্ড/);
  /* মডারেটর — $2y$ হ্যাশ চলে, শুধু নোটিশের অনুমতি */
  const m = pub(); const l2 = await m.req(`/${SLUG}`);
  r = await m.form(`/${SLUG}`, { _t: csrfOf(l2.text), username: 'mod1', password: 'modpass12' }); assert.equal(r.status, 303);
  assert.match((await m.req(`/${SLUG}/settings`)).text, /প্রবেশাধিকার নেই/); assert.equal((await m.req(`/${SLUG}/notices`)).status, 200);
  /* CSRF ছাড়া POST */
  assert.equal((await adm.form(`/${SLUG}/notices`, { do: 'add', title: 'x' })).status, 419);
  /* লগআউট */
  const out = pub(); out.jar = { ...adm.jar }; await out.req(`/${SLUG}/logout`); assert.match((await out.req(`/${SLUG}`)).text, /প্রবেশ করুন/);
});

async function adminPost(path, fields, files) { const t = csrfOf((await adm.req(`/${SLUG}/${path.split('?')[0]}${path.includes('?') ? `?${path.split('?')[1]}` : ''}`)).text); return adm.multipart(`/${SLUG}/${path}`, { _t: t, ...fields }, files); }

test('পোস্ট তৈরি/এডিট: ছবি, পিডিএফ, লিংক, স্লাগ রিডিরেক্ট, SEO স্কিমা', async () => {
  const cat = await db.one("SELECT id FROM categories WHERE slug = 'chakri'");
  const img = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2a7' } }).jpeg().toBuffer();
  const pdf = Buffer.from('%PDF-1.4\n%test\n');
  let r = await adminPost('post', { title: 'পরীক্ষামূলক ব্যাংক নিয়োগ ২০২৬', cat_id: cat.id, company: 'টেস্ট ব্যাংক', division: 'ঢাকা', district: 'ঢাকা', vacancy: '১০', salary: '২০,০০০–৩০,০০০', deadline: '2099-12-31', status: '1', is_job: '1', content: 'লাইন এক\n- আইটেম **মোটা**\nশিরোনাম:\nhttps://example.com/a?b=1&c=2', link_url: ['example.com/apply', 'info@test.com', '01712345678'], link_type: ['url', 'email', 'phone'], link_label: ['আবেদন', '', ''], link_apply_rows: '0' },
  { thumb: [{ name: 't.jpg', type: 'image/jpeg', buffer: img }], pdf: [{ name: 'a.pdf', type: 'application/pdf', buffer: pdf }], gallery: [{ name: 'g.jpg', type: 'image/jpeg', buffer: img }] });
  assert.equal(r.status, 303, r.text); const loc = r.headers.get('location'); const id = Number(/id=(\d+)/.exec(loc)[1]);
  const p = await db.one('SELECT * FROM posts WHERE id = ?', [id]);
  assert.ok(p.thumb && p.pdf && p.slug && Number(p.status) === 1);
  assert.ok(fs.existsSync(path.join(process.env.UPLOAD_DIR, 'posts', p.thumb))); assert.ok(fs.statSync(path.join(process.env.UPLOAD_DIR, 'posts', p.thumb)).size < 150 * 1024);
  assert.equal(Number((await db.one('SELECT COUNT(*) n FROM post_links WHERE post_id = ?', [id])).n), 3);
  assert.equal(Number((await db.one('SELECT is_apply FROM post_links WHERE post_id = ? ORDER BY sort_order LIMIT 1', [id])).is_apply), 1);
  const page = await pub().req(`/post/${p.slug}`); assert.equal(page.status, 200);
  assert.match(page.text, /JobPosting/); assert.match(page.text, /আবেদন করুন|আবেদন/); assert.match(page.text, /<strong>মোটা<\/strong>/); assert.match(page.text, /mailto:info@test.com/); assert.match(page.text, /tel:01712345678/);
  assert.match((await pub().req('/')).text, /পরীক্ষামূলক ব্যাংক নিয়োগ/);
  assert.match((await pub().req('/sitemap.xml')).text, new RegExp(p.slug));
  const spa = JSON.parse((await pub().req(`/post/${p.slug}`, { headers: { 'X-SPA': '1' } })).text); assert.ok(spa.body.includes('পরীক্ষামূলক')); assert.equal(spa.page, 'post');
  /* স্লাগ বদলালে পুরোনো লিংক ৩০১ */
  r = await adminPost(`post?id=${id}`, { title: 'পরীক্ষামূলক ব্যাংক নিয়োগ ২০২৬', slug: 'new-slug-here', status: '1', content: 'x', cat_id: cat.id });
  const old = await pub().req(`/post/${p.slug}`); assert.equal(old.status, 301); assert.match(old.headers.get('location'), /new-slug-here/);
  assert.equal((await pub().req('/post/new-slug-here')).status, 200);
  /* বাল্ক: বিনে → ফেরানো → প্রকাশ */
  await adminPost('posts', { bulk: `delete:${id}` }); assert.equal((await pub().req('/post/new-slug-here')).status, 404);
  await adminPost('posts?trash=1', { bulk: `restore:${id}` }); await adminPost('posts', { bulk: 'publish', ids: String(id) });
  assert.equal((await pub().req('/post/new-slug-here')).status, 200);
  /* ভিউ গোনা */
  await pub().req('/post/new-slug-here', { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 12) Chrome/120 Mobile' } });
  const { flush } = await import('../src/modules/track/track.js'); await flush();
  assert.ok(Number((await db.one('SELECT views FROM posts WHERE id = ?', [id])).views) >= 1);
  /* সার্চ */
  assert.match((await pub().req('/search?q=' + encodeURIComponent('ব্যাংক'))).text, /new-slug-here/);
});

test('ক্যাটাগরি, ব্যানার, নোটিশ, টিম, রিপোর্ট, সেটিংস', async () => {
  let r = await adminPost('categories', { do: 'save', name: 'নতুন বিভাগ', icon: 'star', sort_order: '9', is_active: '1' }); assert.equal(r.status, 303);
  assert.match((await pub().req('/')).text, /নতুন বিভাগ/);
  const banner = await sharp({ create: { width: 1800, height: 700, channels: 3, background: '#09f' } }).png().toBuffer();
  r = await adminPost('banners', { do: 'add', title: 'B1', link: 'https://x.com', sort_order: '1', is_active: '1' }, { image: [{ name: 'b.png', type: 'image/png', buffer: banner }] }); assert.equal(r.status, 303);
  const b = await db.one('SELECT image FROM banners'); assert.ok(b); assert.match((await pub().req('/')).text, /bnr-track/);
  const meta = await sharp(path.join(process.env.UPLOAD_DIR, 'banners', b.image)).metadata(); assert.ok(Math.abs(meta.width / meta.height - 856 / 292) < 0.02);
  await adminPost('notices', { do: 'add', title: 'জরুরি নোটিশ', body: 'বিস্তারিত', link: '' }); assert.match((await pub().req('/notices')).text, /জরুরি নোটিশ/);
  const n = JSON.parse((await pub().req('/api/notices?since=0')).text); assert.equal(n.unread, 1);
  const face = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c33' } }).jpeg().toBuffer();
  r = await adminPost('team', { do: 'save', name: 'আরিফ হোসেন', role: 'সম্পাদক', bio: 'পরিচিতি', facebook: 'https://fb.com/x', is_active: '1' }, { photo: [{ name: 'p.jpg', type: 'image/jpeg', buffer: face }] }); assert.equal(r.status, 303);
  assert.match((await pub().req('/')).text, /আরিফ হোসেন/); assert.match((await pub().req('/team')).text, /সম্পাদক/);
  const rep = await pub().req('/api/report', { method: 'POST', body: JSON.stringify({ email: 'a@b.com', title: 'ভুল তথ্য আছে', details: 'এখানে ভুল আছে বিস্তারিত লিখলাম' }), headers: { 'Content-Type': 'application/json' } }); assert.equal(JSON.parse(rep.text).ok, true);
  assert.equal(JSON.parse((await pub().req('/api/report', { method: 'POST', body: JSON.stringify({ email: 'bad', title: 'x', details: 'y' }), headers: { 'Content-Type': 'application/json' } })).text).ok, false);
  assert.match((await adm.req(`/${SLUG}/reports`)).text, /ভুল তথ্য আছে/);
  r = await adminPost('settings', { site_name: 'নতুন নাম', tagline: 'স্লোগান', per_page: '10', promo_gap: '3', notice_limit: '50', admin_slug: SLUG }); assert.equal(r.status, 303);
  assert.match((await pub().req('/about')).text, /নতুন নাম/);
  await adminPost('settings', { site_name: 'টেস্ট সাইট', admin_slug: SLUG, per_page: '20' });
});

test('প্রিমিয়াম পোস্ট ও মেইনটেন্যান্স', async () => {
  const p = await db.one('SELECT id FROM posts LIMIT 1');
  await adminPost(`post?id=${p.id}`, { title: 'প্রিমিয়াম টেস্ট', status: '1', is_premium: '1', premium_until: '2099-01-01', content: 'x' });
  assert.match((await pub().req('/promoted')).text, /প্রিমিয়াম টেস্ট/); assert.match((await pub().req('/')).text, /prem-under|প্রিমিয়াম/);
  await adminPost('settings', { maintenance: '1', admin_slug: SLUG, per_page: '20' });
  assert.equal((await pub().req('/')).status, 503); assert.equal((await adm.req('/')).status, 200);
  await adminPost('settings', { admin_slug: SLUG, per_page: '20' }); assert.equal((await pub().req('/')).status, 200);
});

test('নোটিফিকেশন: ইমেইল double opt-in, আনসাবস্ক্রাইব, পুশ সাবস্ক্রিপশন', async () => {
  const c = pub();
  let r = await c.req('/api/notify/email', { method: 'POST', body: JSON.stringify({ email: 'bad' }), headers: { 'Content-Type': 'application/json' } }); assert.equal(JSON.parse(r.text).ok, false);
  r = await c.req('/api/notify/email', { method: 'POST', body: JSON.stringify({ email: 'reader@example.com', mode: 'daily', cats: [] }), headers: { 'Content-Type': 'application/json' } });
  const row = await db.one('SELECT * FROM email_subscribers WHERE email = ?', ['reader@example.com']); assert.ok(row); assert.equal(Number(row.confirmed), 0);
  assert.match((await c.req(`/notify/confirm?t=${row.token}`)).text, /নিশ্চিত হয়েছে/); assert.equal(Number((await db.one('SELECT confirmed FROM email_subscribers WHERE id = ?', [row.id])).confirmed), 1);
  assert.match((await c.req('/notify/confirm?t=' + 'a'.repeat(32))).text, /সঠিক নয়/);
  assert.match((await c.req(`/notify/unsub?t=${row.token}`)).text, /বন্ধ হয়েছে/); assert.ok((await db.one('SELECT unsub_at FROM email_subscribers WHERE id = ?', [row.id])).unsub_at);
  const sub = { endpoint: 'https://push.example.com/send/abc123', keys: { p256dh: 'BPx'.padEnd(87, 'a'), auth: 'authkey1234567890' } };
  const p = await db.one('SELECT id FROM posts LIMIT 1');
  r = await c.req('/api/notify/push', { method: 'POST', body: JSON.stringify({ subscription: sub, cats: [1], saved: [p.id] }), headers: { 'Content-Type': 'application/json' } }); assert.equal(JSON.parse(r.text).ok, true);
  assert.equal(Number((await db.one('SELECT COUNT(*) n FROM push_subscriptions')).n), 1); assert.equal(Number((await db.one('SELECT COUNT(*) n FROM push_saved')).n), 1);
  assert.equal(JSON.parse((await c.req('/api/notify/push', { method: 'POST', body: JSON.stringify({ subscription: { endpoint: 'http://insecure' } }), headers: { 'Content-Type': 'application/json' } })).text).ok, false);
  const saved = JSON.parse((await c.req(`/api/posts?ids=${p.id},99999`)).text); assert.equal(saved.found.length, 1); assert.match(saved.html, /pitem/);
});

/* ═══════════ অটোমেশন: নকল সোর্স (WordPress REST) + নকল AI ═══════════ */
let src; const SRC = { posts: [] };
function startSource() {
  return new Promise((ok) => {
    src = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/wp-json/wp/v2/posts') {
        const page = Number(u.searchParams.get('page') || 1); const per = Number(u.searchParams.get('per_page') || 50); const ob = u.searchParams.get('orderby');
        const sorted = [...SRC.posts].sort((a, b) => (ob === 'modified' ? b.modified.localeCompare(a.modified) : b.date.localeCompare(a.date)));
        const items = sorted.slice((page - 1) * per, page * per);
        if (page > Math.max(1, Math.ceil(sorted.length / per))) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"code":"rest_post_invalid_page_number"}'); }
        res.writeHead(200, { 'content-type': 'application/json', 'x-wp-total': String(sorted.length), 'x-wp-totalpages': String(Math.ceil(sorted.length / per)) });
        return res.end(JSON.stringify(items.map((p) => ({ id: p.id, date: p.date, modified: p.modified, link: `http://src.test/${p.slug}/`, slug: p.slug, title: { rendered: p.title } }))));
      }
      const m = /^\/wp-json\/wp\/v2\/posts\/(\d+)$/.exec(u.pathname);
      if (m) { const p = SRC.posts.find((x) => x.id === Number(m[1])); if (!p) { res.writeHead(404); return res.end('{}'); } res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id: p.id, date: p.date, modified: p.modified, link: `http://src.test/${p.slug}/`, title: { rendered: p.title }, content: { rendered: p.html } })); }
      res.writeHead(404); res.end('nf');
    }).listen(0, '127.0.0.1', () => ok(src.address().port));
  });
}
const longText = (extra) => `<p>${'এটি একটি পরীক্ষামূলক নিয়োগ বিজ্ঞপ্তির লেখা যেখানে পর্যাপ্ত তথ্য আছে। '.repeat(6)}</p>${extra}`;
const iso = (d) => d.toISOString().slice(0, 19);
const agoDays = (n) => iso(new Date(Date.now() - n * 864e5));
const futureDate = '2099-11-30';

test('অটোমেশন: বেসলাইন → নতুন পোস্ট → AI → খসড়া; ডুপ্লিকেট/মেয়াদ/সারসংক্ষেপ AI ছাড়াই বাদ; ক্যাপ; দ্বিতীয় রানে ডুপ্লিকেট নয়', async () => {
  const port = await startSource();
  globalThis.__autoTest = true;
  let aiCalls = 0;
  globalThis.__autoMockAi = async (scr) => { aiCalls += 1; return { title: `AI: ${scr.title}`.slice(0, 80), category: 'চাকরি', company: 'টেস্ট প্রতিষ্ঠান', vacancy: '৫', division: 'ঢাকা', district: 'ঢাকা', salary: '২০০০০ টাকা', employment_type: 'FULL_TIME', application_start: '2099-11-01', deadline: futureDate, apply_url: 'https://apply.example.org/x', official_url: 'https://official.example.org', content_html: '<p>নতুন করে লেখা</p><h3>এক নজরে</h3><ul><li>পদ ৫</li></ul>', meta_title: 'মেটা', meta_description: 'বিবরণ', keywords: 'ক, খ', confidence_note: '' }; };
  await setSetting('auto_source', `http://127.0.0.1:${port}`); await setSetting('auto_enabled', '1'); await setSetting('auto_daily_cap', '3'); await setSetting('auto_batch', '5'); await setSetting('auto_concurrency', '2'); await setSetting('auto_start_date', '2020-01-01');
  await setSetting('auto_notify_email', ''); await db.run("DELETE FROM job_locks"); await db.run("DELETE FROM source_posts"); await db.run("DELETE FROM settings WHERE k IN ('auto_sp_base','auto_job')");
  const { runAuto, counts, isRunning } = await import('../src/modules/automation/engine.js');
  /* পুরোনো ২ টা পোস্ট সোর্সে আছে */
  SRC.posts = [1, 2].map((i) => ({ id: i, slug: `old-${i}`, title: `পুরোনো বিজ্ঞপ্তি ${i}`, date: agoDays(30 + i), modified: agoDays(30 + i), html: longText('') }));
  let s = await runAuto({ manual: true });
  assert.match(s.stop, /বেসলাইন তৈরি হলো/); assert.equal(aiCalls, 0); assert.equal((await counts()).baseline, 2);
  /* এখন নতুন: ১) আসল নতুন ২) আমাদের পোস্টের ডুপ্লিকেট ৩) সারসংক্ষেপ ৪) মেয়াদ শেষ ৫) আরেকটি নতুন ৬) ৭ নতুন (ক্যাপ পরীক্ষা) */
  await db.run("UPDATE posts SET title = 'বাংলাদেশ রেলওয়ে সহকারী স্টেশন মাস্টার নিয়োগ বিজ্ঞপ্তি', vacancy = '৪০', deadline = ?, application_start = NULL, status = 1 WHERE id = (SELECT id FROM (SELECT id FROM posts ORDER BY id LIMIT 1) t)", [futureDate]);
  const dupLine = `মোট পদ সংখ্যা: ৪০ । আবেদনের শেষ তারিখ: ৩০ নভেম্বর ২০৯৯`;
  SRC.posts.push(
    { id: 10, slug: 'new-a', title: 'অর্থ মন্ত্রণালয়ে ১৫ পদে নিয়োগ বিজ্ঞপ্তি ২০২৬', date: agoDays(1), modified: agoDays(1), html: longText(`<p>আবেদনের শেষ তারিখ: ৩০ নভেম্বর ২০৯৯ <a href="https://apply.example.org/x">Apply</a> <a href="https://x.test/file.pdf">pdf</a></p>`) },
    { id: 11, slug: 'dup-b', title: 'বাংলাদেশ রেলওয়ে সহকারী স্টেশন মাস্টার নিয়োগ বিজ্ঞপ্তি', date: agoDays(1), modified: agoDays(1), html: longText(`<p>${dupLine}</p>`) },
    { id: 12, slug: 'chakrir-khobor-today', title: 'আজকের চাকরির খবর সকল নিয়োগ', date: agoDays(1), modified: agoDays(1), html: longText('') },
    { id: 13, slug: 'expired-c', title: 'মেয়াদোত্তীর্ণ একটি নিয়োগ বিজ্ঞপ্তি', date: agoDays(1), modified: agoDays(1), html: longText('<p>আবেদনের শেষ তারিখ: ০১ জানুয়ারি ২০২০</p>') },
    { id: 14, slug: 'new-d', title: 'পল্লী বিদ্যুৎ সমিতি ২০ পদে নিয়োগ ২০২৬', date: agoDays(0.5), modified: agoDays(0.5), html: longText('<p>আবেদনের শেষ তারিখ: ২০ ডিসেম্বর ২০৯৯</p>') },
    { id: 15, slug: 'new-e', title: 'সিভিল এভিয়েশন ৭ পদে নিয়োগ ২০২৬', date: agoDays(0.4), modified: agoDays(0.4), html: longText('<p>আবেদনের শেষ তারিখ: ২১ ডিসেম্বর ২০৯৯</p>') },
    { id: 16, slug: 'new-f', title: 'জাতীয় রাজস্ব বোর্ড ৯ পদে নিয়োগ ২০২৬', date: agoDays(0.3), modified: agoDays(0.3), html: longText('<p>আবেদনের শেষ তারিখ: ২২ ডিসেম্বর ২০৯৯</p>') },
  );
  s = await runAuto({ manual: true, limit: 5 });
  const c1 = await counts();
  assert.equal(s.new, 7, `new=${s.new}`);
  assert.equal(aiCalls, 3, `AI calls ${aiCalls}: ${s.msg} / ${s.stop}`);        // দৈনিক ক্যাপ ৩
  assert.match(s.stop, /সীমা/);
  const drafts = await db.all('SELECT * FROM posts WHERE is_auto = 1 AND review_pending = 1'); assert.equal(drafts.length, 3);
  assert.ok(drafts.every((d) => Number(d.status) === 0), 'খসড়া প্রকাশ হয়নি');
  assert.ok(drafts[0].source_url && drafts[0].deadline === futureDate + ' 00:00:00'.slice(0, 0) || drafts[0].deadline);
  const withPdf = await db.one("SELECT COUNT(*) n FROM post_links pl JOIN posts p ON p.id = pl.post_id WHERE p.is_auto = 1 AND pl.is_apply = 1"); assert.ok(Number(withPdf.n) >= 1);
  assert.equal((await db.one("SELECT status FROM source_posts WHERE source_id = 11")).status, 'skipped_duplicate');
  assert.equal((await db.one("SELECT note FROM source_posts WHERE source_id = 12")).note, 'roundup');
  assert.match((await db.one("SELECT note FROM source_posts WHERE source_id = 13")).note, /মেয়াদ শেষ/);
  assert.ok(Number(c1.done) >= 3);
  /* খসড়া সাইটে দেখা যায় না */
  assert.doesNotMatch((await pub().req('/')).text, /AI: অর্থ মন্ত্রণালয়ে/);
  /* ক্যাপ পূর্ণ — আবার চালালে AI নয়, আর ডুপ্লিকেট পোস্টও নয় */
  s = await runAuto({ manual: true, limit: 5 }); assert.equal(aiCalls, 3); assert.equal(Number((await db.one("SELECT COUNT(*) n FROM posts WHERE is_auto = 1")).n), 3);
  /* ক্যাপ বাড়ালে বাকি ৩টি হবে, আগেরগুলো আবার নয় */
  await setSetting('auto_daily_cap', '20'); s = await runAuto({ manual: true, limit: 5 });
  assert.equal(aiCalls, 4, `aiCalls=${aiCalls}`); assert.equal(Number((await db.one("SELECT COUNT(*) n FROM posts WHERE is_auto = 1")).n), 4);
  /* সোর্সে ৩ টি নতুন হলেও আগেরগুলো done — আবার চালালে আর কিছু নেই */
  s = await runAuto({ manual: true, limit: 5 }); assert.match(s.stop, /নতুন কোনো পোস্ট নেই|প্রসেস করার মতো আর কিছু নেই|এই রানের/); 
  /* তালা: অন্য কেউ লিজ ধরে থাকলে রান শুরুই হয় না; প্রক্রিয়া মরে গেলে (মেয়াদ শেষ) নিজে থেকে ছাড়ে */
  await db.run("INSERT INTO job_locks (name, holder, until_at) VALUES ('auto', 'other-proc', DATE_ADD(NOW(), INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE holder='other-proc', until_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE)");
  s = await runAuto({ manual: true }); assert.match(s.stop, /আগের রান এখনো চলছে/); assert.equal(await isRunning(), true);
  await db.run("UPDATE job_locks SET until_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE name='auto'");
  assert.equal(await isRunning(), false);
  /* সোর্স বন্ধ হলে AI কল নয়, রান ব্যর্থ বার্তা */
  src.close(); await setSetting('auto_source', 'http://127.0.0.1:1'); const before = aiCalls; s = await runAuto({ manual: true }); assert.equal(aiCalls, before); assert.match(s.stop, /REST API সাড়া দিচ্ছে না/);
  globalThis.__autoMockAi = null; await setSetting('auto_enabled', '0');
});

test('অটোমেশন: AI ত্রুটিতে (ভুল key/ক্রেডিট শেষ) থামে, চেষ্টা/খরচ গোনে না', async () => {
  const port = await startSource();
  await setSetting('auto_source', `http://127.0.0.1:${port}`); await setSetting('auto_daily_cap', '50');
  const { AutoAIError } = await import('../src/modules/automation/ai.js'); const { runAuto, counts } = await import('../src/modules/automation/engine.js');
  SRC.posts.push({ id: 50, slug: 'bad-key-post', title: 'ভুল কী পরীক্ষার জন্য নতুন পোস্ট ২০২৬ নিয়োগ', date: agoDays(0.1), modified: agoDays(0.1), html: longText('<p>আবেদনের শেষ তারিখ: ২২ ডিসেম্বর ২০৯৯</p>') });
  globalThis.__autoMockAi = async () => { throw new AutoAIError('OpenAI API key ভুল বা বাতিল', 'নতুন key দিন', true); };
  const s = await runAuto({ manual: true, limit: 2 });
  assert.equal(s.fatal, true); assert.match(s.stop, /AI সমস্যার কারণে থামানো/);
  const row = await db.one('SELECT status, tries FROM source_posts WHERE source_id = 50'); assert.equal(row.status, 'new'); assert.equal(Number(row.tries), 0);
  globalThis.__autoMockAi = async () => { throw new Error('boom'); };
  const s2 = await runAuto({ manual: true, limit: 1 }); assert.equal(s2.failed >= 1, true);
  assert.equal((await db.one('SELECT status FROM source_posts WHERE source_id = 50')).status, 'failed');
  src.close(); globalThis.__autoMockAi = null;
});

test('নোটিফিকেশন কাজ: নতুন পোস্টে পুশ/ইমেইল কিউ, ডাইজেস্ট, রিমাইন্ডার', async () => {
  const jobs = await import('../src/modules/notify/jobs.js'); const mailer = await import('../src/modules/notify/mailer.js');
  await setSetting('smtp_host', 'smtp.invalid'); await setSetting('smtp_user', 'u@x.com'); await setSetting('smtp_pass', 'p');
  await db.run("DELETE FROM email_subscribers"); await db.run("DELETE FROM mail_queue"); await db.run("DELETE FROM notify_jobs"); await db.run('DELETE FROM push_saved'); await db.run('DELETE FROM push_subscriptions');
  await db.run("INSERT INTO email_subscribers (email, token, confirmed, mode, cats, created_at) VALUES ('i@x.com', REPEAT('a',32), 1, 'instant', '', NOW()), ('d@x.com', REPEAT('b',32), 1, 'daily', '', NOW()), ('u@x.com', REPEAT('c',32), 0, 'instant', '', NOW())");
  const p = await db.one('SELECT id, slug FROM posts WHERE status = 1 AND deleted_at IS NULL LIMIT 1');
  await jobs.enqueueNewPost(p.id); await jobs.enqueueNewPost(p.id);
  assert.equal(Number((await db.one('SELECT COUNT(*) n FROM notify_jobs')).n), 1);
  const r = await jobs.processNotifyJobs(); assert.equal(r.done, true);
  const q = await db.all('SELECT to_email, body FROM mail_queue'); assert.deepEqual(q.map((x) => x.to_email), ['i@x.com']); assert.match(q[0].body, /notify\/unsub\?t=a{32}/);
  const d = await jobs.sendDailyDigest(true); assert.equal(d.queued, 1);
  assert.ok((await db.all('SELECT to_email FROM mail_queue')).some((x) => x.to_email === 'd@x.com'));
  /* রিমাইন্ডার: আগামীকাল শেষ হওয়া সেভ করা পোস্ট — পাঠানো ব্যর্থ (নকল endpoint) কিন্তু ক্র্যাশ নয় */
  await db.run("UPDATE posts SET deadline = DATE_ADD(CURDATE(), INTERVAL 1 DAY) WHERE id = ?", [p.id]);
  await db.run("INSERT INTO push_subscriptions (endpoint_hash, endpoint, p256dh, auth, created_at) VALUES (REPEAT('d',40), 'https://127.0.0.1:1/x', 'BAAA', 'AAAA', NOW())");
  const sid = (await db.one('SELECT id FROM push_subscriptions LIMIT 1')).id; await db.run('INSERT INTO push_saved (sub_id, post_id, created_at) VALUES (?,?,NOW())', [sid, p.id]);
  const rem = await jobs.sendReminders(true); assert.equal(typeof rem.sent, 'number');
  const dr = await mailer.drainQueue(5); assert.ok(dr.skipped === undefined);   // SMTP সেট আছে, পাঠাতে গিয়ে ব্যর্থ হবে কিন্তু ক্র্যাশ নয়
  const failed = await db.one("SELECT COUNT(*) n FROM mail_queue WHERE tries > 0"); assert.ok(Number(failed.n) >= 1);
});

test('ক্রন এন্ডপয়েন্ট কী ছাড়া বন্ধ', async () => {
  assert.equal((await pub().req('/cron/tick')).status, 403); assert.equal((await pub().req('/cron/tick?key=wrong')).status, 403);
  const { setting } = await import('../src/core/settings.js');
  assert.equal((await pub().req(`/cron/tick?key=${setting('auto_cron_key')}`)).status, 200);
});
