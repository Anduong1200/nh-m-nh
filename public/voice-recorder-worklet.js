/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Captures only while explicitly connected by VoiceRecorder. No storage/network access.
class NhaMinhVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.remaining = sampleRate / 16000;
    this.weight = 0;
    this.sum = 0;
    this.total = 0;
    this.buffer = new Int16Array(256);
    this.used = 0;
    this.finished = false;
    this.port.onmessage = event => { if (event.data === "stop") this.finish(); };
  }
  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage({ samples }, [samples.buffer]);
    this.used = 0;
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.flush();
    this.port.postMessage({ complete: true });
  }
  process(inputs) {
    if (this.finished) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length && !this.finished; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] || 0;
      mono /= channels.length;
      let weight = 1;
      while (weight > 0 && !this.finished) {
        const take = Math.min(weight, this.remaining);
        this.sum += mono * take;
        this.weight += take;
        weight -= take;
        this.remaining -= take;
        if (this.remaining < 1e-9) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.weight));
          this.buffer[this.used++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
          this.total++;
          this.remaining = sampleRate / 16000;
          this.weight = 0;
          this.sum = 0;
          if (this.used === this.buffer.length) this.flush();
          if (this.total === 16000 * 60) this.finish();
        }
      }
    }
    // The default output stays silent; microphone samples are never played locally.
    return !this.finished;
  }
}
registerProcessor("nha-minh-voice", NhaMinhVoiceProcessor);
