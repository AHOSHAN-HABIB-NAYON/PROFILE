import { describe, expect, it } from 'vitest';
import { ImageService } from '../src/modules/uploads/image.service';

const stored: { key: string; type?: string; size: number }[] = [];
const images = new ImageService({ put: async (key, data, type) => (stored.push({ key, type, size: data.length }), `/media/${key}`), remove: async () => undefined }, 2 * 1024 * 1024);

describe('category icons', () => {
  it('renders an uploaded SVG (scripts and all) to a WebP image', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><circle cx="12" cy="12" r="10" fill="#f42a41"/></svg>');
    const r = await images.categoryIcon(svg);
    expect(r.url).toMatch(/^\/media\/categories\/.+\.webp$/);
    expect(stored.at(-1)?.type).toBe('image/webp');
  });
  it('rejects files that are not images', async () => {
    await expect(images.categoryIcon(Buffer.from('hello world, not an image'))).rejects.toThrow();
  });
});
