const SITE_ORIGIN = "https://quartzreport.pages.dev";
const REPOSITORY = "Clayton630/QuartzReport";
const ARTICLE_PATH = `/repos/${REPOSITORY}/contents/articles`;
const CACHE_SECONDS = 60;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return origin === SITE_ORIGIN
    ? {
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        Vary: "Origin",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      }
    : {};
}

function response(body, init, request) {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(corsHeaders(request))) headers.set(name, value);
  return new Response(body, { ...init, headers });
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function validState(state, secret) {
  const [issuedAt, nonce, signature] = (state || "").split(".");
  if (!issuedAt || !nonce || !signature || Date.now() - Number(issuedAt) > 10 * 60 * 1000) return false;
  const expected = await sign(`${issuedAt}.${nonce}`, secret);
  return signature.length === expected.length && crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(new TextEncoder().encode(signature), new TextEncoder().encode(expected))
    : signature === expected;
}

function allowedImageSource(rawUrl) {
  try {
    const source = new URL(rawUrl);
    return source.protocol === "https:" || source.protocol === "http:" ? source : null;
  } catch {
    return null;
  }
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "QuartzReport-Worker",
    ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
  };
}

async function github(env, path, search = "") {
  return fetch(`https://api.github.com${path}${search}`, { headers: githubHeaders(env) });
}

async function articleFeed(request, env, ctx) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const ref = new URL(request.url).searchParams.get("ref") || "main";
  const listResponse = await github(env, ARTICLE_PATH, `?ref=${encodeURIComponent(ref)}`);
  if (!listResponse.ok) return response("Unable to load articles", { status: 502 }, request);

  const files = (await listResponse.json()).filter((file) => file.type === "file" && file.name.endsWith(".md"));
  const articles = await Promise.all(
    files.map(async (file) => {
      const article = await github(env, `${ARTICLE_PATH}/${encodeURIComponent(file.name)}`, `?ref=${encodeURIComponent(ref)}`);
      if (!article.ok) return null;
      const data = await article.json();
      return { name: file.name, content: data.content, sha: data.sha };
    })
  );

  const feed = response(JSON.stringify({ articles: articles.filter(Boolean) }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  }, request);
  ctx.waitUntil(cache.put(request, feed.clone()));
  return feed;
}

async function legacyArticleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api", "");
  const allowed = path === ARTICLE_PATH || path.startsWith(`${ARTICLE_PATH}/`);
  if (!allowed || request.method !== "GET") return response("Not found", { status: 404 }, request);

  const upstream = await github(env, path, url.search);
  return response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  }, request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return response(null, { status: 204, headers: { "Access-Control-Allow-Headers": "Content-Type" } }, request);
    }

    if (url.pathname === "/img") {
      const source = allowedImageSource(url.searchParams.get("src"));
      const width = Math.min(Math.max(Number.parseInt(url.searchParams.get("w"), 10) || 0, 1), 2400);
      const quality = Math.min(Math.max(Number.parseInt(url.searchParams.get("q"), 10) || 82, 40), 90);
      if (!source || !width) return response("Invalid image request", { status: 400 }, request);

      const resizeUrl = `https://images.weserv.nl/?url=${encodeURIComponent(source.href)}&w=${width}&q=${quality}&output=webp`;
      const image = await fetch(resizeUrl, { headers: { "User-Agent": "QuartzReport/2.0" } });
      return response(image.body, {
        status: image.status,
        headers: {
          "content-type": image.headers.get("content-type") || "image/webp",
          "cache-control": "public, max-age=86400",
        },
      }, request);
    }

    if (url.pathname === "/auth") {
      if (!env.OAUTH_STATE_SECRET) return response("OAuth is not configured", { status: 503 }, request);
      const issuedAt = String(Date.now());
      const nonce = crypto.randomUUID();
      const state = `${issuedAt}.${nonce}.${await sign(`${issuedAt}.${nonce}`, env.OAUTH_STATE_SECRET)}`;
      const redirect = new URL("https://github.com/login/oauth/authorize");
      redirect.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      redirect.searchParams.set("scope", "public_repo");
      redirect.searchParams.set("state", state);
      redirect.searchParams.set("redirect_uri", `${url.origin}/callback`);
      return Response.redirect(redirect, 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code || !(await validState(url.searchParams.get("state"), env.OAUTH_STATE_SECRET))) {
        return response("Invalid OAuth request", { status: 400 }, request);
      }
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const { access_token: token } = await tokenResponse.json();
      if (!token) return response("GitHub authorization failed", { status: 502 }, request);
      const payload = JSON.stringify(`authorization:github:success:${JSON.stringify({ token, provider: "github" })}`);
      return response(`<script>window.opener.postMessage(${payload}, ${JSON.stringify(SITE_ORIGIN)});window.close();</script>`, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      }, request);
    }

    if (url.pathname === "/api/articles" && request.method === "GET") return articleFeed(request, env, ctx);
    if (url.pathname.startsWith("/api/")) return legacyArticleApi(request, env);

    return response("Not found", { status: 404 }, request);
  },
};
