import "server-only";
import sharp from "sharp";

export const PHOTO_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_OUTPUT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;

/** Decode actual pixels, normalize orientation, discard EXIF/GPS and all input filenames. */
export async function normalizePhoto(bytes: Uint8Array): Promise<Buffer> {
  if (!bytes.byteLength || bytes.byteLength > PHOTO_INPUT_MAX_BYTES) throw new Error("Photo size not supported");
  const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS, animated: false });
  const metadata = await image.metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw new Error("Photo format not supported");
  // toBuffer performs the complete decode, unlike metadata inspection alone.
  const output = await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).flatten({ background: "#fffaf0" }).jpeg({ quality: 82 }).toBuffer();
  if (!output.byteLength || output.byteLength > PHOTO_OUTPUT_MAX_BYTES) throw new Error("Photo output too large");
  return output;
}
