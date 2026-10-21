import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { getArticles } from '../src/lib/articles.js';
import { coverVariants, variantPath } from '../src/lib/cover-variants.js';

const sources = [...new Set((await getArticles()).map((article) => article.thumbnail))];
let total = 0;
for (const source of sources) {
  let bytes;
  if (source.startsWith('/')) bytes = await readFile(join(process.cwd(), 'public', decodeURIComponent(source)));
  else {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com' || !url.pathname.startsWith('/Clayton630/QuartzReport/')) throw new Error(`Source non autorisée : ${source}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Image indisponible : ${source}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  for (const { kind, widths } of coverVariants) for (const width of widths) {
    const height = kind === 'square' ? width : Math.round(width * 9 / 16);
    const output = await sharp(bytes).rotate().resize(width, height, { fit: 'cover', position: 'centre' }).flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const target = join(process.cwd(), 'public', variantPath(source, kind, width));
    await mkdir(join(process.cwd(), 'public/img/cover-previews'), { recursive: true });
    await writeFile(target, output);
    total += output.length;
  }
}
console.log(`${sources.length} couvertures, ${sources.length * 6} variantes, ${(total / 1024 / 1024).toFixed(2)} Mio.`);
