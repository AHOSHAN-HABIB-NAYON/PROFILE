import { describe, expect, it } from 'vitest';
import { ImageService, sanitizeSvg } from '../src/modules/uploads/image.service';

const stored: { key: string; type?: string; data: Buffer }[] = [];
const images = new ImageService({ put: async (key, data, type) => (stored.push({ key, type, data }), `/media/${key}`), remove: async () => undefined }, 2 * 1024 * 1024);

describe('category icons', () => {
  it('keeps an uploaded SVG as SVG (text stays sharp) with scripts removed', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><circle cx="12" cy="12" r="10" fill="#f42a41"/></a><text x="4" y="40">বিসিএস</text></svg>');
    const r = await images.categoryIcon(svg);
    expect(r.url).toMatch(/^\/media\/categories\/.+\.svg$/);
    const out = stored.at(-1)!;
    expect(out.type).toBe('image/svg+xml');
    const text = out.data.toString('utf8');
    expect(text).not.toMatch(/script|onload|javascript:/i);
    expect(text).toContain('বিসিএস');
    expect(text).toContain('viewBox="0 0 48 48"');
  });
  it('strips foreignObject and outside links', () => {
    const s = sanitizeSvg('<svg viewBox="0 0 1 1"><foreignObject><div/></foreignObject><image href="https://evil.example/x.png"/><use href="#a"/><rect style="fill:url(https://x)"/></svg>');
    expect(s).not.toMatch(/foreignObject|evil|https:/);
    expect(s).toContain('href="#a"');
  });
  it('rejects files that are not images', async () => {
    await expect(images.categoryIcon(Buffer.from('hello world, not an image'))).rejects.toThrow();
  });
});
