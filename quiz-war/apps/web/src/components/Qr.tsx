import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { isNative } from '../lib/platform';
import { Icon, IconTile } from './Icon';
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
        setError(tr('Camera permission is needed to scan. You can also type the UID instead.', 'স্ক্যান করতে ক্যামেরার অনুমতি লাগবে। চাইলে UID লিখেও খুঁজতে পারেন।'));
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
        <IconTile name="scan" tone="primary" size={72} anim="pulse" />
        <p className="muted small">{tr('Point your camera at a QUIZ WAR QR code. Google’s secure scanner opens — the app never sees your camera.', 'QUIZ WAR-এর QR কোডের দিকে ক্যামেরা ধরুন। Google-এর নিরাপদ স্ক্যানার খুলবে — অ্যাপ আপনার ক্যামেরা দেখতে পায় না।')}</p>
        {error && <p className="form-error"><Icon name="alert-circle" size={18} /> {error}</p>}
        <button
          className="btn primary lg block"
          disabled={nativeBusy}
          onClick={async () => {
            setNativeBusy(true);
            setError(null);
            try {
              const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
              const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
              if (!available) {
                setError(tr('Preparing the scanner… try again in a moment.', 'স্ক্যানার প্রস্তুত হচ্ছে… একটু পরে আবার চেষ্টা করুন।'));
                await BarcodeScanner.installGoogleBarcodeScannerModule();
                return;
              }
              const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
              const uid = barcodes[0]?.rawValue ? uidFromScan(barcodes[0].rawValue) : null;
              if (uid) onUid(uid);
              else if (barcodes.length) setError(tr('That QR code is not a QUIZ WAR player code.', 'এটি QUIZ WAR-এর প্লেয়ার QR কোড নয়।'));
            } catch (e) {
              const msg = (e as Error).message || '';
              if (!/cancel/i.test(msg)) setError(msg || tr('Scanner unavailable', 'স্ক্যানার পাওয়া যাচ্ছে না'));
            } finally {
              setNativeBusy(false);
            }
          }}
        >
          {nativeBusy ? <span className="spinner" /> : <Icon name="camera" />} {tr('Open scanner', 'স্ক্যানার খুলুন')}
        </button>
      </div>
    );
  }
  return (
    <div className="col">
      {error ? <p className="form-error"><Icon name="alert-circle" size={18} /> {error}</p> : (
        <div className="scanner-frame">
          <video ref={video} className="scanner-video" playsInline muted aria-label={tr('Camera preview for QR scanning', 'QR স্ক্যানের জন্য ক্যামেরা')} />
        </div>
      )}
    </div>
  );
}
