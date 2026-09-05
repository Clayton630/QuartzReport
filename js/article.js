const WORKER_ORIGIN = "https://quartzreport-oauth.claytonelhorga.workers.dev";
const PLACEHOLDER_IMAGE = "img/article-placeholder.jpg";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseFrontMatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text.trim() };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "");
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function safeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return PLACEHOLDER_IMAGE;
  try {
    const candidate = new URL(value, window.location.origin);
    if (candidate.protocol !== "https:" && candidate.protocol !== "http:") return PLACEHOLDER_IMAGE;
    return candidate.origin === window.location.origin
      ? `${candidate.pathname}${candidate.search}`
      : candidate.toString();
  } catch {
    return PLACEHOLDER_IMAGE;
  }
}

function optimizedImageUrl(value, width) {
  const safeUrl = safeImageUrl(value);
  if (!safeUrl.startsWith("/img/uploads/")) return safeUrl;
  return `${WORKER_ORIGIN}/img?src=${encodeURIComponent(safeUrl)}&w=${width}&q=88`;
}

function optimizeInlineImages(safeHtml) {
  const template = document.createElement("template");
  template.innerHTML = safeHtml;

  for (const image of template.content.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    try {
      const candidate = new URL(source || "", window.location.origin);
      if (
        candidate.origin === window.location.origin &&
        candidate.pathname.startsWith("/img/uploads/")
      ) {
        image.setAttribute(
          "src",
          optimizedImageUrl(`${candidate.pathname}${candidate.search}`, 2560),
        );
      }
    } catch {
      // DOMPurify already removed unsafe URLs; leave malformed URLs untouched.
    }
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
  }

  return template.innerHTML;
}

function setMeta(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute("content", value);
}

function renderArticle(meta, body) {
  const title = meta.title || "Sans titre";
  const author = meta.author || "Inconnu";
  const date = new Date(meta.date || Date.now());
  const dateDisplay = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const cover = meta.thumbnail ? optimizedImageUrl(meta.thumbnail, 2560) : "";
  const description = meta.description || body.replace(/\s+/g, " ").slice(0, 160);
  const safeBody = DOMPurify.sanitize(marked.parse(body), {
    USE_PROFILES: { html: true },
  });
  const optimizedBody = optimizeInlineImages(safeBody);

  document.title = `${title} – Quartz Report`;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  if (cover) setMeta('meta[property="og:image"]', new URL(cover, window.location.origin).toString());
  document.getElementById("article-full").innerHTML = `
    <article class="article-full">
      ${cover ? `<div class="article-cover"><img src="${escapeHtml(cover)}" alt="Illustration de l'article"></div>` : ""}
      <header class="article-header">
        <h1>${escapeHtml(title)}</h1>
        <p class="article-meta">Par ${escapeHtml(author)}, le ${escapeHtml(dateDisplay)}</p>
      </header>
      <section class="article-body">${optimizedBody}</section>
    </article>`;
}

async function loadSingleArticle() {
  const file = new URLSearchParams(window.location.search).get("file");
  const container = document.getElementById("article-full");
  if (!file) {
    container.textContent = "Article introuvable.";
    return;
  }

  try {
    const response = await fetch(`${WORKER_ORIGIN}/api/articles`);
    if (!response.ok) throw new Error("Article feed unavailable");
    const feed = await response.json();
    const entry = feed.articles?.find((article) => article.filename === file);
    if (!entry) throw new Error("Article not found");
    const { meta, body } = parseFrontMatter(entry.content);
    renderArticle(meta, body);
  } catch (error) {
    console.error(error);
    container.textContent = "Erreur lors du chargement de l'article.";
  }
}

document.addEventListener("DOMContentLoaded", loadSingleArticle);
