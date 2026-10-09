import QRCode from 'qrcode';

/**
 * Branded, shareable result card (1080×1350 — the 4:5 size Facebook/Instagram show in full).
 * Drawn on a canvas with the app's own artwork; text is always shared alongside, so nothing
 * important is image-only.
 */

export interface CardPlayer {
  name: string;
  uid: string | null;
  avatarUrl: string | null;
  score: number;
  correct: number;
  answered: number;
  team: number;
  isBot: boolean;
  isMe: boolean;
}

export interface ResultCardData {
  lang: 'bn' | 'en';
  outcome: 'win' | 'loss' | 'draw' | 'solo';
  headline: string;
  subline: string;
  /** Short facts shown as pills under the headline (category, questions, accuracy…). */
  details?: { label: string; value: string }[];
  date: string;
  teamScores: number[];
  teams: number;
  myTeam: number;
  winnerTeam: number | null;
  players: CardPlayer[];
  appUrl: string;
  profileUrl: string;
  ctaText: string;
  labels: { correct: string; points: string; teamBlue: string; teamRed: string; you: string; ai: string };
}

const W = 1080;
const H = 1350;
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const numFmt = (n: number | string, lang: 'bn' | 'en') => {
  const s = typeof n === 'number' ? n.toLocaleString('en-US') : n;
  return lang === 'bn' ? s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : s;
};

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#g)"/><circle cx="256" cy="256" r="150" fill="none" stroke="#22d3ee" stroke-width="18"/><path d="M168 344 L328 184 M184 168 l-24 24 M344 328 l-24 24" stroke="#fff" stroke-width="30" stroke-linecap="round"/><path d="M344 344 L184 184 M328 168 l24 24 M168 328 l24 24" stroke="#fde047" stroke-width="30" stroke-linecap="round"/><circle cx="256" cy="256" r="34" fill="#f42a41" stroke="#fff" stroke-width="10"/></svg>`;

const ICON_PATHS: Record<string, string> = {
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
};

