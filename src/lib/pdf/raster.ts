import 'server-only';
import { createRequire } from 'node:module';
import path from 'node:path';

// The PNG download is the rendered PDF itself, so it always matches the PDF exactly.
// pdfjs-dist + @napi-rs/canvas are server external packages (see next.config.ts).

// Resolved at runtime from the app root: webpack rewrites `createRequire(import.meta.url)` into its own
// module require, which returns a module id instead of a file path.
function standardFontsDir(): string {
  const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'));
  return path.join(path.dirname(nodeRequire.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
}

/** Renders every page of a PDF and stacks them vertically into one PNG. `scale` 2 ≈ 144 dpi. */
export async function pdfToPng(pdf: Uint8Array, scale = 2): Promise<Buffer> {
  // Loaded lazily so a missing native canvas binary can only break PNG export, never the PDF route.
  const [{ getDocument }, { createCanvas }] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('@napi-rs/canvas')]);
  // pdfjs takes ownership of (detaches) the buffer it is given, so pass a copy.
  const doc = await getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: standardFontsDir(), isEvalSupported: false })
    .promise;
  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // pdfjs' canvas typings are the DOM ones; @napi-rs/canvas implements the same API.
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as never, viewport }).promise;
      pages.push(canvas);
    }
    if (pages.length === 1) return pages[0].toBuffer('image/png');

    const gap = Math.round(12 * scale);
    const width = Math.max(...pages.map((p) => p.width));
    const height = pages.reduce((h, p) => h + p.height, 0) + gap * (pages.length - 1);
    const out = createCanvas(width, height);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, width, height);
    let y = 0;
    for (const p of pages) {
      ctx.drawImage(p, 0, y);
      y += p.height + gap;
    }
    return out.toBuffer('image/png');
  } finally {
    await doc.destroy();
  }
}
