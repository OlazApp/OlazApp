/* Renders the site's brand files from the owner's artwork.
 *
 *   npm run brand
 *
 * Masters (scripts/brand/): olaz-mark-master.webp (transparent mark),
 * olaz-plate-master.webp (mark on its plate), olaz-banner-master.webp (1500 x 500).
 * Outputs: public/brand/{olaz-mark, olaz-badge, banner, og}.webp and
 *          src/app/{favicon.ico, icon.png, apple-icon.png} (browsers read those as ICO/PNG).
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SLUG = "olaz";
const PNG = `${ROOT}scripts/brand/${SLUG}-mark-master.webp`;
const JPG = `${ROOT}scripts/brand/${SLUG}-plate-master.webp`;
const BANNER = `${ROOT}scripts/brand/${SLUG}-banner-master.webp`;
const OUT = `${ROOT}public/brand/`;
const APP = `${ROOT}src/app/`;
mkdirSync(OUT, { recursive: true });

// Plate colour = corner pixel of the plate image.
const { data } = await sharp(JPG).extract({ left: 4, top: 4, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const plate = { r: data[0], g: data[1], b: data[2] };
const hex = "#" + [plate.r, plate.g, plate.b].map((v) => v.toString(16).padStart(2, "0")).join("");

// 1. Trimmed transparent mark, squared (for CSS mask and inline use).
const trimmed = await sharp(PNG).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
const side = Math.max(trimmed.info.width, trimmed.info.height);
const squareMark = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: trimmed.data, gravity: "center" }])
  .png()
  .toBuffer();
await sharp(squareMark).resize(512, 512).webp({ quality: 95, alphaQuality: 100 }).toFile(`${OUT}${SLUG}-mark.webp`);

// 2. Plate tile: mark on the plate colour, mark at `ratio` of the side.
const tile = async (size, ratio, radius = 0) => {
  const inner = Math.round(size * ratio);
  const mark = await sharp(squareMark).resize(inner, inner).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: { ...plate, alpha: 1 } } }).composite([{ input: mark, gravity: "center" }]);
  let buf = await img.png().toBuffer();
  if (radius) {
    const maskSvg = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
    buf = await sharp(buf).composite([{ input: maskSvg, blend: "dest-in" }]).png().toBuffer();
  }
  return buf;
};
await sharp(await tile(512, 0.66, 96)).webp({ quality: 95 }).toFile(`${OUT}${SLUG}-badge.webp`);
writeFileSync(`${APP}icon.png`, await tile(512, 0.7));
writeFileSync(`${APP}apple-icon.png`, await tile(180, 0.68));

// favicon.ico: PNG payloads inside an ICO container (16/32/48), mark large enough to read.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => tile(s, s === 16 ? 0.86 : 0.8)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync(`${APP}favicon.ico`, Buffer.concat([header, ...dir, ...pngs]));

// 3. Banner (as given) and the 1200 x 630 social card: full banner centred, edges filled with its own colour.
await sharp(BANNER).webp({ quality: 92 }).toFile(`${OUT}banner.webp`);
const bannerScaled = await sharp(BANNER).resize(1200, 400).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: plate } })
  .composite([{ input: bannerScaled, gravity: "center" }])
  .webp({ quality: 92 })
  .toFile(`${OUT}og.webp`);

console.log(JSON.stringify({ plate: hex, markSide: side }));
