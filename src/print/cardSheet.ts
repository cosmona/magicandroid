// Printable sheets of cards (a «contact sheet»): the card images at their real size (63 × 88 mm), nine per
// A4 page, with optional cut lines, a header and the names under each card. Pure: it only builds the HTML;
// the desktop saves it as PDF (`savePdf`).

export interface PrintCard {
  name: string;
  /** Image URL (Scryfall `normal` / `large`). */
  image: string | null;
  /** Back face, for double-faced cards (printed after the front). */
  back?: string | null;
  /** Copies to print. */
  copies: number;
  /** A basic land (they can be left out). */
  basic?: boolean;
}

export interface SheetOptions {
  title: string;
  /** Every copy (4 × Rayo) or one of each. */
  allCopies: boolean;
  /** Both faces of double-faced cards. */
  backs: boolean;
  /** Real size (63 × 88 mm, 9 per page) or small (a contact sheet: 4 × 4 per page, 16 per page). */
  size: 'real' | 'small';
  /** Thin lines between the cards to cut them. */
  cutLines: boolean;
  /** Each card's name under it (small sheets). */
  names: boolean;
}

/** A basic land, from its type line (English or Spanish). */
export const isBasicLand = (typeLine: string) => /basic|básic/i.test(typeLine) && /land|tierra/i.test(typeLine);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The biggest image Scryfall has for a `normal` URL. */
const big = (url: string) => url.replace('/normal/', '/large/').replace('/small/', '/large/');

/** How many images the sheet will have. */
export function sheetCount(cards: PrintCard[], o: Pick<SheetOptions, 'allCopies' | 'backs'>): number {
  return cards.reduce((n, c) => n + (o.allCopies ? Math.max(1, c.copies) : 1) * (o.backs && c.back ? 2 : 1), 0);
}

export function buildCardSheet(cards: PrintCard[], o: SheetOptions): string {
  const items: { name: string; image: string | null }[] = [];
  for (const c of cards) {
    const n = o.allCopies ? Math.max(1, c.copies) : 1;
    for (let k = 0; k < n; k++) {
      items.push({ name: c.name, image: c.image });
      if (o.backs && c.back) items.push({ name: `${c.name} (reverso)`, image: c.back });
    }
  }
  const perRow = o.size === 'real' ? 3 : 4;
  const perPage = o.size === 'real' ? 9 : 16;
  const w = o.size === 'real' ? 63 : 45;
  const h = o.size === 'real' ? 88 : 62.9;
  const pages: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  const date = new Date().toLocaleDateString('es-ES');
  const page = (list: typeof items, p: number) => `
    <section class="page">
      ${o.size === 'small' || p === 0 ? `<header><b>${esc(o.title)}</b><span>${items.length} cartas · página ${p + 1} de ${pages.length} · ${date} · Magic Swipe</span></header>` : ''}
      <div class="grid">
        ${list
          .map(
            (it) => `<figure>
              ${it.image ? `<img src="${esc(big(it.image))}" alt="">` : `<div class="missing">${esc(it.name)}</div>`}
              ${o.names && o.size === 'small' ? `<figcaption>${esc(it.name)}</figcaption>` : ''}
            </figure>`,
          )
          .join('')}
      </div>
    </section>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; }
  .page { width: 210mm; height: 297mm; padding: ${o.size === 'real' ? '10mm 10.5mm' : '10mm 12mm'}; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: baseline; font-size: 9pt; margin-bottom: 3mm; height: 5mm; }
  header span { color: #777; font-size: 7.5pt; }
  .grid { display: grid; grid-template-columns: repeat(${perRow}, ${w}mm); gap: ${o.cutLines ? 0 : o.size === 'real' ? '0.5mm' : '3mm'}; justify-content: center; }
  figure { width: ${w}mm; ${o.names && o.size === 'small' ? '' : `height: ${h}mm;`} ${o.cutLines ? 'outline: 0.15mm dashed #999;' : ''} }
  img, .missing { display: block; width: ${w}mm; height: ${h}mm; border-radius: ${o.cutLines ? 0 : o.size === 'real' ? '3mm' : '2mm'}; object-fit: cover; }
  .missing { border: 0.3mm solid #aaa; display: flex; align-items: center; justify-content: center; text-align: center; padding: 4mm; font-size: 9pt; }
  figcaption { font-size: 6.5pt; text-align: center; padding: 0.6mm 0 1.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head>
<body>${pages.map(page).join('')}</body></html>`;
}
