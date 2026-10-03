import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { encodeVoiceWav, VOICE_RECORDING_MAX_SAMPLES } from "./pcm-wav";

it("encodes signed little-endian samples and an accurate mono 16kHz header", () => {
  const bytes = encodeVoiceWav([new Int16Array([-32768, 0]), new Int16Array([32767])]);
  const view = new DataView(bytes.buffer);
  expect(bytes.length).toBe(50); expect(view.getUint32(4, true)).toBe(42);
  expect(view.getUint16(22, true)).toBe(1); expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getInt16(44, true)).toBe(-32768); expect(view.getInt16(48, true)).toBe(32767);
  expect(() => encodeVoiceWav([])).toThrow();
  expect(() => encodeVoiceWav([new Int16Array(VOICE_RECORDING_MAX_SAMPLES + 1)])).toThrow();
});

type Processor = { process: (input: Float32Array[][]) => boolean; port: { postMessage: (data: {samples?: Int16Array; complete?: boolean}) => void; onmessage: (event: {data: string}) => void }; };
async function processor(rate: number) {
  const sent: {samples?: Int16Array; complete?: boolean}[] = [];
  let ctor: (new () => Processor) | undefined;
  class Base { port = { postMessage: (data: {samples?: Int16Array; complete?: boolean}) => sent.push(data), onmessage: () => {} }; }
  runInNewContext(await readFile("public/voice-recorder-worklet.js", "utf8"), { AudioWorkletProcessor: Base, registerProcessor: (_name: string, type: new () => Processor) => { ctor = type; }, sampleRate: rate, Int16Array });
  return { capture: new ctor!(), sent };
}
it("downsamples actual microphone blocks to mono signed PCM and flushes when stopped", async () => {
  const { capture, sent } = await processor(48000);
  capture.process([[new Float32Array(480).fill(0.25), new Float32Array(480).fill(0.75)]]);
  capture.port.onmessage({ data: "stop" });
  const samples = sent.flatMap(message => message.samples ? [...message.samples] : []);
  expect(samples).toHaveLength(160); expect(new Set(samples)).toEqual(new Set([16384]));
  expect(sent.at(-1)).toEqual({ complete: true });
  expect(capture.process([[new Float32Array(480)]] )).toBe(false);
});
it("caps capture at exactly 60 seconds independently of wall-clock timers", async () => {
  const { capture, sent } = await processor(44100);
  for (let i = 0; i < 601; i++) capture.process([[new Float32Array(4410).fill(-1)]]);
  expect(sent.reduce((sum, message) => sum + (message.samples?.length ?? 0), 0)).toBe(VOICE_RECORDING_MAX_SAMPLES);
  expect(sent.filter(message => message.complete)).toHaveLength(1);
});
