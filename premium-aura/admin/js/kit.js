/* Admin UI kit: filterable/paginated/bulk-selectable tables and form sheets. */
import { api, esc, $, $$, toast, toastError, sheet, pageHead, pagination, debounce, withLoading, formData } from '/assets/js/core.js';

export { api, esc, $, $$, toast, toastError, sheet, pageHead, withLoading, formData };

/**
 * Render a list page.
 * opts: { head, endpoint, columns:[{label, render(row)}], filters:[{name, type:'search'|'select', label, options:[[v,l]]}],
 *         actions(row) → html, onAction(name, row, ctx), bulk:[{action,label,danger}], onBulk(action, ids, ctx), above, empty }
 */
export function listPage(el, opts) {
  const st = { page: 1, filters: {}, rows: [] };
  el.innerHTML = `${opts.head || ''}${opts.above || ''}
    <div class="card">
      ${opts.filters?.length ? `<div class="row-flex" style="margin-bottom:12px" data-filters>${opts.filters.map((f) => (f.type === 'select'
    ? `<select class="input" style="width:auto;min-height:40px;padding:8px 12px" name="${esc(f.name)}" aria-label="${esc(f.label || f.name)}">${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`
    : `<div class="search-box" style="flex:1;min-width:180px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="${esc(f.name)}" placeholder="${esc(f.label || 'Search…')}"></div>`)).join('')}</div>` : ''}
      ${opts.bulk?.length ? `<div class="row-flex hidden" data-bulkbar style="margin-bottom:10px;padding:8px 10px;border-radius:12px;background:var(--grad-soft)">
        <strong data-selcount>0</strong> selected ${opts.bulk.map((b) => `<button class="btn btn-xs ${b.danger ? 'btn-danger' : 'btn-ghost'}" data-bulk="${esc(b.action)}">${esc(b.label)}</button>`).join('')}</div>` : ''}
      <div data-table></div><div data-pages></div>
    </div>`;

  const ctx = { reload: () => load(st.page), el, state: st };

  async function load(page = 1) {
    st.page = page;
    const box = $('[data-table]', el);
    box.innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton" style="height:44px;margin-bottom:8px"></div>').join('');
    try {
      const r = await api(opts.endpoint, { query: { page, ...st.filters } });
      st.rows = r.items;
      opts.onData?.(r, ctx);
      if (opts.row) {
        box.innerHTML = r.items.length ? `<div class="row-list">${r.items.map((row, i) => `<div data-i="${i}">${opts.row(row)}</div>`).join('')}</div>`
          : `<div class="empty"><i class="fa-solid fa-inbox"></i><div>${esc(opts.empty || 'Nothing here yet')}</div></div>`;
        $('[data-pages]', el).innerHTML = pagination(r.pagination, load);
        return;
      }
      box.innerHTML = r.items.length ? `<div class="table-wrap"><table class="table responsive"><thead><tr>
        ${opts.bulk?.length ? '<th style="width:32px"><input type="checkbox" data-selall aria-label="Select all"></th>' : ''}
        ${opts.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}${opts.actions ? '<th></th>' : ''}</tr></thead><tbody>
        ${r.items.map((row, i) => `<tr data-i="${i}">${opts.bulk?.length ? `<td data-label="Select"><input type="checkbox" data-sel value="${esc(row.id)}"></td>` : ''}
          ${opts.columns.map((c) => `<td data-label="${esc(c.label)}">${c.render(row)}</td>`).join('')}
          ${opts.actions ? `<td class="actions">${opts.actions(row)}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : `<div class="empty"><i class="fa-solid fa-inbox"></i><div>${esc(opts.empty || 'Nothing here yet')}</div></div>`;
      $('[data-pages]', el).innerHTML = pagination(r.pagination, load);
      updateBulk();
    } catch (err) { box.innerHTML = ''; toastError(err); }
  }

  function selected() { return $$('[data-sel]:checked', el).map((c) => Number(c.value)); }
  function updateBulk() {
    const bar = $('[data-bulkbar]', el);
    if (!bar) return;
    const n = selected().length;
    bar.classList.toggle('hidden', !n);
    $('[data-selcount]', bar).textContent = n;
  }

  const onFilter = debounce(() => {
    st.filters = Object.fromEntries($$('[data-filters] [name]', el).map((i) => [i.name, i.value.trim()]).filter(([, v]) => v));
    load(1);
  }, 300);
  $$('[data-filters] [name]', el).forEach((i) => i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', onFilter));

  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-selall]')) $$('[data-sel]', el).forEach((c) => { c.checked = e.target.checked; });
    if (e.target.matches('[data-sel],[data-selall]')) updateBulk();
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bulk]');
    if (b) {
      try { await opts.onBulk(b.dataset.bulk, selected(), ctx); } catch (err) { toastError(err); }
      return;
    }
    const a = e.target.closest('[data-a]');
    if (a && opts.onAction) {
      const tr = a.closest('tr, [data-i]');
      const row = tr ? st.rows[Number(tr.dataset.i)] : null;
      try { await withLoading(a, () => opts.onAction(a.dataset.a, row, ctx, a)); } catch (err) { toastError(err); }
    }
  });

  load(1);
  return ctx;
}

/** Build form fields HTML. field: { name, label, type, value, options, hint, required, placeholder, rows, full, attrs } */
export function fieldsHtml(fields) {
  return fields.map((f) => {
    const v = f.value ?? '';
    const req = f.required ? 'required' : '';
    let input;
    if (f.type === 'select') {
      input = `<select class="input" name="${esc(f.name)}" ${req}>${f.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea class="input" name="${esc(f.name)}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}" ${req} ${f.attrs || ''}>${esc(v)}</textarea>`;
    } else if (f.type === 'switch') {
      return `<div class="field" style="grid-column:1/-1"><label class="switch"><input type="checkbox" name="${esc(f.name)}" ${v ? 'checked' : ''}><span class="track"></span><span>${esc(f.label)}</span></label>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
    } else if (f.type === 'html') {
      return f.html;
    } else {
      input = `<input class="input" type="${esc(f.type || 'text')}" name="${esc(f.name)}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${req} ${f.attrs || ''}>`;
    }
    return `<div class="field" ${f.full ? 'style="grid-column:1/-1"' : ''}><label>${esc(f.label)}</label>${input}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
  }).join('');
}

/** Open a bottom sheet with a form; onSubmit(data, sheetApi, form) should return a promise. */
export function formSheet({ title, icon = 'fa-solid fa-pen', fields, submitLabel = 'Save', onSubmit, wide = false, two = true, extra = '' }) {
  const s = sheet({
    title, icon, wide,
    body: `<form data-form novalidate><div class="form-grid ${two ? 'two' : ''}">${fieldsHtml(fields)}</div>${extra}
      <div class="sheet-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${esc(submitLabel)}</button></div></form>`,
  });
  const form = $('[data-form]', s.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.submitter, async () => {
      try {
        const res = await onSubmit(formData(form), s, form);
        if (res?.message) toast(res.message);
        if (res !== false) s.close();
      } catch (err) { toastError(err); }
    });
  });
  return s;
}

