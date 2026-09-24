'use strict';
/** Read `a.b[0].c` style paths from provider JSON responses. */
function get(obj, path) {
  if (!path) return obj;
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (p === '__proto__' || p === 'constructor' || p === 'prototype') return undefined;
    cur = cur[p];
  }
  return cur;
}
module.exports = { get };
