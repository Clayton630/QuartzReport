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

test("admin OAuth only accepts the public-repository permission", () => {
  assert.equal(__test.hasOnlyPublicRepoScope("public_repo"), true);
  assert.equal(__test.hasOnlyPublicRepoScope("repo"), false);
  assert.equal(__test.hasOnlyPublicRepoScope("public_repo,user"), false);
  assert.equal(__test.hasOnlyPublicRepoScope(undefined), false);
});

test("OAuth callback only targets QuartzReport origins", () => {
  const previewRequest = new Request(
    "https://quartzreport-oauth.claytonelhorga.workers.dev/auth?site_id=2e42426c.quartzreport.pages.dev",
  );
  const externalRequest = new Request(
    "https://quartzreport-oauth.claytonelhorga.workers.dev/auth?site_id=example.com",
  );
  const malformedRequest = new Request(
    "https://quartzreport-oauth.claytonelhorga.workers.dev/auth?site_id=quartzreport.pages.dev%2F%40example.com",
  );

  assert.equal(__test.oauthTargetOrigin(previewRequest), "https://2e42426c.quartzreport.pages.dev");
  assert.equal(__test.oauthTargetOrigin(externalRequest), "https://quartzreport.fr");
  assert.equal(__test.oauthTargetOrigin(malformedRequest), "https://quartzreport.pages.dev");
});

test("only QuartzReport origins receive API CORS access", () => {
  assert.equal(__test.isAllowedOrigin("https://quartzreport.fr"), true);
  assert.equal(__test.isAllowedOrigin("https://www.quartzreport.fr"), true);
  assert.equal(__test.isAllowedOrigin("https://quartzreport.pages.dev"), true);
  assert.equal(__test.isAllowedOrigin("https://20859af1.quartzreport.pages.dev"), true);
  assert.equal(__test.isAllowedOrigin("https://example.com"), false);
});
