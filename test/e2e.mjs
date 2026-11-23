// Runs the real app. A simulated voice goes in through Chromium's fake microphone.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { fakeBeat, fakeHum } from './fake-hum.mjs';
import { degToMidi, SCALES } from '../src/renderer/theory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test/out');
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melody-e2e-'));
const BPM = 100, tune = [[0, 8, 0], [8, 8, 2], [16, 8, 4], [24, 8, 5], [32, 8, 4], [40, 8, 2], [48, 8, 1], [56, 8, 0]];

function wavFile(samples, sr) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return b;
}
// The tune repeats, so wherever the fake mic happens to be when recording starts, whole notes are heard.
const stepSec = 60 / BPM / 4, loop = tune.map(([step, len, deg]) => ({ step, len, midi: degToMidi(deg, 0, 'major', 60) }));
const mic = path.join(tmp, 'voice.wav');
const melody = [];
for (let r = 0; r < 4; r++) for (const n of loop) melody.push({ ...n, step: n.step + r * 64 });
fs.writeFileSync(mic, wavFile(fakeHum(melody, { bpm: BPM, seconds: 256 * stepSec }), 48000));

const launch = () => electron.launch({ args: [ROOT], env: { ...process.env, MELODY_TEST: '1', MELODY_HIDDEN: '1', MELODY_USERDATA: path.join(tmp, 'data'), MELODY_FAKE_MIC: mic } });
const ready = async (page) => { for (let i = 0; i < 100; i++) { if (await page.evaluate(() => document.documentElement.dataset.ready === '1')) return; await page.waitForTimeout(100); } throw new Error('App did not start'); };
const wait = async (page, fn, ms = 40000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await page.evaluate(fn)) return; await page.waitForTimeout(150); } throw new Error(`Timed out: ${fn}`); };

