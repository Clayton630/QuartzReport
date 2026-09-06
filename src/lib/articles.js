import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import {
  imageDimensionAttributes,
  inlineImageWidths,
  localImageDimensions,
  optimizedImageSrcset,
  optimizedImageUrl,
  placeholderImage,
} from "./images.js";

// Les articles restent à leur emplacement actuel : Decap CMS continue donc à les éditer.
const articlesDirectory = join(process.cwd(), "articles");

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

function articleSlug(title, filename) {
  const normalizedTitle = String(title || "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (normalizedTitle) return normalizedTitle;

  return filename
    .replace(/\.md$/iu, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/u, "")
    .replace(/[^a-z0-9-]+/giu, "-")
    .replace(/^-+|-+$/gu, "") || "article";
}

function escapeHtmlAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

async function htmlForArticle(markdown) {
  const rawHtml = marked.parse(markdown);
  const safeHtml = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "title"] },
    allowedSchemes: ["http", "https"],
  });
  const matches = [...safeHtml.matchAll(/<img\s+([^>]*?)src="(\/img\/uploads\/[^\"]+)"([^>]*)>/gi)];
  const replacements = await Promise.all(matches.map(async (match) => {
    const [, before, source, after] = match;
    const remainingAttributes = after.replace(/\s*\/\s*$/u, "");
    const dimensions = await localImageDimensions(source);
    const srcset = optimizedImageSrcset(source, inlineImageWidths);
    const dimensionAttributes = imageDimensionAttributes(dimensions);
    return {
      source: match[0],
      replacement: `<img ${before}src="${optimizedImageUrl(source, 1280)}"${remainingAttributes} srcset="${escapeHtmlAttribute(srcset)}" sizes="(max-width: 768px) 100vw, min(100vw, 1024px)"${dimensions ? ` width="${dimensionAttributes.width}" height="${dimensionAttributes.height}"` : ""} loading="lazy" decoding="async">`,
    };
  }));
  return replacements.reduce((html, { source, replacement }) => html.replace(source, replacement), safeHtml);
}

async function articleFromSource(filename, source) {
  const { meta, body } = parseFrontMatter(source);
  const firstImage = body.match(/!\[.*?\]\((.*?)\)/)?.[1];
  const date = articleDate(meta.date, filename);
  const thumbnail = meta.thumbnail || firstImage || placeholderImage;
  const [thumbnailDimensions, bodyHtml] = await Promise.all([
    localImageDimensions(thumbnail),
    htmlForArticle(body),
  ]);
  return {
    slug: articleSlug(meta.title, filename),
    legacySlug: filename.replace(/\.md$/i, ""),
    filename,
    title: meta.title || "Sans titre",
    author: meta.author || "Inconnu",
    description: meta.description || body.replace(/\s+/g, " ").slice(0, 160),
    category: meta.category || "Autre",
    important: meta.important === "true" || meta.important === true,
    date,
    thumbnail,
    thumbnailDimensions,
    bodyHtml,
  };
}

export async function getArticles() {
  const filenames = (await readdir(articlesDirectory)).filter((name) => name.endsWith(".md")).sort();
  const articles = await Promise.all(
    filenames.map(async (filename) => articleFromSource(filename, await readFile(join(articlesDirectory, filename), "utf8"))),
  );
  const usedSlugs = new Set();
  const uniqueArticles = articles.map((article) => {
    let slug = article.slug;
    let suffix = 2;
    while (usedSlugs.has(slug)) slug = `${article.slug}-${suffix++}`;
    usedSlugs.add(slug);
    return { ...article, slug };
  });
  return uniqueArticles.sort((a, b) => b.date - a.date);
}

export { coverImageWidths, imageDimensionAttributes, optimizedImageSrcset, optimizedImageUrl } from "./images.js";

export const __test = { articleDate, articleSlug, parseFrontMatter };
