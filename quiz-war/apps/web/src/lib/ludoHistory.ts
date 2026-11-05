/** Games against the computer are kept on this phone (shown in Profile → Matches → Ludo). */
export type LocalLudo = { at: string; level: number; players: number; place: number; names: string[] };
const LOCAL_LUDO = 'qw-ludo-local';
export function localLudoHistory(): LocalLudo[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_LUDO) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveLocalLudo(x: LocalLudo) {
  try {
    localStorage.setItem(LOCAL_LUDO, JSON.stringify([x, ...localLudoHistory()].slice(0, 50)));
  } catch {
    /* ignore */
  }
}
