import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { roomCodeFrom } from '../lib/scanner';
import { Sheet } from './Sheet';

/** Returns a frame decoder: native BarcodeDetector when available, else jsQR on a small canvas. */
async function makeDetector(): Promise<(v: HTMLVideoElement) => Promise<string[]>> {
  if ('BarcodeDetector' in window) {
    try {
      const d = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      return async (v) => (await d.detect(v)).map((f: { rawValue: string }) => f.rawValue);
    } catch {
      /* fall back to jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return async (v) => {
    if (!v.videoWidth) return [];
    const scale = Math.min(1, 640 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    return r ? [r.data] : [];
  };
}

/** QR scanner (rear camera + BarcodeDetector, or jsQR where that's missing) shown in a sheet. */
export function QrScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const detect = await makeDetector();
        const tick = async () => {
          if (stopped) return;
          try {
            const code = (await detect(v)).map((raw) => roomCodeFrom(raw)).find(Boolean);
            if (code) {
              haptic('success');
              onCode(code);
              return;
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setErr(t('Camera is blocked. Allow camera access (phone Settings › Apps › QUIZ WAR › Permissions), or type the code instead.', 'ক্যামেরা চালু করা যায়নি। ক্যামেরার অনুমতি দিন (ফোনের Settings › Apps › QUIZ WAR › Permissions), অথবা কোডটি লিখে দিন।'));
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={t('Scan room QR', 'রুমের QR স্ক্যান করুন')} icon="scan">
      <div className="col center">
        {err ? (
          <p className="small muted center">{err}</p>
        ) : (
          <div className="qr-scan">
            <video ref={video} playsInline muted />
            <span className="qr-frame" aria-hidden />
          </div>
        )}
        <p className="small muted center">{t('Point the camera at the QR code on your friend’s screen.', 'বন্ধুর স্ক্রিনের QR কোডের দিকে ক্যামেরা ধরুন।')}</p>
      </div>
    </Sheet>
  );
}
