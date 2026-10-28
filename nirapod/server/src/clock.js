// Injectable clock. Every time-based rule (code expiry, lockouts, resend timing, token expiry) reads the
// time from here so tests can move time forward without waiting.
export const systemClock = Object.freeze({ now: () => new Date() });

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const addMs = (date, ms) => new Date(date.getTime() + ms);
export const secondsUntil = (from, to) => Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));
