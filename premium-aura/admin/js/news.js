import { api, esc, $, $$, pageHead, listPage, btn, toast, toastError, sheet, withLoading, formData, fieldsHtml } from './kit.js';
import { chip, relEl, num, confirmSheet, APP_LIST } from '/assets/js/core.js';

const CATS = [['general', 'General'], ['announcement', 'Announcement'], ['update', 'Update'], ['offer', 'Offer'], ['maintenance', 'Maintenance'], ['premium', 'Premium'], ['tips', 'Tips']];
const TOOLS = [['bold', 'fa-bold'], ['italic', 'fa-italic'], ['underline', 'fa-underline'], ['insertUnorderedList', 'fa-list-ul'], ['insertOrderedList', 'fa-list-ol'], ['h3', 'fa-heading'], ['link', 'fa-link'], ['image', 'fa-image'], ['removeFormat', 'fa-eraser']];

function localInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function editor(post, onSaved) {
  const p = post || {};
  const icons = new Set(p.app_icons || []);
  const s = sheet({
    title: p.id ? 'Edit post' : 'New post', icon: 'fa-solid fa-newspaper', wide: true,
    body: `<form data-post novalidate><div class="form-grid two">
      ${fieldsHtml([
    { name: 'title', label: 'Title', value: p.title, required: true, full: true },
    { name: 'category', label: 'Type', type: 'select', value: p.category || 'announcement', options: CATS },
    { name: 'status', label: 'Status', type: 'select', value: p.status || 'published', options: [['published', 'Published'], ['draft', 'Draft']] },
  ])}
      <div class="field" style="grid-column:1/-1"><label>Content</label>
        <div class="row-flex" style="gap:4px;margin-bottom:6px">${TOOLS.map(([c, i]) => `<button type="button" class="btn btn-ghost btn-xs" data-cmd="${c}" title="${c}"><i class="fa-solid ${i}"></i></button>`).join('')}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-imgfile></div>
        <div class="input" contenteditable="true" data-editor style="min-height:180px;overflow:auto">${p.body_html || ''}</div>
        <span class="hint">HTML is sanitised on the server (scripts, styles and event handlers are removed).</span></div>
      ${fieldsHtml([
    { name: 'image_url', label: 'Cover image URL', value: p.image_url, full: true, hint: 'Or upload below' },
    { name: 'link_url', label: 'Link URL', value: p.link_url }, { name: 'link_label', label: 'Link label', value: p.link_label },
    { name: 'published_at', label: 'Publish time', type: 'datetime-local', value: localInput(p.published_at) },
    { name: 'is_pinned', label: 'Pin to top', type: 'switch', value: !!p.is_pinned },
  ])}
      <div class="field" style="grid-column:1/-1"><label>Application icons</label><div class="row-flex">${APP_LIST.map((a) => `<label class="check"><input type="checkbox" data-icon="${a.code.toLowerCase()}" ${icons.has(a.code.toLowerCase()) ? 'checked' : ''}>${esc(a.code)}</label>`).join('')}</div></div>
      <div class="field" style="grid-column:1/-1"><label>Cover image upload</label><input type="file" class="input" accept="image/jpeg,image/png,image/webp" data-cover></div>
      <details style="grid-column:1/-1;margin-bottom:12px"><summary><strong>SEO</strong> — meta, canonical, Open Graph & Twitter</summary><div class="form-grid two" style="margin-top:10px">
      ${fieldsHtml([
    { name: 'slug', label: 'Slug', value: p.slug, placeholder: 'auto from title' },
    { name: 'meta_title', label: 'Meta title', value: p.meta_title },
    { name: 'meta_description', label: 'Meta description', type: 'textarea', rows: 2, value: p.meta_description, full: true },
    { name: 'canonical_url', label: 'Canonical URL', value: p.canonical_url, full: true },
    { name: 'og_title', label: 'OG title', value: p.og_title }, { name: 'og_image', label: 'OG image URL', value: p.og_image },
    { name: 'og_description', label: 'OG description', type: 'textarea', rows: 2, value: p.og_description, full: true },
    { name: 'twitter_card', label: 'Twitter card', type: 'select', value: p.twitter_card || 'summary_large_image', options: [['summary_large_image', 'Large image'], ['summary', 'Summary']] },
  ])}</div></details>
      <details style="grid-column:1/-1;margin-bottom:12px"><summary><strong>Demo engagement</strong> (design/testing only — always labelled DEMO to users)</summary><div class="form-grid two" style="margin-top:10px">
      ${fieldsHtml([
    { name: 'demo_likes', label: 'Demo likes', type: 'number', value: p.demo_likes || 0 },
    { name: 'demo_shares', label: 'Demo shares', type: 'number', value: p.demo_shares || 0 },
    { name: 'demo_views', label: 'Demo views', type: 'number', value: p.demo_views || 0 },
  ])}<p class="small muted" style="grid-column:1/-1">Shown only when “Demo engagement” is enabled in System Settings.</p></div></details>
      ${p.id ? '' : fieldsHtml([{ name: 'notify', label: 'Notify all users', type: 'switch', value: true }])}
      </div><div class="sheet-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${p.id ? 'Save' : 'Publish'}</button></div></form>`,
  });
  const ed = $('[data-editor]', s.el);
  const upload = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return (await api('/admin/news/image', { method: 'POST', form: fd })).url;
  };
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    ed.focus();
    const c = b.dataset.cmd;
    if (c === 'h3') document.execCommand('formatBlock', false, 'h3');
    else if (c === 'link') { const u = prompt('Link URL (https://…)'); if (u && /^https?:\/\//.test(u)) document.execCommand('createLink', false, u); }
    else if (c === 'image') $('[data-imgfile]', s.el).click();
    else document.execCommand(c);
  });
  $('[data-imgfile]', s.el).addEventListener('change', async (e) => {
    try { const url = await upload(e.target.files[0]); ed.focus(); document.execCommand('insertImage', false, url); } catch (err) { toastError(err); }
    e.target.value = '';
  });
  $('[data-post]', s.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.body_html = ed.innerHTML;
    d.app_icons = $$('[data-icon]:checked', s.el).map((x) => x.dataset.icon);
    d.published_at = d.published_at ? new Date(d.published_at).toISOString() : '';
    await withLoading(e.submitter, async () => {
      try {
        const cover = $('[data-cover]', s.el).files[0];
        if (cover) d.image_url = await upload(cover);
        const r = await api(p.id ? `/admin/news/${p.id}` : '/admin/news', { method: p.id ? 'PUT' : 'POST', body: d });
        toast(r.message); s.close(); onSaved();
      } catch (err) { toastError(err); }
    });
  });
}

