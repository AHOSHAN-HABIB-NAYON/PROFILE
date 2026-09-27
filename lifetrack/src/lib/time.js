'use strict';
/** Current UTC offset (minutes) of an IANA timezone — used to bucket reports by the user's local day. */
function tzOffsetMinutes(tz, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
    const g = (t) => Number(parts.find((p) => p.type === t).value);
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    return Math.round((local - Math.floor(at.getTime() / 60000) * 60000) / 60000);
  } catch { return 0; }
}
const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
/** Local YYYY-MM-DD for a timezone */
function localDate(tz, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
/** Convert a local date+hour in tz to a UTC Date */
function localToUtc(dateStr, hour, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hour, 0));
  return new Date(guess.getTime() - tzOffsetMinutes(tz, guess) * 60000);
}
module.exports = { tzOffsetMinutes, validTz, localDate, localToUtc };
