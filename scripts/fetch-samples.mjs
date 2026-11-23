// Downloads the chosen CC0 recordings, measures each note's real pitch, and writes small Opus files + a manifest.
// Sources: VCSL and VSCO-2-CE by Sam Gossner and contributors (both CC0-1.0).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/renderer/samples');
const CACHE = process.env.MELODY_SAMPLE_CACHE || path.join(os.tmpdir(), 'melodyshaper-samples');
const REPOS = { vcsl: 'sgossner/VCSL', vsco: 'sgossner/VSCO-2-CE' };
const NOTE = '([A-G]#?-?\\d)';

const INSTRUMENTS = [
  { id: 'piano', name: 'Piano', repo: 'vsco', dir: 'Keys/Upright Nr1/', re: `UR1_${NOTE}_mf_RR1\\.wav$`, secs: 6, release: 0.35 },
  { id: 'marimba', name: 'Marimba', repo: 'vcsl', dir: 'Idiophones/Struck Idiophones/Marimba/', re: `Marimba_hit_Outrigger_${NOTE}_med_01\\.wav$`, secs: 2.5, release: 0.2 },
  { id: 'vibes', name: 'Vibraphone', repo: 'vcsl', dir: 'Idiophones/Struck Idiophones/Vibraphone/Hard Mallets/', re: `Vibes_hard_${NOTE}_v2_rr1_Main\\.wav$`, secs: 5, release: 0.4 },
  { id: 'harp', name: 'Harp', repo: 'vcsl', dir: 'Chordophones/Composite Chordophones/Concert Harp/', re: `KSHarp_${NOTE}_mf1\\.wav$`, secs: 5, release: 0.4 },
  { id: 'kalimba', name: 'Kalimba', repo: 'vcsl', dir: 'Idiophones/Plucked Idiophones/Kalimba, Kenya/', re: `MainSpirit_${NOTE}_k\\d+_vl3_rr2\\.wav$`, secs: 3, release: 0.25 },
  { id: 'strings', name: 'Strings', repo: 'vsco', dir: 'Strings/Violin Section/susVib/', re: `VlnEns_susVib_${NOTE}_v1\\.wav$`, secs: 5, release: 0.3, sustain: true },
  { id: 'cello', name: 'Cello', repo: 'vsco', dir: 'Strings/Cello Section/susvib/', re: `susvib_${NOTE}_v1_1\\.wav$`, secs: 5, release: 0.3, sustain: true },
  { id: 'flute', name: 'Flute', repo: 'vsco', dir: 'Woodwinds/Flute/expvib/', re: `LDFlute_expvib_${NOTE}_v1_1\\.wav$`, secs: 4, release: 0.2, sustain: true },
  { id: 'trumpet', name: 'Trumpet', repo: 'vsco', dir: 'Brass/Trumpet/sus/', re: `Sum_SHTrumpet_sus_${NOTE}_v1_rr1\\.wav$`, secs: 4, release: 0.15, sustain: true },
  { id: 'sax', name: 'Tenor Sax', repo: 'vcsl', dir: 'Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato/', re: `BrettTenor_NV_Main_${NOTE}_vl2_rr1\\.wav$`, secs: 4, release: 0.15, sustain: true },
  { id: 'bass', name: 'Upright Bass', repo: 'vsco', dir: 'Strings/Solo Contrabass/Pizz/', re: `${NOTE}[^/]*\\.wav$`, secs: 3, release: 0.15, onePerNote: true },
  { id: 'grand', name: 'Grand Piano', repo: 'vcsl', dir: 'Chordophones/Zithers/Grand Piano, Steinway B/NoSus/', re: `JHPiano_NoSus_Close_${NOTE}_vl3_rr1\\.wav$`, secs: 6, release: 0.35 },
  { id: 'epiano', name: 'Electric Piano', repo: 'vcsl', dir: 'Electrophones/TX81Z/FM Piano/', re: `FMPiano_${NOTE}_vl2\\.wav$`, secs: 4, release: 0.3 },
  { id: 'organ', name: 'Church Organ', repo: 'vsco', dir: 'Keys/Organ/Loud/', numbered: true, secs: 4, release: 0.25, sustain: true },
  { id: 'glock', name: 'Glockenspiel', repo: 'vcsl', dir: 'Idiophones/Struck Idiophones/Glockenspiel/', re: `glock_medium_${NOTE}_01\\.wav$`, secs: 3, release: 0.4 },
  { id: 'chimes', name: 'Tubular Bells', repo: 'vcsl', dir: 'Idiophones/Struck Idiophones/Tubular Bells 1/', re: `chimes_${NOTE}_ff_rr\\d\\.wav$`, secs: 5, release: 0.5, trustLabel: true },
  { id: 'strum', name: 'Strumstick', repo: 'vcsl', dir: 'Chordophones/Composite Chordophones/Strumstick/Finger/', re: `Str\\d_Main_${NOTE}_vl2_rr1\\.wav$`, secs: 3, release: 0.25 },
  { id: 'pizz', name: 'Plucked Strings', repo: 'vsco', dir: 'Strings/Violin Section/Pizz/', re: `VlnEns_Pizz_${NOTE}_v1_rr1\\.wav$`, secs: 2, release: 0.15 },
  { id: 'viola', name: 'Violas', repo: 'vsco', dir: 'Strings/Viola Section/susvib/', re: `ViolaEns_susvib_${NOTE}_v1_1\\.wav$`, secs: 5, release: 0.3, sustain: true },
  { id: 'clarinet', name: 'Clarinet', repo: 'vsco', dir: 'Woodwinds/Clarinet/susLong/', re: `DCClar_susLong_${NOTE}_v2_rr1_sum\\.wav$`, secs: 4, release: 0.15, sustain: true },
  { id: 'oboe', name: 'Oboe', repo: 'vsco', dir: 'Woodwinds/Oboe/Vib/', re: `Oboe_Vib_${NOTE}_v1_Main\\.wav$`, secs: 4, release: 0.15, sustain: true },
  { id: 'horn', name: 'French Horn', repo: 'vsco', dir: 'Brass/F Horn/sus/', re: `MOHorn_sus_${NOTE}_v1_1\\.wav$`, secs: 4, release: 0.2, sustain: true },
  { id: 'trombone', name: 'Trombone', repo: 'vsco', dir: 'Brass/Tenor Trombone/sus/', re: `tenortbn_sus_${NOTE}_v1_1\\.wav$`, secs: 4, release: 0.15, sustain: true },
];

