/* টেস্টের সাহায্যকারী: কুকিসহ HTTP ক্লায়েন্ট */
export class Client {
  constructor(base) { this.base = base; this.jar = {}; }
  cookie() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const res = await fetch(this.base + path, { method, body, redirect: 'manual', headers: { ...headers, cookie: this.cookie() } });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i); const v = kv.slice(i + 1); if (v === '' || /Max-Age=0/i.test(c)) delete this.jar[k]; else this.jar[k] = v; }
    return { status: res.status, headers: res.headers, text: raw ? null : await res.text(), res };
  }
  form(path, data) { return this.req(path, { method: 'POST', body: new URLSearchParams(data).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); }
  multipart(path, fields, files = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) fd.append(k, x);
    for (const [k, list] of Object.entries(files)) for (const f of [].concat(list)) fd.append(k, new Blob([f.buffer], { type: f.type }), f.name);
    return this.req(path, { method: 'POST', body: fd });
  }
}
export const csrfOf = (html) => /name="_t" value="([^"]+)"/.exec(html)?.[1];
