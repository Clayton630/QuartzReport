const SITE_ORIGIN = "https://quartzreport.fr";
const PAGES_ASSET_ORIGIN = "https://quartzreport.pages.dev";
const REPOSITORY = "Clayton630/QuartzReport";
const BRANCH = "main";
const FEED_CACHE_SECONDS = 120;
const FEED_STALE_CACHE_SECONDS = 24 * 60 * 60;
const FEED_CACHE_VERSION = "2";
const MAX_ARTICLE_BYTES = 256 * 1024;
const MAX_IMAGE_WIDTH = 2560;
const MIN_IMAGE_WIDTH = 160;
const MIN_IMAGE_QUALITY = 40;
const MAX_IMAGE_QUALITY = 95;
const OAUTH_STATE_COOKIE = "__Host-quartzreport_oauth_state";
const OAUTH_ORIGIN_COOKIE = "__Host-quartzreport_oauth_origin";
const GITHUB_ADMIN_SCOPE = "public_repo";

function isAllowedOrigin(origin) {
  return (
    origin === SITE_ORIGIN ||
    origin === "https://www.quartzreport.fr" ||
    origin === PAGES_ASSET_ORIGIN ||
    /^https:\/\/[a-z0-9-]+\.quartzreport\.pages\.dev$/u.test(origin || "")
  );
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return { Vary: "Origin" };

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function responseWithCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(data, request, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request),
      ...(init.headers || {}),
    },
  });
}

function isArticleFile(value) {
  return (
    typeof value === "string" &&
    value.length > 3 &&
    value.length <= 200 &&
    value.endsWith(".md") &&
    !value.includes("..") &&
    !/[\\/\0\r\n]/u.test(value)
  );
}

function cookieValue(request, name) {
  const prefix = `${name}=`;
  for (const item of (request.headers.get("Cookie") || "").split(";")) {
    const value = item.trim();
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function oauthStateCookie(value, maxAge = 600) {
  return `${OAUTH_STATE_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function oauthOriginCookie(value, maxAge = 600) {
  return `${OAUTH_ORIGIN_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function oauthTargetOrigin(request) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  if (siteId) {
    try {
      const origin = new URL(`https://${siteId}`).origin;
      if (isAllowedOrigin(origin)) return origin;
    } catch {
      // Fall through to the referrer, then to the production site.
    }
  }

  try {
    const origin = new URL(request.headers.get("Referer") || "").origin;
    return isAllowedOrigin(origin) ? origin : SITE_ORIGIN;
  } catch {
    return SITE_ORIGIN;
  }
}

function clearOAuthCookies(headers) {
  headers.append("Set-Cookie", oauthStateCookie("", 0));
  headers.append("Set-Cookie", oauthOriginCookie("", 0));
  return headers;
}

function hasOnlyPublicRepoScope(scope) {
  return scope === GITHUB_ADMIN_SCOPE;
}

async function readTextLimited(response, maxBytes) {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error("Response exceeds the allowed size");
  }
  if (!response.body) throw new Error("Missing response body");

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("Response exceeds the allowed size");
      throw new Error("Response exceeds the allowed size");
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
}

async function fetchWithRetry(url, init, label) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError = error;
      continue;
    }

    if (response.ok) return response;
    lastError = new Error(`${label} returned ${response.status}`);
    if (response.status < 500 && response.status !== 429) break;
  }
  throw lastError || new Error(`${label} is unavailable`);
}

