import assert from "node:assert/strict";
import test from "node:test";

import { __test } from "../src/lib/articles.js";

test("front matter preserves folded descriptions and quoted values", () => {
  const source = `---\ntitle: "Titre : test"\ndescription: Première ligne\n  seconde ligne\n---\nTexte`;
  const { meta, body } = __test.parseFrontMatter(source);

  assert.equal(meta.title, "Titre : test");
  assert.equal(meta.description, "Première ligne seconde ligne");
  assert.equal(body, "Texte");
});

test("invalid article dates fall back to the date in the filename", () => {
  assert.equal(
    __test.articleDate("not-a-date", "2025-10-07-article.md").toISOString(),
    "2025-10-07T12:00:00.000Z",
  );
});