function iconSvg(name: string, color: string, stroke = 2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

function medalSvg(rank: number) {
  const c: Record<number, [string, string, string, string]> = {
    1: ['#fde68a', '#d39a06', '#8a6100', '#dc2626'],
    2: ['#f1f5f9', '#94a3b8', '#475569', '#2563eb'],
    3: ['#fcd9b6', '#c2773a', '#7c4316', '#16a34a'],
  };
  const [a, b, rim, ribbon] = c[rank];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path d="M12 2h6l3 8h-6zM28 2h-6l-3 8h6z" fill="${ribbon}"/><circle cx="20" cy="24" r="13" fill="url(#m)" stroke="${rim}" stroke-width="2"/><circle cx="20" cy="24" r="9.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><text x="20" y="28.5" text-anchor="middle" font-size="12" font-weight="800" fill="${rim}" font-family="sans-serif">${rank}</text></svg>`;
}

function loadImage(src: string, cors = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
const svgImage = (svg: string) => loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

function roundRect(x: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(left + r, top);
  x.arcTo(left + w, top, left + w, top + h, r);
  x.arcTo(left + w, top + h, left, top + h, r);
  x.arcTo(left, top + h, left, top, r);
  x.arcTo(left, top, left + w, top, r);
  x.closePath();
}

function fitText(x: CanvasRenderingContext2D, text: string, maxW: number) {
  if (x.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && x.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

export async function renderResultCard(d: ResultCardData): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return null;
  const F = (w: number, s: number) => `${w} ${s}px 'Hind Siliguri', 'Plus Jakarta Sans Variable', sans-serif`;
  const L = (w: number, s: number) => `${w} ${s}px 'Plus Jakarta Sans Variable', 'Hind Siliguri', sans-serif`;
  try {
    await Promise.all([document.fonts.load(F(700, 40), 'অআ'), document.fonts.load(L(800, 40), 'QUIZ')]);
  } catch {
    /* fonts are optional */
  }

  // Background: night gradient, glows and a fine diagonal texture.
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1e3a8a');
  bg.addColorStop(0.55, '#111a46');
  bg.addColorStop(1, '#0b1336');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  const glow = (cx: number, cy: number, r: number, color: string) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  };
  glow(W * 0.85, 120, 520, 'rgba(59,130,246,.45)');
  glow(80, H * 0.9, 560, 'rgba(124,58,237,.35)');
  const accent = d.outcome === 'win' ? 'rgba(250,204,21,.28)' : d.outcome === 'loss' ? 'rgba(148,163,184,.18)' : 'rgba(34,211,238,.22)';
  glow(W / 2, 380, 420, accent);
  x.save();
  x.globalAlpha = 0.05;
  x.strokeStyle = '#fff';
  x.lineWidth = 2;
  for (let i = -H; i < W; i += 28) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + H, H);
    x.stroke();
  }
  x.restore();

  // Header: logo + wordmark + flag stripe.
  const logo = await svgImage(LOGO_SVG);
  if (logo) x.drawImage(logo, 64, 56, 104, 104);
  x.fillStyle = '#fff';
  x.font = L(800, 54);
  x.fillText('QUIZ WAR', 192, 112);
  x.font = L(800, 22);
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.fillText('B A N G L A D E S H', 194, 148);
  x.fillStyle = '#006a4e';
  roundRect(x, 194, 160, 90, 6, 3);
  x.fill();
  x.fillStyle = '#f42a41';
  roundRect(x, 290, 160, 30, 6, 3);
  x.fill();
  x.textAlign = 'right';
  x.font = F(600, 28);
  x.fillStyle = 'rgba(255,255,255,.8)';
  x.fillText(d.date, W - 64, 104);
  x.textAlign = 'left';

  // Hero: result word + icon.
  const heroIcon = d.outcome === 'win' ? 'trophy' : d.outcome === 'loss' ? 'shield' : d.outcome === 'draw' ? 'handshake' : 'target';
  const iconColor = d.outcome === 'win' ? '#fde047' : d.outcome === 'loss' ? '#cbd5e1' : '#67e8f9';
  const ic = await svgImage(iconSvg(heroIcon, iconColor, 1.6));
  // halo
  x.save();
  x.beginPath();
  x.arc(W - 190, 330, 118, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,255,255,.07)';
  x.fill();
  x.lineWidth = 3;
  x.strokeStyle = 'rgba(255,255,255,.18)';
  x.stroke();
  x.restore();
  if (ic) x.drawImage(ic, W - 290, 230, 200, 200);

  const headGrad = x.createLinearGradient(64, 230, 64, 360);
  if (d.outcome === 'win') {
    headGrad.addColorStop(0, '#fef08a');
    headGrad.addColorStop(1, '#f59e0b');
  } else {
    headGrad.addColorStop(0, '#ffffff');
    headGrad.addColorStop(1, '#bfdbfe');
  }
  x.fillStyle = headGrad;
  x.font = F(800, d.lang === 'bn' ? 120 : 112);
  x.fillText(fitText(x, d.headline, W - 380), 64, 340);
  x.fillStyle = 'rgba(255,255,255,.85)';
  x.font = F(600, 36);
  x.fillText(fitText(x, d.subline, W - 380), 68, 400);

  // Team score line for battles.
  let y = 470;
  if (d.details?.length) {
    // Fact pills: what was played, so the image stands on its own on social media.
    let px = 64;
    const py = 430;
    for (const f of d.details.slice(0, 4)) {
      x.font = F(700, 24);
      const v = fitText(x, f.value, 260);
      x.font = F(600, 20);
      const l = fitText(x, f.label, 200);
      x.font = F(700, 24);
      const vw = x.measureText(v).width;
      x.font = F(600, 20);
      const lw = x.measureText(l).width;
      const w = Math.max(vw, lw) + 32;
      if (px + w > W - 64) break;
      roundRect(x, px, py, w, 62, 16);
      x.fillStyle = 'rgba(255,255,255,.1)';
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,.16)';
      x.lineWidth = 1.5;
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,.65)';
      x.font = F(600, 20);
      x.fillText(l, px + 16, py + 24);
      x.fillStyle = '#fff';
      x.font = F(700, 24);
      x.fillText(v, px + 16, py + 52);
      px += w + 12;
    }
    y = 512;
  }
  if (d.teams > 1) {
    const [a, b] = [d.teamScores[d.myTeam] ?? 0, d.teamScores.find((_, i) => i !== d.myTeam) ?? 0];
    roundRect(x, 64, y, W - 128, 120, 28);
    x.fillStyle = 'rgba(255,255,255,.08)';
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.14)';
    x.lineWidth = 2;
    x.stroke();
    x.font = F(700, 30);
    x.fillStyle = '#93c5fd';
    x.fillText(d.labels.you, 104, y + 50);
    x.textAlign = 'right';
    x.fillStyle = '#fca5a5';
    x.fillText(d.myTeam === 0 ? d.labels.teamRed : d.labels.teamBlue, W - 104, y + 50);
    x.textAlign = 'center';
    x.font = L(800, 70);
    x.fillStyle = '#fff';
    x.fillText(`${numFmt(a, d.lang)}  :  ${numFmt(b, d.lang)}`, W / 2, y + 86);
    x.textAlign = 'left';
    y += 150;
  } else y += 10;

  // Ranked player list.
  const sorted = [...d.players].sort((p, q) => q.score - p.score).slice(0, 8);
  // Rows grow when there are few players and the list sits centred in the free space.
  const rowH = Math.min(124, Math.floor((1150 - y) / Math.max(1, sorted.length)));
  y += Math.max(0, Math.floor((1150 - y - rowH * sorted.length) / 2) - 20);
  const avatars = await Promise.all(sorted.map((p) => (p.avatarUrl && !p.isBot ? loadImage(p.avatarUrl, true) : Promise.resolve(null))));
  const medals = await Promise.all([1, 2, 3].map((r) => svgImage(medalSvg(r))));
  const crown = await svgImage(iconSvg('crown', '#fde047', 2.2));
  const botIc = await svgImage(iconSvg('bot', '#0e7490', 2));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const top = y + i * rowH;
    const winner = d.winnerTeam !== null && p.team === d.winnerTeam && d.teams > 1;
    roundRect(x, 64, top + 6, W - 128, rowH - 12, 24);
    x.fillStyle = p.isMe ? 'rgba(59,130,246,.28)' : winner ? 'rgba(250,204,21,.12)' : 'rgba(255,255,255,.06)';
    x.fill();
    if (p.isMe) {
      x.strokeStyle = 'rgba(147,197,253,.8)';
      x.lineWidth = 3;
      x.stroke();
    }
    const cy = top + rowH / 2;
    // rank
    if (i < 3 && medals[i]) x.drawImage(medals[i]!, 84, cy - 30, 60, 60);
    else {
      x.textAlign = 'center';
      x.font = L(800, 34);
      x.fillStyle = 'rgba(255,255,255,.7)';
      x.fillText(numFmt(i + 1, d.lang), 114, cy + 12);
      x.textAlign = 'left';
    }
    // avatar
    const ax = 160;
    const ar = Math.min(40, rowH / 2 - 14);
    x.save();
    x.beginPath();
    x.arc(ax + ar, cy, ar, 0, Math.PI * 2);
    x.closePath();
    x.clip();
    if (avatars[i]) x.drawImage(avatars[i]!, ax, cy - ar, ar * 2, ar * 2);
    else {
      const ag = x.createLinearGradient(ax, cy - ar, ax + ar * 2, cy + ar);
      ag.addColorStop(0, p.isBot ? '#cffafe' : '#dbeafe');
      ag.addColorStop(1, p.isBot ? '#ede9fe' : '#ede4ff');
      x.fillStyle = ag;
      x.fillRect(ax, cy - ar, ar * 2, ar * 2);
      if (p.isBot && botIc) x.drawImage(botIc, ax + ar * 0.45, cy - ar * 0.55, ar * 1.1, ar * 1.1);
      else {
        x.fillStyle = '#1e40af';
        x.font = F(800, ar);
        x.textAlign = 'center';
        x.fillText((p.name.trim()[0] ?? '?').toUpperCase(), ax + ar, cy + ar * 0.36);
        x.textAlign = 'left';
      }
    }
    x.restore();
    x.beginPath();
    x.arc(ax + ar, cy, ar, 0, Math.PI * 2);
    x.lineWidth = 3;
    x.strokeStyle = d.teams > 1 ? (p.team === 0 ? '#60a5fa' : '#f87171') : 'rgba(255,255,255,.6)';
    x.stroke();
    if (winner && crown && i === 0) x.drawImage(crown, ax + ar - 18, cy - ar - 26, 36, 36);
    // name + uid + correct
    const tx = ax + ar * 2 + 22;
    x.fillStyle = '#fff';
    x.font = F(700, 34);
    x.fillText(fitText(x, p.name + (p.isMe ? ` (${d.labels.you})` : ''), 520), tx, cy - 4);
    x.font = F(600, 23);
    x.fillStyle = 'rgba(255,255,255,.7)';
    const meta = `${p.isBot ? d.labels.ai : (p.uid ?? '')}  ·  ${numFmt(p.correct, d.lang)}/${numFmt(p.answered, d.lang)} ${d.labels.correct}`;
    x.fillText(fitText(x, meta, 520), tx, cy + 30);
    // score
    x.textAlign = 'right';
    x.font = L(800, 46);
    x.fillStyle = i === 0 ? '#fde047' : '#fff';
    x.fillText(numFmt(p.score, d.lang), W - 96, cy + 8);
    x.font = F(600, 20);
    x.fillStyle = 'rgba(255,255,255,.6)';
    x.fillText(d.labels.points, W - 96, cy + 34);
    x.textAlign = 'left';
  }

  // Footer: call to action + QR to the player's profile.
  const fy = 1180;
  roundRect(x, 64, fy, W - 128, 126, 28);
  x.fillStyle = 'rgba(255,255,255,.95)';
  x.fill();
  x.fillStyle = '#0f172a';
  x.font = F(800, 32);
  x.fillText(fitText(x, d.ctaText, 700), 96, fy + 56);
  x.font = L(700, 26);
  x.fillStyle = '#1d4ed8';
  x.fillText(d.appUrl.replace(/^https?:\/\//, ''), 96, fy + 98);
  try {
    const qr = document.createElement('canvas');
    await QRCode.toCanvas(qr, d.profileUrl, { width: 104, margin: 0, color: { dark: '#0f172a', light: '#ffffff' } });
    x.drawImage(qr, W - 64 - 116, fy + 11, 104, 104);
  } catch {
    /* QR optional */
  }

  return new Promise((r) => c.toBlob(r, 'image/png'));
}

/** Simple card (profile / achievement) kept for other share buttons. */
export async function renderShareCard(o: { title: string; subtitle: string; big: string; footer: string; accent?: string }): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1080;
  const x = c.getContext('2d');
  if (!x) return null;
  const g = x.createLinearGradient(0, 0, 1080, 1080);
  g.addColorStop(0, o.accent ?? '#1d4ed8');
  g.addColorStop(1, '#1e1b4b');
  x.fillStyle = g;
  x.fillRect(0, 0, 1080, 1080);
  const logo = await svgImage(LOGO_SVG);
  if (logo) x.drawImage(logo, 80, 70, 96, 96);
  x.fillStyle = '#fff';
  x.font = "800 44px 'Plus Jakarta Sans Variable', sans-serif";
  x.fillText('QUIZ WAR · BANGLADESH', 200, 132);
  x.font = "800 96px 'Hind Siliguri', sans-serif";
  x.fillText(o.title, 80, 360);
  x.font = "600 46px 'Hind Siliguri', sans-serif";
  x.fillStyle = 'rgba(255,255,255,.85)';
  x.fillText(o.subtitle, 80, 450);
  x.font = "900 150px 'Plus Jakarta Sans Variable', sans-serif";
  x.fillStyle = '#fde047';
  x.fillText(o.big, 80, 760);
  x.font = "700 40px 'Plus Jakarta Sans Variable', sans-serif";
  x.fillStyle = 'rgba(255,255,255,.8)';
  x.fillText(o.footer, 80, 980);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