async function githubFetch(path) {
  return fetchWithRetry(
    `https://api.github.com${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "QuartzReport-PublicFeed",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
    "GitHub",
  );
}

async function fetchArticlesFeed() {
  const listingResponse = await githubFetch(
    `/repos/${REPOSITORY}/contents/articles?ref=${BRANCH}`,
  );
  const listing = JSON.parse(await readTextLimited(listingResponse, MAX_ARTICLE_BYTES));
  const files = Array.isArray(listing)
    ? listing.filter((entry) => entry.type === "file" && isArticleFile(entry.name))
    : [];

  const articles = await Promise.all(
    files.map(async (entry) => {
      const response = await fetchWithRetry(
        entry.download_url,
        { headers: { "User-Agent": "QuartzReport-PublicFeed" } },
        entry.name,
      );
      return { filename: entry.name, content: await readTextLimited(response, MAX_ARTICLE_BYTES) };
    }),
  );

  return { articles, generatedAt: new Date().toISOString() };
}

function feedCacheKey(request, state) {
  const cacheUrl = new URL("/api/articles", request.url);
  cacheUrl.searchParams.set("version", FEED_CACHE_VERSION);
  cacheUrl.searchParams.set("state", state);
  return new Request(cacheUrl, { method: "GET" });
}

function feedResponse(feed, maxAge, cacheState) {
  return new Response(JSON.stringify(feed), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "X-QuartzReport-Cache": cacheState,
    },
  });
}

async function cachedFeed(request, ctx) {
  const cache = caches.default;
  const freshKey = feedCacheKey(request, "fresh");
  const staleKey = feedCacheKey(request, "stale");
  const fresh = await cache.match(freshKey);
  if (fresh) return fresh;

  try {
    const feed = await fetchArticlesFeed();
    const freshResponse = feedResponse(feed, FEED_CACHE_SECONDS, "fresh");
    const staleResponse = feedResponse(feed, FEED_STALE_CACHE_SECONDS, "stale");
    ctx.waitUntil(
      Promise.all([
        cache.put(freshKey, freshResponse.clone()),
        cache.put(staleKey, staleResponse.clone()),
      ]),
    );
    return freshResponse;
  } catch (error) {
    const stale = await cache.match(staleKey);
    if (stale) return stale;
    throw error;
  }
}

async function legacyArticleRead(url, request, ctx) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, request, {
      status: 405,
      headers: { Allow: "GET, OPTIONS" },
    });
  }

  const prefix = `/api/repos/${REPOSITORY}/contents/articles`;
  const suffix = url.pathname.slice(prefix.length);
  const isListing = suffix === "" || suffix === "/";
  const filename = suffix.startsWith("/") ? decodeURIComponent(suffix.slice(1)) : "";
  if (!isListing && !isArticleFile(filename)) {
    return jsonResponse({ error: "Not found" }, request, { status: 404 });
  }

  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.delete("_");
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return responseWithCors(cached, request);

  const githubPath = isListing
    ? `/repos/${REPOSITORY}/contents/articles?ref=${BRANCH}`
    : `/repos/${REPOSITORY}/contents/articles/${encodeURIComponent(filename)}?ref=${BRANCH}`;
  let upstream;
  try {
    upstream = await githubFetch(githubPath);
  } catch {
    return jsonResponse({ error: "Article source unavailable" }, request, { status: 502 });
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "public, max-age=120",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return responseWithCors(response, request);
}

function imageSource(url) {
  const src = url.searchParams.get("src");
  if (!src) return null;
  try {
    const candidate = new URL(src, PAGES_ASSET_ORIGIN);
    const filename = candidate.pathname.slice("/img/uploads/".length);
    if (
      candidate.origin !== PAGES_ASSET_ORIGIN ||
      !candidate.pathname.startsWith("/img/uploads/") ||
      !filename ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..") ||
      /[\0\r\n]/u.test(filename)
    ) {
      return null;
    }
    return candidate.toString();
  } catch {
    return null;
  }
}

async function resizeImage(url) {
  const src = imageSource(url);
  const requestedWidth = Number.parseInt(url.searchParams.get("w") || "", 10);
  const requestedQuality = Number.parseInt(url.searchParams.get("q") || "85", 10);
  if (!src || !Number.isFinite(requestedWidth)) {
    return new Response("Invalid image request", { status: 400 });
  }

  const width = Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, requestedWidth));
  const quality = Math.min(MAX_IMAGE_QUALITY, Math.max(MIN_IMAGE_QUALITY, requestedQuality));
  const resizeUrl = new URL("https://images.weserv.nl/");
  resizeUrl.searchParams.set("url", src);
  resizeUrl.searchParams.set("w", String(width));
  resizeUrl.searchParams.set("q", String(quality));
  resizeUrl.searchParams.set("output", "webp");

  const upstream = await fetch(resizeUrl, {
    headers: { "User-Agent": "QuartzReport-ImageProxy" },
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/webp",
      "cache-control": "public, max-age=86400, immutable",
      Vary: "Accept-Encoding",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/img") return resizeImage(url);

    if (url.pathname === "/auth") {
      const state = randomState();
      const targetOrigin = oauthTargetOrigin(request);
      const redirect = new URL("https://github.com/login/oauth/authorize");
      redirect.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      redirect.searchParams.set("scope", GITHUB_ADMIN_SCOPE);
      redirect.searchParams.set("redirect_uri", `${url.origin}/callback?provider=github`);
      redirect.searchParams.set("state", state);
      const headers = new Headers({
        Location: redirect.toString(),
        "Cache-Control": "no-store",
      });
      headers.append("Set-Cookie", oauthStateCookie(state));
      headers.append("Set-Cookie", oauthOriginCookie(targetOrigin));
      return new Response(null, {
        status: 302,
        headers,
      });
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expectedState = cookieValue(request, OAUTH_STATE_COOKIE);
      const targetOrigin = cookieValue(request, OAUTH_ORIGIN_COOKIE);
      const callbackOrigin = isAllowedOrigin(targetOrigin) ? targetOrigin : SITE_ORIGIN;
      if (!code || !state || !constantTimeEqual(state, expectedState)) {
        return new Response("Invalid OAuth callback", {
          status: 400,
          headers: clearOAuthCookies(new Headers({ "Cache-Control": "no-store" })),
        });
      }

      const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const tokenData = await tokenResp.json();
      const token = tokenData.access_token;
      if (!token || !hasOnlyPublicRepoScope(tokenData.scope)) {
        return new Response("GitHub authorization failed", {
          status: 403,
          headers: clearOAuthCookies(new Headers({ "Cache-Control": "no-store" })),
        });
      }
      const authorizationMessage = `authorization:github:success:${JSON.stringify({ token, provider: "github" })}`;

      return new Response(
        `
        <script>
          (function() {
            if (!window.opener) return;
            var targetOrigin = ${JSON.stringify(callbackOrigin)};
            window.opener.postMessage("authorizing:github", targetOrigin);
            var msg = ${JSON.stringify(authorizationMessage)};
            window.opener.postMessage(msg, targetOrigin);
            window.close();
          })();
        </script>
      `,
        {
          headers: clearOAuthCookies(new Headers({
            "content-type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          })),
        },
      );
    }

    if (url.pathname === "/api/articles") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, request, {
          status: 405,
          headers: { Allow: "GET, OPTIONS" },
        });
      }
      try {
        return responseWithCors(await cachedFeed(request, ctx), request);
      } catch (error) {
        console.error(JSON.stringify({ message: "Feed request failed", error: String(error) }));
        return jsonResponse({ error: "Article feed unavailable" }, request, { status: 502 });
      }
    }

    const legacyPrefix = `/api/repos/${REPOSITORY}/contents/articles`;
    if (url.pathname === legacyPrefix || url.pathname.startsWith(`${legacyPrefix}/`)) {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
      return legacyArticleRead(url, request, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};

export const __test = {
  constantTimeEqual,
  imageSource,
  isAllowedOrigin,
  isArticleFile,
  hasOnlyPublicRepoScope,
  oauthTargetOrigin,
};