export async function mount(el) {
  const list = listPage(el, {
    head: pageHead('fa-solid fa-newspaper', 'News', 'Publish announcements, updates & offers', '<button class="btn btn-primary btn-sm" data-new><i class="fa-solid fa-plus"></i>New post</button>'),
    endpoint: '/admin/news',
    filters: [{ name: 'q', type: 'search', label: 'Search title…' }, { name: 'category', type: 'select', options: [['', 'All types'], ...CATS] }],
    columns: [
      { label: 'Title', render: (n) => `<strong>${n.is_pinned ? '<i class="fa-solid fa-thumbtack"></i> ' : ''}${esc(n.title)}</strong><div class="small muted">/news/${esc(n.slug)}</div>` },
      { label: 'Type', render: (n) => chip('info', n.category) },
      { label: 'Status', render: (n) => chip(n.status) },
      { label: 'Engagement', render: (n) => `<i class="fa-solid fa-heart"></i> ${num(n.likes)} · <i class="fa-solid fa-share"></i> ${num(n.shares)} · <i class="fa-solid fa-eye"></i> ${num(n.views)}` },
      { label: 'Published', render: (n) => (n.published_at ? relEl(new Date(n.published_at).toISOString()) : '—') },
    ],
    actions: (n) => `<a class="btn btn-ghost btn-xs" href="/news/${esc(n.slug)}" target="_blank" rel="noopener" title="View public page"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>${btn('edit', 'fa-solid fa-pen', 'Edit')}${btn('delete', 'fa-solid fa-trash', 'Delete', 'btn-danger')}`,
    async onAction(a, n, ctx) {
      if (a === 'edit') { const r = await api(`/admin/news/${n.id}`); return editor(r.item, ctx.reload); }
      if (a === 'delete' && await confirmSheet({ title: 'Delete post?', message: n.title, confirm: 'Delete', danger: true })) { toast((await api(`/admin/news/${n.id}`, { method: 'DELETE' })).message); ctx.reload(); }
    },
  });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-new]')) editor(null, list.reload); });
}
