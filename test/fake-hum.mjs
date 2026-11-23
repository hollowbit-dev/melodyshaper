// A voice-like test signal: harmonics, vibrato, breath noise, pitch drift, and soft note edges.
export function fakeHum(melody, { bpm, sr = 48000, drift = 0, rootShift = 0, noise = 0.006, seconds }) {
  const stepSec = 60 / bpm / 4, out = new Float32Array(Math.ceil(sr * seconds));
  let seed = 12345;
  for (const n of melody) {
    const a = Math.floor(n.step * stepSec * sr), b = Math.floor((n.step + n.len * 0.9) * stepSec * sr);
    let phase = 0;
    for (let i = a; i < b && i < out.length; i++) {
      const t = (i - a) / sr, m = n.midi + rootShift + drift + 0.18 * Math.sin(2 * Math.PI * 5.5 * t);
      phase += (2 * Math.PI * 440 * 2 ** ((m - 69) / 12)) / sr;
      const edge = Math.min(1, (i - a) / (0.03 * sr), (b - i) / (0.04 * sr));
      out[i] = edge * 0.22 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase) + 0.1 * Math.sin(4 * phase));
    }
  }
  for (let i = 0; i < out.length; i++) { seed = (seed * 16807) % 2147483647; out[i] += noise * (seed / 1073741823.5 - 1); }
  return out;
}

// A beatboxer: a low thump (boom), a noisy mid burst (kah) and a thin high hiss (tss).
export function fakeBeat(hits, { bpm, sr = 48000, seconds }) {
  const stepSec = 60 / bpm / 4, out = new Float32Array(Math.ceil(sr * seconds));
  let seed = 4242, prev = 0;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  for (const { step, drum } of hits) {
    const a = Math.floor(step * stepSec * sr), len = Math.floor((drum === 'kick' ? 0.14 : drum === 'snare' ? 0.11 : 0.07) * sr);
    for (let i = 0; i < len && a + i < out.length; i++) {
      const t = i / sr, n = rand();
      let v;
      if (drum === 'kick') v = 0.75 * Math.exp(-t * 24) * Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-t * 60)) * t);
      else if (drum === 'snare') { v = 0.45 * Math.exp(-t * 34) * (0.6 * n + 0.8 * Math.sin(2 * Math.PI * 900 * t) + 0.5 * Math.sin(2 * Math.PI * 1500 * t)); }
      else { const hp = n - prev; prev = n; v = 0.28 * Math.exp(-t * 60) * hp; }
      out[a + i] += v;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] += 0.002 * rand();
  return out;
}
