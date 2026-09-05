import assert from "node:assert/strict";
import test from "node:test";

import { __test } from "../worker/index.js";

test("only legitimate article filenames are accepted", () => {
  assert.equal(__test.isArticleFile("2025-10-07-test-catégorie.md"), true);
  assert.equal(__test.isArticleFile("../private.md"), false);
  assert.equal(__test.isArticleFile("nested/article.md"), false);
  assert.equal(__test.isArticleFile("article.txt"), false);
});

test("OAuth state comparisons reject missing and altered values", () => {
  assert.equal(__test.constantTimeEqual("same-state", "same-state"), true);
  assert.equal(__test.constantTimeEqual("same-state", "other-state"), false);
  assert.equal(__test.constantTimeEqual("same-state", null), false);
});

test("only QuartzReport Pages origins receive API CORS access", () => {
  assert.equal(__test.isAllowedOrigin("https://quartzreport.pages.dev"), true);
  assert.equal(__test.isAllowedOrigin("https://20859af1.quartzreport.pages.dev"), true);
  assert.equal(__test.isAllowedOrigin("https://example.com"), false);
});

test("image resizing accepts local uploads and rejects external or traversal sources", () => {
  const local = new URL("https://worker.example/img?src=%2Fimg%2Fuploads%2Fcover.png&w=800");
  const external = new URL("https://worker.example/img?src=https%3A%2F%2Fexample.com%2Fcover.png&w=800");
  const traversal = new URL("https://worker.example/img?src=%2Fimg%2Fuploads%2F..%2Fadmin%2Findex.html&w=800");

  assert.equal(__test.imageSource(local), "https://quartzreport.pages.dev/img/uploads/cover.png");
  assert.equal(__test.imageSource(external), null);
  assert.equal(__test.imageSource(traversal), null);
});
