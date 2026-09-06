import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Les articles restent à leur emplacement actuel : Decap CMS continue donc à les éditer.
const articlesDirectory = join(process.cwd(), "articles");
const placeholderImage = "/img/article-placeholder.jpg";
const uploadPrefix = "/img/uploads/";
const imageQuality = 85;
const cardImageWidths = [480, 768, 1280];
const coverImageWidths = [768, 1280, 1920, 2560];
const inlineImageWidths = [480, 768, 1280, 1920];
const thumbnailImageWidths = [160, 240];
const imageDimensionsCache = new Map();

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

function isLocalUpload(value) {
  return (
    typeof value === "string" &&
    value.startsWith(uploadPrefix) &&
    !value.includes("..") &&
    !value.includes("\\") &&
    !/[\0\r\n]/u.test(value)
  );
}

function optimizedImageUrl(value, width = 1280) {
  if (typeof value !== "string" || !value.trim()) return placeholderImage;
  if (!isLocalUpload(value)) return value;
  let encodedPath;
  try {
    encodedPath = encodeURI(decodeURI(value));
  } catch {
    encodedPath = encodeURI(value);
  }
  return `/cdn-cgi/image/width=${width},quality=${imageQuality},format=webp${encodedPath}`;
}

function optimizedImageSrcset(value, widths) {
  if (!isLocalUpload(value)) return undefined;
  return widths.map((width) => `${optimizedImageUrl(value, width)} ${width}w`).join(", ");
}

function readPngDimensions(buffer) {
  if (buffer.length < 24 || buffer[0] !== 0x89 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda || offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function readWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "VP8X" && data + 10 <= buffer.length) {
      return {
        width: 1 + buffer.readUIntLE(data + 4, 3),
        height: 1 + buffer.readUIntLE(data + 7, 3),
      };
    }
    if (type === "VP8 " && data + 10 <= buffer.length && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    if (type === "VP8L" && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

async function localImageDimensions(value) {
  if (!isLocalUpload(value)) return null;
  if (!imageDimensionsCache.has(value)) {
    imageDimensionsCache.set(value, (async () => {
      try {
        const image = await readFile(join(process.cwd(), "public", decodeURIComponent(value)));
        return readPngDimensions(image) || readJpegDimensions(image) || readWebpDimensions(image);
      } catch {
        return null;
      }
    })());
  }
  return imageDimensionsCache.get(value);
}

function imageDimensionAttributes(dimensions) {
  return dimensions && dimensions.width > 0 && dimensions.height > 0 ? dimensions : {};
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
    thumbnailDimensions: await localImageDimensions(meta.thumbnail || firstImage || placeholderImage),
    bodyHtml: await htmlForArticle(body),
  };
}

export async function getArticles() {
  const filenames = (await readdir(articlesDirectory)).filter((name) => name.endsWith(".md"));
  const articles = await Promise.all(
    filenames.map(async (filename) => articleFromSource(filename, await readFile(join(articlesDirectory, filename), "utf8"))),
  );
  return articles.sort((a, b) => b.date - a.date);
}

export { cardImageWidths, coverImageWidths, imageDimensionAttributes, inlineImageWidths, optimizedImageSrcset, optimizedImageUrl, thumbnailImageWidths };

export const __test = { articleDate, parseFrontMatter, readJpegDimensions, readPngDimensions, readWebpDimensions };
