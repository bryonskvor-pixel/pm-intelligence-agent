import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const files = process.argv.slice(2);

for (const path of files) {
  try {
    const bytes = fs.readFileSync(path);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    const pages = doc.getPageCount();
    const first = doc.getPage(0).getSize();
    console.log(path, '->', pages, 'pages, first page size:', Math.round(first.width), 'x', Math.round(first.height), 'pts');
  } catch (e) {
    console.log(path, '-> ERROR', e.message);
  }
}
