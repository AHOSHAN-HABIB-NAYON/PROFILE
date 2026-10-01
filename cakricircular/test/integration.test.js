'use strict';
/**
 * End-to-end tests: boots the real server against a throw-away MySQL database,
 * with mock WordPress + mock OpenAI servers for the automation pipeline.
 *
 *   TEST_DB_NAME=chakri_test TEST_DB_USER=... TEST_DB_PASS=... npm test
 * Skipped automatically when no test database is configured/reachable.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');

const DB = {
  host: process.env.TEST_DB_HOST || 'localhost', port: Number(process.env.TEST_DB_PORT || 3306),
  user: process.env.TEST_DB_USER || 'chakri', password: process.env.TEST_DB_PASS || 'chakri123', name: process.env.TEST_DB_NAME || 'chakri_test',
};

let server; let base; let mock; let mockBase; let dataDir; let cookie = ''; let csrf = '';
let aiCalls = 0;
const wpPosts = [];

function futureDate(days) { const d = new Date(Date.now() + days * 86400000); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; }

async function dbReachable() {
  try {
    const c = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password, database: DB.name });
    const [tables] = await c.query('SHOW TABLES');
    for (const t of tables) await c.query(`DROP TABLE \`${Object.values(t)[0]}\``);
    await c.end();
    return true;
  } catch (e) { console.log('# integration skipped:', e.message); return false; }
}

async function req(method, url, { body, headers = {}, form, raw } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = `cc_admin=${cookie}`;
  let payload = body;
  if (form) { payload = new URLSearchParams(form).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
  else if (body && !(body instanceof FormData) && typeof body !== 'string') { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const res = await fetch(base + url, { method, body: payload, headers: h, redirect: 'manual' });
  const text = raw ? Buffer.from(await res.arrayBuffer()) : await res.text();
  return { status: res.status, headers: res.headers, text, json: () => JSON.parse(text) };
}
async function admin(url, fields = {}, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) (Array.isArray(v) ? v : [v]).forEach((x) => fd.append(k, x));
  for (const [k, f] of Object.entries(files)) fd.append(k, new Blob([f.buf], { type: f.type }), f.name);
  const r = await req('POST', `/v2admin${url}`, { body: fd, headers: { 'x-csrf-token': csrf, accept: 'application/json' } });
  return { status: r.status, ...(r.text.startsWith('{') ? r.json() : { raw: r.text }) };
}

function startMock() {
  return new Promise((resolve) => {
    mock = http.createServer(async (rq, rs) => {
      if (rq.url.startsWith('/wp-json/wp/v2/posts')) { rs.setHeader('content-type', 'application/json'); return rs.end(JSON.stringify(wpPosts)); }
      if (rq.url === '/img.png') {
        const sharp = require('sharp');
        const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#16a34a' } }).png().toBuffer();
        rs.setHeader('content-type', 'image/png'); return rs.end(png);
      }
      if (rq.url === '/v1/models') { rs.setHeader('content-type', 'application/json'); return rs.end('{"data":[]}'); }
      if (rq.url === '/v1/chat/completions') {
        let b = ''; for await (const c of rq) b += c;
        aiCalls++;
        const msg = JSON.parse(b).messages[1].content;
        const title = (msg.match(/শিরোনাম: (.+)/) || [])[1] || 'x';
        const out = {
          title: `${title} (সম্পাদিত)`, excerpt: 'সংক্ষেপ', content_html: '<p>ভূমিকা</p><h2>এক নজরে</h2><table><tr><th>পদ</th><td>১০</td></tr></table><script>alert(1)</script>',
          organization: 'পরীক্ষা প্রতিষ্ঠান', vacancies: '১০', salary: '২০,০০০ টাকা', division: 'ঢাকা', district: 'ঢাকা', job_type: 'স্থায়ী', education: 'স্নাতক',
          start_date: new Date().toISOString().slice(0, 10), deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
          apply_url: 'https://apply.example.com', category: /বৃত্তি|স্কলারশিপ/.test(title) ? 'স্কলারশিপ' : 'সরকারি চাকরি',
          keywords: ['পরীক্ষা', 'নিয়োগ'], meta_title: 'মেটা', meta_description: 'মেটা বিবরণ', is_roundup: false, is_expired: false,
        };
        rs.setHeader('content-type', 'application/json');
        return rs.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }));
      }
      rs.statusCode = 404; rs.end('nf');
    }).listen(0, () => { mockBase = `http://127.0.0.1:${mock.address().port}`; resolve(); });
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    dataDir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
    const port = 3900 + Math.floor(Math.random() * 90);
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, CC_DATA_DIR: dataDir, PORT: String(port), CC_NO_SCHEDULER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const onData = (d) => { log += d; if (log.includes('listening')) resolve(); };
    server.stdout.on('data', onData); server.stderr.on('data', (d) => { log += d; });
    server.on('exit', (c) => reject(new Error(`server exited ${c}: ${log}`)));
    setTimeout(() => reject(new Error(`server start timeout: ${log}`)), 15000);
  });
}

test('integration', async (t) => {
  if (!(await dbReachable())) { t.skip('no test database'); return; }
  await startMock();
  await startServer();
  t.after(() => { server.kill(); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

  await t.test('redirects to installer before install', async () => {
    const r = await req('GET', '/');
    assert.strictEqual(r.status, 302);
    assert.match(r.headers.get('location'), /\/install$/);
  });

  await t.test('installer creates config outside code and locks itself', async () => {
    const r = await req('POST', '/install', { form: { db_host: DB.host, db_port: DB.port, db_name: DB.name, db_user: DB.user, db_pass: DB.password, site_name: 'চাকরি সার্কুলার', site_domain: 'cakricircular.com', admin_user: 'admin', admin_email: 'admin@example.com', admin_pass: 'Admin@12345', admin_path: 'v2admin' } });
    assert.strictEqual(r.status, 200, r.text.slice(0, 500));
    assert.match(r.text, /ইনস্টলেশন সম্পন্ন/);
    assert.ok(fs.existsSync(path.join(dataDir, 'config.json')));
    assert.strictEqual((await req('GET', '/install')).status, 404);
  });

  await t.test('home renders with schema, cache and partial navigation', async () => {
    const a = await req('GET', '/');
    assert.strictEqual(a.status, 200);
    assert.match(a.text, /"@type":"Organization"/);
    assert.match(a.text, /"@type":"WebSite"/);
    assert.strictEqual(a.headers.get('x-cache'), 'MISS');
    assert.strictEqual((await req('GET', '/')).headers.get('x-cache'), 'HIT');
    const p = await req('GET', '/categories', { headers: { 'x-partial': '1' } });
    assert.match(p.headers.get('content-type'), /json/);
    assert.match(p.json().body, /ক্যাটাগরি সমূহ/);
  });

  await t.test('login is rate-limited', async () => {
    const tok = (await req('GET', '/v2admin/login')).text.match(/name="_t" value="([^"]+)"/)[1];
    let last;
    for (let i = 0; i < 6; i++) last = await req('POST', '/v2admin/login', { form: { username: 'admin', password: 'bad', _t: tok }, headers: { 'x-forwarded-for': '10.9.9.9' } });
    assert.strictEqual(last.status, 429);
    assert.match(last.text, /মিনিট পর আবার চেষ্টা করুন/);
    const good = await req('POST', '/v2admin/login', { form: { username: 'admin', password: 'Admin@12345', _t: tok }, headers: { 'x-forwarded-for': '10.9.9.9' } });
    assert.strictEqual(good.status, 429, 'locked IP cannot log in even with the right password');
  });

  await t.test('admin login + CSRF protection', async () => {
    const tok = (await req('GET', '/v2admin/login')).text.match(/name="_t" value="([^"]+)"/)[1];
    const r = await req('POST', '/v2admin/login', { form: { username: 'admin', password: 'Admin@12345', _t: tok } });
    assert.strictEqual(r.status, 302);
    cookie = r.headers.get('set-cookie').match(/cc_admin=([a-f0-9]+)/)[1];
    assert.match(r.headers.get('set-cookie'), /HttpOnly/);
    const dash = await req('GET', '/v2admin');
    assert.strictEqual(dash.status, 200);
    csrf = dash.text.match(/"csrf":"([a-f0-9]+)"/)[1];
    const bad = await req('POST', '/v2admin/cache/clear', { headers: { accept: 'application/json' } });
    assert.strictEqual(bad.status, 403);
  });

  let slug; let postId; let catId;
  await t.test('create post with auto-compressed thumbnail', async () => {
    const sharp = require('sharp');
    const w = 1600; const h = 1200;
    const noise = require('crypto').randomBytes(w * h * 3);
    const big = await sharp(noise, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    assert.ok(big.length > 1024 * 1024, 'test image should be >1MB');
    const cats = await req('GET', '/v2admin/posts/new');
    catId = cats.text.match(/<option value="(\d+)"[^>]*>সরকারি চাকরি/)[1];
    const r = await admin('/posts/new', { title: 'রেলওয়ে ১৩৮০ পদে নিয়োগ বিজ্ঞপ্তি', category_id: catId, organization: 'বাংলাদেশ রেলওয়ে', vacancies: '১৩৮০', deadline: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), content: '<p>বিস্তারিত<script>x()</script></p>', status: 'published' }, { thumbnail: { buf: big, type: 'image/png', name: 'big.png' } });
    assert.ok(r.ok, JSON.stringify(r));
    postId = Number(r.redirect.split('/').pop());
    const c = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password, database: DB.name });
    const [[row]] = await c.query('SELECT slug, thumbnail, content FROM posts WHERE id = ?', [postId]);
    await c.end();
    slug = row.slug;
    assert.strictEqual(slug, 'রেলওয়ে-১৩৮০-পদে-নিয়োগ-বিজ্ঞপ্তি');
    assert.ok(!row.content.includes('<script'));
    assert.match(row.thumbnail, /\.webp$/);
    const size = fs.statSync(path.join(dataDir, 'uploads', row.thumbnail)).size;
    const target = 100 * 1024 + ((big.length / 1048576) - 1) * 87.5 * 1024;
    assert.ok(size <= target * 1.05, `compressed ${size} > target ${target}`);
    const page = await req('GET', `/post/${encodeURIComponent(slug)}`);
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /"@type":"JobPosting"/);
    assert.match(page.text, /"@type":"BreadcrumbList"/);
    assert.match(page.text, /data-countdown=/);
  });

  await t.test('slug change → 301 from old URL', async () => {
    const r = await admin(`/posts/${postId}`, { title: 'রেলওয়ে ১৩৮০ পদে নিয়োগ বিজ্ঞপ্তি', slug: 'রেলওয়ে-নিয়োগ-২০২৬', category_id: '1', status: 'published' });
    assert.ok(r.ok, JSON.stringify(r));
    const old = await req('GET', `/post/${encodeURIComponent(slug)}`);
    assert.strictEqual(old.status, 301);
    assert.strictEqual(decodeURIComponent(old.headers.get('location')), '/post/রেলওয়ে-নিয়োগ-২০২৬');
    slug = 'রেলওয়ে-নিয়োগ-২০২৬';
  });

  await t.test('upload validation & uploads folder hardening', async () => {
    const r = await admin('/banners/new', {}, { image: { buf: Buffer.from('<?php system($_GET[1]); ?>'), type: 'image/jpeg', name: 'x.jpg' } });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /ছবি/);
    assert.strictEqual((await req('GET', '/uploads/evil.php')).status, 403);
    assert.strictEqual((await req('GET', '/uploads/../config.json')).status === 200, false);
  });

  await t.test('search, sitemap, robots, manifest', async () => {
    const s = await req('GET', `/search?q=${encodeURIComponent('রেলওয়ে')}`);
    assert.match(s.text, /রেলওয়ে ১৩৮০ পদে নিয়োগ/);
    const sm = await req('GET', '/sitemap.xml');
    assert.match(sm.text, /sitemap-posts-1\.xml/);
    const sp = await req('GET', '/sitemap-posts-1.xml');
    assert.ok(sp.text.includes(encodeURIComponent(slug)));
    assert.match((await req('GET', '/robots.txt')).text, /Sitemap:/);
    const m = JSON.parse((await req('GET', '/manifest.webmanifest')).text);
    assert.strictEqual(m.display, 'standalone');
    assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
    assert.ok(m.screenshots.some((i) => i.form_factor === 'wide'));
  });

  await t.test('report form: token + rate limit', async () => {
    const saved = cookie; cookie = '';
    const page = await req('GET', '/report');
    const tok = page.text.match(/name="_t" value="([^"]+)"/)[1];
    assert.strictEqual((await req('POST', '/api/report', { body: { type: 'ভুল তথ্য', message: 'তারিখ ভুল আছে', _t: 'bad' } })).status, 400);
    await new Promise((r) => setTimeout(r, 1600));
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await req('POST', '/api/report', { body: { type: 'ভুল তথ্য', message: 'তারিখ ভুল আছে', _t: tok, post_id: postId }, headers: { 'x-forwarded-for': '10.1.1.1' } })).status);
    assert.deepStrictEqual(statuses, [200, 200, 200, 200, 200, 429]);
    cookie = saved;
  });

  await t.test('maintenance mode: visitors see 503, admins see the site', async () => {
    assert.ok((await admin('/settings', { maintenance: '1', maintenance_title: 'রক্ষণাবেক্ষণ চলছে' })).ok);
    const saved = cookie; cookie = '';
    const r = await req('GET', '/');
    assert.strictEqual(r.status, 503);
    assert.match(r.text, /রক্ষণাবেক্ষণ চলছে/);
    cookie = saved;
    assert.strictEqual((await req('GET', '/')).status, 200);
    assert.ok((await admin('/settings', { maintenance: '0' })).ok);
  });

  await t.test('settings change shows up instantly', async () => {
    assert.ok((await admin('/settings', { tagline: 'নতুন ট্যাগলাইন', hero_subtitle: 'পরীক্ষামূলক সাবটাইটেল' })).ok);
    assert.match((await req('GET', '/')).text, /পরীক্ষামূলক সাবটাইটেল/);
  });

  await t.test('automation: scrape → dedupe → AI → drafts (never published)', async () => {
    const now = new Date().toISOString().slice(0, 19);
    wpPosts.push(
      { id: 101, date: now, modified: now, link: `${mockBase}/a`, title: { rendered: 'খাদ্য অধিদপ্তরে ৫০০ পদে নিয়োগ' }, content: { rendered: `<p>পদসংখ্যা: ৫০০</p><p>শেষ তারিখ ${futureDate(15)}</p>` }, excerpt: { rendered: '' }, _embedded: { 'wp:featuredmedia': [{ source_url: `${mockBase}/img.png` }] } },
      { id: 102, date: now, modified: now, link: `${mockBase}/b`, title: { rendered: 'আজকের চাকরির খবর পত্রিকা ১০ অক্টোবর' }, content: { rendered: '<p>সব চাকরি</p>' }, excerpt: { rendered: '' } },
      { id: 103, date: now, modified: now, link: `${mockBase}/c`, title: { rendered: 'পুরোনো নিয়োগ বিজ্ঞপ্তি' }, content: { rendered: '<p>শেষ তারিখ ১০/০১/২০২৫</p>' }, excerpt: { rendered: '' } },
      { id: 104, date: now, modified: now, link: `${mockBase}/d`, title: { rendered: 'রেলওয়ে ১৩৮০ পদে নিয়োগ বিজ্ঞপ্তি প্রকাশ' }, content: { rendered: '<p>পদসংখ্যা: ১৩৮০</p>' }, excerpt: { rendered: '' } },
      { id: 105, date: now, modified: now, link: `${mockBase}/e`, title: { rendered: 'কমনওয়েলথ বৃত্তি ২০২৭' }, content: { rendered: `<p>আবেদনের শেষ ${futureDate(40)}</p>` }, excerpt: { rendered: '' } },
    );
    const s = await admin('/automation/settings', { openai_key: 'sk-test', openai_model: 'gpt-4o-mini', openai_base: `${mockBase}/v1`, auto_sources: mockBase, auto_batch: '6', auto_daily_limit: '40', auto_parallel: '2', auto_interval_min: '60', auto_price_in: '0.15', auto_price_out: '0.60' });
    assert.ok(s.ok, JSON.stringify(s));
    const k = await admin('/automation/settings', { openai_base: `${mockBase}/v1`, auto_sources: mockBase, _test: '1' });
    assert.ok(k.ok, JSON.stringify(k));

    const runAndWait = async () => {
      const r = await admin('/automation/run');
      assert.ok(r.ok, JSON.stringify(r));
      const second = await admin('/automation/run');
      assert.strictEqual(second.ok, false, 'lock must prevent a parallel run');
      for (let i = 0; i < 100; i++) {
        const p = JSON.parse((await req('GET', '/v2admin/automation/poll?since=0', { headers: { 'x-admin': '1' } })).text);
        if (!p.locked && p.run && p.run.status !== 'running') return p;
        await new Promise((res) => setTimeout(res, 200));
      }
      throw new Error('automation did not finish');
    };
    let p = await runAndWait();
    assert.strictEqual(p.run.status, 'done', JSON.stringify(p));
    assert.strictEqual(aiCalls, 2, 'only the 2 genuinely new posts go to AI');
    assert.strictEqual(p.run.drafts, 2);
    const c = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password, database: DB.name });
    const [drafts] = await c.query("SELECT status, auto_generated, content, thumbnail, category_id FROM posts WHERE auto_generated = 1");
    assert.strictEqual(drafts.length, 2);
    assert.ok(drafts.every((d) => d.status === 'draft'), 'automation must never publish');
    assert.ok(drafts.every((d) => !d.content.includes('<script')));
    assert.ok(drafts.some((d) => d.thumbnail), 'featured image downloaded');
    const [items] = await c.query('SELECT source_id, status FROM automation_items ORDER BY source_id');
    const st = Object.fromEntries(items.map((i) => [i.source_id, i.status]));
    assert.deepStrictEqual(st, { 101: 'processed', 102: 'skipped', 103: 'expired', 104: 'duplicate', 105: 'processed' });

    // second run: nothing new → no AI
    p = await runAndWait();
    assert.strictEqual(aiCalls, 2);
    // source modified → draft is updated (1 AI call), not duplicated
    wpPosts[0].modified = new Date(Date.now() + 60000).toISOString().slice(0, 19);
    p = await runAndWait();
    assert.strictEqual(aiCalls, 3);
    const [[n]] = await c.query('SELECT COUNT(*) AS n FROM posts WHERE auto_generated = 1');
    assert.strictEqual(n.n, 2);
    await c.end();
  });

  await t.test('cron link requires the key', async () => {
    assert.strictEqual((await req('GET', '/cron/run?key=wrong')).status, 403);
  });

  await t.test('bulk trash & restore', async () => {
    let r = await admin('/posts/bulk', { ids: [String(postId)], action: 'trash' });
    assert.ok(r.ok);
    assert.strictEqual((await req('GET', `/post/${encodeURIComponent(slug)}`)).status, 404);
    r = await admin('/posts/bulk', { ids: [String(postId)], action: 'restore' });
    assert.ok(r.ok);
    r = await admin('/posts/bulk', { ids: [String(postId)], action: 'publish' });
    assert.ok(r.ok);
    assert.strictEqual((await req('GET', `/post/${encodeURIComponent(slug)}`)).status, 200);
  });

  await t.test('post links + gallery: saved from the editor, shown on the post page', async () => {
    const sharp = require('sharp');
    const img = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#2563eb' } }).jpeg().toBuffer();
    const fd = new FormData();
    const fields = { title: 'লিংক ও গ্যালারি পরীক্ষা পোস্ট', category_id: String(catId), status: 'published',
      'links[0][label]': 'অনলাইনে আবেদন', 'links[0][url]': 'https://apply.example.gov.bd', 'links[0][apply]': '1',
      'links[1][label]': 'মূল বিজ্ঞপ্তি', 'links[1][url]': 'https://example.gov.bd/notice.pdf',
      'links[2][label]': 'হেল্পলাইন', 'links[2][url]': 'tel:01700000000' };
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('images', new Blob([img], { type: 'image/jpeg' }), 'a.jpg');
    fd.append('images', new Blob([img], { type: 'image/jpeg' }), 'b.jpg');
    const r = await req('POST', '/v2admin/posts/new', { body: fd, headers: { 'x-csrf-token': csrf, accept: 'application/json' } });
    const d = r.json();
    assert.ok(d.ok, d.error);
    const id = Number(d.redirect.split('/').pop());
    const c = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password, database: DB.name });
    const [[p]] = await c.query('SELECT slug, apply_url FROM posts WHERE id = ?', [id]);
    const [links] = await c.query('SELECT label, url, is_apply FROM post_links WHERE post_id = ? ORDER BY sort', [id]);
    const [imgs] = await c.query('SELECT id, image FROM post_images WHERE post_id = ? ORDER BY sort', [id]);
    assert.strictEqual(p.apply_url, 'https://apply.example.gov.bd', 'first apply link becomes the main apply button');
    assert.deepStrictEqual(links.map((l) => l.url), ['https://apply.example.gov.bd', 'https://example.gov.bd/notice.pdf', 'tel:01700000000']);
    assert.strictEqual(imgs.length, 2);
    for (const im of imgs) assert.ok(/\.webp$/.test(im.image), 'gallery images are re-encoded to webp');
    const page = await req('GET', `/post/${encodeURIComponent(p.slug)}`);
    assert.match(page.text, /গুরুত্বপূর্ণ লিংক/);
    assert.match(page.text, /data-gallery/);
    assert.match(page.text, /href="tel:01700000000"/);
    assert.match(page.text, new RegExp(`og:image" content="[^"]*${imgs[0].image.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`), 'first gallery image is the share image');
    // remove one image + reorder links on edit
    const fd2 = new FormData();
    for (const [k, v] of Object.entries({ title: 'লিংক ও গ্যালারি পরীক্ষা পোস্ট', category_id: String(catId), status: 'published', slug: p.slug,
      'links[0][label]': 'হেল্পলাইন', 'links[0][url]': 'tel:01700000000', remove_images: String(imgs[0].id) })) fd2.append(k, v);
    const r2 = (await req('POST', `/v2admin/posts/${id}`, { body: fd2, headers: { 'x-csrf-token': csrf, accept: 'application/json' } })).json();
    assert.ok(r2.ok && r2.reload, 'editor reloads after file changes');
    const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM post_images WHERE post_id = ?', [id]);
    const [links2] = await c.query('SELECT url FROM post_links WHERE post_id = ?', [id]);
    await c.end();
    assert.strictEqual(Number(n), 1);
    assert.deepStrictEqual(links2.map((l) => l.url), ['tel:01700000000']);
  });

  await t.test('old PHP-site URLs redirect permanently', async () => {
    const cases = [['/promoted', '/premium'], ['/about', '/page/about'], ['/privacy', '/page/privacy'], ['/category/x/page/3', '/category/x?page=3'], ['/page/2', '/posts?page=2'], ['/index.php', '/']];
    for (const [from, to] of cases) {
      const r = await req('GET', from);
      assert.strictEqual(r.status, 301, from);
      assert.strictEqual(new URL(r.headers.get('location'), base).pathname + new URL(r.headers.get('location'), base).search, to, from);
    }
  });

  await t.test('import from the old PHP database (re-runnable, no duplicates)', async (st) => {
    const oldName = `${DB.name}_old`;
    let c;
    try {
      c = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password, multipleStatements: true });
      await c.query(`DROP DATABASE IF EXISTS \`${oldName}\`; CREATE DATABASE \`${oldName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${oldName}\``);
    } catch (e) { if (c) await c.end(); st.skip(`no permission to create ${oldName}: ${e.code}`); return; }
    await c.query(`
      CREATE TABLE settings (k VARCHAR(64) PRIMARY KEY, v LONGTEXT);
      CREATE TABLE categories (id INT PRIMARY KEY, name VARCHAR(120), slug VARCHAR(140), icon VARCHAR(60), meta_title VARCHAR(190), meta_desc VARCHAR(300), sort_order INT, is_active TINYINT);
      CREATE TABLE posts (id INT PRIMARY KEY, cat_id INT, title VARCHAR(255), slug VARCHAR(190), content LONGTEXT, thumb VARCHAR(120), pdf VARCHAR(120), division VARCHAR(60), district VARCHAR(60),
        vacancy VARCHAR(30), company VARCHAR(160), employment_type VARCHAR(30), deadline DATE, is_job TINYINT, keywords VARCHAR(300), meta_title VARCHAR(190), meta_desc VARCHAR(300), views INT,
        status TINYINT, published_at DATETIME, updated_at DATETIME, created_by INT, deleted_at DATETIME, salary VARCHAR(100), is_premium TINYINT, premium_until DATE, is_auto TINYINT,
        review_pending TINYINT, source_url VARCHAR(500), source_lastmod VARCHAR(40), auto_note TEXT, application_start DATE);
      CREATE TABLE post_links (id INT PRIMARY KEY, post_id INT, label VARCHAR(120), url VARCHAR(500), is_apply TINYINT, sort_order INT);
      CREATE TABLE post_images (id INT PRIMARY KEY, post_id INT, image VARCHAR(120), sort_order INT);
      CREATE TABLE admins (id INT PRIMARY KEY, username VARCHAR(60), pass VARCHAR(255), name VARCHAR(120), role VARCHAR(20), perms TEXT, is_active TINYINT, last_login DATETIME, created_at DATETIME);
      CREATE TABLE source_posts (source_id VARCHAR(40), source_link VARCHAR(500), title_raw VARCHAR(500), source_date DATETIME, source_modified DATETIME, status VARCHAR(30), my_post_id INT, match_post_id INT);
      INSERT INTO settings VALUES ('site_name','পুরোনো নাম'),('tagline','সঠিক তথ্য, আপনার সফলতা'),('fb','https://facebook.com/cc'),('auto_source','https://bdgovtjob.net'),('page_about','# আমরা কারা\nআমরা চাকরির খবর দিই।');
      INSERT INTO categories VALUES (11,'চাকরি','job','fa-briefcase',NULL,NULL,1,1),(12,'রেজাল্ট','result','fa-square-poll-vertical',NULL,NULL,2,1);
      INSERT INTO posts (id,cat_id,title,slug,content,pdf,vacancy,company,employment_type,deadline,is_job,views,status,published_at,updated_at,is_premium,review_pending) VALUES
        (501,11,'পুরোনো পোস্ট এক','old-one','যোগ্যতা:\n- স্নাতক','x1.pdf','১০','পুরোনো প্রতিষ্ঠান','FULL_TIME','2099-12-31',1,77,1,'2026-09-01 10:00:00','2026-09-02 10:00:00',1,0),
        (502,12,'পুরোনো পোস্ট দুই','old-two','<p>ফলাফল</p>',NULL,NULL,NULL,NULL,NULL,0,5,1,'2026-09-03 10:00:00',NULL,0,1);
      INSERT INTO post_links VALUES (1,501,'আবেদন','https://apply.old.gov.bd',1,0),(2,501,'ফোন','tel:0170000',0,1),(3,501,'','javascript:x',0,2);
      INSERT INTO post_images VALUES (1,501,'g1.jpg',0);
      INSERT INTO admins VALUES (1,'oldboss','${require('bcryptjs').hashSync('Old@pass123', 8).replace(/^\$2a\$/, '$2y$')}','Boss','super','["all"]',1,NULL,'2026-01-01 00:00:00');
      INSERT INTO source_posts VALUES ('9001','https://bdgovtjob.net/a','A','2026-09-01 10:00:00','2026-09-01 11:00:00','done',501,NULL),('9002','https://bdgovtjob.net/b','B','2026-09-02 10:00:00','2026-09-02 11:00:00','baseline',NULL,NULL);
    `);
    await c.end();
    const oldUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-old-up-'));
    fs.mkdirSync(path.join(oldUploads, 'posts')); fs.mkdirSync(path.join(oldUploads, 'pdf'));
    fs.writeFileSync(path.join(oldUploads, 'posts', 'g1.jpg'), require('fs').readFileSync(path.join(__dirname, '..', 'public', 'icons', 'icon-96.png')));
    const form = { old_host: DB.host, old_port: String(DB.port), old_name: oldName, old_user: DB.user, old_pass: DB.password, old_uploads: oldUploads, with_settings: '1', with_users: '1' };
    const chk = await admin('/import/check', form);
    assert.ok(chk.ok, chk.error);
    assert.match(chk.html, /পুরোনো ডাটাবেস পাওয়া গেছে/);
    for (let run = 0; run < 2; run++) {
      const r = await admin('/import/run', form);
      assert.ok(r.ok, r.error);
      assert.match(r.html, /x1\.pdf/, 'missing PDF is listed');
    }
    const n = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password, database: DB.name });
    const [posts] = await n.query('SELECT id, legacy_id, slug, status, pdf, organization, job_type, views, notified, is_premium FROM posts WHERE legacy_id IS NOT NULL ORDER BY legacy_id');
    const [[links]] = await n.query('SELECT COUNT(*) c FROM post_links l JOIN posts p ON p.id = l.post_id WHERE p.legacy_id = 501');
    const [[auto]] = await n.query("SELECT status, post_id FROM automation_items WHERE source_site = 'bdgovtjob.net' AND source_id = '9001'");
    const [[about]] = await n.query("SELECT content FROM pages WHERE slug = 'about'");
    await n.end();
    assert.strictEqual(posts.length, 2, 'running twice does not duplicate');
    assert.strictEqual(posts[0].status, 'published');
    assert.strictEqual(posts[1].status, 'draft', 'review_pending stays a draft');
    assert.strictEqual(posts[0].pdf, 'pdf/x1.pdf');
    assert.strictEqual(posts[0].job_type, 'স্থায়ী');
    assert.strictEqual(Number(posts[0].views), 77);
    assert.strictEqual(Number(posts[0].notified), 1, 'old posts are never push-notified');
    assert.strictEqual(Number(links.c), 2, 'unsafe link dropped, tel kept');
    assert.strictEqual(auto.status, 'processed');
    assert.strictEqual(auto.post_id, posts[0].id);
    assert.match(about.content, /<h2>আমরা কারা<\/h2>/);
    assert.ok(fs.existsSync(path.join(dataDir, 'uploads', 'posts', 'g1.jpg')), 'old uploads copied');
    const page = await req('GET', '/post/old-one');
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /apply\.old\.gov\.bd/);
    // the old admin can log in with the old password
    const saveCookie = cookie; cookie = '';
    const lp = await req('GET', '/v2admin/login');
    const tk = (lp.text.match(/name="_t" value="([^"]+)"/) || lp.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await new Promise((r) => setTimeout(r, 1600));
    const login = await req('POST', '/v2admin/login', { form: { username: 'oldboss', password: 'Old@pass123', ...(tk ? { _t: tk } : {}) } });
    assert.ok([302, 303].includes(login.status), `old admin login (${login.status})`);
    cookie = saveCookie;
    const c2 = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password });
    await c2.query(`DROP DATABASE IF EXISTS \`${oldName}\``); await c2.end();
  });

  await t.test('restart keeps config (no reinstall needed)', async () => {
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    await startServer();
    assert.strictEqual((await req('GET', '/')).status, 200);
  });
});
