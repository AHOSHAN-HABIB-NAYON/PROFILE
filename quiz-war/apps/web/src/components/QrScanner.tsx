import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { roomCodeFrom } from '../lib/scanner';
import { Sheet } from './Sheet';

/** Browser QR scanner (BarcodeDetector + rear camera) shown in a sheet. */
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
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(v);
            const code = found.map((f: { rawValue: string }) => roomCodeFrom(f.rawValue)).find(Boolean);
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
        setErr(t('Camera is blocked. Allow camera access in your browser, or type the code instead.', 'ক্যামেরা চালু করা যায়নি। ব্রাউজারে ক্যামেরার অনুমতি দিন, অথবা কোডটি লিখে দিন।'));
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
