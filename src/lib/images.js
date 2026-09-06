import { readFile } from "node:fs/promises";
import { join } from "node:path";
import mediaCatalog from "../../data/media-catalog.json" with { type: "json" };

const placeholderImage = "/img/article-placeholder.jpg";
const uploadPrefix = "/img/uploads/";
const imageQuality = 85;
const coverImageWidths = [768, 1280, 1920, 2560];
const inlineImageWidths = [480, 768, 1280, 1920];
const imageDimensionsCache = new Map();
const nonTransformableUploads = new Set(mediaCatalog.images.filter((image) => image.transformable === false).map((image) => image.path));

function isLocalUpload(value) {
  return (
    typeof value === "string" &&
    value.startsWith(uploadPrefix) &&
    !value.includes("..") &&
    !value.includes("\\") &&
    !/[\0\r\n]/u.test(value)
  );
}

function encodedUploadPath(value) {
  try {
    return encodeURI(decodeURI(value));
  } catch {
    return encodeURI(value);
  }
}

function optimizedImageUrl(value, width = 1280) {
  if (typeof value !== "string" || !value.trim()) return placeholderImage;
  if (!isLocalUpload(value)) return value;
  if (nonTransformableUploads.has(value)) return encodedUploadPath(value);
  return `/cdn-cgi/image/width=${width},quality=${imageQuality},format=webp${encodedUploadPath(value)}`;
}

function optimizedImageSrcset(value, widths) {
  if (!isLocalUpload(value)) return undefined;
  if (nonTransformableUploads.has(value)) return undefined;
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
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
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
      return { width: 1 + buffer.readUIntLE(data + 4, 3), height: 1 + buffer.readUIntLE(data + 7, 3) };
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

export {
  coverImageWidths,
  imageDimensionAttributes,
  inlineImageWidths,
  isLocalUpload,
  localImageDimensions,
  optimizedImageSrcset,
  optimizedImageUrl,
  placeholderImage,
};

export const __test = { readJpegDimensions, readPngDimensions, readWebpDimensions };
