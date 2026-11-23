// Hum to notes with classic signal processing (the YIN pitch algorithm). No AI model is involved.
import { degToMidi, nearestDeg, rowCount, SCALES } from './theory.mjs';

const RATE = 24000, WIN = 1024, HOP = 480, MIN_HZ = 70, MAX_HZ = 1000;
const FRAME_SEC = HOP / RATE;

function downsample(x, sr) {
  if (sr <= RATE) return { x, sr };
  const ratio = sr / RATE, n = Math.floor(x.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b && j < x.length; j++) sum += x[j];
    out[i] = sum / (b - a);
  }
  return { x: out, sr: sr / ratio };
}

export function trackPitch(input, inputRate) {
  const { x, sr } = downsample(input, inputRate);
  const maxTau = Math.floor(sr / MIN_HZ), minTau = Math.floor(sr / MAX_HZ);
  const count = Math.max(0, Math.floor((x.length - WIN - maxTau) / HOP));
  const midi = new Float32Array(count).fill(NaN), rms = new Float32Array(count);
  const d = new Float32Array(maxTau + 2), c = new Float32Array(maxTau + 2);
  for (let f = 0; f < count; f++) {
    const s = f * HOP;
    let e = 0;
    for (let i = 0; i < WIN; i++) e += x[s + i] * x[s + i];
    rms[f] = Math.sqrt(e / WIN);
    if (rms[f] < 0.002) continue;
    d.fill(0);
    for (let t = 1; t <= maxTau; t++) { let sum = 0; for (let i = 0; i < WIN; i++) { const v = x[s + i] - x[s + i + t]; sum += v * v; } d[t] = sum; }
    let total = 0, tau = -1;
    c[0] = 1;
    for (let t = 1; t <= maxTau; t++) { total += d[t]; c[t] = total ? (d[t] * t) / total : 1; }
    for (let t = minTau; t < maxTau; t++) if (c[t] < 0.18) { while (t + 1 < maxTau && c[t + 1] < c[t]) t++; tau = t; break; }
    if (tau < 2) continue;
    const a = c[tau - 1], b = c[tau], g = c[tau + 1], den = 2 * (a - 2 * b + g);
    midi[f] = 69 + 12 * Math.log2((sr / (tau + (den ? (a - g) / den : 0))) / 440);
  }
  return { midi, rms };
}

// A quick single-pitch reading for the guitar tuner. Returns a MIDI note with cents, or null.
export function detectPitch(buffer, sampleRate) {
  const step = sampleRate > 30000 ? 2 : 1, sr = sampleRate / step, n = Math.floor(buffer.length / step), x = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) { x[i] = buffer[i * step]; energy += x[i] * x[i]; }
  if (Math.sqrt(energy / Math.max(1, n)) < 0.003) return null;
  const maxTau = Math.min(Math.floor(sr / 55), Math.floor(n / 2) - 1), minTau = Math.floor(sr / 1400), win = n - maxTau - 1;
  if (win < 64 || maxTau <= minTau) return null;
  const c = new Float32Array(maxTau + 2);
  let total = 0, tau = -1;
  c[0] = 1;
  for (let t = 1; t <= maxTau; t++) {
    let d = 0;
    for (let i = 0; i < win; i++) { const v = x[i] - x[i + t]; d += v * v; }
    total += d;
    c[t] = total ? (d * t) / total : 1;
  }
  for (let t = minTau; t < maxTau; t++) if (c[t] < 0.15) { while (t + 1 < maxTau && c[t + 1] < c[t]) t++; tau = t; break; }
  if (tau < 2) return null;
  const a = c[tau - 1], b = c[tau], g = c[tau + 1], den = 2 * (a - 2 * b + g);
  return 69 + 12 * Math.log2(sr / (tau + (den ? (a - g) / den : 0)) / 440);
}

const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[s.length >> 1]; };

export function segmentNotes({ midi, rms }) {
  const n = midi.length;
  if (!n) return [];
  const peak = Math.max(...rms);
  const gate = Math.max(0.006, peak * 0.14);
  const clean = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(midi[i]) || rms[i] < gate) continue;
    const near = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) if (!Number.isNaN(midi[j])) near.push(midi[j]);
    clean[i] = median(near);
  }
  const notes = [];
  let cur = null, gap = 0, off = 0, recentPeak = 0, dipped = false;
  const close = (endFrame) => {
    if (cur && endFrame - cur.start >= 4) notes.push({ start: cur.start * FRAME_SEC, end: endFrame * FRAME_SEC, midi: median(cur.values) });
    cur = null; off = 0; recentPeak = 0; dipped = false;
  };
  for (let i = 0; i < n; i++) {
    const v = clean[i];
    if (Number.isNaN(v)) { if (cur && ++gap > 2) close(i - gap + 1); continue; }
    gap = 0;
    if (!cur) { cur = { start: i, values: [v] }; recentPeak = rms[i]; continue; }
    if (rms[i] < recentPeak * 0.45) dipped = true;
    if (dipped && rms[i] > recentPeak * 0.7) { close(i); cur = { start: i, values: [v] }; recentPeak = rms[i]; continue; }
    recentPeak = Math.max(recentPeak * 0.985, rms[i]);
    const center = median(cur.values.slice(-12));
    if (Math.abs(v - center) > 0.8) {
      if (++off >= 3) { const at = i - off + 1; const keep = cur.values.slice(0, -(off - 1) || undefined); cur.values = keep; close(at); cur = { start: at, values: [v] }; recentPeak = rms[i]; continue; }
    } else off = 0;
    cur.values.push(v);
  }
  if (cur) close(n);
  return notes;
}