let app = await launch();
try {
  let page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 1240, height: 800 });
  await ready(page);

  // Sixty-second path: beat, chords, bass.
  await page.click('[data-track=drums]'); await page.click('.chip[data-id=four]');
  await page.click('[data-track=chords]'); await page.click('.chip[data-id=pop]');
  await page.click('[data-track=bass]'); await page.click('.chip[data-id=follow]');
  let s = await page.evaluate(() => { const x = window.__melody.song; return x.tracks.map((t) => (t.hits || t.notes).length); });
  assert.deepEqual(s, [40, 12, 8, 0]);
  await page.waitForTimeout(600);
  assert(await page.evaluate(() => window.__melody.engine.playing), 'playback should start after picking a beat');
  await page.click('#play');

  // Every instrument decodes and has its notes.
  const counts = await page.evaluate(async () => {
    const e = window.__melody.engine; await e.boot();
    const out = {};
    for (const i of e.manifest.instruments) { const b = await Promise.all(i.zones.map((z) => e.load(z.file))); out[i.id] = b.filter((x) => x.duration > 0.2).length === i.zones.length; }
    for (const d of e.manifest.drums) out[d.id] = (await e.load(d.file)).duration > 0.05;
    return out;
  });
  assert(Object.values(counts).every(Boolean), `Bad sounds: ${JSON.stringify(counts)}`);

  // The real permission and getUserMedia call still run. Their silent fake stream is then swapped for the
  // simulated voice, which enters the same capture worklet, worker and note placement as a real microphone.
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = await window.__melody.engine.boot();
    const voice = await ctx.decodeAudioData(bytes.buffer);
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let last = null;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const granted = await real(constraints);
      granted.getTracks().forEach((t) => t.stop());
      try { last?.stop(); } catch { /* already stopped */ }
      const src = ctx.createBufferSource(), dest = ctx.createMediaStreamDestination();
      src.buffer = window.__voice || voice; src.loop = true; src.connect(dest); src.start();
      last = src;
      return dest.stream;
    };
  }, fs.readFileSync(mic).toString('base64'));

  // Hum twice: the second run proves the microphone can be reused.
  for (let round = 0; round < 2; round++) {
    await page.click('[data-track=melody]');
    await page.click('#hum');
    await wait(page, () => !document.getElementById('overlay').hidden);
    if (round === 0) { await page.waitForTimeout(3200); await page.screenshot({ path: path.join(OUT, 'hum.png') }); }
    await wait(page, () => document.getElementById('overlay').hidden && window.__melody.song.tracks[3].notes.length > 0 && window.__melody.engine.playing);
    await page.click('#play');
    const notes = await page.evaluate(() => window.__melody.song.tracks[3].notes);
    const allowed = new Set(SCALES.major.steps);
    assert(notes.length >= 5, `Hum ${round}: only ${notes.length} notes`);
    assert(notes.every((n) => allowed.has(degToMidi(n.deg, 0, 'major', 60) % 12)), 'Hum produced an out-of-key note');
    const heard = new Set(notes.map((n) => n.deg % 7));
    for (const d of [0, 2, 4]) assert(heard.has(d), `Hum ${round}: missing degree ${d} in ${JSON.stringify(notes)}`);
    console.log(`hum ${round + 1}: ${notes.length} notes through the real microphone path`);
    if (round === 0) await page.evaluate(() => { window.__melody.song.tracks[3].notes = []; });
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'main.png') });

  // Key change keeps notes, and undo restores.
  const before = await page.evaluate(() => JSON.stringify(window.__melody.song.tracks[3].notes));
  await page.selectOption('#key', '7');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__melody.song.tracks[3].notes)), before);
  await page.click('#undo');
  assert.equal(await page.evaluate(() => window.__melody.song.key), 0);
  await page.click('#redo');
  assert.equal(await page.evaluate(() => window.__melody.song.key), 7);
  await page.click('#undo');

  // Drawing a note, then clicking it removes it.
  await page.click('[data-track=chords]');
  const box = await page.locator('#roll').boundingBox();
  const n0 = await page.evaluate(() => window.__melody.song.tracks[1].notes.length);
  await page.mouse.click(box.x + box.width - 30, box.y + 12);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[1].notes.length), n0 + 1);
  await page.mouse.click(box.x + box.width - 30, box.y + 12);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[1].notes.length), n0);

  // Time signatures: grid length, starter beats, MIDI header, undo.
  for (const [meter, barSteps, firstBeat, sig] of [['3/4', 12, 'waltz', [3, 2]], ['6/8', 12, 'ballad6', [6, 3]], ['5/4', 20, 'five32', [5, 2]]]) {
    await page.selectOption('#meter', meter);
    await page.click('[data-track=drums]');
    await page.click(`.chip[data-id=${firstBeat}]`);
    await page.click('#play');
    const r = await page.evaluate(() => { const x = window.__melody.song, m = [...window.__melody.midiBytes()]; let at = -1; for (let i = 0; i < m.length - 2; i++) if (m[i] === 255 && m[i + 1] === 88) { at = i; break; } return { meter: x.meter, max: Math.max(...x.tracks.flatMap((t) => (t.hits || t.notes).map((n) => n.step))), bars: x.bars, sig: [m[at + 3], m[at + 4]] }; });
    assert.equal(r.meter, meter); assert(r.max < r.bars * barSteps, `${meter}: note past the end`); assert.deepEqual(r.sig, sig);
  }
  for (let i = 0; i < 6; i++) await page.click('#undo');
  assert.equal(await page.evaluate(() => window.__melody.song.meter), '4/4');
  await page.click('[data-track=melody]');
  await page.evaluate(() => { if (window.__melody.engine.playing) document.getElementById('play').click(); });

  // A take can be re-timed and moved an octave without singing again.
  const normal = await page.evaluate(() => window.__melody.song.tracks[3].notes.length);
  await page.click('.chip[data-grid="4"]');
  const simple = await page.evaluate(() => window.__melody.song.tracks[3].notes);
  assert(simple.every((n) => n.step % 4 === 0), 'Simple timing should land on beats');
  await page.click('.chip[data-grid="2"]');
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[3].notes.length), normal);
  const low = await page.evaluate(() => Math.min(...window.__melody.song.tracks[3].notes.map((n) => n.deg)));
  if (low >= 7) { await page.click('.chip[data-octave="-1"]'); assert.equal(await page.evaluate(() => Math.min(...window.__melody.song.tracks[3].notes.map((n) => n.deg))), low - 7); await page.click('#undo'); }

  // Beatbox into the drum track through the same capture path.
  const beatPlan = [];
  for (let bar = 0; bar < 8; bar++) for (const [step, drum] of [[0, 'kick'], [4, 'snare'], [8, 'kick'], [12, 'snare']]) beatPlan.push({ step: bar * 16 + step, drum });
  const beatWav = wavFile(fakeBeat(beatPlan, { bpm: BPM, seconds: 128 * stepSec }), 48000);
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.__voice = await window.__melody.engine.ctx.decodeAudioData(bytes.buffer);
  }, beatWav.toString('base64'));
  await page.click('[data-track=drums] .name');
  assert.equal(await page.textContent('#humLabel'), 'Beatbox a beat');
  await page.click('#hum');
  await wait(page, () => !document.getElementById('overlay').hidden);
  await wait(page, () => document.getElementById('overlay').hidden && window.__melody.engine.playing);
  await page.click('#play');
  const boxed = await page.evaluate(() => window.__melody.song.tracks[0].hits);
  const boxedKinds = new Set(boxed.map((h) => h.drum));
  assert(boxed.length >= 10, `Beatbox found only ${boxed.length} hits`);
  assert(boxedKinds.has('kick') && boxedKinds.has('snare'), `Beatbox kinds: ${[...boxedKinds]}`);
  console.log(`beatbox: ${boxed.length} hits through the capture path`);
  await page.click('#undo');
  await page.evaluate(() => { window.__voice = null; });
  await page.click('[data-track=melody] .name');

  // Real vocals: record onto a voice track, keep the audio through save and reopen, and hear it in the mix.
  await page.selectOption('#addTrack', 'vocal');
  assert.equal(await page.textContent('#humLabel'), 'Record vocals');
  await page.click('#hum');
  await wait(page, () => !document.getElementById('overlay').hidden);
  await wait(page, () => document.getElementById('overlay').hidden && window.__melody.engine.playing);
  await page.click('#play');
  const vocal = await page.evaluate(() => { const t = window.__melody.song.tracks.find((x) => x.role === 'vocal'); const b = window.__melody.engine.audio.get(t.clips[0].id); return { clips: t.clips.length, seconds: b.duration }; });
  assert.equal(vocal.clips, 1); assert(vocal.seconds > 9 && vocal.seconds < 10, `Vocal length ${vocal.seconds}`);
  const reopened = await page.evaluate(async () => {
    const m = window.__melody, before = m.song.tracks.find((x) => x.role === 'vocal').clips[0].id, text = m.serializeFile(), original = m.engine.audio.get(before).getChannelData(0).slice(0, 48000);
    m.engine.audio.delete(before);
    const ok = await m.loadSong(text, 'Reopened');
    const b = m.engine.audio.get(before);
    let diff = 0;
    if (b) { const d = b.getChannelData(0); for (let i = 0; i < original.length; i++) diff = Math.max(diff, Math.abs(d[i] - original[i])); }
    return { ok, has: !!b, diff, name: m.song.name };
  });
  assert(reopened.ok && reopened.has, 'Recording should survive save and reopen'); assert(reopened.diff < 0.001, `Audio changed: ${reopened.diff}`);
  await page.evaluate(() => { const m = window.__melody; m.song.name = 'My song'; for (const t of m.song.tracks) t.solo = t.role === 'vocal'; });
  const voiceOnly = await page.evaluate(async () => { const b = await window.__melody.exportBytes(), v = new DataView(b.buffer); let p = 0; for (let i = 44; i + 1 < b.length; i += 2) p = Math.max(p, Math.abs(v.getInt16(i, true))); return p; });
  assert(voiceOnly > 1000, `Vocal missing from export: ${voiceOnly}`);
  await page.evaluate(() => { const m = window.__melody; for (const t of m.song.tracks) t.solo = false; m.song.tracks = m.song.tracks.filter((t) => t.role !== 'vocal'); m.select('melody'); });

  // Sections: a new section keeps the groove, a repeat is linked, and the song plays and exports end to end.
  const firstBars = await page.evaluate(() => window.__melody.song.bars);
  await page.selectOption('#addSection', 'new:Chorus');
  let arr = await page.evaluate(() => { const x = window.__melody.song; return { blocks: x.arrangement.length, melody: x.tracks.find((t) => t.id === 'melody').notes.length, chords: x.tracks.find((t) => t.id === 'chords').notes.length }; });
  assert.deepEqual(arr, { blocks: 2, melody: 0, chords: 12 });
  await page.selectOption('#addSection', 'repeat:s1');
  const flat = await page.evaluate(() => { const f = window.__melody.flatten(); return { bars: f.bars, melody: f.tracks.find((t) => t.id === 'melody').notes.length, last: Math.max(...f.tracks.flatMap((t) => (t.hits || t.notes).map((n) => n.step))), blocks: f.blocks.length }; });
  assert.equal(flat.bars, firstBars * 3); assert.equal(flat.blocks, 3); assert(flat.melody >= 10, 'repeat should play the melody twice'); assert(flat.last < flat.bars * 16);
  await page.click('#playSong');
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => window.__melody.engine.playing && window.__melody.engine.project.bars === 12));
  await page.click('#playSong');
  assert.equal(await page.evaluate(() => window.__melody.engine.playing), false);

  // Tracks: add, remove, undo.
  await page.selectOption('#addTrack', 'melody');
  assert.equal(await page.evaluate(() => window.__melody.song.tracks.length), 5);
  await page.locator('[data-track=melody-1]').hover();
  await page.locator('[data-track=melody-1] .del').click();
  assert.equal(await page.evaluate(() => window.__melody.song.tracks.length), 4);
  await page.click('#undo');
  assert.equal(await page.evaluate(() => window.__melody.song.tracks.length), 5);
  await page.click('#undo');
  assert.equal(await page.evaluate(() => window.__melody.song.tracks.length), 4);

  // Effects and swing change the rendered sound, and a pan really moves it.
  const stereo = () => page.evaluate(async () => {
    const b = await window.__melody.exportBytes(), v = new DataView(b.buffer);
    let l = 0, r = 0;
    for (let i = 44; i + 3 < b.length; i += 4) { l += Math.abs(v.getInt16(i, true)); r += Math.abs(v.getInt16(i + 2, true)); }
    return { l, r };
  });
  await page.evaluate(() => { for (const t of window.__melody.song.tracks) t.fx.pan = -1; });
  const panned = await stereo();
  assert(panned.l > panned.r * 3, `Pan left should favour left: ${JSON.stringify(panned)}`);
  await page.evaluate(() => { for (const t of window.__melody.song.tracks) t.fx.pan = 0; window.__melody.song.swing = 0.4; });
  const swung = await stereo();
  assert(Math.abs(swung.l - swung.r) < swung.l * 0.05, 'Centred mix should be balanced');
  await page.evaluate(() => { window.__melody.song.swing = 0; });

  // Editing: select, copy, paste, nudge in key, loudness, delete, undo.
  await page.click('[data-track=chords]');
  await page.evaluate(() => { window.__melody.selectAll(); window.__melody.copySelected(); window.__melody.removeSelected(); });
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[1].notes.length), 0);
  await page.click('#undo');
  const noteCount = await page.evaluate(() => window.__melody.song.tracks[1].notes.length);
  assert(noteCount >= 12);
  await page.evaluate(() => { const m = window.__melody; m.select('melody'); m.song.tracks[3].notes = [{ deg: 2, step: 0, len: 2 }, { deg: 4, step: 4, len: 2 }]; m.select('melody'); m.selectAll(); m.copySelected(); m.pasteClip(8); });
  let edited = await page.evaluate(() => window.__melody.song.tracks[3].notes.map((n) => [n.deg, n.step]));
  assert.deepEqual(edited.slice(-2), [[2, 8], [4, 12]]);
  await page.keyboard.press('ArrowUp');
  edited = await page.evaluate(() => window.__melody.song.tracks[3].notes.map((n) => [n.deg, n.step]));
  assert.deepEqual(edited.slice(-2), [[3, 8], [5, 12]]);
  await page.evaluate(() => { const v = document.getElementById('velocity'); v.value = 0.4; v.dispatchEvent(new Event('input')); v.dispatchEvent(new Event('change')); });
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[3].notes.at(-1).vel), 0.4);

  // Marquee selection with the mouse.
  await page.keyboard.press('Escape');
  const rollBox = await page.locator('#roll').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(rollBox.x + 76, rollBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(rollBox.x + rollBox.width - 3, rollBox.y + rollBox.height - 3, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => window.__melody.selection.size), 4);
  await page.keyboard.press('Backspace');
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[3].notes.length), 0);

  // Bar-by-bar chord picker.
  await page.click('[data-track=chords]');
  await page.selectOption('.barChord[data-bar="0"]', '5');
  const bar = await page.evaluate(() => window.__melody.song.tracks[1].notes.filter((n) => n.step === 0).map((n) => n.deg).sort((a, b) => a - b));
  assert.deepEqual(bar, [5, 7, 9]);
  assert.equal(await page.locator('.barChord[data-bar="0"] option:checked').textContent(), 'Am');

  // Live recording from the computer keyboard lands in key, in time, and undoes as one step.
  await page.click('[data-track=melody]');
  const beforeRec = await page.evaluate(() => window.__melody.song.tracks[3].notes.length);
  await page.evaluate(() => window.__melody.toggleRec());
  await page.waitForTimeout(500);
  for (const key of ['a', 'd', 'g']) { await page.keyboard.down(key); await page.waitForTimeout(220); await page.keyboard.up(key); await page.waitForTimeout(90); }
  await page.evaluate(() => window.__melody.toggleRec());
  await page.click('#play');
  const recorded = await page.evaluate(() => window.__melody.song.tracks[3].notes);
  assert.equal(recorded.length, beforeRec + 3, `Recorded ${JSON.stringify(recorded)}`);
  assert.deepEqual(recorded.map((n) => n.deg), [0, 2, 4]);
  assert(recorded.every((n) => n.step % 2 === 0 && n.len >= 2));
  await page.click('#undo');
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[3].notes.length), beforeRec);

  // On-screen pads follow the key, and the bar chord names update with it.
  assert.equal(await page.textContent('.pad[data-pad="0"]'), 'C4A');
  await page.selectOption('#key', '2');
  assert.equal(await page.textContent('.pad[data-pad="0"]'), 'D4A');
  await page.click('[data-track=chords] .name');
  assert.equal(await page.locator('.barChord[data-bar="0"] option:checked').textContent(), 'Bm');
  await page.click('#undo');
  await page.click('[data-track=melody] .name');
  const voicesBefore = await page.evaluate(() => window.__melody.engine.voices.size);
  const pad = await page.locator('.pad[data-pad="2"]').boundingBox();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  assert(await page.evaluate(() => window.__melody.engine.voices.size) > voicesBefore, 'Pad should sound');
  await page.mouse.up();

  // Zoom keeps clicks on the right cell.
  await page.selectOption('#zoom', '1');
  const zoomBox = await page.locator('#roll').boundingBox();
  await page.mouse.click(zoomBox.x + 72 + (zoomBox.width - 72) * (8.5 / 16), zoomBox.y + 8);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__melody.song.tracks[3].notes.at(-1).step), 8);
  await page.click('#undo');
  await page.selectOption('#zoom', '0');

  // Exports.
  const wav = await page.evaluate(async () => {
    const b = await window.__melody.exportBytes(), v = new DataView(b.buffer);
    let peak = 0; for (let i = 44; i + 1 < b.length; i += 2) peak = Math.max(peak, Math.abs(v.getInt16(i, true)));
    return { head: String.fromCharCode(...b.slice(0, 4)), size: b.length, peak };
  });
  assert.equal(wav.head, 'RIFF'); assert(wav.size > 4000000, `WAV should hold the whole song: ${wav.size}`); assert(wav.peak > 5000, `WAV too quiet: ${wav.peak}`);
  const midi = Buffer.from(await page.evaluate(() => [...window.__melody.midiBytes()]));
  assert.equal(midi.subarray(0, 4).toString(), 'MThd');
  assert.equal(midi.readUInt16BE(10), 5);

  // MP3 and stems.
  const mp3 = await page.evaluate(() => window.__melody.mp3Bytes());
  assert((mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0) || String.fromCharCode(...mp3.slice(0, 3)) === 'ID3', `Not an MP3: ${mp3}`);
  const stems = await page.evaluate(() => window.__melody.stemCount());
  assert(stems >= 3, `Stems: ${stems}`);
  for (let i = 0; i < stems; i++) {
    const stem = await page.evaluate((n) => window.__melody.renderStem(n), i);
    assert.equal(stem.size, wav.size, 'Stems must line up with the full mix'); assert(stem.peak > 300, `Stem ${i} is silent`);
  }

  // Autosave survives a restart.
  const saved = await page.evaluate(() => JSON.stringify(window.__melody.song.tracks.map((t) => (t.hits || t.notes).length)));
  await page.waitForTimeout(700);
  assert.deepEqual(errors, []);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await ready(page);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__melody.song.tracks.map((t) => (t.hits || t.notes).length))), saved);
  console.log(`e2e: passed, WAV ${(wav.size / 1e6).toFixed(1)} MB, peak ${wav.peak}`);
} finally {
  await app.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
