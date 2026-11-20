// Imprime una hoja de cartas (src/print/cardSheet.ts) a PDF en el móvil y la comparte: las imágenes se
// descargan primero (el CDN de Scryfall necesita nuestro User-Agent) y se incrustan, para que el PDF las tenga todas.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildCardSheet, type PrintCard, type SheetOptions } from '@/print/cardSheet';

const HEADERS = { 'User-Agent': 'MagicSwipe/1.0', Accept: 'image/*' };
/** A4 a 72 PPP. */
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

/** Construye la hoja, la imprime a PDF y abre el menú de compartir (guardar, enviar, imprimir). `onProgress` = imágenes listas. */
export async function printCardSheet(cards: PrintCard[], o: SheetOptions, onProgress?: (done: number, total: number) => void) {
  const urls = [...new Set(cards.flatMap((c) => [c.image, o.backs ? c.back : null]).filter((u): u is string => !!u))];
  const data: Record<string, string | null> = {};
  let done = 0;
  // De pocas en pocas.
  for (let i = 0; i < urls.length; i += 4) {
    const chunk = urls.slice(i, i + 4);
    const got = await Promise.all(chunk.map(asDataUrl));
    chunk.forEach((u, k) => (data[u] = got[k]));
    done += chunk.length;
    onProgress?.(done, urls.length);
  }
  const embedded = cards.map((c) => ({ ...c, image: c.image ? (data[c.image] ?? c.image) : null, back: c.back ? (data[c.back] ?? c.back) : null }));
  // La hoja pide la imagen `large`; las data URLs no tienen esa ruta, así que en ellas no cambia nada.
  const html = buildCardSheet(embedded, o);
  const { uri } = await Print.printToFileAsync({ html, ...A4 });
  const dest = new File(Paths.cache, `${o.title.replace(/[\/:*?"<>|]/g, '').slice(0, 60) || 'cartas'}.pdf`);
  try {
    if (dest.exists) dest.delete();
    new File(uri).move(dest);
  } catch {
    /* conserva el nombre original */
  }
  await Sharing.shareAsync(dest.exists ? dest.uri : uri, { mimeType: 'application/pdf', dialogTitle: o.title, UTI: 'com.adobe.pdf' });
}
