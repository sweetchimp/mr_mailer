/**
 * Rasterises public/favicon.svg into the PNG assets the app ships (logo.png
 * plus the 16/32/64 favicons).
 *
 * The SVG is the source of truth; the PNGs are generated so they can never
 * drift from it. Run `node scripts/generate-brand-assets.mjs` after editing the
 * SVG. `sharp` is only a devDependency — nothing renders SVG at runtime.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "public", "favicon.svg"));

const TARGETS = [
  ["public/logo.png", 1254],
  ["public/favicon-64.png", 64],
  ["public/favicon-32.png", 32],
  ["public/favicon-16.png", 16],
];

for (const [file, size] of TARGETS) {
  // Render at the target resolution rather than scaling a 64px raster down or
  // up: density tells librsvg how many pixels to produce before any resizing.
  const density = (72 * size) / 64;
  await sharp(svg, { density })
    .resize(size, size, { fit: "contain" })
    .png()
    .toFile(path.join(root, file));
  console.log(`wrote ${file} (${size}x${size})`);
}
