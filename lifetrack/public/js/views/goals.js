/* Goals with animated progress rings/bars, remaining amount & days, contributions. */
import { $, $$, el, html, icon, api, t, money, fmtDay, ring, animateProgress, emptyState, errorState, on, toast, openSheet, confirmDialog, countUp } from '../core.js';
import { openGoalForm, openContributeForm, GOAL_KINDS, changed } from '../forms.js';

export default function goals(ctx) {
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.goals')}</h1><div class="ph-actions"><button class="btn btn-primary btn-sm" data-add>${icon('plus', 'i-sm')}${t('goal.add')}</button></div></header>
    <div class="card card-pad" style="display:flex;align-items:center;gap:14px;margin-bottom:12px" data-summary><div class="sk" style="height:56px;width:100%"></div></div>
    <div class="goal-grid stagger" data-list></div>
  </div>`);
  async function load() {
    const box = $('[data-list]', page);
    try {
      const list = await api.get('/api/goals', { force: true });
      const active = list.filter((g) => !g.completed_at);
      const saved = list.reduce((s, g) => s + Number(g.current_amount), 0); const target = list.reduce((s, g) => s + Number(g.target_amount), 0);
      const pct = target ? (saved / target) * 100 : 0;
      $('[data-summary]', page).innerHTML = String(html`${ring(pct, 'var(--primary)', 56)}<div style="flex:1"><small class="muted" style="font-size:11.5px">${t('goal.total_saved')}</small><div style="font-size:19px;font-weight:800;letter-spacing:-.02em" data-saved>${money(0)}</div><small class="muted" style="font-size:11.5px">${t('goal.of_target', { target: money(target) })}</small></div>
        <div style="text-align:right"><span class="badge blue">${t('goal.active_n', { n: active.length })}</span><br><span class="badge green" style="margin-top:4px">${t('goal.done_n', { n: list.length - active.length })}</span></div>`);
      countUp($('[data-saved]', page), saved, (v) => money(v, undefined, { decimals: 0 }));
      box.innerHTML = list.length ? String(html`${list.map((g) => {
        const [ic, c] = GOAL_KINDS[g.kind] || GOAL_KINDS.custom; const col = g.color || c;
        return html`<div class="goal" data-id="${g.id}">
          <div class="goal-top">${g.image_path ? html`<img class="goal-img" src="${g.image_path}" alt="" loading="lazy">` : html`<span class="tile tile-lg" style="--c:${col}">${icon(g.icon || ic)}</span>`}
            <div class="li-main"><div class="li-title">${g.name}${g.completed_at ? html` <span class="badge green">${icon('check', 'i-xs')}${t('goal.completed')}</span>` : ''}</div>
            <div class="li-sub">${g.deadline ? (g.days_left >= 0 ? t('goal.days_left', { n: g.days_left }) : t('goal.overdue')) + ' · ' + fmtDay(g.deadline) : t('goal.no_deadline')}</div></div>${ring(g.progress, col, 46)}</div>
          <div class="progress"><span data-w="${g.progress}" style="--pc:${col}"></span></div>
          <div class="goal-meta"><span><b>${money(g.current_amount, g.currency)}</b> / ${money(g.target_amount, g.currency)}</span><span>${t('goal.remaining')}: <b>${money(g.remaining, g.currency)}</b></span></div>
          <div class="row"><button class="btn btn-soft btn-sm" data-add-money>${icon('plus', 'i-sm')}${t('goal.add_money')}</button><button class="btn btn-ghost btn-sm" data-opts style="flex:0 0 auto">${icon('dots')}</button></div></div>`;
      })}`) : String(html`<div class="card" style="grid-column:1/-1">${emptyState(t('goal.empty'), t('goal.empty_sub'), html`<button class="btn btn-primary btn-sm" data-add2>${icon('plus', 'i-sm')}${t('goal.add')}</button>`)}</div>`);
      animateProgress(page);
      box.querySelector('[data-add2]')?.addEventListener('click', () => openGoalForm());
      $$('.goal', box).forEach((card) => {
        const g = list.find((x) => String(x.id) === card.dataset.id);
        card.querySelector('[data-add-money]').onclick = () => openContributeForm(g);
        card.querySelector('[data-opts]').onclick = () => {
          const body = el(html`<div class="list set-list"><button class="li" data-x="edit"><span class="tile" style="--c:var(--primary)">${icon('edit')}</span><span class="li-main"><span class="li-title">${t('goal.edit')}</span></span></button>
            <button class="li" data-x="del"><span class="tile" style="--c:var(--red)">${icon('trash')}</span><span class="li-main"><span class="li-title neg">${t('goal.delete')}</span></span></button></div>`);
          const s = openSheet({ title: g.name, body });
          body.querySelector('[data-x=edit]').onclick = () => { s.close(); setTimeout(() => openGoalForm(g), 150); };
          body.querySelector('[data-x=del]').onclick = async () => { s.close(); if (await confirmDialog({ title: t('goal.delete'), message: t('goal.delete_confirm', { name: g.name }), danger: true, confirm: t('common.delete') })) { try { await api.del(`/api/goals/${g.id}`); changed('goal'); toast(t('common.deleted')); } catch (e) { toast(e.message, { type: 'error' }); } } };
        };
      });
    } catch (e) { box.innerHTML = String(errorState(e.message)); box.querySelector('[data-retry]').onclick = load; }
  }
  $('[data-add]', page).onclick = () => openGoalForm();
  load();
  return { el: page, title: t('nav.goals'), refresh: load, destroy: on('data:changed', load) };
}
