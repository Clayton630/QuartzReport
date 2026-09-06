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
const PROFILE_MAX_NAME_LENGTH = 80;
const PROFILE_MAX_EMAIL_LENGTH = 254;
const PROFILE_MAX_PHONE_LENGTH = 40;
const PROFILE_MAX_LINKS = 4;
const PROFILE_MAX_LINK_LENGTH = 2048;
const PROFILE_MAX_PHOTO_BASE64_LENGTH = 350_000;

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
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

function profileError(message, request, status = 400) {
  return jsonResponse({ error: message }, request, { status, headers: { "Cache-Control": "no-store" } });
}

function profileResponse(profile) {
  if (!profile) return null;
  let links = [];
  try {
    links = JSON.parse(profile.links_json || "[]");
  } catch {
    links = [];
  }
  return {
    githubId: profile.github_id,
    githubLogin: profile.github_login,
    name: profile.display_name,
    email: profile.email || "",
    phone: profile.phone || "",
    links,
    hasPhoto: Boolean(profile.photo_base64 && profile.photo_type),
  };
}

function publicProfileResponse(profile) {
  const data = profileResponse(profile);
  if (!data) return null;
  return {
    githubId: data.githubId,
    name: data.name,
    avatarUrl: data.hasPhoto ? `/api/profile/avatar/${encodeURIComponent(data.githubId)}` : null,
  };
}

function cleanOptionalText(value, maxLength, label) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`${label} invalide`);
  const clean = value.trim();
  if (clean.length > maxLength) throw new Error(`${label} trop long`);
  return clean;
}

function cleanProfileInput(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Profil invalide");
  const name = cleanOptionalText(data.name, PROFILE_MAX_NAME_LENGTH, "Nom");
  if (!name) throw new Error("Le nom est obligatoire");
  const email = cleanOptionalText(data.email, PROFILE_MAX_EMAIL_LENGTH, "E-mail");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error("E-mail invalide");
  const phone = cleanOptionalText(data.phone, PROFILE_MAX_PHONE_LENGTH, "Téléphone");
  if (data.links !== undefined && !Array.isArray(data.links)) throw new Error("Liens invalides");
  const links = (data.links || []).filter((link) => link !== "").map((link) => {
    const clean = cleanOptionalText(link, PROFILE_MAX_LINK_LENGTH, "Lien");
    try {
      const url = new URL(clean);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      throw new Error("Lien invalide");
    }
    return clean;
  });
  if (links.length > PROFILE_MAX_LINKS) throw new Error(`Maximum ${PROFILE_MAX_LINKS} liens`);

  let photoBase64 = null;
  let photoType = null;
  if (data.photo) {
    if (typeof data.photo !== "object" || typeof data.photo.base64 !== "string") throw new Error("Photo invalide");
    if (!["image/jpeg", "image/png", "image/webp"].includes(data.photo.type)) throw new Error("Format de photo invalide");
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(data.photo.base64) || data.photo.base64.length > PROFILE_MAX_PHOTO_BASE64_LENGTH) {
      throw new Error("Photo trop lourde ou invalide");
    }
    photoBase64 = data.photo.base64;
    photoType = data.photo.type;
  }

  return { name, email, phone, links, photoBase64, photoType, removePhoto: data.removePhoto === true };
}

async function authenticatedGitHubUser(request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "QuartzReport-ContributorProfiles",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user || !Number.isInteger(user.id) || typeof user.login !== "string") return null;
  return { id: String(user.id), login: user.login };
}

async function profileRequestData(request) {
  const text = await readTextLimited(request, 500_000);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Données invalides");
  }
}

