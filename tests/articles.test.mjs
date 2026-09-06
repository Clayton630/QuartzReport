import assert from "node:assert/strict";
import test from "node:test";

import { __test as articleTest } from "../src/lib/articles.js";
import { __test as imageTest, optimizedImageUrl } from "../src/lib/images.js";

test("front matter preserves folded descriptions and quoted values", () => {
  const source = `---\ntitle: "Titre : test"\ndescription: Première ligne\n  seconde ligne\n---\nTexte`;
  const { meta, body } = articleTest.parseFrontMatter(source);

  assert.equal(meta.title, "Titre : test");
  assert.equal(meta.description, "Première ligne seconde ligne");
  assert.equal(body, "Texte");
});

test("invalid article dates fall back to the date in the filename", () => {
  assert.equal(
    articleTest.articleDate("not-a-date", "2025-10-07-article.md").toISOString(),
    "2025-10-07T12:00:00.000Z",
  );
});

test("local image paths are encoded exactly once", () => {
  assert.equal(
    optimizedImageUrl("/img/uploads/mi79_renove%CC%81_bourg_la_reine.jpg", 1280),
    "/cdn-cgi/image/width=1280,quality=85,format=webp/img/uploads/mi79_renove%CC%81_bourg_la_reine.jpg",
  );
});

test("image dimension readers reject unrelated data", () => {
  const unrelated = Buffer.from("not an image");
  assert.equal(imageTest.readPngDimensions(unrelated), null);
  assert.equal(imageTest.readJpegDimensions(unrelated), null);
  assert.equal(imageTest.readWebpDimensions(unrelated), null);
});
