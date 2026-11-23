import * as lame from './vendor/lamejs.js';

// Turns a 16-bit stereo WAV into a 192 kbps MP3 away from the interface thread.
self.onmessage = ({ data }) => {
  try {
    const view = new DataView(data.wav), rate = view.getUint32(24, true), frames = (data.wav.byteLength - 44) / 4;
    const left = new Int16Array(frames), right = new Int16Array(frames);
    for (let i = 0; i < frames; i++) { left[i] = view.getInt16(44 + i * 4, true); right[i] = view.getInt16(46 + i * 4, true); }
    const Encoder = lame.Mp3Encoder || lame.default.Mp3Encoder, enc = new Encoder(2, rate, 192), parts = [];
    for (let i = 0; i < frames; i += 1152) {
      const out = enc.encodeBuffer(left.subarray(i, i + 1152), right.subarray(i, i + 1152));
      if (out.length) parts.push(new Uint8Array(out));
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { bytes.set(p, at); at += p.length; }
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
