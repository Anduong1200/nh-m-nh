export const VOICE_RECORDING_RATE = 16000;
export const VOICE_RECORDING_MAX_SAMPLES = 60 * VOICE_RECORDING_RATE;

/** Browser capture produces uncompressed, mono signed PCM; no microphone metadata is retained. */
export function encodeVoiceWav(chunks: readonly Int16Array[]): Uint8Array<ArrayBuffer> {
  const samples = chunks.reduce((count, chunk) => count + chunk.length, 0);
  if (!samples || samples > VOICE_RECORDING_MAX_SAMPLES || !chunks.every(chunk => chunk instanceof Int16Array)) throw new Error("Unsupported recording duration");
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  function text(offset: number, value: string) { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); }
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, VOICE_RECORDING_RATE, true);
  view.setUint32(28, VOICE_RECORDING_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const sample of chunk) { view.setInt16(offset, sample, true); offset += 2; }
  return bytes;
}
