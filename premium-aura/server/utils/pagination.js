'use strict';

function paginate(query, { defaultSize = 30, maxSize = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const size = Math.min(maxSize, Math.max(1, parseInt(query.pageSize || query.per_page, 10) || defaultSize));
  return { page, size, offset: (page - 1) * size };
}

function meta(total, { page, size }) {
  const t = Number(total) || 0;
  return { page, pageSize: size, total: t, pages: Math.max(1, Math.ceil(t / size)) };
}

module.exports = { paginate, meta };
