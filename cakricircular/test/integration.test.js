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

  let slug; let postId;
  await t.test('create post with auto-compressed thumbnail', async () => {
    const sharp = require('sharp');
    const w = 1600; const h = 1200;
    const noise = require('crypto').randomBytes(w * h * 3);
    const big = await sharp(noise, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    assert.ok(big.length > 1024 * 1024, 'test image should be >1MB');
    const cats = await req('GET', '/v2admin/posts/new');
    const catId = cats.text.match(/<option value="(\d+)"[^>]*>সরকারি চাকরি/)[1];
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

  await t.test('restart keeps config (no reinstall needed)', async () => {
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    await startServer();
    assert.strictEqual((await req('GET', '/')).status, 200);
  });
});
