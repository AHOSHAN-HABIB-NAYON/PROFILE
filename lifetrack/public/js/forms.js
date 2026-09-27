/* Quick Add bottom sheet + all create/edit forms (transactions, loans, goals, reminders, notes, accounts). */
import { $, $$, el, html, raw, icon, payMark, api, state, t, toast, openSheet, formErrors, withBusy, segmented, money, uid, emit,
  localDateStr, localDateTimeInput, inputToIso, fmtDay, currencyOf, ApiError } from './core.js';

export async function ensureRefs(force = false) {
  if (!state.accounts || force) state.accounts = await api.get('/api/accounts', { force: true });
  if (!state.categories || force) state.categories = await api.get('/api/categories', { force: true });
}
export const changed = (what) => { state.accounts = null; emit('data:changed', what); };

const successBurst = () => el(html`<div style="display:grid;place-items:center;padding:26px 0 18px;gap:10px;animation:scaleIn .3s var(--spring)">
  <svg class="success-check" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none" stroke="var(--green)" stroke-width="3"/><path fill="none" stroke="var(--green)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" d="m15 27 7.5 7.5L38 19"/></svg>
  <b>${t('common.saved')}</b></div>`);
async function celebrate(sheet) {
  sheet.body.replaceChildren(successBurst()); sheet.el.querySelector('.sheet-foot')?.remove();
  await new Promise((r) => setTimeout(r, 750)); sheet.close();
}

/* ---------------- Quick Add ---------------- */
const QUICK = [
  ['income', 'income', '#12A150'], ['expense', 'expense', '#E0434B'], ['investment', 'trend-up', '#7446E6'], ['lend', 'lend', '#EE8A0B'], ['borrow', 'borrow', '#DB2777'],
  ['deposit', 'piggy', '#0E9F98'], ['transfer', 'transfer', '#1E4FD8'], ['goal', 'target', '#0891B2'], ['note', 'note', '#64748B'], ['reminder', 'alarm', '#D97706'],
];
export function quickAdd() {
  $$('.fab').forEach((f) => f.classList.add('open'));
  const body = el(html`<div><div class="qadd">${QUICK.map(([k, ic, c], i) => html`<button data-k="${k}" style="animation-delay:${i * 25}ms"><span class="tile" style="--c:${c}">${icon(ic)}</span>${t('quick.' + k)}</button>`)}</div>
    <div class="row" style="margin-top:4px"><button class="btn btn-soft btn-sm" data-k="mood">${icon('smile', 'i-sm')}${t('quick.mood')}</button><button class="btn btn-soft btn-sm" data-k="account">${icon('wallet', 'i-sm')}${t('quick.account')}</button></div></div>`);
  const s = openSheet({ title: t('quick.title'), body, onClose: () => $$('.fab').forEach((f) => f.classList.remove('open')) });
  $$('button[data-k]', body).forEach((b) => b.onclick = () => {
    const k = b.dataset.k; s.close();
    setTimeout(() => {
      if (['income', 'expense', 'investment', 'deposit', 'transfer'].includes(k)) openTxForm(k);
      else if (k === 'lend') openLoanForm('lent'); else if (k === 'borrow') openLoanForm('borrowed');
      else if (k === 'goal') openGoalForm(); else if (k === 'note') openNoteForm(); else if (k === 'reminder') openReminderForm();
      else if (k === 'account') openAccountForm(); else if (k === 'mood') import('./views/mood.js').then((m) => m.openMoodForm());
    }, 120);
  });
}

/* ---------------- Transaction form ---------------- */
const catKind = (type) => (type === 'investment' ? 'investment' : ['income', 'deposit'].includes(type) ? 'income' : 'expense');
function accPicker(name, accounts, selected) {
  return html`<div class="acc-pick" role="radiogroup" data-name="${name}">${accounts.map((a) => html`<button type="button" role="radio" aria-checked="${String(a.id) === String(selected)}" class="${String(a.id) === String(selected) ? 'active' : ''}" data-id="${a.id}">${payMark(a.type)}<span>${a.name}<small>${money(a.balance, a.currency)}</small></span></button>`)}</div>`;
}
function bindPicker(root, onPick) {
  $$('button', root).forEach((b) => b.onclick = () => { $$('button', root).forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); }); onPick(b.dataset.id); });
}