const GROUPS = { Keys: ['piano', 'grand', 'epiano', 'organ'], Mallets: ['marimba', 'vibes', 'glock', 'chimes', 'kalimba'], Plucked: ['harp', 'strum', 'pizz', 'bass'], Strings: ['strings', 'viola', 'cello'], Winds: ['flute', 'clarinet', 'oboe', 'sax'], Brass: ['trumpet', 'horn', 'trombone'] };
const groupOf = (id) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(id));

const DRUMS = [
  { id: 'kick', name: 'Kick', repo: 'vcsl', path: 'Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v5_rr1_Sum.wav', secs: 1.2 },
  { id: 'snare', name: 'Snare', repo: 'vcsl', path: 'Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v3_rr1_Mid.wav', secs: 0.8 },
  { id: 'hat', name: 'Hi-hat', repo: 'vcsl', path: 'Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v3_rr1_Mid.wav', secs: 0.5 },
  { id: 'openhat', name: 'Open hat', repo: 'vcsl', path: 'Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitO_rr1_Mid.wav', secs: 1.2 },
  { id: 'clap', name: 'Clap', repo: 'vcsl', path: 'Idiophones/Struck Idiophones/Claps/Clap_rr1.wav', secs: 0.8 },
  { id: 'shaker', name: 'Shaker', repo: 'vcsl', path: 'Idiophones/Struck Idiophones/Shaker, Small/Mid_ShakerDouble_Down_rr1.wav', secs: 0.5 },
  { id: 'tom', name: 'Tom', repo: 'vcsl', path: 'Membranophones/Struck Membranophones/Tom 1/Stick/TomH_HitS_v2_rr1_Mid.wav', secs: 1 },
  { id: 'conga', name: 'Conga', repo: 'vcsl', path: 'Membranophones/Struck Membranophones/Conga/Conga_HitN_v3_rr1_Sum.wav', secs: 0.8 },
  { id: 'tamb', name: 'Tambourine', repo: 'vcsl', path: 'Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav', secs: 0.7 },
  { id: 'cowbell', name: 'Cowbell', repo: 'vcsl', path: 'Idiophones/Struck Idiophones/Cowbells/Cowbell1_Hit_v3_rr1_Mid.wav', secs: 0.7 },
  { id: 'crash', name: 'Crash', repo: 'vsco', path: 'Percussion/cymbal-crash1_mf_rr1.wav', secs: 3 },
];

