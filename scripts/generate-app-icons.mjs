import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(
  rootDirectory,
  "public",
  "assets",
  "dustycards-master-ball-d.webp"
);
const outputDirectory = path.join(rootDirectory, "public", "icons");

const background = { r: 7, g: 8, b: 11, alpha: 1 };

async function renderSquareIcon(size, logoSize) {
  const logo = await sharp(sourcePath)
    .resize(logoSize, logoSize, { fit: "contain" })
    .png()
    .toBuffer();

  const offset = Math.round((size - logoSize) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderTransparentIcon(size) {
  return sharp(sourcePath)
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function buildIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const entriesSize = images.length * entrySize;
  let imageOffset = headerSize + entriesSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = images.map(({ size, buffer }) => {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    imageOffset += buffer.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ buffer }) => buffer)]);
}

await mkdir(outputDirectory, { recursive: true });

const browser192 = await renderSquareIcon(192, 168);
const browser512 = await renderSquareIcon(512, 448);
const maskable512 = await renderSquareIcon(512, 336);
const apple180 = await renderSquareIcon(180, 158);

await Promise.all([
  writeFile(path.join(outputDirectory, "dustycards-pokeball-192.png"), browser192),
  writeFile(path.join(outputDirectory, "dustycards-pokeball-512.png"), browser512),
  writeFile(path.join(outputDirectory, "dustycards-pokeball-maskable-512.png"), maskable512),
  writeFile(path.join(outputDirectory, "dustycards-pokeball-apple-180.png"), apple180),
]);

const faviconImages = await Promise.all(
  [16, 32, 48, 256].map(async (size) => ({
    size,
    buffer: await renderTransparentIcon(size),
  }))
);

await writeFile(path.join(rootDirectory, "src", "app", "favicon.ico"), buildIco(faviconImages));

console.log("Generated DustyCards browser and install icons.");