async function handleOwnProfile(request, env) {
  const user = await authenticatedGitHubUser(request);
  if (!user) return profileError("Connexion GitHub requise", request, 401);
  if (request.method === "GET") {
    const profile = await env.PROFILES_DB.prepare("SELECT * FROM contributor_profiles WHERE github_id = ?")
      .bind(user.id)
      .first();
    return jsonResponse({ profile: profileResponse(profile) }, request, { headers: { "Cache-Control": "no-store" } });
  }
  if (request.method !== "PUT") return profileError("Méthode non autorisée", request, 405);
  try {
    const input = cleanProfileInput(await profileRequestData(request));
    const existing = await env.PROFILES_DB.prepare("SELECT photo_base64, photo_type FROM contributor_profiles WHERE github_id = ?")
      .bind(user.id)
      .first();
    const photoBase64 = input.removePhoto ? null : input.photoBase64 ?? existing?.photo_base64 ?? null;
    const photoType = input.removePhoto ? null : input.photoType ?? existing?.photo_type ?? null;
    await env.PROFILES_DB.prepare(
      `INSERT INTO contributor_profiles
        (github_id, github_login, display_name, email, phone, links_json, photo_type, photo_base64, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(github_id) DO UPDATE SET
         github_login = excluded.github_login,
         display_name = excluded.display_name,
         email = excluded.email,
         phone = excluded.phone,
         links_json = excluded.links_json,
         photo_type = excluded.photo_type,
         photo_base64 = excluded.photo_base64,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(user.id, user.login, input.name, input.email || null, input.phone || null, JSON.stringify(input.links), photoType, photoBase64).run();
    const profile = await env.PROFILES_DB.prepare("SELECT * FROM contributor_profiles WHERE github_id = ?")
      .bind(user.id)
      .first();
    return jsonResponse({ profile: profileResponse(profile) }, request, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return profileError(error instanceof Error ? error.message : "Profil invalide", request);
  }
}

async function handlePublicProfiles(request, env) {
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") || "").split(","))]
    .filter((id) => /^\d{1,20}$/u.test(id))
    .slice(0, 50);
  if (ids.length === 0) return jsonResponse({ profiles: {} }, request, { headers: { "Cache-Control": "public, max-age=60" } });
  const placeholders = ids.map(() => "?").join(", ");
  const { results } = await env.PROFILES_DB.prepare(
    `SELECT github_id, github_login, display_name, links_json, photo_type, photo_base64 FROM contributor_profiles WHERE github_id IN (${placeholders})`,
  ).bind(...ids).all();
  const profiles = Object.fromEntries(results.map((profile) => [profile.github_id, publicProfileResponse(profile)]));
  return jsonResponse({ profiles }, request, { headers: { "Cache-Control": "public, max-age=60" } });
}

async function handleProfileAvatar(request, env, githubId) {
  if (!/^\d{1,20}$/u.test(githubId)) return new Response("Not found", { status: 404 });
  const profile = await env.PROFILES_DB.prepare("SELECT photo_type, photo_base64 FROM contributor_profiles WHERE github_id = ?")
    .bind(githubId)
    .first();
  if (!profile?.photo_type || !profile.photo_base64) return new Response("Not found", { status: 404 });
  const binary = Uint8Array.from(atob(profile.photo_base64), (character) => character.charCodeAt(0));
  return new Response(binary, {
    headers: {
      "content-type": profile.photo_type,
      "cache-control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
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

    if (url.pathname === "/api/profile/me") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
      if (!isAllowedOrigin(request.headers.get("Origin"))) return new Response("Forbidden", { status: 403 });
      return handleOwnProfile(request, env);
    }

    if (url.pathname === "/api/profiles") {
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
      if (request.method !== "GET") return profileError("Méthode non autorisée", request, 405);
      return handlePublicProfiles(request, env);
    }

    if (url.pathname.startsWith("/api/profile/avatar/")) {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      return handleProfileAvatar(request, env, url.pathname.slice("/api/profile/avatar/".length));
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
  cleanProfileInput,
  constantTimeEqual,
  isAllowedOrigin,
  isArticleFile,
  hasOnlyPublicRepoScope,
  oauthTargetOrigin,
};
