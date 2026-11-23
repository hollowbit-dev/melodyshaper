// The editing and playback tools, run in the real app.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { expandStyle } from '../src/renderer/theory.mjs';

const chord = [0, 2, 4].map((deg) => ({ deg, step: 0, len: 16 }));
assert.deepEqual(expandStyle(chord, 'block'), chord);
assert.deepEqual(expandStyle(chord, 'strum').map((n) => n.delay > 0), [false, true, true]);
assert.deepEqual(expandStyle(chord, 'arp').map((n) => n.deg), [0, 2, 4, 0, 2, 4, 0, 2]);
assert.equal(expandStyle(chord, 'pulse').length, 12);
for (const s of ['strum', 'arp', 'pulse']) assert(expandStyle(chord, s).every((n) => n.step + n.len <= 16), `${s} runs past the chord`);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'melody-features-'));
const app = await electron.launch({ args: [ROOT], env: { ...process.env, MELODY_TEST: '1', MELODY_HIDDEN: '1', MELODY_USERDATA: tmp } });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (let i = 0; i < 100 && !(await page.evaluate(() => document.documentElement.dataset.ready === '1')); i++) await page.waitForTimeout(100);
  await page.setViewportSize({ width: 1240, height: 800 });
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // Chord styles change the sound and MIDI, keep the written notes, and survive reopening.
  await page.click('[data-track=chords] .name'); await page.click('.chip[data-id=pop]'); await page.click('#play');
  const written = await ev(() => JSON.stringify(window.__melody.song.tracks[1].notes));
  const heldMidi = await ev(() => window.__melody.midiBytes().length);
  await page.click('.chip[data-style=arp]'); await page.click('#play');
  assert.equal(await ev(() => JSON.stringify(window.__melody.song.tracks[1].notes)), written);
  assert((await ev(() => window.__melody.midiBytes().length)) > heldMidi, 'Arpeggio should reach MIDI');
  assert(await ev(async () => { const m = window.__melody; return (await m.loadSong(m.serializeFile(), 'Styled')) && m.song.tracks[1].style === 'arp'; }));
  await ev(() => { const m = window.__melody; m.song.name = 'My song'; m.select('chords'); });
  const peak = await ev(async () => { const b = await window.__melody.exportBytes(), v = new DataView(b.buffer); let p = 0; for (let i = 44; i + 1 < b.length; i += 2) p = Math.max(p, Math.abs(v.getInt16(i, true))); return p; });
  assert(peak > 3000, `Styled chords too quiet: ${peak}`);

  // Note tools.
  await ev(() => { const m = window.__melody, t = m.song.tracks[3]; t.notes = [{ deg: 0, step: 0, len: 4 }, { deg: 2, step: 8, len: 2 }]; m.select('melody'); m.selectAll(); m.noteTool('reverse'); });
  assert.deepEqual(await ev(() => window.__melody.song.tracks[3].notes.map((n) => [n.deg, n.step]).sort((a, b) => a[0] - b[0])), [[0, 6], [2, 0]]);
  await page.click('#undo');
  await ev(() => { const m = window.__melody; m.select('melody'); m.selectAll(); m.noteTool('harmony'); });
  assert.deepEqual(await ev(() => window.__melody.song.tracks[3].notes.map((n) => n.deg).sort((a, b) => a - b)), [0, 2, 2, 4]);
  await page.click('#undo');
  await ev(() => { const m = window.__melody; m.select('melody'); m.selectAll(); m.noteTool('longer'); });
  assert.deepEqual(await ev(() => window.__melody.song.tracks[3].notes.map((n) => n.len)), [8, 4]);
  await page.click('#undo');

  // Click the ruler to play from a bar, metronome, tap tempo.
  const r = await page.locator('#ruler').boundingBox();
  await page.mouse.click(r.x + 72 + (r.width - 72) * 0.51, r.y + 8);
  await page.waitForTimeout(120);
  const at = await ev(() => window.__melody.engine.position());
  assert(at >= 32 && at < 40, `Ruler should jump to bar 3, got ${at}`);
  await page.click('#play');
  await page.keyboard.press('m');
  assert.equal(await ev(() => window.__melody.engine.metronome), true);
  await page.keyboard.press('m');
  await ev(() => { const m = window.__melody; [0, 500, 1000, 1500].forEach((x) => m.tapTempo(10000 + x)); });
  assert.equal(await ev(() => window.__melody.song.bpm), 120);
  await page.click('#undo');
  assert.equal(await ev(() => window.__melody.song.bpm), 100);

  // Rename and duplicate a track.
  await page.dblclick('[data-track=melody] .name');
  await page.fill('.inlineName', 'Lead'); await page.keyboard.press('Enter');
  assert.equal(await ev(() => window.__melody.song.tracks[3].name), 'Lead');
  await page.locator('[data-track=melody]').hover();
  await page.locator('[data-track=melody] .dup').click();
  assert.deepEqual(await ev(() => { const x = window.__melody.song.tracks; return [x.length, x[4].name, x[4].notes.length]; }), [5, 'Lead copy', 2]);
  await page.click('#undo');

  // A repeated block can be made separate without touching the original.
  await page.selectOption('#addSection', 'repeat:s1');
  assert.equal(await page.locator('.blockSplit').count(), 2);
  await page.locator('.block').nth(1).hover();
  await page.locator('.block').nth(1).locator('.blockSplit').click();
  assert.deepEqual(await ev(() => { const x = window.__melody.song; return [x.arrangement.length, new Set(x.arrangement).size, x.active]; }), [2, 2, 's2']);
  await ev(() => { window.__melody.song.tracks[3].notes = []; });
  assert.equal(await ev(() => window.__melody.flatten().tracks[3].notes.length), 2, 'Original block must keep its notes');

  // Rename a section that isn't the active one.
  await page.locator('.block').nth(0).locator('.blockName').dblclick();
  await page.fill('.inlineName', 'Opening'); await page.keyboard.press('Enter');
  assert.equal(await ev(() => window.__melody.song.sections[0].name), 'Opening');

  // Shortcuts panel blocks instrument keys while open.
  await page.keyboard.press('Shift+Slash');
  assert(await ev(() => document.getElementById('help').open));
  await page.keyboard.press('m');
  assert.equal(await ev(() => window.__melody.engine.metronome), false);
  await page.keyboard.press('Escape');
  assert.equal(await ev(() => document.getElementById('help').open), false);

  // ---- Finishing pass: limiter, endings, chord finder, and never losing work.
  const measure = `(b) => { const v = new DataView(b.buffer); let p = 0, e = 0, n = 0, tail = 0; const last = b.length - 400; for (let i = 44; i + 1 < b.length; i += 2) { const s = Math.abs(v.getInt16(i, true)); p = Math.max(p, s); e += s * s; n++; if (i >= last) tail = Math.max(tail, s); } return { size: b.length, peak: p / 32768, rms: Math.sqrt(e / n) / 32768, tail: tail / 32768 }; }`;
  const loud = await ev(async (code) => {
    const m = window.__melody, s = m.song, f = (0, eval)(code);
    s.arrangement = ['s1']; s.sections = s.sections.filter((x) => x.id === 's1'); s.active = 's1';
    s.bars = 4; s.bpm = 120; s.ending = 'ring';
    const extra = Array.from({ length: 11 }, (_, i) => ({ ...s.tracks[1], id: `chords-${i + 10}`, name: `Loud ${i}`, vol: 1, mute: false, solo: false, notes: [0, 2, 4, 7].map((deg) => ({ deg, step: 0, len: 64 })), fx: { pan: 0, reverb: 0.3, echo: 0.3, tone: 0.5 } }));
    s.tracks.splice(4, s.tracks.length, ...extra);
    for (const t of s.tracks) { t.mute = false; t.solo = false; t.vol = 1; if (t.kind === 'inst' && !t.notes.length) t.notes = [{ deg: 0, step: 0, len: 64 }]; }
    s.sections[0].parts = {};
    const mix = f(await m.exportBytes());
    return mix;
  }, measure);
  assert(loud.peak <= 0.9, `Limiter let a peak through: ${loud.peak}`);
  assert(loud.tail < 0.02, `Ring ending should finish silent: ${loud.tail}`);
  const faded = await ev(async (code) => { const m = window.__melody, f = (0, eval)(code); m.song.ending = 'fade'; const r = f(await m.exportBytes()); m.song.ending = 'ring'; return r; }, measure);
  assert(faded.tail < 0.02, `Fade should finish silent: ${faded.tail}`);
  assert(faded.size < loud.size, 'A fade has no ring-out tail');
  const ended = await ev(() => new Promise((done) => { const m = window.__melody; m.song.bpm = 180; m.song.bars = 4; m.playSong().then(() => { const off = setInterval(() => { if (!m.engine.playing) { clearInterval(off); done(true); } }, 50); setTimeout(() => { clearInterval(off); done(false); }, 12000); }); }));
  assert(ended, 'Play song should finish on its own');

  // Chord finder appears from the melody, applies on click, and undoes.
  await ev(() => { const m = window.__melody, s = m.song; s.tracks.splice(4); s.bars = 4; s.bpm = 100; s.tracks[3].mute = false; s.tracks[3].notes = [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]].flatMap((x, bar) => x.map((deg, i) => ({ deg, step: bar * 16 + i * 4, len: 4 }))); m.showChords(); });
  assert.equal(await page.locator('.fit').count(), 3);
  assert.equal(await page.locator('.fit').first().locator('span').textContent(), 'C  G  Am  F');
  await page.locator('.fit').first().click();
  await page.click('#play').catch(() => {});
  assert.equal(await ev(() => window.__melody.song.tracks[1].notes.length), 12);
  assert.equal(await page.locator('.fit.on').count(), 1);
  await ev(() => window.__melody.engine.stop());

  // Unsaved work: Cancel keeps it, and Don't Save lets the new song through.
  const kept = await ev(async () => {
    const m = window.__melody, text = m.serializeFile(), before = m.song.tracks[3].notes.length;
    m.song.tracks[3].notes.push({ deg: 1, step: 1, len: 1 }); document.getElementById('undo').disabled = false;
    await m.loadSong(text, 'Base');
    m.select('melody');
    m.song.tracks[3].notes = m.song.tracks[3].notes.slice(0, 4); m.nudge(0, 0);
    let asked = 0;
    m.setAsk(async () => { asked++; return 'cancel'; });
    m.selectAll(); m.nudge(1, 0);
    const name = m.song.name;
    await m.openSong({ text: JSON.stringify({ ...JSON.parse(text), name: 'Other' }), name: 'Other', file: '/nope.melody' });
    const stayed = m.song.name === name && m.dirty;
    m.setAsk(async () => { asked++; return 'discard'; });
    await m.openSong({ text: JSON.stringify({ ...JSON.parse(text), name: 'Other' }), name: 'Other', file: '/nope.melody' });
    return { asked, stayed, now: m.song.name, dirty: m.dirty, before };
  });
  assert.equal(kept.asked, 2);
  assert(kept.stayed, 'Cancel must keep the current song');
  assert.equal(kept.now, 'Other');
  assert.equal(kept.dirty, false);
  // A damaged file changes nothing and asks nothing further.
  assert.equal(await ev(async () => { const m = window.__melody; await m.openSong({ text: 'not a song', name: 'Bad', file: '/bad.melody' }); return m.song.name; }), 'Other');

  assert.deepEqual(errors, []);
  console.log('features: chord styles, note tools, ruler, metronome, tap, rename, duplicate, separate block, shortcuts, limiter, endings, chord finder, unsaved work');
} finally {
  await app.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
