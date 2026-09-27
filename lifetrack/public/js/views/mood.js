/* Compact mood / life tracker: log today, recent strip, monthly overview & timeline. */
import { $, $$, el, html, icon, moodIcon, api, state, t, fmtDay, localDateStr, emptyState, errorState, on, toast, openSheet, withBusy, emit } from '../core.js';

const ACTIVITIES = ['work', 'family', 'friends', 'exercise', 'study', 'travel', 'rest', 'shopping', 'health', 'hobby'];
export function openMoodForm(date = localDateStr(), existing = null) {
  let mood = existing?.mood || 0; let activity = existing?.activity || '';
  const body = el(html`<form novalidate><p class="muted" style="text-align:center;font-size:12.5px;margin-bottom:8px">${fmtDay(date, 'long')}</p>
    <div class="moods" data-moods>${[1, 2, 3, 4, 5].map((m) => html`<button type="button" class="mood-btn ${m === mood ? 'active' : ''}" data-m="${m}">${moodIcon(m)}${t('mood.m' + m)}</button>`)}</div>
    <div class="field" style="margin-top:12px"><label>${t('mood.activity')}</label><div class="chips" style="flex-wrap:wrap" data-acts>${ACTIVITIES.map((a) => html`<button type="button" class="chip ${a === activity ? 'active' : ''}" data-a="${a}">${t('mood.act.' + a)}</button>`)}</div></div>
    <div class="field"><label>${t('mood.note')}</label><input class="input" name="note" maxlength="300" value="${existing?.note || ''}" placeholder="${t('mood.note_ph')}"></div></form>`);
  const foot = el(html`<div style="width:100%"><button class="btn btn-primary btn-lg btn-block" data-save>${icon('check', 'i-sm')}${t('common.save')}</button></div>`);
  const s = openSheet({ title: t('mood.how_today'), body, foot });
  $$('[data-m]', body).forEach((b) => b.onclick = () => { mood = Number(b.dataset.m); $$('[data-m]', body).forEach((x) => x.classList.toggle('active', x === b)); });
  $$('[data-a]', body).forEach((b) => b.onclick = () => { activity = activity === b.dataset.a ? '' : b.dataset.a; $$('[data-a]', body).forEach((x) => x.classList.toggle('active', x.dataset.a === activity)); });
  foot.querySelector('[data-save]').onclick = (e) => withBusy(e.currentTarget, async () => {
    if (!mood) { toast(t('mood.pick'), { type: 'warn' }); return; }
    try { await api.post('/api/moods', { mood, date, activity: activity ? t('mood.act.' + activity) : undefined, note: new FormData(body).get('note') || undefined }); emit('data:changed', 'mood'); s.close(); toast(t('mood.saved')); }
    catch (er) { toast(er.message, { type: 'error' }); }
  });
}

export default function moodView() {
  let month = localDateStr().slice(0, 7);
  const page = el(html`<div>
    <header class="ph"><h1>${t('nav.mood')}</h1><div class="ph-actions"><button class="btn btn-primary btn-sm" data-log>${icon('plus', 'i-sm')}${t('mood.log')}</button></div></header>
    <section class="card card-pad"><div style="font-weight:700;font-size:13.5px;margin-bottom:8px">${t('mood.how_today')}</div><div class="moods" data-quick>${[1, 2, 3, 4, 5].map((m) => html`<button class="mood-btn" data-m="${m}">${moodIcon(m)}${t('mood.m' + m)}</button>`)}</div></section>
    <div class="two-col" style="margin-top:12px">
      <section class="card card-pad"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:13.5px" data-mtitle></b><span class="badge blue" data-avg></span></div>
        <div class="cal-grid" data-grid></div>
        <div class="legend" style="justify-content:center;margin-top:10px" data-dist></div></section>
      <section><div class="section-head"><h2>${t('mood.timeline')}</h2></div><div class="card card-pad" data-timeline></div></section>
    </div></div>`);
  async function load() {
    try {
      const d = await api.get(`/api/moods?month=${month}`, { force: true });
      const LOC = { bn: 'bn-BD', hi: 'hi-IN' }[state.lang] || 'en-US';
      $('[data-mtitle]', page).textContent = new Intl.DateTimeFormat(LOC, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-15T00:00:00Z'));
      $('[data-avg]', page).textContent = d.average ? t('mood.avg', { n: d.average }) : t('mood.no_entries');
      const map = Object.fromEntries(d.items.map((x) => [x.date, x]));
      const [y, m] = month.split('-').map(Number); const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const cells = []; for (let i = 0; i < first; i++) cells.push(html`<span></span>`);
      for (let i = 1; i <= days; i++) { const ds = `${month}-${String(i).padStart(2, '0')}`; const e = map[ds]; cells.push(html`<button class="cal-day" data-d="${ds}" style="padding-top:3px">${e ? html`<svg viewBox="0 0 24 24" style="width:24px;height:24px"><use href="#mood-${e.mood}"/></svg>` : html`<span style="margin-top:4px;color:var(--faint)">${i}</span>`}</button>`); }
      $('[data-grid]', page).innerHTML = String(html`${cells}`);
      $$('[data-d]', page).forEach((b) => b.onclick = () => { if (b.dataset.d <= localDateStr()) openMoodForm(b.dataset.d, map[b.dataset.d]); });
      const dist = [1, 2, 3, 4, 5].map((k) => d.items.filter((x) => x.mood === k).length);
      $('[data-dist]', page).innerHTML = String(html`${[5, 4, 3, 2, 1].map((k) => html`<span>${moodIcon(k)}<b>${dist[k - 1]}</b></span>`)}`);
      $$('[data-dist] svg', page).forEach((s) => { s.style.width = '18px'; s.style.height = '18px'; });
      $('[data-timeline]', page).innerHTML = d.recent.length ? String(html`<div class="timeline">${d.recent.map((x) => html`<div class="tl-item" style="--c:${['', '#EF4444', '#F97316', '#EAB308', '#84CC16', '#16A34A'][x.mood]}"><div style="display:flex;gap:8px;align-items:center"><svg viewBox="0 0 24 24" style="width:22px;height:22px"><use href="#mood-${x.mood}"/></svg><b style="font-size:13px">${t('mood.m' + x.mood)}</b><span class="muted" style="font-size:11.5px;margin-left:auto">${fmtDay(x.date)}</span></div>${x.activity || x.note ? html`<p class="muted" style="font-size:12px;margin:4px 0 0 30px">${[x.activity, x.note].filter(Boolean).join(' · ')}</p>` : ''}</div>`)}</div>`)
        : String(emptyState(t('mood.empty'), t('mood.empty_sub')));
      const todayE = d.recent.find((x) => x.date === localDateStr());
      $$('[data-quick] .mood-btn', page).forEach((b) => b.classList.toggle('active', Number(b.dataset.m) === todayE?.mood));
    } catch (e) { $('[data-timeline]', page).innerHTML = String(errorState(e.message)); }
  }
  $$('[data-quick] .mood-btn', page).forEach((b) => b.onclick = async () => {
    $$('[data-quick] .mood-btn', page).forEach((x) => x.classList.toggle('active', x === b));
    try { await api.post('/api/moods', { mood: Number(b.dataset.m), date: localDateStr() }); toast(t('mood.saved')); emit('data:changed', 'mood'); } catch (e) { toast(e.message, { type: 'error' }); }
  });
  $('[data-log]', page).onclick = () => openMoodForm();
  load();
  return { el: page, title: t('nav.mood'), refresh: load, destroy: on('data:changed', load) };
}
