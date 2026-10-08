import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { isNative } from '../lib/platform';
import { uidFromScan } from '../lib/qr';

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) void QRCode.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } });
  }, [value, size]);
  return (
    <div className="qr-box">
      <canvas ref={ref} width={size} height={size} role="img" aria-label={`QR code for ${value}`} />
    </div>
  );
}

/**
 * QR scanner: native ML Kit scanner inside the Android app; in browsers it uses
 * BarcodeDetector when available and falls back to jsQR on camera frames.
 */
export function QrScanner({ onUid }: { onUid: (uid: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [nativeBusy, setNativeBusy] = useState(false);

  useEffect(() => {
    if (isNative) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 720 } }, audio: false });
      } catch {
        setError('Camera permission is needed to scan. You can also type the UID instead.');
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      const Detector = (window as any).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : (await import('jsqr')).default;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const scan = async () => {
        if (stopped) return;
        if (v.readyState >= 2) {
          let text: string | null = null;
          if (detector) {
            const codes = await detector.detect(v).catch(() => []);
            text = codes[0]?.rawValue ?? null;
          } else if (jsQR) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(img.data, img.width, img.height)?.data ?? null;
          }
          const uid = text ? uidFromScan(text) : null;
          if (uid) {
            stopped = true;
            onUid(uid);
            return;
          }
        }
        raf = requestAnimationFrame(() => void scan());
      };
      void scan();
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onUid]);

  if (isNative) {
    return (
      <div className="col center">
        <p className="muted small">Point your camera at a QUIZ WAR QR code.</p>
        {error && <p className="form-error">{error}</p>}
        <button
          className="btn primary lg block"
          disabled={nativeBusy}
          onClick={async () => {
            setNativeBusy(true);
            setError(null);
            try {
              const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
              const perm = await BarcodeScanner.requestPermissions();
              if (perm.camera !== 'granted' && perm.camera !== 'limited') throw new Error('Camera permission denied');
              const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
              const uid = barcodes[0]?.rawValue ? uidFromScan(barcodes[0].rawValue) : null;
              if (uid) onUid(uid);
              else if (barcodes.length) setError('That QR code is not a QUIZ WAR player code.');
            } catch (e) {
              setError((e as Error).message || 'Scanner unavailable');
            } finally {
              setNativeBusy(false);
            }
          }}
        >
          📷 Open scanner
        </button>
      </div>
    );
  }
  return (
    <div className="col">
      {error ? <p className="form-error">{error}</p> : (
        <div className="scanner-frame">
          <video ref={video} className="scanner-video" playsInline muted aria-label="Camera preview for QR scanning" />
        </div>
      )}
    </div>
  );
}
