// Music rules. Notes are stored as positions in the scale, so every note stays in key when the key changes.
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SCALES = {
  major: { name: 'Major (happy)', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Minor (moody)', steps: [0, 2, 3, 5, 7, 8, 10] },
  majpent: { name: 'Pentatonic (bright)', steps: [0, 2, 4, 7, 9] },
  minpent: { name: 'Pentatonic (dark)', steps: [0, 3, 5, 7, 10] },
};
export const TRACK_BASE = { chords: 48, bass: 36, melody: 60, vocal: 60, guitar: 60 };
// The grid is always sixteenth notes. barSteps = grid cells per bar, beatSteps = cells per counted beat.
// In 6/8 the speed counts the two big beats, and the count-in counts all six eighth notes.
export const METERS = {
  '4/4': { num: 4, den: 4, barSteps: 16, beatSteps: 4, countSteps: 4, count: 4, bassHit: 8, midi: [4, 2, 24, 8] },
  '3/4': { num: 3, den: 4, barSteps: 12, beatSteps: 4, countSteps: 4, count: 3, bassHit: 8, midi: [3, 2, 24, 8] },
  '6/8': { num: 6, den: 8, barSteps: 12, beatSteps: 6, countSteps: 2, count: 6, bassHit: 6, midi: [6, 3, 36, 8] },
  '5/4': { num: 5, den: 4, barSteps: 20, beatSteps: 4, countSteps: 4, count: 5, bassHit: 12, midi: [5, 2, 24, 8] },
};
export const stepSeconds = (bpm, meter = '4/4') => 60 / bpm / METERS[meter].beatSteps;
export const midiName =(m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const rowCount = (scale) => SCALES[scale].steps.length * 2 + 1;

export function degToMidi(deg, key, scale, base) {
  const s = SCALES[scale].steps, n = s.length;
  const oct = Math.floor(deg / n);
  return base + key + s[deg - oct * n] + 12 * oct;
}

export function nearestDeg(midi, key, scale, base, min = -40, max = 40) {
  let best = min, gap = Infinity;
  for (let d = min; d <= max; d++) {
    const g = Math.abs(degToMidi(d, key, scale, base) - midi);
    if (g < gap) { gap = g; best = d; }
  }
  return best;
}

// Generic, public-domain-style patterns only: the everyday building blocks of popular music.
export const BEATS = [
  { id: 'four', name: 'Four on the floor', hits: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.' } },
  { id: 'back', name: 'Basic rock', hits: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' } },
  { id: 'half', name: 'Half-time', hits: { kick: 'x.........x.....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.' } },
  { id: 'hiphop', name: 'Hip-hop', hits: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' } },
  { id: 'shuffle', name: 'Soft shaker', hits: { kick: 'x.......x.......', clap: '....x.......x...', shaker: 'x.xxx.xxx.xxx.xx' } },
];
const METER_BEATS = {
  '4/4': BEATS,
  '3/4': [
    { id: 'waltz', name: 'Waltz', hits: { kick: 'x...........', snare: '....x...x...', hat: 'x.x.x.x.x.x.' } },
    { id: 'ballad3', name: 'Slow ballad', hits: { kick: 'x.....x.....', snare: '........x...', hat: 'x...x...x...' } },
    { id: 'soft3', name: 'Soft shaker', hits: { kick: 'x...........', clap: '........x...', shaker: 'x.xxx.xxx.xx' } },
  ],
  '6/8': [
    { id: 'ballad6', name: '6/8 ballad', hits: { kick: 'x...........', snare: '......x.....', hat: 'x.x.x.x.x.x.' } },
    { id: 'roll6', name: 'Rolling', hits: { kick: 'x.....x.x...', snare: '......x.....', hat: 'x.x.x.x.x.x.' } },
    { id: 'soft6', name: 'Soft shaker', hits: { kick: 'x...........', clap: '......x.....', shaker: 'x.xxx.x.xxx.' } },
  ],
  '5/4': [
    { id: 'five32', name: 'Three + two', hits: { kick: 'x...........x.......', snare: '........x.......x...', hat: 'x.x.x.x.x.x.x.x.x.x.' } },
    { id: 'five23', name: 'Two + three', hits: { kick: 'x.......x...........', snare: '....x...........x...', hat: 'x.x.x.x.x.x.x.x.x.x.' } },
    { id: 'soft5', name: 'Soft shaker', hits: { kick: 'x...........x.......', clap: '........x.......x...', shaker: 'x.xxx.xxx.xxx.xxx.xx' } },
  ],
};
export const beatsFor = (meter) => METER_BEATS[meter];
export const PROGRESSIONS = [
  { id: 'pop', name: 'I – V – vi – IV', degrees: [0, 4, 5, 3] },
  { id: 'sad', name: 'vi – IV – I – V', degrees: [5, 3, 0, 4] },
  { id: 'fifties', name: 'I – vi – IV – V', degrees: [0, 5, 3, 4] },
  { id: 'lift', name: 'I – IV – V – IV', degrees: [0, 3, 4, 3] },
  { id: 'jazz', name: 'ii – V – I – I', degrees: [1, 4, 0, 0] },
];

export function chordLabel(deg, key, scale) {
  const root = degToMidi(deg, key, scale, 60), third = degToMidi(deg + 2, key, scale, 60) - root, fifth = degToMidi(deg + 4, key, scale, 60) - root;
  const name = NOTE_NAMES[root % 12];
  if (third === 4 && fifth === 7) return name;
  if (third === 3 && fifth === 7) return `${name}m`;
  if (third === 3 && fifth === 6) return `${name}dim`;
  if (third === 4 && fifth === 8) return `${name}aug`;
  return `${name} (${NOTE_NAMES[(root + third) % 12]} ${NOTE_NAMES[(root + fifth) % 12]})`;
}

export const beatHits = (beat, steps) => {
  const out = [];
  for (const [drum, pattern] of Object.entries(beat.hits)) {
    for (let s = 0; s < steps; s++) if (pattern[s % pattern.length] === 'x') out.push({ drum, step: s });
  }
  return out;
};

export function chordNotes(prog, scale, steps, meter = '4/4') {
  const n = SCALES[scale].steps.length, notes = [], barSteps = METERS[meter].barSteps;
  for (let bar = 0; bar * barSteps < steps; bar++) {
    const root = prog.degrees[bar % prog.degrees.length] % n;
    for (const offset of [0, 2, 4]) notes.push({ deg: root + offset, step: bar * barSteps, len: barSteps });
  }
  return notes;
}

// Finds chords that suit a melody using plain music theory: one chord per bar, scored on how many
// of the melody's notes it contains, with a preference for strong beats and natural chord movement.
const MOVE_SCORE = { 0: -0.12, 2: 0.03, 3: 0.05, 5: 0.12, 7: 0.06, 9: 0.05, 10: 0.02 };
const pc = (m) => ((m % 12) + 12) % 12;
function trueRoot(pcs) {
  return pcs.find((r) => [3, 4].some((third) => pcs.includes((r + third) % 12)) && pcs.includes((r + 7) % 12));
}
export function fitChords(melody, { key, scale, meter = '4/4', bars }, count = 3) {
  const { barSteps, countSteps } = METERS[meter], size = SCALES[scale].steps.length;
  const weights = Array.from({ length: bars }, () => new Float64Array(12));
  for (const n of melody) {
    const note = pc(degToMidi(n.deg, key, scale, 60));
    for (let s = n.step; s < n.step + n.len && s < bars * barSteps; s++) {
      const pos = s % barSteps, strength = pos === 0 ? 2 : pos % countSteps === 0 ? 1.4 : 1;
      weights[Math.floor(s / barSteps)][note] += strength * (n.vel ?? 1);
    }
  }
  const totals = weights.map((w) => w.reduce((a, b) => a + b, 0)), allWeight = totals.reduce((a, b) => a + b, 0);
  if (!allWeight) return [];
  const chords = Array.from({ length: size }, (_, d) => {
    const pcs = [0, 2, 4].map((o) => pc(degToMidi(d + o, key, scale, 60))), root = trueRoot(pcs);
    return { d, pcs, root: root ?? pcs[0], plain: root !== undefined };
  });
  const inChord = (c, b) => c.pcs.reduce((sum, p) => sum + weights[b][p], 0);
  const tonic = pc(key), fifth = pc(key + 7);
  const barScore = (c, b) => {
    const fit = totals[b] ? (inChord(c, b) - 0.8 * (totals[b] - inChord(c, b))) / totals[b] : 0;
    let score = fit + (c.plain ? 0 : -0.25);
    if (b === 0 && c.d === 0) score += 0.12;
    if (b === bars - 1) score += c.d === 0 ? 0.14 : c.root === fifth ? 0.05 : 0;
    return score;
  };
  let beam = chords.map((c) => ({ list: [c], score: barScore(c, 0) })).sort((a, b) => b.score - a.score);
  for (let b = 1; b < bars; b++) {
    const next = [];
    for (const path of beam) for (const c of chords) {
      const move = MOVE_SCORE[pc(c.root - path.list.at(-1).root)] ?? 0;
      next.push({ list: [...path.list, c], score: path.score + barScore(c, b) + move });
    }
    beam = next.sort((a, b2) => b2.score - a.score).slice(0, 120);
  }
  // Keep options that really differ, relaxing only if the tune leaves too few.
  const chosen = [], apart = (a, b) => a.list.filter((c, i) => c.d !== b.list[i].d).length;
  for (let gap = Math.max(2, Math.ceil(bars / 4)); gap >= 1 && chosen.length < count; gap--) {
    for (const path of beam) {
      if (chosen.length >= count) break;
      if (!chosen.includes(path) && chosen.every((x) => apart(x, path) >= gap)) chosen.push(path);
    }
  }
  return chosen.map((path) => ({
    degrees: path.list.map((c) => c.d),
    match: Math.round((path.list.reduce((sum, c, b) => sum + inChord(c, b), 0) / allWeight) * 100),
  }));
}

export const notesForChords = (degrees, meter = '4/4') => degrees.flatMap((d, bar) => [0, 2, 4].map((o) => ({ deg: d + o, step: bar * METERS[meter].barSteps, len: METERS[meter].barSteps })));

// Writes a melody over chords or a bass line with fixed music rules (no AI): strong beats land on chord
// notes, weak beats step between them, and four-bar phrases repeat a short idea so it sounds intentional.
export const MELODY_STYLES = [{ id: 'simple', name: 'Simple' }, { id: 'flowing', name: 'Flowing' }, { id: 'catchy', name: 'Catchy' }];
function randomizer(seed) {
  let a = (seed * 2654435761 + 1) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function barRhythm(rand, style, meter) {
  const { barSteps, countSteps } = METERS[meter];
  const lengths = style === 'simple' ? [countSteps, countSteps, countSteps * 2] : style === 'flowing' ? [2, 2, countSteps, 2] : [1, 2, 3, countSteps, 2].filter((x) => x <= countSteps + 1);
  const rests = style === 'simple' ? 0.08 : style === 'flowing' ? 0.06 : 0.16, out = [];
  for (let step = 0; step < barSteps;) {
    let len = lengths[Math.floor(rand() * lengths.length)];
    // Long notes stop at the bar line, and odd lengths resolve back onto the eighth-note grid.
    len = Math.min(len, barSteps - step);
    if (step > 0 && rand() < rests) { step += Math.min(2, barSteps - step); continue; }
    out.push({ at: step, len, up: rand() < 0.5 ? 1 : -1, shape: rand() * 2 - 1 });
    step += len;
  }
  return out;
}
export function makeMelody(source, { kind = 'chords', scale, meter = '4/4', bars, style = 'flowing', seed = 1 }) {
  const { barSteps, countSteps } = METERS[meter], size = SCALES[scale].steps.length, top = rowCount(scale) - 1;
  const cls = (d) => ((d % size) + size) % size, rand = randomizer(seed);
  let last = null;
  const harmony = Array.from({ length: bars }, (_, bar) => {
    const here = source.filter((n) => n.step < (bar + 1) * barSteps && n.step + n.len > bar * barSteps);
    if (here.length) {
      const first = Math.min(...here.map((n) => n.step));
      const start = here.filter((n) => n.step === first);
      last = kind === 'bass' ? [0, 2, 4].map((o) => cls(Math.min(...start.map((n) => n.deg)) + o)) : [...new Set(start.map((n) => cls(n.deg)))];
    }
    return last;
  });
  const fallback = harmony.find(Boolean) || [0, 2, 4].map(cls);
  const chordAt = (bar) => harmony[bar] || fallback;
  // This range spans a full octave, so every chord note always has a place in it.
  const low = Math.max(1, Math.floor(size / 2)), high = Math.min(top, size + Math.ceil(size / 2));
  const keepIn = (d) => Math.max(low, Math.min(high, d));
  // Picks the chord note closest to where the phrase wants to go, avoiding repeats and big leaps.
  const nearest = (from, tones, target = from) => {
    let best = keepIn(from), score = Infinity;
    for (let d = low; d <= high; d++) {
      if (!tones.includes(cls(d))) continue;
      const leap = Math.abs(d - from), cost = Math.abs(d - target) + (d === from ? 1.2 : 0) + (leap > 3 ? (leap - 3) * 0.7 : 0);
      if (cost < score) { score = cost; best = d; }
    }
    return best;
  };
  const ideaA = barRhythm(rand, style, meter), ideaB = barRhythm(rand, style, meter), notes = [];
  const middle = (low + high) / 2, reach = (high - low) / 2;
  let deg = nearest(Math.round(middle), chordAt(0), middle - 1 + rand() * 2);
  for (let bar = 0; bar < bars; bar++) {
    const inPhrase = bar % 4, closes = inPhrase === 3 || bar === bars - 1;
    let cells = inPhrase === 2 ? ideaB : ideaA;
    if (closes) {
      // A phrase ends by landing and holding, which is what makes it sound finished.
      const cut = Math.floor(barSteps / 2 / countSteps) * countSteps;
      cells = [...cells.filter((c) => c.at < cut).map((c) => ({ ...c, len: Math.min(c.len, cut - c.at) })), { at: cut, len: barSteps - cut, up: -1, shape: -0.5 }];
    }
    const tones = chordAt(bar);
    cells.forEach((cell, i) => {
      const strong = cell.at % countSteps === 0, end = closes && i === cells.length - 1;
      // Each four-bar phrase rises towards its middle and comes back down.
      const place = (inPhrase + cell.at / barSteps) / 4, target = middle - reach * 0.55 + Math.sin(place * Math.PI) * reach * 1.1 + cell.shape * 1.2;
      if (end) deg = bar === bars - 1 && tones.includes(0) ? nearest(deg, [0], middle - 1) : nearest(deg, tones, target);
      else if (strong) deg = nearest(deg, tones, target);
      else deg = keepIn(deg + (Math.abs(target - deg) < 0.6 ? cell.up : Math.sign(target - deg)));
      const vel = cell.at === 0 ? 1 : strong ? 0.88 : 0.72;
      notes.push({ deg, step: bar * barSteps + cell.at, len: Math.max(1, cell.len), vel });
    });
  }
  return notes;
}

// How a chord is played. The written notes never change, so a style can be swapped at any time.
export const CHORD_STYLES = [
  { id: 'block', name: 'Held' },
  { id: 'strum', name: 'Strum' },
  { id: 'arp', name: 'Arpeggio' },
  { id: 'pulse', name: 'Pulse' },
];
const STRUM_GAP = 0.024;
export function expandStyle(notes, style, meter = '4/4') {
  if (!style || style === 'block') return notes;
  const groups = new Map(), out = [], beat = METERS[meter].countSteps;
  for (const n of notes) { if (!groups.has(n.step)) groups.set(n.step, []); groups.get(n.step).push(n); }
  for (const [start, group] of groups) {
    group.sort((a, b) => a.deg - b.deg);
    if (style === 'strum') group.forEach((n, i) => out.push({ ...n, from: n, delay: i * STRUM_GAP }));
    else if (style === 'pulse') for (const n of group) for (let s = start; s < start + n.len; s += beat) out.push({ ...n, from: n, step: s, len: Math.max(1, Math.min(beat - 1, start + n.len - s)) });
    else {
      const span = Math.max(...group.map((n) => n.len));
      for (let s = start, i = 0; s < start + span; s += 2, i++) { const n = group[i % group.length]; out.push({ ...n, from: n, step: s, len: Math.min(2, start + span - s) }); }
    }
  }
  return out;
}

export function bassFromChords(chords, scale, meter = '4/4') {
  const { barSteps, bassHit } = METERS[meter];
  const n = SCALES[scale].steps.length, byStep = new Map();
  for (const c of chords) if (!byStep.has(c.step) || c.deg < byStep.get(c.step).deg) byStep.set(c.step, c);
  const out = [];
  for (const c of byStep.values()) {
    const root = ((c.deg % n) + n) % n;
    const len = Math.min(6, bassHit - 1);
    out.push({ deg: root, step: c.step, len: Math.min(len, c.len) });
    if (c.len >= barSteps) out.push({ deg: root, step: c.step + bassHit, len: Math.min(len, barSteps - bassHit) });
  }
  return out.sort((a, b) => a.step - b.step);
}
