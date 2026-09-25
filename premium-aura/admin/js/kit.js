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
