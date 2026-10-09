/**
 * QR scanning for "Join room": the camera preview runs in the page (app WebView or browser)
 * and frames are decoded with BarcodeDetector when present, otherwise the pure-JS jsQR.
 */
export const scanAvailable = () => !!navigator.mediaDevices?.getUserMedia;

/** Pulls a room code out of a scanned link (…/war-room/K7P4QX) or a bare code. */
export function roomCodeFrom(text: string): string | null {
  const v = text.trim();
  const m = /\/war-room\/([A-Za-z0-9-]+)/.exec(v);
  if (m) return m[1]!.toUpperCase();
  return /^[A-Za-z0-9]{4,12}$/.test(v) ? v.toUpperCase() : null;
}
