export const coverVariants = [
  { kind: 'square', widths: [72, 144, 216] },
  { kind: 'card', widths: [320, 640, 960] },
];

export function variantPath(source, kind, width) {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(source)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  }
  return `/img/cover-previews/${hash.toString(16)}-${kind}-${width}.jpg`;
}
