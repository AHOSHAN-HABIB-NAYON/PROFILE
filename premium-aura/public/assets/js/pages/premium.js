import { api, esc, $, $$, toast, toastError, pageHead, copyText, withLoading, relEl, chip, sheet, money, num, state, BINANCE_LOGO, TETHER_LOGO } from '../core.js';

export async function mount(el, ctx) {
  const reload = () => ctx.navigate(location.pathname, { replace: true, scroll: false });
  const r = await api('/premium');
  let selected = r.plans.find((p) => p.is_featured) || r.plans[0];
  const l = r.limits;
  const m = r.methods;

  el.innerHTML = `${pageHead('fa-solid fa-crown', 'Premium Services', 'Get more limits & features')}
  <div class="upgrade-banner" style="margin-bottom:16px"><i class="fa-solid fa-crown crown"></i>
    <div style="flex:1"><strong style="font-size:16px">${l.premium ? `${esc(l.premium.plan)} is active` : 'Need More Numbers & OTPs?'}</strong>
    <div class="small" style="opacity:.85">${l.premium ? `Valid until ${esc(new Date(l.premium.expires_at).toISOString().slice(0, 10))} · ${l.quota === null ? 'Unlimited' : `${num(l.quota_used)} / ${num(l.quota)}`} resources used`
    : `Free plan · ${num(l.quota_used)} / ${num(l.quota)} today · ${num(l.free_hourly_limit)}/hour. Upgrade for more numbers and faster speed.`}</div></div></div>

  <div class="card"><div class="card-head"><h2>VIP Member Plans</h2></div>
    <div class="plan-grid" data-plans>${r.plans.map((p) => `
      <div class="plan-card ${p.is_featured ? 'featured' : ''} ${selected?.id === p.id ? 'selected' : ''}" data-plan="${p.id}" tabindex="0" role="button">
        <div class="dur">${esc(p.name)}</div><div class="price">${esc(money(p.price))}</div>
        <div class="lim">${p.resource_limit === null ? 'No limit' : `${num(p.resource_limit)} numbers`}</div>
        ${p.hourly_limit ? `<div class="speed-tag"><i class="fa-solid fa-bolt"></i> ${num(p.hourly_limit)}/hour${p.daily_limit ? ` · ${num(p.daily_limit)}/day` : ''}</div>` : ''}
        <div class="small muted" style="margin-top:6px">${esc(p.description || '')}</div></div>`).join('')}</div>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h2>Payment Methods</h2></div>
      ${m.trc20 || m.binance ? `<div class="method-tabs" role="tablist">
        ${m.trc20 ? `<button type="button" class="method-tab" data-method="trc20" role="tab">${TETHER_LOGO}<span>TRC20 (USDT)</span></button>` : ''}
        ${m.binance ? `<button type="button" class="method-tab" data-method="binance" role="tab"><span class="bn-logo">${BINANCE_LOGO}</span><span>Binance Pay</span></button>` : ''}
      </div>` : ''}
      ${m.trc20 ? `<div class="pay-method" data-panel="trc20">
          <img class="qr" src="${esc(m.trc20.qr)}" alt="TRC20 QR code"><div class="address-box">${esc(m.trc20.address)}</div>
          <button class="btn btn-primary btn-sm btn-block" data-copy="${esc(m.trc20.address)}"><i class="fa-regular fa-copy"></i>Copy Address</button>
          <div class="small muted">${esc(m.trc20.note || '')}</div></div>` : ''}
      ${m.binance ? `<div class="pay-method" data-panel="binance">
          ${m.binance.qr ? `<img class="qr" src="${esc(m.binance.qr)}" alt="Binance Pay QR">` : ''}
          <div class="bn-uid"><span class="bn-logo">${BINANCE_LOGO}</span> UID: <strong class="mono">${esc(m.binance.uid)}</strong> <button class="btn btn-ghost btn-xs" data-copy="${esc(m.binance.uid)}"><i class="fa-regular fa-copy"></i></button></div>
          ${m.binance.name ? `<div class="small muted">${esc(m.binance.name)}</div>` : ''}
          ${m.binance.link ? `<a class="btn btn-binance btn-sm btn-block" href="${esc(m.binance.link)}" target="_blank" rel="noopener"><span class="bn-logo">${BINANCE_LOGO}</span>Binance Pay Direct</a>` : ''}</div>` : ''}
      ${!m.trc20 && !m.binance ? '<div class="empty"><i class="fa-solid fa-credit-card"></i><div>Payment methods are not configured yet.</div></div>' : ''}
    </div>
    <div class="card"><div class="card-head"><h2>Pay Now</h2><span class="link small muted" data-selected></span></div>
      <form data-pay>
        <input type="hidden" name="method" value="${m.trc20 ? 'trc20' : 'binance'}">
        <div class="field"><label>Transaction ID / Reference</label><input class="input" name="transaction_ref" maxlength="190" placeholder="TX hash or Binance order ID"></div>
        <div class="field"><label>Payment screenshot</label>
          <label class="dropzone" data-drop><input type="file" name="screenshot" accept="image/jpeg,image/png,image/webp" hidden>
          <i class="fa-solid fa-cloud-arrow-up" style="font-size:22px;color:var(--primary)"></i><div class="small">Tap to upload · JPG, PNG, WEBP · max ${m.upload_max_mb} MB</div><div data-preview></div></label></div>
        <button class="btn btn-primary btn-block" type="submit" ${!m.trc20 && !m.binance ? 'disabled' : ''}><i class="fa-solid fa-paper-plane"></i>Submit Payment</button>
      </form>
      <div class="divider"></div>
      <button class="btn btn-soft btn-block" data-wallet-buy><i class="fa-solid fa-wallet"></i>Pay with wallet balance (<span data-wallet>${esc(money(state.wallet?.balance))}</span>)</button>
    </div>
  </div>

  <div class="card" style="margin-top:16px"><div class="card-head"><h2>My Payments</h2></div>
    <div class="list">${r.payments.length ? r.payments.map((p) => `<div class="list-item"><span class="li-ic payment"><i class="fa-solid fa-receipt"></i></span>
      <div class="li-body"><div class="li-title">${esc(p.plan_name || 'Plan')} · ${esc(money(p.amount))}</div><div class="li-sub">${esc(p.method.toUpperCase())} · ${relEl(p.created_at)}${p.admin_note ? ` · ${esc(p.admin_note)}` : ''}</div></div>
      <div class="li-end">${chip(p.status)}</div></div>`).join('') : '<div class="empty"><i class="fa-solid fa-receipt"></i><div>No payments yet</div></div>'}</div></div>`;

  const setSelected = () => { $('[data-selected]', el).textContent = selected ? `${selected.name} · ${money(selected.price)}` : ''; };
  setSelected();
  // Only the chosen payment method is shown.
  const chooseMethod = (method) => {
    $$('[data-method]', el).forEach((b) => b.classList.toggle('active', b.dataset.method === method));
    $$('[data-panel]', el).forEach((p) => { p.hidden = p.dataset.panel !== method; });
    const input = $('[data-pay] [name=method]', el);
    if (input) input.value = method;
  };
  chooseMethod(m.trc20 ? 'trc20' : 'binance');
  el.addEventListener('click', (e) => { const t = e.target.closest('[data-method]'); if (t) chooseMethod(t.dataset.method); });

  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-plan]');
    if (p) {
      selected = r.plans.find((x) => x.id === Number(p.dataset.plan));
      $$('[data-plan]', el).forEach((c) => c.classList.toggle('selected', c === p));
      setSelected();
    }
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy, c);
  });

  const file = $('[name=screenshot]', el);
  const drop = $('[data-drop]', el);
  file.addEventListener('change', () => {
    const f = file.files[0];
    const prev = $('[data-preview]', el);
    if (!f) { prev.innerHTML = ''; return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { toast('Only JPG, PNG or WEBP images', 'error'); file.value = ''; return; }
    if (f.size > m.upload_max_mb * 1024 * 1024) { toast(`Max ${m.upload_max_mb} MB`, 'error'); file.value = ''; return; }
    prev.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="Screenshot preview">`;
  });
  ['dragover', 'dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.toggle('drag', t === 'dragover');
    if (t === 'drop' && e.dataTransfer.files[0]) { file.files = e.dataTransfer.files; file.dispatchEvent(new Event('change')); }
  }));

  $('[data-pay]', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selected) return toast('Choose a plan', 'warning');
    const fd = new FormData(e.target);
    fd.set('plan_id', selected.id);
    if (!file.files[0]) fd.delete('screenshot');
    await withLoading(e.submitter, async () => {
      try {
        const res = await api('/payment', { method: 'POST', form: fd });
        toast(res.message);
        reload();
      } catch (err) { toastError(err); }
    });
  });

  $('[data-wallet-buy]', el).addEventListener('click', async (e) => {
    if (!selected) return;
    const s = sheet({
      title: 'Confirm purchase', icon: 'fa-solid fa-wallet',
      body: `<p>Activate <strong>${esc(selected.name)}</strong> for <strong>${esc(money(selected.price))}</strong> using your wallet balance?</p>`,
      foot: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-ok>Pay Now</button>',
    });
    s.el.querySelector('[data-ok]').addEventListener('click', async (ev) => {
      await withLoading(ev.currentTarget, async () => {
        try { const res = await api('/premium/wallet', { method: 'POST', body: { plan_id: selected.id } }); s.close(); toast(res.message); reload(); } catch (err) { toastError(err); }
      });
    });
  });
}
