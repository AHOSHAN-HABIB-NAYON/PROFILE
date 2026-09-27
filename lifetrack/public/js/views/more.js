/* "More" hub (mobile): profile, feature grid, settings shortcuts, install card, admin link, sign out. */
import { $, $$, el, html, icon, api, state, t, toast, on, confirmDialog } from '../core.js';
import { avatar, applyTheme } from '../app.js';

export async function logout() {
  try { const p = await import('../push.js'); await p.disable().catch(() => {}); } catch {}
  await api.post('/api/auth/logout').catch(() => {});
  location.href = '/app/login';
}

export default function more(ctx) {
  const features = [['/app/transactions', 'layers', 'nav.transactions', 'var(--primary)'], ['/app/reports', 'pie', 'nav.reports', 'var(--violet)'], ['/app/calendar', 'calendar', 'nav.calendar', 'var(--teal)'],
    ['/app/loans', 'lend', 'nav.loans', 'var(--orange)'], ['/app/investments', 'trend-up', 'nav.investments', 'var(--green)'], ['/app/mood', 'smile', 'nav.mood', 'var(--yellow)'],
    ['/app/notes', 'note', 'nav.notes', 'var(--muted)'], ['/app/reminders', 'alarm', 'nav.reminders', 'var(--pink)']];
  const settings = [['profile', 'user', 'var(--primary)'], ['security', 'shield', 'var(--green)'], ['notifications', 'bell', 'var(--orange)'], ['preferences', 'globe', 'var(--teal)'],
    ['theme', 'palette', 'var(--violet)'], ['categories', 'tag', 'var(--pink)'], ['backup', 'database', 'var(--primary)'], ['privacy', 'lock', 'var(--red)'], ['help', 'help', 'var(--teal)'], ['about', 'info', 'var(--muted)']];
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.more')}</h1><div class="ph-actions"><button class="icon-btn" data-theme-toggle></button><a class="icon-btn" href="/app/notifications" data-unread aria-label="${t('nav.notifications')}">${icon('bell')}</a></div></header>
    <a class="card profile-card" href="/app/settings/profile" style="color:inherit">${avatar(state.me)}<div style="flex:1;min-width:0"><b style="font-size:15px" class="ellipsis">${state.me.name}</b><div class="muted ellipsis" style="font-size:12px">${state.me.email}</div>${state.me.verified ? html`<span class="badge green" style="margin-top:4px">${icon('check', 'i-xs')}${t('set.verified')}</span>` : html`<span class="badge orange" style="margin-top:4px">${t('set.unverified')}</span>`}</div>${icon('chevron-right', 'muted')}</a>
    <div class="card install-card" data-install hidden style="margin-top:12px"><span class="tile" style="--c:var(--primary)">${icon('install')}</span><div style="flex:1"><b style="font-size:13px">${t('pwa.install_title')}</b><div class="muted" style="font-size:11.5px">${t('pwa.install_sub')}</div></div><button class="btn btn-primary btn-sm" data-install-btn>${t('pwa.install')}</button></div>
    <div class="card qa stagger" style="margin-top:12px;grid-template-columns:repeat(4,1fr)">${features.map(([h, ic, k, c]) => html`<a href="${h}" style="display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--text-2);padding:6px 2px"><span class="tile" style="--c:${c};width:42px;height:42px;border-radius:14px">${icon(ic)}</span>${t(k)}</a>`)}</div>
    <div class="set-group"><h3>${t('nav.settings')}</h3><div class="list set-list">${settings.map(([k, ic, c]) => html`<a class="li" href="/app/settings/${k}"><span class="tile" style="--c:${c}">${icon(ic)}</span><span class="li-main"><span class="li-title">${t('set.' + k)}</span></span>${icon('chevron-right', 'i-sm chev')}</a>`)}</div></div>
    ${state.me.canAdmin ? html`<div class="set-group"><div class="list set-list"><a class="li" href="/admin"><span class="tile" style="--c:var(--violet)">${icon('shield')}</span><span class="li-main"><span class="li-title">${t('nav.admin_panel')}</span><span class="li-sub">${t('role.' + state.me.role)}</span></span>${icon('external', 'i-sm chev')}</a></div></div>` : ''}
    <button class="btn btn-danger-soft btn-block" style="margin-top:14px" data-logout>${icon('logout', 'i-sm')}${t('auth.sign_out')}</button>
    <p class="muted" style="text-align:center;font-size:11px;margin-top:12px">${state.config?.site || 'LifeTrack'} · ${state.config?.tagline || ''}</p></div>`);
  page.querySelector('a[href="/admin"]')?.addEventListener('click', (e) => { e.stopPropagation(); });
  const showInstall = () => { $('[data-install]', page).hidden = !state.installPrompt; };
  showInstall();
  $('[data-install-btn]', page).onclick = async () => { if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; showInstall(); };
  $('[data-logout]', page).onclick = async () => { if (await confirmDialog({ title: t('auth.sign_out'), message: t('auth.sign_out_confirm'), confirm: t('auth.sign_out') })) logout(); };
  requestAnimationFrame(() => applyTheme(document.documentElement.dataset.theme, { save: false, animate: false }));
  import('../app.js').then((m) => m.setUnread(state.unread || 0));
  return { el: page, title: t('nav.more'), destroy: on('installable', showInstall) };
}