export const btn = (a, icon, title, cls = 'btn-ghost') => `<button class="btn btn-xs ${cls}" data-a="${esc(a)}" title="${esc(title)}" aria-label="${esc(title)}"><i class="${esc(icon)}"></i></button>`;
export const tbtn = (a, label, cls = 'btn-ghost') => `<button class="btn btn-xs ${cls}" data-a="${esc(a)}">${esc(label)}</button>`;

/**
 * Shared "who gets told, and how" panel: all users or specific users (by email),
 * a message, and the channels (in-app bell, email, browser push).
 * `toggle: true` adds an on/off switch that reveals the panel.
 */
export function notifyPanelHtml({ toggle = false, title = '', body = '', showTitle = true } = {}) {
  return `<div class="notify-panel" data-notify-panel>
    ${toggle ? '<label class="switch" style="margin-bottom:10px"><input type="checkbox" name="notify" data-notify-on><span class="track"></span><span>Notify users</span></label>' : ''}
    <div class="notify-body" ${toggle ? 'hidden' : ''}>
      <div class="field"><label>Send to</label><div class="seg">
        <label><input type="radio" name="notify_to" value="all" checked><span><i class="fa-solid fa-users"></i>All users</span></label>
        <label><input type="radio" name="notify_to" value="users"><span><i class="fa-solid fa-user"></i>Specific users</span></label></div></div>
      <div class="field" data-notify-users hidden><label>Choose users <span class="muted small" data-picked-count></span></label>
        <div class="picked" data-picked></div>
        <div class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" data-user-search placeholder="Search name or email…" autocomplete="off"></div>
        <div class="user-pick-list" data-user-list></div>
        <input type="hidden" name="notify_users"></div>
      ${showTitle ? `<div class="field"><label>Title</label><input class="input" name="notify_title" maxlength="160" value="${esc(title)}" placeholder="New numbers available"></div>` : ''}
      <div class="field"><label>Message</label><textarea class="input" name="notify_body" rows="3" maxlength="500" placeholder="Write your message…">${esc(body)}</textarea></div>
      <div class="field"><label>Send by</label><div class="chk-row">
        <label class="chk"><input type="checkbox" name="ch_inapp" checked><span><i class="fa-regular fa-bell"></i>In-app</span></label>
        <label class="chk"><input type="checkbox" name="ch_email"><span><i class="fa-regular fa-envelope"></i>Email</span></label>
        <label class="chk"><input type="checkbox" name="ch_push" checked><span><i class="fa-regular fa-paper-plane"></i>Push</span></label></div>
        <span class="hint">Users who turned a channel off in their settings are skipped. Email needs SMTP.</span></div>
    </div></div>`;
}

