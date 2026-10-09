import { registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './platform';

/** Native plugin (MainActivity) — writes to Pictures/QUIZ WAR via MediaStore, no storage permission needed. */
const QwGallery = registerPlugin<{ saveImage(o: { base64: string; fileName: string }): Promise<{ uri: string }> }>('QwGallery');

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Share a PNG with text — native share sheet on Android, Web Share (files) in browsers, text fallback otherwise. */
export async function shareImage(blob: Blob | null, o: { title: string; text: string; url: string; fileName: string }): Promise<ShareOutcome> {
  try {
    if (isNative) {
      if (blob) {
        const file = await Filesystem.writeFile({ path: o.fileName, data: await toBase64(blob), directory: Directory.Cache });
        await Share.share({ title: o.title, text: `${o.text}\n${o.url}`, files: [file.uri], dialogTitle: o.title });
      } else await Share.share({ title: o.title, text: o.text, url: o.url, dialogTitle: o.title });
      return 'shared';
    }
    if (blob && navigator.canShare) {
      const file = new File([blob], o.fileName, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: o.title, text: `${o.text}\n${o.url}` });
        return 'shared';
      }
    }
    if (navigator.share) {
      await navigator.share({ title: o.title, text: o.text, url: o.url });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${o.text}\n${o.url}`);
    return 'copied';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : /cancel/i.test(String((e as Error)?.message)) ? 'cancelled' : 'failed';
  }
}

/** Save a PNG to the phone gallery (native) or download it (web). */
export async function saveImage(blob: Blob, fileName: string): Promise<'saved' | 'downloaded' | 'failed'> {
  if (isNative) {
    try {
      await QwGallery.saveImage({ base64: await toBase64(blob), fileName });
      return 'saved';
    } catch {
      // Older Android (< 10) or plugin missing: fall back to the share sheet so the user can still keep it.
      try {
        const file = await Filesystem.writeFile({ path: fileName, data: await toBase64(blob), directory: Directory.Cache });
        await Share.share({ files: [file.uri] });
        return 'saved';
      } catch {
        return 'failed';
      }
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
