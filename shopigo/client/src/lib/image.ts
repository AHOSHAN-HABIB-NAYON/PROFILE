export type ImgSize = 'thumb' | 'md' | 'lg';
const WIDTH: Record<ImgSize, number> = { thumb: 240, md: 640, lg: 1280 };

export function img(path: string | null | undefined, size: ImgSize = 'md', fmt: 'webp' | 'avif' | 'jpg' = 'webp'): string {
  if (!path) return '';
  if (/^(https?:|data:|blob:|\/)/.test(path)) return path;
  if (fmt === 'jpg') return `/uploads/${path}-lg.jpg`;
  return `/uploads/${path}-${size}.${fmt}`;
}

export function srcSet(path: string, fmt: 'webp' | 'avif', sizes: ImgSize[] = ['thumb', 'md', 'lg']): string {
  return sizes.map((s) => `${img(path, s, fmt)} ${WIDTH[s]}w`).join(', ');
}

export function iconUrl(path: string | null | undefined, size: 32 | 180 | 192 | 512 = 192): string {
  return path ? `/uploads/${path}-${size}.png` : '/icons/icon-192.png';
}

export function logoUrl(path: string | null | undefined): string {
  return path ? `/uploads/${path}-logo.webp` : '';
}
