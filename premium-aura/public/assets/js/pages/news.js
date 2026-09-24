import { api, esc, $, $$, toast, toastError, pageHead, relEl, fmtDate, pagination, brandHtml, appIcon, num, state, copyText } from '../core.js';

const CAT_LABEL = { all: 'All', general: 'General', announcement: 'Announcement', update: 'Update', offer: 'Offer', maintenance: 'Maintenance', premium: 'Premium', tips: 'Tips' };

function when(iso) {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  return days < 7 ? relEl(iso) : esc(fmtDate(iso));
}

function post(p) {
  const s = state.site;
  const demo = p.demo;
  // Real counts only; admin-configured demo engagement is shown separately and labelled DEMO.
  const demoTag = (k) => (demo && demo[k] ? ` <span class="demo-tag" title="Demo engagement configured by the admin for design/testing — not real activity">+${num(demo[k])} DEMO</span>` : '');
  return `<article class="card news-card" data-post="${p.id}">
    <div class="news-inner">
      <header class="news-head"><span class="brand-mark sm">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="">` : '<i class="fa-solid fa-crown"></i>'}</span>
        <div><strong>${esc(s.site_name)} <i class="fa-solid fa-circle-check verified" title="Verified"></i></strong><small>Admin · ${when(p.published_at)}</small></div>
        <span class="chip ${p.category === 'offer' ? 'warning' : p.category === 'maintenance' ? 'danger' : 'info'}">${p.is_pinned ? '<i class="fa-solid fa-thumbtack"></i> ' : ''}${esc(CAT_LABEL[p.category] || p.category)}</span></header>
      <h3>${esc(p.title)}</h3>
      ${p.image_url ? `<img class="news-image" src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}
      ${p.app_icons?.length ? `<div class="news-icons">${p.app_icons.map((i) => appIcon(i, 'sm')).join('')}</div>` : ''}
      <div class="news-body clamped" data-body>${p.body_html}</div>
      <button class="btn btn-ghost btn-xs" data-more style="margin-top:6px">Read more</button>
      ${p.link_url ? `<a class="btn btn-soft btn-sm" style="margin-top:10px" href="${esc(p.link_url)}" target="_blank" rel="noopener nofollow"><i class="fa-solid fa-arrow-up-right-from-square"></i>${esc(p.link_label || 'Open link')}</a>` : ''}
    </div>
    <div class="news-actions">
      <button data-like class="${p.liked ? 'liked' : ''}" aria-pressed="${p.liked}"><i class="fa-${p.liked ? 'solid' : 'regular'} fa-heart"></i><span data-likes>${num(p.stats.likes)}</span>${demoTag('likes')}</button>
      <button data-share><i class="fa-solid fa-share-nodes"></i><span data-shares>${num(p.stats.shares)}</span>${demoTag('shares')}</button>
      <button data-view><i class="fa-regular fa-eye"></i><span>${num(p.stats.views)}</span>${demoTag('views')}</button>
    </div>
  </article>`;
}

export async function mount(el) {
  let page = 1;
  let cat = '';
  el.innerHTML = `${pageHead('fa-solid fa-newspaper', 'News', 'Latest updates & announcements')}
    <div class="tabs" data-cats style="margin-bottom:14px">${Object.entries(CAT_LABEL).map(([k, v]) => `<button class="tab ${k === 'all' ? 'active' : ''}" data-cat="${k === 'all' ? '' : k}">${v}</button>`).join('')}</div>
    <div class="grid" data-feed style="max-width:760px"></div><div data-pages></div>`;

  async function load(p = page) {
    page = p;
    const feed = $('[data-feed]', el);
    feed.innerHTML = '<div class="skeleton sk-block"></div><div class="skeleton sk-block"></div>';
    const r = await api('/news', { query: { page, category: cat } });
    feed.innerHTML = r.items.length ? r.items.map(post).join('') : '<div class="card empty"><i class="fa-solid fa-newspaper"></i><div>No posts yet</div></div>';
    $('[data-pages]', el).innerHTML = pagination(r.pagination, load);
    // mark as viewed when a post scrolls into view
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        api('/news/view', { method: 'POST', body: { post_id: Number(en.target.dataset.post) } }).catch(() => {});
      }
    }, { threshold: 0.6 });
    $$('[data-post]', el).forEach((a) => {
      io.observe(a);
      const b = $('[data-body]', a);
      if (b.scrollHeight <= b.clientHeight + 4) $('[data-more]', a).remove();
    });
  }

  el.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-post]');
    const t = e.target.closest('[data-cat]');
    if (t) {
      $$('[data-cat]', el).forEach((b) => b.classList.toggle('active', b === t));
      cat = t.dataset.cat;
      return load(1);
    }
    if (!card) return;
    const id = Number(card.dataset.post);
    if (e.target.closest('[data-more]')) {
      $('[data-body]', card).classList.remove('clamped');
      e.target.closest('[data-more]').remove();
      return;
    }
    const like = e.target.closest('[data-like]');
    if (like) {
      try {
        const r = await api('/news/like', { method: 'POST', body: { post_id: id } });
        like.classList.toggle('liked', r.liked);
        like.setAttribute('aria-pressed', r.liked);
        like.querySelector('i').className = `fa-${r.liked ? 'solid' : 'regular'} fa-heart`;
        like.querySelector('[data-likes]').textContent = num(r.likes);
      } catch (err) { toastError(err); }
      return;
    }
    if (e.target.closest('[data-share]')) {
      const title = $('h3', card).textContent;
      let channel = 'link';
      try {
        const r = await api('/news/share', { method: 'POST', body: { post_id: id, channel: navigator.share ? 'native' : 'link' } });
        const url = `${location.origin}${r.url}`;
        if (navigator.share) { channel = 'native'; await navigator.share({ title, url }).catch(() => {}); } else await copyText(url);
        e.target.closest('[data-share]').querySelector('[data-shares]').textContent = num(r.shares);
      } catch (err) { if (channel === 'link') toastError(err); }
    }
  });

  await load(1);
}
