"use client";

import { useEffect, useRef, useState } from "react";
import { encodeVoiceWav, VOICE_RECORDING_MAX_SAMPLES, VOICE_RECORDING_RATE } from "./pcm-wav";

type Capture = { context: AudioContext; stream?: MediaStream; source?: MediaStreamAudioSourceNode; node?: AudioWorkletNode; chunks: Int16Array[]; count: number; stopped: boolean; timeout?: ReturnType<typeof setTimeout> };
function hidden() { return document.visibilityState === "hidden"; }

export function VoiceRecorder({ onRecorded, disabled = false }: { onRecorded: (file: File) => void; disabled?: boolean }) {
  const [status, setStatus] = useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0), [message, setMessage] = useState("");
  const capture = useRef<Capture | null>(null), mounted = useRef(true), sequence = useRef(0);
  const callback = useRef(onRecorded);
  const stopRef = useRef<() => void>(() => {});

  function finish(current: Capture) {
    if (current.stopped) return;
    current.stopped = true;
    if (current.timeout) clearTimeout(current.timeout);
    current.stream?.getTracks().forEach(track => track.stop());
    current.source?.disconnect(); current.node?.disconnect();
    void current.context.close().catch(() => {});
    if (capture.current === current) capture.current = null;
    if (current.count) {
      const bytes = encodeVoiceWav(current.chunks);
      callback.current(new File([bytes], "voice.wav", { type: "audio/wav" }));
    }
    if (mounted.current) {
      setStatus("idle");
      setMessage(current.count ? "Đã giữ bản ghi. Bạn có thể nghe lại và gửi lên bảng." : "Chưa có âm thanh trong bản ghi. Bạn có thể thử lại.");
    }
  }

  function stop() {
    sequence.current++;
    const current = capture.current;
    if (!current) return;
    // Release the hardware immediately, including when Safari suspends a background worklet.
    current.stream?.getTracks().forEach(track => track.stop());
    if (!current.node) { finish(current); return; }
    if (current.timeout) clearTimeout(current.timeout);
    current.node.port.postMessage("stop");
    current.timeout = setTimeout(() => finish(current), 100);
  }
  useEffect(() => { callback.current = onRecorded; stopRef.current = stop; });

  useEffect(() => {
    mounted.current = true;
    function visibility() { if (hidden()) stopRef.current(); }
    function pagehide() { stopRef.current(); }
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", visibility);
      stopRef.current();
    };
  }, []);
  useEffect(() => { if (disabled) stopRef.current(); }, [disabled]);

  async function start() {
    if (disabled || capture.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined" || typeof AudioWorkletNode === "undefined") { setMessage("Trình duyệt chưa hỗ trợ ghi âm tại đây. Bạn vẫn có thể chọn tệp WAV."); return; }
    const token = ++sequence.current;
    setStatus("starting"); setMessage(""); setSeconds(0);
    let context: AudioContext;
    try { context = new AudioContext(); }
    catch { setStatus("idle"); setMessage("Chưa mở được micro. Bạn vẫn có thể chọn tệp WAV."); return; }
    const current: Capture = { context, chunks: [], count: 0, stopped: false };
    capture.current = current;
    try {
      // Called only from the user's button gesture, before the asynchronous permission request.
      await context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      current.stream = stream;
      if (token !== sequence.current || !mounted.current || hidden()) { stream.getTracks().forEach(track => track.stop()); finish(current); return; }
      if (!context.audioWorklet || context.sampleRate < VOICE_RECORDING_RATE || context.sampleRate > 192000) throw new Error("Unsupported capture format");
      await context.audioWorklet.addModule("/voice-recorder-worklet.js");
      if (token !== sequence.current || !mounted.current || hidden()) { finish(current); return; }
      const node = new AudioWorkletNode(context, "nha-minh-voice", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      current.node = node;
      node.port.onmessage = (event: MessageEvent<{ samples?: Int16Array; complete?: boolean }>) => {
        if (current.stopped) return;
        const samples = event.data.samples;
        if (samples instanceof Int16Array && samples.length && current.count + samples.length <= VOICE_RECORDING_MAX_SAMPLES) {
          current.chunks.push(samples); current.count += samples.length;
          if (mounted.current) setSeconds(Math.floor(current.count / VOICE_RECORDING_RATE));
        }
        if (event.data.complete) finish(current);
      };
      current.source = context.createMediaStreamSource(stream);
      current.source.connect(node); node.connect(context.destination);
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => stopRef.current(), { once: true }));
      current.timeout = setTimeout(stop, 61_000);
      setStatus("recording");
    } catch {
      finish(current);
      if (mounted.current && token === sequence.current) setMessage("Chưa mở được micro. Bạn có thể cấp quyền rồi thử lại, hoặc chọn tệp WAV.");
    }
  }

  return <div className="space-y-2">
    <button type="button" disabled={disabled && status === "idle"} onClick={status === "idle" ? start : stop} className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] px-4 py-2 text-[var(--forest)]">
      {status === "recording" ? `Dừng ghi âm · ${seconds}/60 giây` : status === "starting" ? "Hủy mở micro" : "Ghi âm bằng micro"}
    </button>
    <p className="text-xs text-[var(--muted)]">Tối đa 60 giây. Ghi âm dừng khi bạn rời màn hình này.</p>
    {message && <p role="status" className="text-sm text-[var(--forest)]">{message}</p>}
  </div>;
}
