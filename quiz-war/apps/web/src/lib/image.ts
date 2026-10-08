/**
 * Client-side pre-compression before upload (saves mobile data on slow networks).
 * The server still validates, re-encodes to WebP and strips metadata.
 */
export async function compressImage(file: File, maxSize = 1024, quality = 0.86): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image is too large (max 15 MB)');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  } catch {
    throw new Error('This image could not be read');
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
  if (blob && blob.type === 'image/webp') return blob;
  return (await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality)))!;
}

export async function uploadImage(path: string, file: File, apiFn: (p: string, o: any) => Promise<any>) {
  const blob = await compressImage(file);
  const form = new FormData();
  form.append('file', blob, blob.type === 'image/webp' ? 'image.webp' : 'image.jpg');
  return apiFn(path, { form });
}
