'use strict';
/**
 * Extra per-post data: multiple labelled links (apply / notice / result …)
 * and a gallery of notice images. Kept in their own tables so a post can have any number.
 */
const db = require('./db');
const uploads = require('./util/uploads');
const { strip, safeUrl } = require('./util/html');

const MAX_LINKS = 20;
const MAX_IMAGES = 12;

async function forPost(postId) {
  const [links, images] = await Promise.all([
    db.query('SELECT id, label, url, is_apply FROM post_links WHERE post_id = ? ORDER BY sort, id', [postId]),
    db.query('SELECT id, image, caption FROM post_images WHERE post_id = ? ORDER BY sort, id', [postId]),
  ]);
  return { links, images };
}

/** Normalise the admin form's `links[i][label|url|apply]` rows. */
function parseLinks(raw) {
  let rows = raw || [];
  if (!Array.isArray(rows)) rows = Object.keys(rows).sort((a, b) => a - b).map((k) => rows[k]);
  return rows
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      label: strip(r.label).slice(0, 180),
      url: safeUrl(String(r.url || '').trim()).slice(0, 600),
      is_apply: r.apply === '1' || r.apply === 'on' || r.apply === true ? 1 : 0,
    }))
    .filter((r) => r.url && /^(https?:\/\/|tel:|mailto:)/i.test(r.url))
    .slice(0, MAX_LINKS);
}

async function replaceLinks(postId, links) {
  await db.query('DELETE FROM post_links WHERE post_id = ?', [postId]);
  let sort = 0;
  for (const l of links) {
    await db.insert('post_links', { post_id: postId, label: l.label || hostLabel(l.url), url: l.url, is_apply: l.is_apply, sort: sort++ });
  }
}

/** Remove the images ticked for deletion, then append the new uploads (already saved). */
async function updateImages(postId, removeIds, newFiles) {
  const ids = (Array.isArray(removeIds) ? removeIds : removeIds ? [removeIds] : []).map(Number).filter((n) => n > 0);
  if (ids.length) {
    const rows = await db.raw('SELECT id, image FROM post_images WHERE post_id = ? AND id IN (?)', [postId, ids]);
    for (const r of rows) uploads.removeFile(r.image);
    await db.raw('DELETE FROM post_images WHERE post_id = ? AND id IN (?)', [postId, ids]);
  }
  const have = Number(await db.val('SELECT COUNT(*) FROM post_images WHERE post_id = ?', [postId]));
  let sort = Number(await db.val('SELECT COALESCE(MAX(sort), -1) FROM post_images WHERE post_id = ?', [postId])) + 1;
  for (const rel of newFiles.slice(0, Math.max(0, MAX_IMAGES - have))) {
    await db.insert('post_images', { post_id: postId, image: rel, sort: sort++ });
  }
}

/** Delete links, gallery rows and gallery files of permanently removed posts. */
async function destroy(postIds) {
  if (!postIds.length) return;
  const imgs = await db.raw('SELECT image FROM post_images WHERE post_id IN (?)', [postIds]);
  for (const r of imgs) uploads.removeFile(r.image);
  await db.raw('DELETE FROM post_images WHERE post_id IN (?)', [postIds]);
  await db.raw('DELETE FROM post_links WHERE post_id IN (?)', [postIds]);
}

function hostLabel(url) {
  if (/^tel:/i.test(url)) return 'ফোন করুন';
  if (/^mailto:/i.test(url)) return 'ইমেইল করুন';
  try { return new URL(url).host.replace(/^www\./, ''); } catch (_) { return 'লিংক'; }
}

module.exports = { forPost, parseLinks, replaceLinks, updateImages, destroy, hostLabel, MAX_LINKS, MAX_IMAGES };