const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const toMidi = (n) => { const m = n.match(/^([A-G]#?)(-?\d)$/); return (Number(m[2]) + 1) * 12 + PC[m[1]]; };

async function tree(repo) {
  const f = path.join(CACHE, `${repo}.json`);
  if (!fs.existsSync(f)) {
    const out = execFileSync('gh', ['api', `repos/${REPOS[repo]}/git/trees/master?recursive=1`], { maxBuffer: 1 << 28 });
    fs.writeFileSync(f, out);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).tree.filter((x) => x.type === 'blob').map((x) => x.path);
}

async function download(repo, p) {
  const local = path.join(CACHE, repo, p);
  if (fs.existsSync(local) && fs.statSync(local).size > 1000) return local;
  fs.mkdirSync(path.dirname(local), { recursive: true });
  const url = `https://raw.githubusercontent.com/${REPOS[repo]}/master/${p.split('/').map(encodeURIComponent).join('/')}`;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.ok) {
      const b = Buffer.from(await r.arrayBuffer());
      if (b.subarray(0, 4).toString() !== 'RIFF') throw new Error(`Not a WAV: ${p}`);
      fs.writeFileSync(local, b);
      return local;
    }
    await new Promise((d) => setTimeout(d, 800 * (i + 1)));
  }
  throw new Error(`Download failed: ${p}`);
}

// YIN pitch estimate over the steady part of the note.
function measure(file) {
  const sr = 22050;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '0.08', '-t', '0.7', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  const W = 2048, maxTau = Math.floor(sr / 30), minTau = Math.floor(sr / 2200);
  const estimates = [];
  for (let s = 0; s + W + maxTau < x.length; s += 1024) {
    const d = new Float32Array(maxTau + 1);
    for (let t = 1; t <= maxTau; t++) for (let i = 0; i < W; i++) { const v = x[s + i] - x[s + i + t]; d[t] += v * v; }
    let sum = 0, tau = -1;
    const c = new Float32Array(maxTau + 1); c[0] = 1;
    for (let t = 1; t <= maxTau; t++) { sum += d[t]; c[t] = sum ? (d[t] * t) / sum : 1; }
    for (let t = minTau; t < maxTau; t++) if (c[t] < 0.15) { while (t + 1 < maxTau && c[t + 1] < c[t]) t++; tau = t; break; }
    if (tau < 1) continue;
    const a = c[tau - 1], b = c[tau], g = c[tau + 1], den = 2 * (a - 2 * b + g);
    estimates.push(sr / (tau + (den ? (a - g) / den : 0)));
  }
  if (estimates.length < 2) return null;
  estimates.sort((p, q) => p - q);
  return 69 + 12 * Math.log2(estimates[estimates.length >> 1] / 440);
}

// Close-miked notes can lean hard to one side, which makes a melody jump around the stereo field.
// Mild leans are evened out. A strong lean means one mic missed the note, so the better mic feeds both sides.
function balanceFilter(input) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-ac', '2', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  let l = 1e-9, r = 1e-9, peak = 1e-6;
  for (let i = 0; i + 1 < x.length; i += 2) { l += x[i] * x[i]; r += x[i + 1] * x[i + 1]; peak = Math.max(peak, Math.abs(x[i]), Math.abs(x[i + 1])); }
  // Quiet takes are raised first, so the silence trim can't mistake a whole note for silence.
  const lift = `volume=${(0.5 / peak).toFixed(4)}`;
  if (Math.abs(10 * Math.log10(l / r)) > 6) { const c = l > r ? 0 : 1; return `pan=stereo|c0=c${c}|c1=c${c},${lift}`; }
  const mean = (l + r) / 2;
  return `pan=stereo|c0=${Math.sqrt(mean / l).toFixed(4)}*c0|c1=${Math.sqrt(mean / r).toFixed(4)}*c1,${lift}`;
}

function encode(input, output, secs) {
  const fade = Math.min(0.25, secs / 4);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input,
    '-af', `aformat=channel_layouts=stereo,${balanceFilter(input)},silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${secs},afade=t=out:st=${secs - fade}:d=${fade},loudnorm=I=-18:TP=-2:LRA=11:linear=true,aresample=48000`,
    '-c:a', 'libopus', '-b:a', '80k', output]);
  if (fs.statSync(output).size < 500) throw new Error(`Encoded file is empty: ${output}`);
}

fs.mkdirSync(CACHE, { recursive: true });
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = { license: 'CC0-1.0', sources: ['VCSL', 'VSCO-2-CE'], instruments: [], drums: [] };
const files = { vcsl: await tree('vcsl'), vsco: await tree('vsco') };

