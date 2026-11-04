import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useT } from '../lib/i18n';
import { Icon } from './Icon';

const VIEW = 280; // crop circle size on screen (px)
const OUT = 720; // output square (px)

/**
 * Profile photo cropper: after picking a photo, move it with a finger, zoom with two fingers or
 * the slider, then Confirm. Returns a square JPEG/WebP file of the visible circle.
 */
export function useImageCropper() {
  const [job, setJob] = useState<{ url: string; resolve: (f: File | null) => void } | null>(null);
  const crop = (file: File) =>
    new Promise<File | null>((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      setJob({ url: URL.createObjectURL(file), resolve });
    });
  const done = (f: File | null) => {
    if (!job) return;
    URL.revokeObjectURL(job.url);
    job.resolve(f);
    setJob(null);
  };
  const element = job ? <Cropper url={job.url} onDone={done} /> : null;
  return { crop, element };
}

function Cropper({ url, onDone }: { url: string; onDone: (f: File | null) => void }) {
  const t = useT();
  const img = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number; px: number; py: number; dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      img.current = i;
      setSize({ w: i.naturalWidth, h: i.naturalHeight });
    };
    i.src = url;
  }, [url]);

  // Base scale: the photo just covers the circle at zoom 1.
  const base = size ? VIEW / Math.min(size.w, size.h) : 1;
  const scale = base * zoom;
  const clamp = (p: { x: number; y: number }, z = zoom) => {
    if (!size) return p;
    const s = base * z;
    const mx = Math.max(0, (size.w * s - VIEW) / 2);
    const my = Math.max(0, (size.h * s - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const down = (e: RPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, dist: dist(), zoom };
  };
  const move = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !start.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = start.current;
    if (pointers.current.size >= 2 && st.dist) {
      const z = Math.min(4, Math.max(1, (st.zoom * dist()) / st.dist));
      setZoom(z);
      setPos((p) => clamp(p, z));
    } else {
      setPos(clamp({ x: st.px + e.clientX - st.x, y: st.py + e.clientY - st.y }));
    }
  };
  const up = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    start.current = pointers.current.size ? { ...[...pointers.current.values()][0]!, px: pos.x, py: pos.y, dist: dist(), zoom } : null;
  };

  const confirm = async () => {
    if (!img.current || !size) return;
    setBusy(true);
    const c = document.createElement('canvas');
    c.width = OUT;
    c.height = OUT;
    const x = c.getContext('2d')!;
    // Visible square in image pixels.
    const side = VIEW / scale;
    const sx = size.w / 2 - pos.x / scale - side / 2;
    const sy = size.h / 2 - pos.y / scale - side / 2;
    x.fillStyle = '#fff';
    x.fillRect(0, 0, OUT, OUT);
    x.drawImage(img.current, sx, sy, side, side, 0, 0, OUT, OUT);
    const blob = (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.9))) ?? (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9)));
    setBusy(false);
    onDone(blob ? new File([blob], blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg', { type: blob.type }) : null);
  };

  return (
    <div className="cropper" role="dialog" aria-label={t('Adjust photo', 'ছবি ঠিক করুন')}>
      <div className="cr-top">
        <button className="btn icon ghost on-dark" aria-label={t('Cancel', 'বাতিল')} onClick={() => onDone(null)}><Icon name="close" size={22} /></button>
        <b>{t('Move and zoom', 'সরিয়ে ও বড়-ছোট করে বসান')}</b>
        <span style={{ width: 40 }} />
      </div>
      <div className="cr-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {size ? (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ width: size.w * scale, height: size.h * scale, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
          />
        ) : (
          <span className="spinner" />
        )}
        <span className="cr-mask" aria-hidden style={{ width: VIEW, height: VIEW }} />
      </div>
      <div className="cr-bottom">
        <div className="cr-zoom">
          <Icon name="image" size={16} />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => { const z = Number(e.target.value); setZoom(z); setPos((p) => clamp(p, z)); }} aria-label={t('Zoom', 'জুম')} />
          <Icon name="image" size={22} />
        </div>
        <button className="btn primary lg block" disabled={!size || busy} onClick={() => void confirm()}>
          {busy ? <span className="spinner" /> : <Icon name="check" />} {t('Confirm', 'নিশ্চিত করুন')}
        </button>
      </div>
    </div>
  );
}
