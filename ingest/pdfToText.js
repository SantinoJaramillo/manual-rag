// ingest/pdfToPages.js
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function pdfToPages(filePath) {
  if (!filePath) throw new Error('pdfToPages: filePath saknas');

  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  await fs.access(abs);

  const buf = await fs.readFile(abs);
  const data = new Uint8Array(buf);

  // (Tystar font-varningar)
  const require = createRequire(import.meta.url);
  const pdfjsBase = path.dirname(require('pdfjs-dist/package.json'));
  const standardFontDataUrl = path.join(pdfjsBase, 'standard_fonts/');

  const pdfDoc = await getDocument({ data, standardFontDataUrl }).promise;

  const pages = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map(it => (typeof it.str === 'string' ? it.str : '')).join(' ');
    pages.push({
      page: pageNum, // 1-baserat sidnummer
      text: text
        .replace(/\r/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim(),
    });
  }
  return pages;
}

export default pdfToPages;
