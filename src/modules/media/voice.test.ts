import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { encodeVoiceWav } from "@/components/media/pcm-wav";
import { normalizeVoice, VOICE_INPUT_MAX_BYTES } from "./voice";

function wav(seconds = 1) {
  const bytes = Buffer.alloc(44 + 32000 * seconds);
  Buffer.from(encodeVoiceWav([new Int16Array(16000)])).copy(bytes, 0, 0, 44);
  bytes.writeUInt32LE(bytes.length - 8, 4); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
describe("actual PCM voice validation", () => {
  it("derives actual sample duration and preserves normalized PCM playback", () => {
    const input = wav(60), result = normalizeVoice(input);
    expect(result.durationSeconds).toBe(60); expect(result.bytes.equals(input)).toBe(true);
    expect(result.bytes.length).toBe(1_920_044);
  });
  it("removes ancillary personal metadata without trusting claimed duration", () => {
    const original = wav();
    const name = Buffer.from("Sensitive recorder location!!");
    const chunk = Buffer.alloc(8 + name.length + (name.length & 1)); chunk.write("LIST", 0); chunk.writeUInt32LE(name.length, 4); name.copy(chunk, 8);
    const input = Buffer.concat([original, chunk]); input.writeUInt32LE(input.length - 8, 4);
    const normalized = normalizeVoice(input);
    expect(normalized.durationSeconds).toBe(1); expect(normalized.bytes).toEqual(original);
    expect(normalized.bytes.includes(name)).toBe(false);
  });
  it.each([Buffer.from("<html>voice</html>"), Buffer.from("OggS-not-wave"), Buffer.alloc(0), Buffer.alloc(VOICE_INPUT_MAX_BYTES + 1), wav(61)])("rejects unsupported, oversized and actual over-duration bytes", input => {
    expect(() => normalizeVoice(input)).toThrow();
  });
  it("rejects truncation, compressed headers, false framing/rate and partial sample frames", () => {
    for (const mutate of [
      (b: Buffer) => b.subarray(0, b.length - 1),
      (b: Buffer) => { b.writeUInt16LE(3, 20); return b; },
      (b: Buffer) => { b.writeUInt32LE(b.length - 7, 4); return b; },
      (b: Buffer) => { b.writeUInt32LE(16001, 28); return b; },
      (b: Buffer) => { b.writeUInt16LE(2, 22); return b; },
      (b: Buffer) => { b.writeUInt32LE(32001, 40); return b; },
    ]) expect(() => normalizeVoice(mutate(wav()))).toThrow();
  });
  it("rejects duplicate fmt/data chunks rather than hiding trailing samples", () => {
    for (const extra of [wav().subarray(12, 36), wav().subarray(36)]) {
      const input = Buffer.concat([wav(), extra]); input.writeUInt32LE(input.length - 8, 4);
      expect(() => normalizeVoice(input)).toThrow();
    }
  });
});