// Places sung notes on the grid and in the key. Singers drift, so the whole phrase is tuned first.
export function notesToGrid(sung, { bpm, stepSec: givenStep, key, scale, base, steps, grid = 2, latency = 0 }) {
  if (!sung.length) return [];
  const stepSec = givenStep || 60 / bpm / 4;
  const drift = median(sung.map((s) => s.midi - Math.round(s.midi)));
  const tuned = sung.map((s) => ({ ...s, midi: s.midi - drift }));
  const rows = rowCount(scale);
  const center = degToMidi(Math.floor(rows / 2), key, scale, base);
  const octave = 12 * Math.round((center - median(tuned.map((s) => s.midi))) / 12);
  const n = SCALES[scale].steps.length;
  const placed = [];
  for (const s of tuned) {
    const a = Math.max(0, Math.round((s.start - latency) / stepSec / grid) * grid);
    const b = Math.round((s.end - latency) / stepSec / grid) * grid;
    if (a >= steps) continue;
    let deg = nearestDeg(s.midi + octave, key, scale, base);
    while (deg < 0) deg += n;
    while (deg >= rows) deg -= n;
    placed.push({ deg, step: a, len: Math.max(grid, Math.min(b, steps) - a) });
  }
  placed.sort((p, q) => p.step - q.step || q.len - p.len);
  const out = [];
  for (const p of placed) {
    const last = out[out.length - 1];
    if (last && last.step === p.step) continue;
    if (last && last.step + last.len > p.step) last.len = p.step - last.step;
    if (last && last.deg === p.deg && last.step + last.len === p.step && last.len < grid) { last.len += p.len; continue; }
    out.push({ ...p });
  }
  return out;
}

// ---------------------------------------------------------------- beatbox to drums
// Finds each mouth hit by its sudden rise in loudness, then sorts it by where its energy sits:
// low and round is a kick, bright and hissy is a hat, and everything between is a snare.
function fftEnergy(x, start, size) {
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < size; i++) re[i] = (x[start + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < size; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const u = i + k, v = u + len / 2, tr = re[v] * cr - im[v] * ci, ti = re[v] * ci + im[v] * cr;
        re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  const power = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
  return power;
}

export function classifyHit(x, sr, start) {
  const size = 1024, power = fftEnergy(x, start, size), hz = sr / size;
  let total = 1e-12, low = 0, high = 0, moment = 0;
  for (let i = 1; i < power.length; i++) {
    const f = i * hz;
    total += power[i]; moment += f * power[i];
    if (f < 220) low += power[i];
    if (f > 3000) high += power[i];
  }
  const centroid = moment / total;
  if (low / total > 0.4 || centroid < 420) return 'kick';
  if (high / total > 0.45 || centroid > 3200) return 'hat';
  return 'snare';
}

export function findHits(input, inputRate) {
  const { x, sr } = downsample(input, inputRate);
  const hop = Math.round(sr * 0.004), win = hop * 2, count = Math.floor((x.length - win) / hop);
  if (count < 4) return [];
  const env = new Float32Array(count);
  let peak = 0;
  for (let f = 0; f < count; f++) {
    let e = 0;
    for (let i = 0; i < win; i++) e += x[f * hop + i] * x[f * hop + i];
    env[f] = Math.sqrt(e / win);
    peak = Math.max(peak, env[f]);
  }
  if (peak < 0.01) return [];
  const gate = Math.max(0.008, peak * 0.12), gapFrames = Math.round(0.075 / (hop / sr)), back = Math.round(0.024 / (hop / sr));
  const hits = [];
  let last = -gapFrames;
  // Starts at frame 0 so a hit right on the downbeat of the take is not lost.
  for (let f = 0; f < count; f++) {
    if (env[f] < gate || f - last < gapFrames) continue;
    let before = 0;
    const from = Math.max(0, f - back), span = f - 1 - from;
    for (let k = from; k < f - 1; k++) before += env[k];
    before = span > 0 ? before / span : 0;
    if (env[f] < before * 2.2 + 0.002) continue;
    hits.push({ time: (f * hop) / sr, drum: classifyHit(x, sr, f * hop) });
    last = f;
  }
  return hits;
}

export function hitsToGrid(found, { stepSec, steps, grid = 1, latency = 0 }) {
  const seen = new Set(), out = [];
  for (const h of found) {
    const step = Math.max(0, Math.round((h.time - latency) / stepSec / grid) * grid);
    const k = `${h.drum}:${step}`;
    if (step >= steps || seen.has(k)) continue;
    seen.add(k);
    out.push({ drum: h.drum, step });
  }
  return out;
}

export const beatboxToHits = (samples, sampleRate, options) => hitsToGrid(findHits(samples, sampleRate), options);

export const humToNotes = (samples, sampleRate, options) => {
  const sung = segmentNotes(trackPitch(samples, sampleRate));
  return { sung, notes: notesToGrid(sung, options) };
};
