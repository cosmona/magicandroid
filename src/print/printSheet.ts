// Prints a card sheet (src/print/cardSheet.ts) to PDF on the phone and shares it: the images are downloaded
// first (Scryfall's CDN needs our User-Agent) and embedded, so the PDF has them all.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildCardSheet, type PrintCard, type SheetOptions } from '@/print/cardSheet';

const HEADERS = { 'User-Agent': 'MagicSwipe/1.0', Accept: 'image/*' };
/** A4 at 72 PPI. */
const A4 = { width: 595, height: 842 };

async function asDataUrl(url: string): Promise<string | null> {
  try {
    const name = `print-${url.split('/').pop()?.split('?')[0] ?? Date.now()}`;
    const file = await File.downloadFileAsync(url.replace('/normal/', '/large/'), new File(Paths.cache, name), { idempotent: true, headers: HEADERS });
    return `data:image/jpeg;base64,${await file.base64()}`;
  } catch {
    return null;
  }
}

/** Builds the sheet, prints it to PDF and opens the share menu (save, send, print). `onProgress` = images ready. */
export async function printCardSheet(cards: PrintCard[], o: SheetOptions, onProgress?: (done: number, total: number) => void) {
  const urls = [...new Set(cards.flatMap((c) => [c.image, o.backs ? c.back : null]).filter((u): u is string => !!u))];
  const data: Record<string, string | null> = {};
  let done = 0;
  // A few at a time.
  for (let i = 0; i < urls.length; i += 4) {
    const chunk = urls.slice(i, i + 4);
    const got = await Promise.all(chunk.map(asDataUrl));
    chunk.forEach((u, k) => (data[u] = got[k]));
    done += chunk.length;
    onProgress?.(done, urls.length);
  }
  const embedded = cards.map((c) => ({ ...c, image: c.image ? (data[c.image] ?? c.image) : null, back: c.back ? (data[c.back] ?? c.back) : null }));
  // The sheet asks for the `large` image; the data URLs have no such path, so nothing changes in them.
  const html = buildCardSheet(embedded, o);
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  const dest = new File(Paths.cache, `${o.title.replace(/[\/:*?"<>|]/g, '').slice(0, 60) || 'cartas'}.pdf`);
  try {
    if (dest.exists) dest.delete();
    new File(uri).move(dest);
  } catch {
    /* keep the original name */
  }
  await Sharing.shareAsync(dest.exists ? dest.uri : uri, { mimeType: 'application/pdf', dialogTitle: o.title, UTI: 'com.adobe.pdf' });
}
