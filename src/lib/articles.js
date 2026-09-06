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
  let currentKey = null;
  for (const line of match[1].split("\n")) {
    if (/^\s+\S/u.test(line) && currentKey) {
      meta[currentKey] = `${meta[currentKey]} ${line.trim()}`.trim();
      continue;
    }

    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u);
    if (!entry) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = entry;
    const value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        meta[key] = JSON.parse(value);
      } catch {
        meta[key] = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      meta[key] = value.slice(1, -1).replaceAll("''", "'");
    } else {
      meta[key] = value;
    }
    currentKey = key;
  }
  return { meta, body: match[2].trim() };
}

function articleDate(value, filename) {
  const fromMetadata = new Date(value || "");
  if (!Number.isNaN(fromMetadata.valueOf())) return fromMetadata;

  const fromFilename = filename.match(/^(\d{4}-\d{2}-\d{2})-/u)?.[1];
  const fallback = fromFilename ? new Date(`${fromFilename}T12:00:00.000Z`) : new Date(0);
  return Number.isNaN(fallback.valueOf()) ? new Date(0) : fallback;
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
  const date = articleDate(meta.date, filename);
  return {
    slug: filename.replace(/\.md$/i, ""),
    filename,
    title: meta.title || "Sans titre",
    author: meta.author || "Inconnu",
    description: meta.description || body.replace(/\s+/g, " ").slice(0, 160),
    category: meta.category || "Autre",
    important: meta.important === "true" || meta.important === true,
    date,
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

export const __test = { articleDate, parseFrontMatter };
