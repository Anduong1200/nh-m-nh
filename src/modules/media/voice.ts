import "server-only";

export const VOICE_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 60;
export type NormalizedVoice = { bytes: Buffer; durationSeconds: number };

/** PCM has no compressed frames: validate every chunk and derive time from actual sample bytes. */
export function normalizeVoice(input: Uint8Array): NormalizedVoice {
  if (input.byteLength < 44 || input.byteLength > VOICE_INPUT_MAX_BYTES) throw new Error("Unsupported voice size");
  const bytes = Buffer.from(input);
  if (bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WAVE" || bytes.readUInt32LE(4) !== bytes.length - 8) throw new Error("Unsupported voice container");
  let format: { channels: number; rate: number; bits: number; align: number } | undefined;
  let samples: Buffer | undefined;
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("Truncated voice chunk");
    const kind = bytes.toString("latin1", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + length;
    if (end + (length & 1) > bytes.length) throw new Error("Truncated voice data");
    if (kind === "fmt ") {
      if (format || ![16, 18].includes(length) || bytes.readUInt16LE(start) !== 1 || (length === 18 && bytes.readUInt16LE(start + 16) !== 0)) throw new Error("Only PCM WAV is supported");
      const channels = bytes.readUInt16LE(start + 2), rate = bytes.readUInt32LE(start + 4), bits = bytes.readUInt16LE(start + 14), align = bytes.readUInt16LE(start + 12);
      if (![1, 2].includes(channels) || rate < 8000 || rate > 48000 || ![8, 16].includes(bits) || align !== channels * bits / 8 || bytes.readUInt32LE(start + 8) !== rate * align) throw new Error("Invalid PCM sample format");
      format = { channels, rate, bits, align };
    } else if (kind === "data") {
      if (samples || !length) throw new Error("Invalid PCM data");
      samples = bytes.subarray(start, end);
    }
    // Ancillary chunks (including names/recording location) never reach Storage.
    offset = end + (length & 1);
  }
  if (!format || !samples || samples.length % format.align !== 0) throw new Error("Incomplete PCM samples");
  const durationSeconds = samples.length / format.align / format.rate;
  if (durationSeconds <= 0 || durationSeconds > VOICE_MAX_SECONDS) throw new Error("Voice duration exceeds 60 seconds");
  const padding = samples.length & 1;
  const output = Buffer.alloc(44 + samples.length + padding);
  if (output.length > VOICE_INPUT_MAX_BYTES) throw new Error("Voice output too large");
  output.write("RIFF", 0); output.writeUInt32LE(output.length - 8, 4); output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(format.channels, 22);
  output.writeUInt32LE(format.rate, 24); output.writeUInt32LE(format.rate * format.align, 28); output.writeUInt16LE(format.align, 32); output.writeUInt16LE(format.bits, 34);
  output.write("data", 36); output.writeUInt32LE(samples.length, 40); samples.copy(output, 44);
  return { bytes: output, durationSeconds };
}
