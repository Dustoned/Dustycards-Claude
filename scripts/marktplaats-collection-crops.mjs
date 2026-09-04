// Offline helper for the scheduled Codex reviewer. Detection and inspection happen
// in the external review task; this script produces actual crops, never guesses cards.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { normalizeCollectionInspection } from "../src/lib/marktplaats-collections.ts";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Required argument: ${name}`);
  return path.resolve(process.argv[index + 1]);
}
const reportPath = argument("--in");
const manifestPath = argument("--images");
const output = argument("--out");
if ((await fs.stat(reportPath)).size > 15 * 1024 * 1024) throw new Error("Report exceeds 15 MB.");
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const inputRoot = await fs.realpath(path.dirname(manifestPath));
const index = [];
await fs.mkdir(output, { recursive: true });
for (const entry of report.collections ?? []) {
  const inspection = normalizeCollectionInspection(entry);
  for (const photo of inspection.photos) {
    const relativeFile = manifest[inspection.externalId]?.[photo.id];
    if (typeof relativeFile !== "string") throw new Error(`Missing local original: ${inspection.externalId}/${photo.id}`);
    const file = await fs.realpath(path.resolve(inputRoot, relativeFile));
    const relative = path.relative(inputRoot, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Original photo must be inside the image manifest folder.");
    if ((await fs.stat(file)).size > 25 * 1024 * 1024) throw new Error("Original photo exceeds 25 MB.");
    const metadata = await sharp(file, { limitInputPixels: 30_000_000 }).metadata();
    if (!["jpeg", "png", "webp", "avif", "heif"].includes(metadata.format)) throw new Error("Unsupported original image format.");
    const { data, info } = await sharp(file, { limitInputPixels: 30_000_000 }).rotate().toBuffer({ resolveWithObject: true });
    if (info.width !== photo.width || info.height !== photo.height) throw new Error(`Oriented dimensions do not match report for ${photo.id}.`);
    for (const card of inspection.cards) {
      for (const [cropIndex, crop] of card.crops.entries()) {
        if (crop.photoId !== photo.id) continue;
        const left = Math.floor(crop.x * info.width);
        const top = Math.floor(crop.y * info.height);
        const width = Math.min(info.width - left, Math.ceil(crop.width * info.width));
        const height = Math.min(info.height - top, Math.ceil(crop.height * info.height));
        const filename = `${createHash("sha256").update(`${inspection.externalId}/${card.id}/${cropIndex}`).digest("hex").slice(0, 24)}.webp`;
        await sharp(data).extract({ left, top, width, height }).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 95 }).toFile(path.join(output, filename));
        index.push({ listing: inspection.externalId, card: card.id, photo: photo.id, side: crop.side, file: filename, originalPixels: { width, height } });
      }
    }
  }
}
await fs.writeFile(path.join(output, "index.json"), JSON.stringify(index, null, 2));
console.log(JSON.stringify({ crops: index.length, index: path.join(output, "index.json"), reminder: "Open and inspect EVERY crop before raising identity/condition confidence. Cropping is not identification." }));
