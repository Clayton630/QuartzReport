import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { getArticles } from '../src/lib/articles.js';
import { coverVariants, variantPath } from '../src/lib/cover-variants.js';
import { coverPreview } from '../src/lib/cover-previews.js';

test('every existing cover has all six static previews', async () => {
  for (const article of await getArticles()) {
    for (const { kind, widths } of coverVariants) {
      const preview = coverPreview(article.thumbnail, kind);
      assert.equal(preview.srcset.split(', ').length, 3);
      for (const width of widths) await access(join(process.cwd(), 'public', variantPath(article.thumbnail, kind, width)));
    }
  }
});

test('variant paths are stable, safe and distinct for remote and accented sources', () => {
  const source = 'https://example.test/image été.png';
  assert.equal(variantPath(source, 'card', 320), variantPath(source, 'card', 320));
  assert.match(variantPath(source, 'square', 72), /^\/img\/cover-previews\/[a-f0-9]+-square-72\.jpg$/);
  assert.notEqual(variantPath(source, 'square', 72), variantPath(source + '2', 'square', 72));
});