export async function openTxForm(type = 'expense', { tx = null, account_id = null } = {}) {
  try { await ensureRefs(); } catch (e) { toast(e.message, { type: 'error' }); return; }
  const accounts = state.accounts.filter((a) => !a.archived_at);
  if (!accounts.length) { toast(t('tx.need_account'), { type: 'info' }); openAccountForm(); return; }
  const editing = !!tx;
  let cur = { type: tx?.type || type, account_id: tx?.account_id || account_id || accounts[0].id, to_account_id: accounts[1]?.id || null, category_id: tx?.category_id || null };
  const idem = uid();
  const body = el(html`<form novalidate autocomplete="off">
    ${editing ? '' : html`<div class="seg type-tabs" data-types>${['expense', 'income', 'transfer', 'investment', 'deposit'].map((k) => html`<button type="button" data-v="${k}" class="${k === cur.type ? 'active' : ''}">${t('tx.type.' + k)}</button>`)}</div>`}
    <div class="amount-box field"><span class="cur" data-cur></span><input class="amount-input" name="amount" inputmode="decimal" placeholder="0" value="${tx ? Number(tx.amount) : ''}" aria-label="${t('tx.amount')}" autofocus></div>
    <div class="field"><label>${t('tx.account')}</label><div data-acc></div></div>
    <div class="field" data-to-wrap hidden><label>${t('tx.to_account')}</label><div data-to></div></div>
    <div class="field" data-to-amt hidden><label>${t('tx.to_amount')}</label><input class="input" name="to_amount" inputmode="decimal"></div>
    <div class="field" data-inv hidden><label>${t('tx.investment_name')}</label><input class="input" name="investment_name" maxlength="120" placeholder="${t('tx.investment_name_ph')}"></div>
    <div class="field" data-cat-wrap><label>${t('tx.category')}</label><div class="cat-pick" data-cats></div></div>
    <div class="row"><div class="field"><label>${t('tx.datetime')}</label><input class="input" type="datetime-local" name="occurred_at" value="${localDateTimeInput(tx ? new Date(tx.occurred_at) : new Date())}"></div></div>
    <div class="field"><label>${t('tx.note')}</label><input class="input" name="note" maxlength="500" value="${tx?.note || ''}" placeholder="${t('tx.note_ph')}"></div>
    <div class="field"><label>${t('tx.tags')}</label><input class="input" name="tags" maxlength="200" value="${tx?.tags || ''}" placeholder="${t('tx.tags_ph')}"></div>
    <label class="file-drop">${icon('paperclip', 'i-sm')}<span data-file>${t('tx.attach')}</span><input type="file" name="file" accept="image/*,application/pdf"></label>
  </form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${editing ? t('common.save_changes') : t('tx.save')}</button>`);
  const s = openSheet({ title: editing ? t('tx.edit') : t('tx.new'), body, foot });
  const form = body;
  const accOf = (id) => accounts.find((a) => String(a.id) === String(id)) || state.accounts.find((a) => String(a.id) === String(id));

  const renderAcc = () => {
    const a = $('[data-acc]', form); a.replaceChildren(el(accPicker('account_id', accounts, cur.account_id))); bindPicker(a.firstElementChild, (id) => { cur.account_id = id; refresh(); });
    const tw = $('[data-to]', form); const others = accounts.filter((x) => String(x.id) !== String(cur.account_id));
    if (!others.find((x) => String(x.id) === String(cur.to_account_id))) cur.to_account_id = others[0]?.id || null;
    tw.replaceChildren(el(accPicker('to_account_id', others, cur.to_account_id))); bindPicker(tw.firstElementChild, (id) => { cur.to_account_id = id; refresh(); });
  };
  const renderCats = () => {
    const kind = catKind(cur.type);
    const cats = state.categories.filter((c) => c.kind === kind);
    if (!cats.find((c) => String(c.id) === String(cur.category_id))) cur.category_id = editing && tx.category_id ? tx.category_id : cats[0]?.id || null;
    $('[data-cats]', form).innerHTML = String(html`${cats.map((c) => html`<button type="button" data-id="${c.id}" class="${String(c.id) === String(cur.category_id) ? 'active' : ''}"><span class="tile" style="--c:${c.color}">${icon(c.icon)}</span>${c.name}</button>`)}`);
    $$('[data-cats] button', form).forEach((b) => b.onclick = () => { cur.category_id = b.dataset.id; $$('[data-cats] button', form).forEach((x) => x.classList.toggle('active', x === b)); });
  };
  const refresh = () => {
    const a = accOf(cur.account_id); const to = accOf(cur.to_account_id);
    $('[data-cur]', form).textContent = `${currencyOf(a?.currency).symbol} ${a?.currency || ''}`;
    $('[data-to-wrap]', form).hidden = cur.type !== 'transfer';
    $('[data-to-amt]', form).hidden = !(cur.type === 'transfer' && to && a && to.currency !== a.currency);
    $('[data-inv]', form).hidden = cur.type !== 'investment' || editing;
    $('[data-cat-wrap]', form).hidden = cur.type === 'transfer';
  };
  renderAcc(); renderCats(); refresh();
  if (!editing) segmented($('[data-types]', form), (v) => { cur.type = v; renderCats(); refresh(); });
  const fileIn = form.querySelector('input[type=file]');
  fileIn.onchange = () => { $('[data-file]', form).textContent = fileIn.files[0]?.name || t('tx.attach'); };

  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = new FormData(form);
    const payload = { amount: String(f.get('amount') || '').replace(/,/g, ''), account_id: Number(cur.account_id), category_id: cur.type === 'transfer' ? null : Number(cur.category_id) || null,
      occurred_at: inputToIso(f.get('occurred_at')), note: f.get('note') || undefined, tags: f.get('tags') || undefined };
    try {
      let saved;
      if (editing) saved = await api.patch(`/api/transactions/${tx.id}`, payload);
      else {
        Object.assign(payload, { type: cur.type });
        if (cur.type === 'transfer') { payload.to_account_id = Number(cur.to_account_id); if (!$('[data-to-amt]', form).hidden) payload.to_amount = f.get('to_amount'); }
        if (cur.type === 'investment') payload.investment_name = f.get('investment_name') || undefined;
        saved = await api.post('/api/transactions', payload, { idem });
      }
      if (fileIn.files[0]) { try { await api.upload(`/api/transactions/${saved.id}/attachment`, fileIn.files[0]); } catch (er) { toast(er.message, { type: 'error' }); } }
      changed('tx'); await celebrate(s);
      toast(editing ? t('tx.updated') : t('tx.saved_toast', { amount: money(saved.amount, saved.currency) }));
    } catch (er) {
      if (er instanceof ApiError && er.status === 0 && !editing && !navigator.onLine) {
        const { add } = await import('./outbox.js');
        add({ key: idem, body: { ...payload, type: cur.type }, preview: { ...payload, type: cur.type, currency: accOf(cur.account_id)?.currency, account_name: accOf(cur.account_id)?.name }, at: Date.now() });
        s.close(); toast(t('outbox.queued'), { type: 'warn', timeout: 5000 }); emit('data:changed', 'outbox');
        return;
      }
      toast(er.message, { type: 'error' }); formErrors(form, er);
    }
  });
}

