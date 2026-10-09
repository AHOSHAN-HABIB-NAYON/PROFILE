import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

/**
 * QR scanning for "Join room". Android uses Google's code scanner (camera UI inside Play
 * services, no CAMERA permission for the app); browsers use BarcodeDetector + the camera.
 */
const NativeScanner = registerPlugin<{ scan(): Promise<{ value: string }> }>('QwScanner');

export const nativeScanAvailable = () => isNative && Capacitor.isPluginAvailable('QwScanner');
export const webScanAvailable = () => !isNative && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
export const scanAvailable = () => nativeScanAvailable() || webScanAvailable();

/** Native scan. Resolves null when the player closes the scanner. */
export async function nativeScan(): Promise<string | null> {
  try {
    return (await NativeScanner.scan()).value ?? null;
  } catch (e) {
    if ((e as { code?: string })?.code === 'cancelled') return null;
    throw e;
  }
}

/** Pulls a room code out of a scanned link (…/war-room/K7P4QX) or a bare code. */
export function roomCodeFrom(text: string): string | null {
  const v = text.trim();
  const m = /\/war-room\/([A-Za-z0-9-]+)/.exec(v);
  if (m) return m[1]!.toUpperCase();
  return /^[A-Za-z0-9]{4,12}$/.test(v) ? v.toUpperCase() : null;
}
