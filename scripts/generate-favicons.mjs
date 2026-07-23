import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const assetsDir = resolve(import.meta.dirname, "../app/assets");
const publicDir = resolve(import.meta.dirname, "../public");

const sizes = [16, 32, 64];

for (const size of sizes) {
  const svgPath = resolve(assetsDir, `favicon-${size}.svg`);
  const pngPath = resolve(publicDir, `favicon-${size}.png`);

  const svgBuffer = readFileSync(svgPath);

  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(pngPath);

  console.log(`Generated ${pngPath}`);
}

const faviconSvgSrc = resolve(assetsDir, "favicon-64.svg");
const faviconSvgDest = resolve(publicDir, "favicon.svg");
const svgContent = readFileSync(faviconSvgSrc, "utf-8");

import { writeFileSync } from "node:fs";
writeFileSync(faviconSvgDest, svgContent);
console.log(`Copied ${faviconSvgDest}`);