/* ---------------- Lending / borrowing ---------------- */
export async function openLoanForm(kind = 'lent') {
  try { await ensureRefs(); } catch (e) { toast(e.message, { type: 'error' }); return; }
  const accounts = state.accounts.filter((a) => !a.archived_at);
  if (!accounts.length) { openAccountForm(); return; }
  let accountId = accounts[0].id;
  const idem = uid();
  const due = new Date(Date.now() + 14 * 864e5);
  const body = el(html`<form novalidate autocomplete="off">
    <div class="seg type-tabs" data-kind><button type="button" data-v="lent" class="${kind === 'lent' ? 'active' : ''}">${t('loan.i_lent')}</button><button type="button" data-v="borrowed" class="${kind === 'borrowed' ? 'active' : ''}">${t('loan.i_borrowed')}</button></div>
    <div class="amount-box field"><span class="cur" data-cur></span><input class="amount-input" name="amount" inputmode="decimal" placeholder="0" aria-label="${t('tx.amount')}" autofocus></div>
    <div class="field"><label data-person-l></label><input class="input" name="person_name" maxlength="120" placeholder="${t('loan.person_ph')}"></div>
    <div class="field"><label>${t('loan.contact')}</label><input class="input" name="contact" maxlength="190" placeholder="${t('loan.contact_ph')}"></div>
    <div class="field"><label>${t('tx.account')}</label><div data-acc></div></div>
    <div class="row"><div class="field"><label data-given-l></label><input class="input" type="date" name="given_at" value="${localDateStr()}"></div>
      <div class="field"><label>${t('loan.due_date')}</label><input class="input" type="date" name="due_date" value="${localDateStr(due)}"></div></div>
    <div class="field"><label>${t('tx.note')}</label><input class="input" name="note" maxlength="500"></div>
    <div class="alert" data-preview>${icon('alarm', 'i-sm')}<span></span></div>
  </form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${t('common.save')}</button>`);
  const s = openSheet({ title: t('loan.new'), body, foot });
  const form = body;
  const acc = () => accounts.find((a) => String(a.id) === String(accountId));
  const upd = () => {
    const f = new FormData(form);
    $('[data-cur]', form).textContent = `${currencyOf(acc().currency).symbol} ${acc().currency}`;
    $('[data-person-l]', form).textContent = t(kind === 'lent' ? 'loan.lent_to' : 'loan.borrowed_from');
    $('[data-given-l]', form).textContent = t(kind === 'lent' ? 'loan.given_date' : 'loan.received_date');
    const amount = money(f.get('amount') || 0, acc().currency); const person = f.get('person_name') || '…';
    const dueS = f.get('due_date') ? fmtDay(f.get('due_date'), 'long') : '—';
    $('[data-preview] span', form).textContent = t(kind === 'lent' ? 'loan.preview_lent' : 'loan.preview_borrowed', { amount, person, due: dueS });
  };
  const a = $('[data-acc]', form); a.replaceChildren(el(accPicker('account_id', accounts, accountId))); bindPicker(a.firstElementChild, (id) => { accountId = id; upd(); });
  segmented($('[data-kind]', form), (v) => { kind = v; upd(); });
  form.addEventListener('input', upd); upd();
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = new FormData(form);
    try {
      await api.post('/api/loans', { kind, person_name: f.get('person_name'), contact: f.get('contact') || undefined, amount: f.get('amount'), account_id: Number(accountId), given_at: f.get('given_at'), due_date: f.get('due_date') || null, note: f.get('note') || undefined }, { idem });
      changed('loan'); await celebrate(s); toast(t('loan.saved'));
    } catch (er) { toast(er.message, { type: 'error' }); formErrors(form, er); }
  });
}

