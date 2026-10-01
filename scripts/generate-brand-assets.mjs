/**
 * Derives every logo asset the app ships from `public/mr-mailer-logo.png`.
 *
 * That PNG is the source of truth; everything else here is generated so it can
 * never drift from it. Run `npm run assets:brand` after replacing the source,
 * or `npm run assets:brand -- --preview` to eyeball the square mark candidates
 * before committing to one. `sharp` is a devDependency — nothing rasterises at
 * runtime.
 *
 * The source is 1536x1024 with **no alpha channel** (PNG colour type 2) on a
 * flat `rgb(254,254,254)` background, so two things are needed before it is
 * usable in the app:
 *
 *  1. The background has to be keyed out. A white box behind the mascot would be
 *     visible in the dark-mode header, and at watermark opacity it would be a
 *     grey wash over the whole app. Naive "white to transparent" would also eat
 *     any white inside the artwork, so this flood fills instead: a 4-neighbour
 *     BFS seeded from all four image edges that only spreads through
 *     background-coloured pixels. That is safe here specifically because the
 *     artwork is fully enclosed — the measured content box sits at least 95px
 *     inside every edge, so there is no path from an edge into the mascot.
 *
 *  2. The mark and the wordmark have to be separated. They are divided by 42px
 *     of pure white (rows 630..671 are entirely empty), which makes the cut
 *     exact rather than a judgement call.
 *
 * Note `sharp.trim()` cannot be used for any of this: it derives its trim
 * rectangle from the alpha channel, and this image has none, so it is a no-op.
 * The geometry below is therefore measured explicitly. It was measured twice
 * (independently, in C# and JS) and both runs agreed exactly.
 */
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "public", "mr-mailer-logo.png");

/** Flat background of the source, as sampled from its border. */
const BG = { r: 254, g: 254, b: 254 };

/**
 * Squared RGB distances. A pixel counts as background while it is within
 * `VISIT` of the flat colour, and its alpha ramps from fully transparent to
 * fully opaque across `FEATHER_LO`..`FEATHER_HI`. The gap between them is what
 * turns the anti-aliased edge of the artwork into a soft alpha edge instead of
 * a stair-stepped one, and leaves white pixels *inside* the artwork opaque.
 */
const VISIT = 62 * 62;
const FEATHER_LO = 26 * 26;
const FEATHER_HI = 64 * 64;

/**
 * Measured regions of the 1536x1024 source. All are tight ink bounding boxes
 * except the padding on the square mark crops, which keep a little air so the
 * artwork is not flush against the edge of a favicon tile.
 */
const GEOMETRY = {
  /** Mascot over wordmark, the full stacked lockup. */
  lockup: { left: 205, top: 95, width: 1129, height: 780 },
  /** The illustrated mascot on its own, above the empty row run. */
  mascot: { left: 431, top: 95, width: 740, height: 535 },
};

/**
 * The wordmark occupies these rows; everything from 630 to 671 is empty, which
 * is what makes the cut above exact.
 */
const WORDMARK_ROWS = { top: 672, bottom: 874 };

/**
 * Square crops through the mascot's head, for the app header.
 *
 * The head is a dome spanning x 431..691, y 95..~205 whose apex leans right
 * (apex centred near x 640) and which merges into the body around y 210. Note
 * what this artwork is *not*: posterising the dome to 3, 4 and 6 levels traces
 * only a lit-side/shadow-side boundary, and the head contains no near-white
 * region of any size, so it has no eyes or mouth to find. It is a smoothly
 * shaded monochrome navy form. That is why the favicon is a monogram cut from
 * the wordmark rather than a crop of this, and why the header mark below is
 * offered as a switchable choice rather than an optimised one.
 *
 * Override without editing: `--mark=C`.
 */
const MARKS = {
  A: { left: 425, top: 88, width: 260, height: 260, note: "tight on the dome" },
  B: { left: 400, top: 80, width: 320, height: 320, note: "balanced" },
  C: { left: 370, top: 70, width: 400, height: 400, note: "head + shoulders" },
  D: { left: 431, top: 95, width: 740, height: 740, note: "whole character" },
};

/** The chosen entry of MARKS, used for the in-app header mark. */
const chosenMark = (() => {
  const flag = process.argv.find((a) => a.startsWith("--mark="));
  const key = flag ? flag.slice("--mark=".length) : "B";
  if (!MARKS[key]) {
    throw new Error(`unknown mark "${key}"; expected one of ${Object.keys(MARKS).join(", ")}`);
  }
  return { key, ...MARKS[key] };
})();

/** Display sizes, doubled for retina, minus anything the source cannot supply. */
const OUTPUTS = {
  lockup: { file: "public/logo-lockup.png", width: 920 },
  mascot: { file: "public/logo-mascot.png", width: 740 },
  mark: { file: "public/logo-mark.png", width: 256 },
};