export function bindNotifyPanel(root) {
  const panel = root.querySelector('[data-notify-panel]');
  if (!panel) return;
  const picked = new Map(); // email → name
  const q = (sel) => panel.querySelector(sel);
  let loaded = false;
  const renderPicked = () => {
    q('[name=notify_users]').value = [...picked.keys()].join(',');
    q('[data-picked-count]').textContent = picked.size ? `· ${picked.size} selected` : '';
    q('[data-picked]').innerHTML = [...picked].map(([email, name]) => `<span class="pick-chip">${esc(name || email)}<button type="button" data-unpick="${esc(email)}" aria-label="Remove">×</button></span>`).join('');
    panel.querySelectorAll('[data-pick-user]').forEach((c) => { c.checked = picked.has(c.value); });
  };
  const load = async (term = '') => {
    const box = q('[data-user-list]');
    box.innerHTML = '<div class="small muted" style="padding:8px">Loading…</div>';
    try {
      const r = await api('/admin/users', { query: { q: term, status: 'active', pageSize: 50 } });
      box.innerHTML = r.items.length ? r.items.map((u) => `<label class="pick-row"><input type="checkbox" data-pick-user value="${esc(u.email)}" data-name="${esc(u.name)}" ${picked.has(u.email) ? 'checked' : ''}>
          <span class="avatar">${esc(String(u.name || u.email).charAt(0).toUpperCase())}</span><span class="pick-text"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span></label>`).join('')
        : '<div class="small muted" style="padding:8px">No users found</div>';
    } catch (err) { box.innerHTML = ''; toastError(err); }
  };
  const sync = () => {
    const on = q('[data-notify-on]');
    q('.notify-body').hidden = !!on && !on.checked;
    const specific = q('[name=notify_to][value=users]').checked;
    q('[data-notify-users]').hidden = !specific;
    if (specific && !loaded) { loaded = true; load(); }
  };
  panel.addEventListener('change', (e) => {
    const c = e.target.closest('[data-pick-user]');
    if (c) { if (c.checked) picked.set(c.value, c.dataset.name); else picked.delete(c.value); renderPicked(); return; }
    sync();
  });
  panel.addEventListener('click', (e) => { const x = e.target.closest('[data-unpick]'); if (x) { picked.delete(x.dataset.unpick); renderPicked(); } });
  q('[data-user-search]').addEventListener('input', debounce((e) => load(e.target.value.trim()), 300));
  panel.reset = () => { picked.clear(); renderPicked(); };
  sync();
}

/** The panel's values with explicit 1/0 for every channel (safe for JSON and multipart). */
export function notifyValues(root) {
  const q = (s) => root.querySelector(s);
  const on = q('[data-notify-on]');
  const out = {
    notify: on ? (on.checked ? '1' : '0') : '1',
    notify_to: q('[name=notify_to]:checked')?.value || 'all',
    notify_users: q('[name=notify_users]')?.value || '',
    notify_body: q('[name=notify_body]')?.value || '',
    ch_inapp: q('[name=ch_inapp]')?.checked ? '1' : '0',
    ch_email: q('[name=ch_email]')?.checked ? '1' : '0',
    ch_push: q('[name=ch_push]')?.checked ? '1' : '0',
  };
  const t = q('[name=notify_title]');
  if (t && t.value.trim()) out.notify_title = t.value;
  if (!out.notify_body.trim()) delete out.notify_body;
  return out;
}