export async function openRepayForm(loan) {
  await ensureRefs();
  const accounts = state.accounts.filter((a) => !a.archived_at && a.currency === loan.currency);
  if (!accounts.length) { toast(t('loan.no_matching_account'), { type: 'error' }); return; }
  let accountId = accounts.find((a) => a.id === loan.account_id)?.id || accounts[0].id;
  const rest = (Number(loan.amount) - Number(loan.paid_amount)).toFixed(2);
  const idem = uid();
  const body = el(html`<form novalidate>
    <div class="amount-box field"><span class="cur">${currencyOf(loan.currency).symbol} ${loan.currency}</span><input class="amount-input" name="amount" inputmode="decimal" value="${Number(rest)}" autofocus></div>
    <p class="hint" style="text-align:center;margin:-6px 0 12px">${t('loan.remaining')}: <b>${money(rest, loan.currency)}</b></p>
    <div class="field"><label>${t(loan.kind === 'lent' ? 'loan.received_into' : 'loan.paid_from')}</label><div data-acc></div></div>
    <div class="field"><label>${t('loan.payment_date')}</label><input class="input" type="date" name="paid_at" value="${localDateStr()}"></div>
    <div class="field"><label>${t('tx.note')}</label><input class="input" name="note" maxlength="255"></div></form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${t('loan.record_payment')}</button>`);
  const s = openSheet({ title: t(loan.kind === 'lent' ? 'loan.receive_payment' : 'loan.make_payment'), body, foot });
  const a = $('[data-acc]', body); a.replaceChildren(el(accPicker('account_id', accounts, accountId))); bindPicker(a.firstElementChild, (id) => { accountId = id; });
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = new FormData(body);
    try { await api.post(`/api/loans/${loan.kind}/${loan.id}/payments`, { amount: f.get('amount'), account_id: Number(accountId), paid_at: f.get('paid_at'), note: f.get('note') || undefined }, { idem }); changed('loan'); await celebrate(s); }
    catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); }
  });
}

