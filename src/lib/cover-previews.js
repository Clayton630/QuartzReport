import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { coverVariants, variantPath } from './cover-variants.js';
import { originalImageUrl } from './images.js';

export function coverPreview(source, kind) {
  const widths = coverVariants.find((item) => item.kind === kind).widths;
  const available = widths.filter((width) => existsSync(join(process.cwd(), 'public', variantPath(source, kind, width))));
  return {
    src: available.length ? variantPath(source, kind, available[0]) : originalImageUrl(source),
    srcset: available.length ? available.map((width) => `${variantPath(source, kind, width)} ${width}w`).join(', ') : undefined,
  };
}
