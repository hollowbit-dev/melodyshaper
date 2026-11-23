import assert from 'node:assert';
import { beatboxToHits, humToNotes } from '../src/renderer/pitch.mjs';
import { degToMidi, SCALES, TRACK_BASE } from '../src/renderer/theory.mjs';

import { fakeBeat, fakeHum } from './fake-hum.mjs';

const tune = [[0, 4, 0], [4, 4, 2], [8, 4, 4], [12, 4, 5], [16, 8, 4], [24, 4, 2], [28, 4, 1], [32, 8, 0]];
const CASES = [
  { name: 'on pitch', key: 0, scale: 'major', bpm: 100, drift: 0, rootShift: 0 },
  { name: '35 cents flat', key: 0, scale: 'major', bpm: 100, drift: -0.35, rootShift: 0 },
  { name: 'low male voice', key: 0, scale: 'major', bpm: 90, drift: 0.12, rootShift: -12 },
  { name: 'high voice', key: 0, scale: 'major', bpm: 120, drift: -0.1, rootShift: 12 },
  { name: 'other key', key: 7, scale: 'major', bpm: 110, drift: 0.2, rootShift: 0 },
];
const started = Date.now();
for (const c of CASES) {
  const melody = tune.map(([step, len, deg]) => ({ step, len, midi: degToMidi(deg, c.key, c.scale, 60) }));
  const seconds = (64 * 60) / c.bpm / 4;
  const samples = fakeHum(melody, { bpm: c.bpm, drift: c.drift, rootShift: c.rootShift, seconds });
  const { notes } = humToNotes(samples, 48000, { bpm: c.bpm, key: c.key, scale: c.scale, base: TRACK_BASE.melody, steps: 64 });
  assert.equal(notes.length, tune.length, `${c.name}: got ${notes.length} notes: ${JSON.stringify(notes)}`);
  const shift = notes[0].deg - tune[0][2];
  notes.forEach((n, i) => {
    assert.equal(n.step, tune[i][0], `${c.name}: note ${i} starts at ${n.step}`);
    assert.equal(n.deg - shift, tune[i][2], `${c.name}: note ${i} wrong pitch`);
    assert(Math.abs(n.len - tune[i][1]) <= 2, `${c.name}: note ${i} length ${n.len}`);
  });
  assert.equal(shift % SCALES[c.scale].steps.length, 0, `${c.name}: moved by a non-octave`);
}
const silent = humToNotes(new Float32Array(48000 * 4), 48000, { bpm: 100, key: 0, scale: 'major', base: 60, steps: 64 });
assert.equal(silent.notes.length, 0);
console.log(`pitch: ${CASES.length} voices transcribed exactly (${Date.now() - started} ms)`);

for (const bpm of [80, 100, 130]) {
  const beat = [];
  for (let bar = 0; bar < 4; bar++) for (const [step, drum] of [[0, 'kick'], [2, 'hat'], [4, 'snare'], [6, 'hat'], [8, 'kick'], [10, 'hat'], [12, 'snare'], [14, 'hat']]) beat.push({ step: bar * 16 + step, drum });
  const stepSec = 60 / bpm / 4, audio = fakeBeat(beat, { bpm, seconds: 64 * stepSec + 0.2 });
  const hits = beatboxToHits(audio, 48000, { stepSec, steps: 64 });
  const key = (h) => `${h.step}:${h.drum}`, want = new Set(beat.map(key)), got = new Set(hits.map(key));
  assert.deepEqual([...want].filter((k) => !got.has(k)), [], `${bpm} BPM: missed hits`);
  assert.deepEqual([...got].filter((k) => !want.has(k)), [], `${bpm} BPM: extra hits`);
}
assert.equal(beatboxToHits(new Float32Array(48000 * 2), 48000, { stepSec: 0.15, steps: 64 }).length, 0);
console.log('beatbox: kick, snare and hat placed exactly at 3 speeds');
