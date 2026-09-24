'use strict';
/** HTML-escape any value for safe interpolation into server-rendered markup. */
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
module.exports = function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, (c) => MAP[c]);
};