/* ---------------- Goals ---------------- */
export const GOAL_KINDS = { phone: ['phone', '#2F62F0'], bike: ['bike', '#E0434B'], car: ['car', '#0EA5A0'], emergency: ['umbrella', '#12A150'], travel: ['plane', '#0891B2'],
  education: ['graduation', '#7446E6'], home: ['house', '#EE8A0B'], wedding: ['ring', '#DB2777'], laptop: ['laptop', '#475569'], custom: ['target', '#1E4FD8'] };
export async function openGoalForm(goal = null) {
  let kind = goal?.kind || 'custom';
  const body = el(html`<form novalidate autocomplete="off">
    <div class="field"><label>${t('goal.type')}</label><div class="cat-pick" data-kinds>${Object.entries(GOAL_KINDS).map(([k, [ic, c]]) => html`<button type="button" data-k="${k}" class="${k === kind ? 'active' : ''}"><span class="tile" style="--c:${c}">${icon(ic)}</span>${t('goal.kind.' + k)}</button>`)}</div></div>
    <div class="field"><label>${t('goal.name')}</label><input class="input" name="name" maxlength="120" value="${goal?.name || ''}" placeholder="${t('goal.name_ph')}"></div>
    <div class="row"><div class="field"><label>${t('goal.target')}</label><input class="input" name="target_amount" inputmode="decimal" value="${goal ? Number(goal.target_amount) : ''}"></div>
      <div class="field"><label>${t('goal.saved')}</label><input class="input" name="current_amount" inputmode="decimal" value="${goal ? Number(goal.current_amount) : ''}" placeholder="0" ${goal ? 'disabled' : ''}></div></div>
    <div class="field"><label>${t('goal.deadline')}</label><input class="input" type="date" name="deadline" value="${goal?.deadline ? String(goal.deadline).slice(0, 10) : ''}"></div>
    <div class="field"><label>${t('tx.note')}</label><input class="input" name="note" maxlength="500" value="${goal?.note || ''}"></div>
    <label class="file-drop">${icon('image', 'i-sm')}<span data-file>${t('goal.image')}</span><input type="file" accept="image/*"></label></form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${goal ? t('common.save_changes') : t('goal.create')}</button>`);
  const s = openSheet({ title: goal ? t('goal.edit') : t('goal.new'), body, foot });
  $$('[data-kinds] button', body).forEach((b) => b.onclick = () => {
    kind = b.dataset.k; $$('[data-kinds] button', body).forEach((x) => x.classList.toggle('active', x === b));
    const n = body.querySelector('[name=name]'); if (!n.value || Object.keys(GOAL_KINDS).some((k) => t('goal.kind.' + k) === n.value)) n.value = kind === 'custom' ? '' : t('goal.kind.' + kind);
  });
  const fileIn = body.querySelector('input[type=file]'); fileIn.onchange = () => { $('[data-file]', body).textContent = fileIn.files[0]?.name || t('goal.image'); };
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = new FormData(body);
    const payload = { name: f.get('name'), kind, icon: GOAL_KINDS[kind][0], color: GOAL_KINDS[kind][1], target_amount: f.get('target_amount'), deadline: f.get('deadline') || null, note: f.get('note') || undefined };
    if (!goal && f.get('current_amount')) payload.current_amount = f.get('current_amount');
    try {
      const g = goal ? await api.patch(`/api/goals/${goal.id}`, payload) : await api.post('/api/goals', payload);
      if (fileIn.files[0]) await api.upload(`/api/goals/${g.id}/image`, fileIn.files[0]).catch((er) => toast(er.message, { type: 'error' }));
      changed('goal'); await celebrate(s);
    } catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); }
  });
}
export function openContributeForm(goal) {
  let mode = 'add';
  const body = el(html`<form novalidate><div class="seg type-tabs" data-mode><button type="button" data-v="add" class="active">${t('goal.add_money')}</button><button type="button" data-v="withdraw">${t('goal.withdraw')}</button></div>
    <div class="amount-box field"><span class="cur">${currencyOf(goal.currency).symbol} ${goal.currency}</span><input class="amount-input" name="amount" inputmode="decimal" placeholder="0" autofocus></div>
    <p class="hint" style="text-align:center">${t('goal.remaining')}: <b>${money(goal.remaining, goal.currency)}</b></p></form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${t('common.save')}</button>`);
  const s = openSheet({ title: goal.name, body, foot });
  segmented($('[data-mode]', body), (v) => { mode = v; });
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const v = String(new FormData(body).get('amount') || '').trim();
    try { const g = await api.post(`/api/goals/${goal.id}/contribute`, { amount: (mode === 'withdraw' ? '-' : '') + v }); changed('goal'); await celebrate(s); if (g.completed_at && !goal.completed_at) toast(t('goal.reached_toast', { goal: g.name })); }
    catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); }
  });
}

