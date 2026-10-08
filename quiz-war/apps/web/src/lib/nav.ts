/** Lets non-React modules (socket events, push taps, deep links) navigate the SPA. */
let nav: ((to: string) => void) | null = null;
export const setNavigator = (fn: (to: string) => void) => (nav = fn);
export const navigateTo = (to: string) => (nav ? nav(to) : (window.location.href = to));
