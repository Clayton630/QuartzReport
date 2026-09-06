const SITE_ORIGIN = "https://quartzreport.fr";
const PAGES_ASSET_ORIGIN = "https://quartzreport.pages.dev";
const REPOSITORY = "Clayton630/QuartzReport";
const BRANCH = "main";
const FEED_CACHE_SECONDS = 120;
const FEED_STALE_CACHE_SECONDS = 24 * 60 * 60;
const FEED_CACHE_VERSION = "2";
const MAX_ARTICLE_BYTES = 256 * 1024;
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

    return new Response("Not found", { status: 404 });
  },
};

export const __test = {
  constantTimeEqual,
  isAllowedOrigin,
  isArticleFile,
  hasOnlyPublicRepoScope,
  oauthTargetOrigin,
};