/* ---------------- Reminders ---------------- */
export function openReminderForm(rem = null) {
  const due = rem ? new Date(rem.due_at) : new Date(Date.now() + 864e5);
  const body = el(html`<form novalidate autocomplete="off">
    <div class="field"><label>${t('rem.title')}</label><input class="input" name="title" maxlength="160" value="${rem?.title || ''}" placeholder="${t('rem.title_ph')}"></div>
    <div class="row"><div class="field"><label>${t('rem.type')}</label><select class="select" name="type">${['bill', 'payment', 'custom'].map((k) => html`<option value="${k}" ${rem?.type === k ? 'selected' : ''}>${t('rem.type.' + k)}</option>`)}</select></div>
      <div class="field"><label>${t('rem.amount')}</label><input class="input" name="amount" inputmode="decimal" value="${rem?.amount ? Number(rem.amount) : ''}"></div></div>
    <div class="field"><label>${t('rem.due')}</label><input class="input" type="datetime-local" name="due_at" value="${localDateTimeInput(due)}"></div>
    <div class="row"><div class="field"><label>${t('rem.notify')}</label><select class="select" name="remind_before_min">${[[0, 'rem.at_time'], [60, 'rem.1h'], [1440, 'rem.1d'], [4320, 'rem.3d'], [10080, 'rem.1w']].map(([v, k]) => html`<option value="${v}">${t(k)}</option>`)}</select></div>
      <div class="field"><label>${t('rem.repeat')}</label><select class="select" name="repeat_rule">${['none', 'daily', 'weekly', 'monthly', 'yearly'].map((k) => html`<option value="${k}" ${rem?.repeat_rule === k ? 'selected' : ''}>${t('rem.repeat.' + k)}</option>`)}</select></div></div>
    <div class="field"><label>${t('tx.note')}</label><input class="input" name="body" maxlength="500" value="${rem?.body || ''}"></div></form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${t('common.save')}</button>`);
  const s = openSheet({ title: rem ? t('rem.edit') : t('rem.new'), body, foot });
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = new FormData(body);
    const p = { title: f.get('title'), type: f.get('type'), amount: f.get('amount') || null, due_at: inputToIso(f.get('due_at')), remind_before_min: Number(f.get('remind_before_min')), repeat_rule: f.get('repeat_rule'), body: f.get('body') || undefined };
    try { rem ? await api.patch(`/api/reminders/${rem.id}`, p) : await api.post('/api/reminders', p); changed('reminder'); await celebrate(s); }
    catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); }
  });
}

