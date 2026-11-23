import assert from 'node:assert';
import { beatGroups } from '../src/renderer/beats.mjs';
import { METERS, SCALES, BEATS, PROGRESSIONS, beatHits, beatsFor, bassFromChords, chordNotes, degToMidi, fitChords, makeMelody, MELODY_STYLES, nearestDeg, notesForChords, rowCount, stepSeconds } from '../src/renderer/theory.mjs';

for (const scale of Object.keys(SCALES)) {
  for (let key = 0; key < 12; key++) {
    const allowed = new Set(SCALES[scale].steps.map((s) => (s + key) % 12));
    for (let deg = -10; deg < rowCount(scale) + 10; deg++) {
      const m = degToMidi(deg, key, scale, 60);
      assert(allowed.has(((m % 12) + 12) % 12), `${scale} ${key} ${deg} out of key`);
      assert.equal(degToMidi(nearestDeg(m, key, scale, 60), key, scale, 60), m);
    }
    for (let m = 40; m < 90; m++) assert(allowed.has(degToMidi(nearestDeg(m, key, scale, 60), key, scale, 60) % 12));
  }
  for (const p of PROGRESSIONS) {
    const chords = chordNotes(p, scale, 64);
    assert.equal(chords.length, 12);
    assert(chords.every((c) => c.deg >= 0 && c.deg < rowCount(scale)), `${scale} ${p.id} chord off the grid`);
    const bass = bassFromChords(chords, scale);
    assert.equal(bass.length, 8);
    assert(bass.every((b) => b.deg >= 0 && b.step < 64));
  }
}
for (const b of BEATS) assert(beatHits(b, 32).every((h) => h.step < 32));
for (const [id, m] of Object.entries(METERS)) {
  assert.equal(m.count * m.countSteps, m.barSteps, `${id}: count-in must fill one bar`);
  assert.equal(m.barSteps % m.beatSteps, 0, `${id}: beats must divide the bar`);
  for (const b of beatsFor(id)) for (const [drum, p] of Object.entries(b.hits)) assert.equal(p.length, m.barSteps, `${id} ${b.id} ${drum}: pattern length ${p.length}`);
  const steps = m.barSteps * 4, chords = chordNotes(PROGRESSIONS[0], 'major', steps, id), bass = bassFromChords(chords, 'major', id);
  assert(chords.every((c) => c.step % m.barSteps === 0 && c.len === m.barSteps));
  assert.equal(bass.length, 8);
  assert(bass.every((b) => b.step + b.len <= steps && b.len > 0), `${id}: bass runs past the end`);
  for (let i = 1; i < bass.length; i++) assert(bass[i - 1].step + bass[i - 1].len <= bass[i].step, `${id}: bass notes overlap`);
}
// Chord finder: a tune outlining C, G, Am, F in C major should get exactly those chords first.
const outline = [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]].flatMap((tones, bar) => tones.map((deg, i) => ({ deg, step: bar * 16 + i * 4, len: 4 })));
const found = fitChords(outline, { key: 0, scale: 'major', bars: 4 });
assert.deepEqual(found[0].degrees, [0, 4, 5, 3]);
assert.equal(found[0].match, 100);
assert.equal(found.length, 3);
assert.equal(new Set(found.map((f) => f.degrees.join())).size, 3, 'Chord options must differ');
assert.deepEqual(fitChords([], { key: 0, scale: 'major', bars: 4 }), []);
for (const scale of Object.keys(SCALES)) for (const meter of Object.keys(METERS)) for (const key of [0, 5, 11]) for (const bars of [4, 8, 16]) {
  const size = METERS[meter].barSteps, tune = Array.from({ length: bars * 2 }, (_, i) => ({ deg: (i * 3) % rowCount(scale), step: i * (size / 2), len: 2 }));
  const list = fitChords(tune, { key, scale, meter, bars });
  assert(list.length >= 1 && list.length <= 3);
  for (const f of list) {
    assert.equal(f.degrees.length, bars);
    assert(f.match >= 0 && f.match <= 100);
    assert(notesForChords(f.degrees, meter).every((n) => n.deg >= 0 && n.deg < rowCount(scale) && n.step + n.len <= bars * size), `${scale} ${meter}: chord off the grid`);
  }
}
// Drum presets: every bar fills its time signature, ids are unique, and every sound exists.
const soundIds = new Set(JSON.parse((await import('node:fs')).readFileSync(new URL('../src/renderer/samples/manifest.json', import.meta.url), 'utf8')).drums.map((d) => d.id));
const ids = new Set();
let presets = 0;
for (const [meter, m] of Object.entries(METERS)) for (const g of beatGroups(meter, beatsFor(meter))) for (const b of g.beats) {
  presets++;
  assert(!ids.has(`${meter}:${b.id}`), `Duplicate preset ${b.id}`); ids.add(`${meter}:${b.id}`);
  for (const [drum, p] of Object.entries(b.hits)) { assert.equal(p.length, m.barSteps, `${meter} ${b.id} ${drum}: length ${p.length}`); assert(soundIds.has(drum), `${b.id}: no sound ${drum}`); assert(/^[x.]+$/.test(p)); }
}
assert(presets >= 100, `Only ${presets} drum presets`);

// Melody maker: in range, inside the song, no overlaps, strong beats on chord notes, repeatable, and varied.
for (const scale of Object.keys(SCALES)) for (const meter of Object.keys(METERS)) for (const bars of [4, 8, 16]) for (const style of MELODY_STYLES) for (const kind of ['chords', 'bass']) for (const seed of [1, 2, 3]) {
  const m = METERS[meter], n = SCALES[scale].steps.length, source = kind === 'chords' ? chordNotes(PROGRESSIONS[0], scale, bars * m.barSteps, meter) : bassFromChords(chordNotes(PROGRESSIONS[0], scale, bars * m.barSteps, meter), scale, meter);
  const tune = makeMelody(source, { kind, scale, meter, bars, style: style.id, seed });
  assert(tune.length >= bars, `${scale} ${meter} ${style.id}: too few notes`);
  assert.deepEqual(makeMelody(source, { kind, scale, meter, bars, style: style.id, seed }), tune, 'Same seed must give the same melody');
  tune.forEach((x, i) => {
    assert(Number.isInteger(x.deg) && x.deg >= 0 && x.deg < rowCount(scale), `${scale} ${meter}: note off the grid`);
    assert(x.len > 0 && x.step + x.len <= bars * m.barSteps, `${scale} ${meter}: note past the end`);
    if (i) assert(tune[i - 1].step + tune[i - 1].len <= x.step, `${scale} ${meter} ${style.id}: notes overlap`);
    if (x.step % m.barSteps === 0) {
      const bar = x.step / m.barSteps, root = PROGRESSIONS[0].degrees[bar % 4] % n, tones = [0, 2, 4].map((o) => (root + o) % n);
      assert(tones.includes(x.deg % n), `${scale} ${meter} ${style.id}: bar ${bar} doesn't start on a chord note`);
    }
  });
}
const seedA = makeMelody(chordNotes(PROGRESSIONS[0], 'major', 64), { scale: 'major', bars: 4, seed: 1 }), seedB = makeMelody(chordNotes(PROGRESSIONS[0], 'major', 64), { scale: 'major', bars: 4, seed: 2 });
assert.notDeepEqual(seedA, seedB, 'Another try should give a different melody');
assert.equal(stepSeconds(120, '4/4'), 0.125);
assert.equal(stepSeconds(120, '6/8'), 60 / 120 / 6);
console.log('theory: every note in every key stays in key');
