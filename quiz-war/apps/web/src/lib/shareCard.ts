/**
 * Renders a shareable PNG card (victory / rank / achievement / profile). The share always
 * carries the same information as text too, so nothing important is image-only.
 */
export async function renderShareCard(o: { title: string; subtitle: string; big: string; footer: string; accent?: string }): Promise<Blob | null> {
  const W = 1080;
  const H = 1080;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return null;
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, o.accent ?? '#1d4ed8');
  g.addColorStop(1, '#1e1b4b');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.08;
  x.font = '700 520px sans-serif';
  x.fillStyle = '#fff';
  x.fillText('⚔', 520, 980);
  x.globalAlpha = 1;
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  const font = (w: number, s: number) => `${w} ${s}px 'Plus Jakarta Sans', 'Hind Siliguri', sans-serif`;
  x.fillStyle = '#fff';
  x.font = font(800, 44);
  x.fillText('QUIZ WAR · BANGLADESH', 80, 130);
  x.font = font(800, 96);
  wrap(x, o.title, 80, 330, W - 160, 104);
  x.font = font(600, 46);
  x.fillStyle = 'rgba(255,255,255,.85)';
  wrap(x, o.subtitle, 80, 520, W - 160, 58);
  x.font = font(900, 150);
  x.fillStyle = '#fde047';
  x.fillText(o.big, 80, 800);
  x.font = font(700, 40);
  x.fillStyle = 'rgba(255,255,255,.8)';
  x.fillText(o.footer, 80, 980);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

function wrap(x: CanvasRenderingContext2D, text: string, left: number, top: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  let y = top;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (x.measureText(test).width > maxW && line) {
      x.fillText(line, left, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) x.fillText(line, left, y);
}

export async function shareWithCard(card: Parameters<typeof renderShareCard>[0], text: string, url: string) {
  const blob = await renderShareCard(card).catch(() => null);
  const file = blob ? new File([blob], 'quizwar.png', { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text}\n${url}`, title: card.title });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text, url, title: card.title });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'cancelled';
  }
}