/* ---------------- Notes ---------------- */
export function openNoteForm(note = null) {
  const body = el(html`<form novalidate><div class="field"><label>${t('note.title')}</label><input class="input" name="title" maxlength="160" value="${note?.title || ''}"></div>
    <div class="field"><label>${t('note.body')}</label><textarea class="textarea" name="body" rows="6" maxlength="5000">${note?.body || ''}</textarea></div>
    <label class="check"><input type="checkbox" name="pinned" ${note?.pinned ? 'checked' : ''}>${t('note.pin')}</label></form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${t('common.save')}</button>`);
  const s = openSheet({ title: note ? t('note.edit') : t('note.new'), body, foot });
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = new FormData(body); const p = { title: f.get('title'), body: f.get('body'), pinned: !!f.get('pinned') };
    try { note ? await api.patch(`/api/notes/${note.id}`, p) : await api.post('/api/notes', p); changed('note'); await celebrate(s); }
    catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); }
  });
}

/* ---------------- Accounts ---------------- */
export const ACC_TYPES = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card', 'wallet'];
export function openAccountForm(acc = null) {
  let type = acc?.type || 'bkash';
  const currencies = state.config?.currencies || [];
  const body = el(html`<form novalidate autocomplete="off">
    <div class="field"><label>${t('acc.type')}</label><div class="cat-pick" data-types>${ACC_TYPES.map((k) => html`<button type="button" data-k="${k}" class="${k === type ? 'active' : ''}">${payMark(k)}${t('acc.type.' + k)}</button>`)}</div></div>
    <div class="field"><label>${t('acc.name')}</label><input class="input" name="name" maxlength="80" value="${acc?.name || t('acc.type.' + type)}"></div>
    ${acc ? '' : html`<div class="row"><div class="field"><label>${t('acc.currency')}</label><select class="select" name="currency">${currencies.map((c) => html`<option value="${c.code}" ${c.code === (state.profile?.currency || 'BDT') ? 'selected' : ''}>${c.code} ${c.symbol}</option>`)}</select></div>
      <div class="field"><label>${t('acc.opening')}</label><input class="input" name="opening_balance" inputmode="decimal" placeholder="0"></div></div>`}
    <div class="field"><label>${t('acc.number_hint')}</label><input class="input" name="number_hint" maxlength="4" inputmode="numeric" pattern="[0-9]*" value="${acc?.number_hint || ''}" placeholder="1234"></div>
    <label class="check"><input type="checkbox" name="include_in_total" ${!acc || acc.include_in_total ? 'checked' : ''}>${t('acc.include_total')}</label></form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${acc ? t('common.save_changes') : t('acc.create')}</button>`);
  const s = openSheet({ title: acc ? t('acc.edit') : t('acc.new'), body, foot });
  $$('[data-types] button', body).forEach((b) => b.onclick = () => {
    const prevName = t('acc.type.' + type); type = b.dataset.k; $$('[data-types] button', body).forEach((x) => x.classList.toggle('active', x === b));
    const n = body.querySelector('[name=name]'); if (!n.value || n.value === prevName) n.value = t('acc.type.' + type);
  });
  const idem = uid();
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    const f = new FormData(body);
    const p = { name: f.get('name'), type, number_hint: f.get('number_hint') || null, include_in_total: !!f.get('include_in_total') };
    if (!acc) Object.assign(p, { currency: f.get('currency'), opening_balance: f.get('opening_balance') || undefined, idempotency_key: idem });
    try { acc ? await api.patch(`/api/accounts/${acc.id}`, p) : await api.post('/api/accounts', p); changed('account'); await celebrate(s); }
    catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); }
  });
}
export function openAdjustForm(acc) {
  const body = el(html`<form novalidate><p class="hint" style="margin-bottom:10px">${t('acc.adjust_hint')}</p>
    <div class="amount-box field"><span class="cur">${currencyOf(acc.currency).symbol} ${acc.currency}</span><input class="amount-input" name="balance" inputmode="decimal" value="${Number(acc.balance)}" autofocus></div></form>`);
  const foot = el(html`<button class="btn btn-primary btn-lg btn-block" data-save>${t('acc.adjust')}</button>`);
  const s = openSheet({ title: t('acc.adjust'), body, foot });
  const idem = uid();
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    try { await api.post(`/api/accounts/${acc.id}/adjust`, { balance: new FormData(body).get('balance'), idempotency_key: idem }); changed('account'); await celebrate(s); }
    catch (er) { toast(er.message, { type: 'error' }); formErrors(body, er); }
  });
}
export { raw };
