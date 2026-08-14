import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "public", "logo.png"));

for (const size of [16, 64]) {
  await sharp(source).resize(size, size).png().toFile(path.join(root, "public", `favicon-${size}.png`));
  console.log(`favicon-${size}.png written`);
}

await sharp(source).resize(32, 32).png().toFile(path.join(root, "public", "favicon-32.png"));
console.log("favicon-32.png written (for ico)");

const png32 = fs.readFileSync(path.join(root, "public", "favicon-32.png"));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0);
entry.writeUInt8(32, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png32.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);
fs.writeFileSync(path.join(root, "public", "favicon.ico"), Buffer.concat([header, entry, png32]));
console.log("favicon.ico written");
