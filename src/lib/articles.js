import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Les articles restent à leur emplacement actuel : Decap CMS continue donc à les éditer.
const articlesDirectory = join(process.cwd(), "articles");
const workerOrigin = "https://quartzreport-oauth.claytonelhorga.workers.dev";
const placeholderImage = "/img/article-placeholder.jpg";

function parseFrontMatter(source) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: source.trim() };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    meta[key] = line.slice(separator + 1).trim().replace(/^"|"$/g, "");
  }
  return { meta, body: match[2].trim() };
}

function optimizedImageUrl(value, width = 1280) {
  if (typeof value !== "string" || !value.trim()) return placeholderImage;
  if (!value.startsWith("/img/uploads/")) return value;
  return `${workerOrigin}/img?src=${encodeURIComponent(value)}&w=${width}&q=85`;
}

function htmlForArticle(markdown) {
  const rawHtml = marked.parse(markdown);
  const safeHtml = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "title"] },
    allowedSchemes: ["http", "https"],
  });
  return safeHtml.replace(/<img\s+([^>]*?)src="(\/img\/uploads\/[^\"]+)"([^>]*)>/gi, (_match, before, source, after) =>
    `<img ${before}src="${optimizedImageUrl(source, 2560)}"${after} loading="lazy" decoding="async">`,
  );
}

function articleFromSource(filename, source) {
  const { meta, body } = parseFrontMatter(source);
  const firstImage = body.match(/!\[.*?\]\((.*?)\)/)?.[1];
  const date = new Date(meta.date || Date.now());
  return {
    slug: filename.replace(/\.md$/i, ""),
    filename,
    title: meta.title || "Sans titre",
    author: meta.author || "Inconnu",
    description: meta.description || body.replace(/\s+/g, " ").slice(0, 160),
    category: meta.category || "Autre",
    important: meta.important === "true" || meta.important === true,
    date: Number.isNaN(date.valueOf()) ? new Date() : date,
    thumbnail: meta.thumbnail || firstImage || placeholderImage,
    bodyHtml: htmlForArticle(body),
  };
}

export async function getArticles() {
  const filenames = (await readdir(articlesDirectory)).filter((name) => name.endsWith(".md"));
  const articles = await Promise.all(
    filenames.map(async (filename) => articleFromSource(filename, await readFile(join(articlesDirectory, filename), "utf8"))),
  );
  return articles.sort((a, b) => b.date - a.date);
}

export { optimizedImageUrl };
