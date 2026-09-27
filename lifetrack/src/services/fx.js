'use strict';
const settings = require('./settings');
/** SQL fragment converting `col` (in row currency `curCol`) to target currency, using admin-managed rates. */
function convSql(col, curCol, target) {
  const list = settings.currencies();
  const rateOf = (c) => Number(list.find((x) => x.code === c)?.rate || 1);
  const t = rateOf(target) || 1;
  if (list.length <= 1) return { sql: col, params: [] };
  const cases = list.map(() => 'WHEN ? THEN ?').join(' ');
  const params = []; list.forEach((c) => params.push(c.code, Number(c.rate || 1) / t));
  return { sql: `(${col} * (CASE ${curCol} ${cases} ELSE 1 END))`, params };
}
function convert(amount, from, to) {
  const list = settings.currencies();
  const rf = Number(list.find((x) => x.code === from)?.rate || 1); const rt = Number(list.find((x) => x.code === to)?.rate || 1);
  return (Number(amount) * rf) / rt;
}
module.exports = { convSql, convert };