const FAVICONS = [
  { file: "public/favicon-64.png", size: 64 },
  { file: "public/favicon-32.png", size: 32 },
  { file: "public/favicon-16.png", size: 16 },
  // Apple masks its own corners and does not downscale well, so this one is
  // full bleed with square corners and no inset.
  { file: "public/apple-touch-icon.png", size: 180, fullBleed: true },
];

/**
 * Key the flat background out of the source, returning a full-size PNG buffer
 * with a real alpha channel. Done once and reused for every crop.
 */
async function keyOutBackground() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`expected 4 channels after ensureAlpha, got ${channels}`);

  const distanceSq = (i) => {
    const dr = data[i] - BG.r;
    const dg = data[i + 1] - BG.g;
    const db = data[i + 2] - BG.b;
    return dr * dr + dg * dg + db * db;
  };

  // Queue-based BFS over the border. `Int32Array` rather than an array of pairs
  // so 1.5M pixels do not turn into 1.5M small objects.
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const seed = (x, y) => {
    const p = y * width + x;
    if (visited[p]) return;
    if (distanceSq(p * channels) > VISIT) return;
    visited[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }

  let filled = 0;
  while (head < tail) {
    const p = queue[head++];
    filled++;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }

  // Soft alpha across the feather band, so the keyed edge is not jagged.
  const span = FEATHER_HI - FEATHER_LO;
  for (let p = 0; p < width * height; p++) {
    if (!visited[p]) continue;
    const d = distanceSq(p * channels);
    const t = (d - FEATHER_LO) / span;
    data[p * channels + 3] = Math.max(0, Math.min(255, Math.round(t * 255)));
  }

  console.log(
    `keyed ${filled} background px (${((100 * filled) / (width * height)).toFixed(1)}% of the frame) to alpha`,
  );
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Crop a region out of the keyed master and scale it to `outWidth`. */
async function crop(master, region, outWidth) {
  // Both dimensions are explicit. `fit: "fill"` with only a width leaves the
  // height at the source's, which silently produced a 28x320 "square" and then
  // failed to composite. Deriving the height from the region's own aspect keeps
  // every crop exactly proportional and makes squareness a property of the
  // measured geometry rather than something to remember.
  const outHeight = Math.round((outWidth * region.height) / region.width);
  return cropTo(master, region, outWidth, outHeight);
}

/** Crop a region and force it to exactly `outWidth` x `outHeight`. */
async function cropTo(master, region, outWidth, outHeight) {
  return sharp(master)
    .extract({ left: region.left, top: region.top, width: region.width, height: region.height })
    .resize({ width: outWidth, height: outHeight, fit: "fill" })
    .png()
    .toBuffer();
}

/**
 * Find the leftmost letter of the wordmark by walking its columns.
 *
 * Done at runtime rather than hardcoded so that replacing the source does not
 * silently leave a stale crop pointed at the wrong artwork. Letters are
 * separated by white gutters, so contiguous runs of inked columns are letters;
 * the first run is the leading "M" of "Mr Mailer". The band count doubles as a
 * sanity check on the wordmark's identity.
 */
async function measureMonogram() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, channels } = info;
  const { top, bottom } = WORDMARK_ROWS;

  const inked = (x) => {
    for (let y = top; y <= bottom; y++) {
      const i = (y * width + x) * channels;
      const dr = data[i] - BG.r;
      const dg = data[i + 1] - BG.g;
      const db = data[i + 2] - BG.b;
      if (dr * dr + dg * dg + db * db > VISIT) return true;
    }
    return false;
  };

  const bands = [];
  let start = -1;
  for (let x = 0; x < width; x++) {
    const on = inked(x);
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      bands.push({ left: start, right: x - 1 });
      start = -1;
    }
  }
  if (start >= 0) bands.push({ left: start, right: width - 1 });
  if (!bands.length) throw new Error("no wordmark letters found; is the source still the same artwork?");

  const first = bands[0];
  // Tighten vertically to the letter's own ink, so the monogram is not padded
  // out by the wordmark's full line height (which includes descenders).
  let minY = bottom;
  let maxY = top;
  for (let y = top; y <= bottom; y++) {
    for (let x = first.left; x <= first.right; x++) {
      const i = (y * width + x) * channels;
      const dr = data[i] - BG.r;
      const dg = data[i + 1] - BG.g;
      const db = data[i + 2] - BG.b;
      if (dr * dr + dg * dg + db * db > VISIT) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        break;
      }
    }
  }

  console.log(
    `wordmark: ${bands.length} letter bands detected (expected 8 for "Mr Mailer")`,
  );
  bands.forEach((b, i) =>
    console.log(`  ${String.fromCharCode(65 + i)}  x ${b.left}..${b.right}  width ${b.right - b.left + 1}`),
  );

  return { left: first.left, top: minY, width: first.right - first.left + 1, height: maxY - minY + 1 };
}

/**
 * Favicons get an opaque white plate rather than a transparent background: the
 * artwork is ~67% dark navy, which is invisible against a dark browser theme or
 * a dark tab bar. The plate is what makes one file work on any background.
 *
 * `region` is fitted inside the tile and centred, rather than cropped to it, so
 * the monogram keeps its own proportions whatever the tile size.
 */
