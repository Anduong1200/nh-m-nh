import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { normalizePhoto, PHOTO_INPUT_MAX_BYTES } from "./photo";

describe("actual private photo normalization", () => {
  it("decodes JPEG bytes, strips EXIF/GPS and resizes actual pixels", async () => {
    const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "green" } }).withExif({ IFD0: { Copyright: "Sensitive metadata" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "21/1 0/1 0/1" } }).jpeg().toBuffer();
    const output = await normalizePhoto(input);
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 1600, height: 800 });
    expect(metadata.exif).toBeUndefined();
    expect(output.includes(Buffer.from("Sensitive metadata"))).toBe(false);
  });
  it("transcodes PNG with transparency into a bounded JPEG", async () => {
    const input = await sharp({ create: { width: 80, height: 50, channels: 4, background: "transparent" } }).png().toBuffer();
    expect(await sharp(await normalizePhoto(input)).metadata()).toMatchObject({ format: "jpeg", width: 80, hasAlpha: false });
  });
  it.each([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), Buffer.from('<html><script>alert(1)</script>'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(0), Buffer.alloc(PHOTO_INPUT_MAX_BYTES + 1)])("rejects non-photo, truncated and oversized bytes", async bytes => {
    await expect(normalizePhoto(bytes)).rejects.toThrow();
  });
});