for (const inst of INSTRUMENTS) {
  // These files are numbered by semitone instead of named by note, so the measured pitches set the anchor.
  if (inst.numbered) {
    const list = files[inst.repo].filter((p) => p.startsWith(inst.dir) && /_(\d+)\.wav$/.test(p)).map((p) => ({ p, num: Number(p.match(/_(\d+)\.wav$/)[1]) })).sort((a, b) => a.num - b.num);
    const heard = [];
    for (const c of list) { const wav = await download(inst.repo, c.p), measured = measure(wav); if (measured !== null) heard.push({ ...c, wav, measured }); }
    const offsets = heard.map((h) => h.measured - h.num).sort((a, b) => a - b), anchor = offsets[offsets.length >> 1];
    const zones = [];
    fs.mkdirSync(path.join(OUT, inst.id), { recursive: true });
    for (const h of heard) {
      const root = Math.round(anchor + h.num), cents = (h.measured - root) * 100;
      if (Math.abs(cents) > 45 || root < 36 || root > 96 || (zones.length && root - zones.at(-1).root < 3)) continue;
      const file = `${inst.id}/${root}.opus`;
      encode(h.wav, path.join(OUT, file), inst.secs);
      zones.push({ root, cents: Math.round(cents), file });
    }
    console.log(`${inst.name}: ${zones.length} notes, range ${zones[0].root}-${zones.at(-1).root}, from ${list.length} files`);
    manifest.instruments.push({ id: inst.id, name: inst.name, group: groupOf(inst.id), release: inst.release, sustain: !!inst.sustain, zones });
    continue;
  }
  const re = new RegExp(inst.re);
  const seen = new Map();
  for (const p of files[inst.repo]) {
    if (!p.startsWith(inst.dir)) continue;
    const m = path.basename(p).match(re);
    if (m && !seen.has(m[1])) seen.set(m[1], p);
  }
  const candidates = [...seen].map(([label, p]) => ({ label, p, midi: toMidi(label) })).sort((a, b) => a.midi - b.midi);
  const thinned = [];
  for (const c of candidates) if (!thinned.length || c.midi - thinned.at(-1).midi >= 3) thinned.push(c);
  const zones = [];
  let dropped = 0;
  fs.mkdirSync(path.join(OUT, inst.id), { recursive: true });
  // A library numbers its octaves one way throughout, so one shift applies to the whole instrument.
  // The most common measured shift wins; a note that disagrees is a detector octave error.
  const measuredNotes = [];
  for (const c of thinned) {
    const wav = await download(inst.repo, c.p);
    // Bells ring with uneven overtones that fool pitch detection, so their written notes are used.
    if (inst.trustLabel) { measuredNotes.push({ ...c, wav, octaves: 0, cents: 0 }); continue; }
    const measured = measure(wav);
    if (measured === null) { dropped++; console.warn(`  ${inst.id} ${c.label}: no clear pitch, dropped`); continue; }
    const octaves = Math.round((measured - c.midi) / 12);
    const cents = (measured - (c.midi + 12 * octaves)) * 100;
    if (Math.abs(cents) > 45) { dropped++; console.warn(`  ${inst.id} ${c.label}: measured ${measured.toFixed(2)}, dropped`); continue; }
    measuredNotes.push({ ...c, wav, octaves, cents });
  }
  if (!measuredNotes.length) throw new Error(`${inst.id}: no usable notes`);
  const votes = {};
  for (const n of measuredNotes) votes[n.octaves] = (votes[n.octaves] || 0) + 1;
  const shift = Number(Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]);
  for (const n of measuredNotes) {
    const root = n.midi + 12 * shift;
    const file = `${inst.id}/${root}.opus`;
    encode(n.wav, path.join(OUT, file), inst.secs);
    zones.push({ root, cents: Math.round(n.cents), file });
  }
  console.log(`${inst.name}: ${zones.length} notes, range ${zones[0].root}-${zones.at(-1).root}, shift ${shift} oct, votes ${JSON.stringify(votes)}, ${dropped} dropped`);
  manifest.instruments.push({ id: inst.id, name: inst.name, group: groupOf(inst.id), release: inst.release, sustain: !!inst.sustain, zones });
}

fs.mkdirSync(path.join(OUT, 'drums'), { recursive: true });
for (const d of DRUMS) {
  const wav = await download(d.repo, d.path);
  const file = `drums/${d.id}.opus`;
  encode(wav, path.join(OUT, file), d.secs);
  manifest.drums.push({ id: d.id, name: d.name, file });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
const total = execFileSync('du', ['-sh', OUT]).toString().split('\t')[0];
console.log(`Done: ${manifest.instruments.length} instruments, ${manifest.drums.length} drums, ${total}`);