async function favicon(master, region, size, { fullBleed = false } = {}) {
  // A letterform needs more breathing room than a filled silhouette, but at
  // 16px every pixel counts, so the floor is 1px rather than 2.
  const inset = fullBleed ? 0 : Math.max(1, Math.round(size * 0.13));
  const box = size - inset * 2;
  const scale = box / Math.max(region.width, region.height);
  const artW = Math.max(1, Math.round(region.width * scale));
  const artH = Math.max(1, Math.round(region.height * scale));
  const art = await cropTo(master, region, artW, artH);
  const offset = Math.floor((box - artH) / 2);

  // Rounded corners via a destination-in mask. At 16px the radius is under three
  // pixels, which is why the full-bleed apple icon skips it entirely.
  const radius = fullBleed ? 0 : Math.round(size * 0.18);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );

  return sharp({
    create: { width: size, height: size, channels: 4, background: "#FFFFFF" },
  })
    .composite([
      { input: art, top: inset + offset, left: inset + Math.floor((box - artW) / 2) },
      { input: mask, blend: "dest-in" },
    ])
    .png()
    .toBuffer();
}

/**
 * Render a contact sheet: the square mascot crops for the header, plus the
 * monogram and the resulting favicons at real size. Only useful for choosing
 * `--mark`; the monogram needs no choosing.
 */
async function preview(master, monogram, outDir) {
  await mkdir(outDir, { recursive: true });
  const keys = Object.keys(MARKS);
  const big = 220;
  const gap = 16;
  const pad = 20;
  const strip = 56;
  const cols = keys.length + 1;
  const width = pad * 2 + cols * big + (cols - 1) * gap;
  const stripTop = pad + big + gap;
  const height = stripTop + strip + pad;

  const layers = [
    {
      // Dark strip behind the real-size renders: the worst case for a dark navy
      // mark, and the reason the favicons carry a white plate.
      input: Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
          `<rect x="0" y="${stripTop}" width="${width}" height="${strip}" fill="#1B1F26"/></svg>`,
      ),
    },
  ];

  for (const [i, key] of keys.entries()) {
    const x = pad + i * (big + gap);
    layers.push({ input: await crop(master, MARKS[key], big), top: pad, left: x });
  }

  // The monogram column, so the favicon can be compared against the mascots.
  const monoX = pad + keys.length * (big + gap);
  layers.push({ input: await crop(master, monogram, big), top: pad, left: monoX });
  layers.push({ input: await favicon(master, monogram, 32), top: stripTop + 12, left: monoX });
  layers.push({ input: await favicon(master, monogram, 16), top: stripTop + 20, left: monoX + 44 });

  for (const [i, key] of keys.entries()) {
    const x = pad + i * (big + gap);
    layers.push({ input: await favicon(master, MARKS[key], 32), top: stripTop + 12, left: x });
    await sharp(await crop(master, MARKS[key], big)).toFile(
      path.join(outDir, `logo-mark-${key}.png`),
    );
  }
  await sharp(await favicon(master, monogram, 256)).toFile(path.join(outDir, "logo-monogram.png"));

  await sharp({ create: { width, height, channels: 4, background: "#F1F3F6" } })
    .composite(layers)
    .png()
    .toFile(path.join(outDir, "logo-mark-candidates.png"));

  console.log(`\nwrote candidates to ${outDir}`);
  for (const [key, region] of Object.entries(MARKS)) {
    console.log(
      `  ${key}  ${region.width}x${region.height} @ (${region.left},${region.top})  ${region.note}`,
    );
  }
  console.log(`  monogram  ${monogram.width}x${monogram.height} @ (${monogram.left},${monogram.top})`);
  console.log(`\nopen logo-mark-candidates.png in that folder, then re-run with --mark=<A|B|C|D>`);
}

const master = await keyOutBackground();
const monogram = await measureMonogram();

if (process.argv.includes("--preview")) {
  await preview(master, monogram, path.join(os.tmpdir(), "opencode"));
} else {
  for (const [name, target] of Object.entries(OUTPUTS)) {
    const region = name === "mark" ? chosenMark : GEOMETRY[name];
    const buffer = await crop(master, region, target.width);
    await sharp(buffer).toFile(path.join(root, target.file));
    const { size } = await stat(path.join(root, target.file));
    const m = await sharp(buffer).metadata();
    console.log(
      `wrote ${target.file}  ${m.width}x${m.height}  ${(size / 1024).toFixed(1)} KB  (header mark ${chosenMark.key})`,
    );
  }

  for (const { file, size, fullBleed } of FAVICONS) {
    const buffer = await favicon(master, monogram, size, { fullBleed });
    await sharp(buffer).toFile(path.join(root, file));
    const { size: bytes } = await stat(path.join(root, file));
    console.log(`wrote ${file}  ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB  (monogram)`);
  }
}
