import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("le catalogue des médias décrit des images valides", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/media-catalog.json", import.meta.url), "utf8"));
  assert.equal(catalog.version, 1);
  assert.ok(Array.isArray(catalog.images) && catalog.images.length > 0);
  for (const image of catalog.images) {
    assert.match(image.path, /^\/img\/uploads\//);
    assert.match(image.sha256, /^[a-f0-9]{64}$/);
    assert.match(image.dhash, /^[a-f0-9]{16}$/);
    assert.ok(image.width > 0 && image.height > 0 && image.bytes > 0);
  }
});
