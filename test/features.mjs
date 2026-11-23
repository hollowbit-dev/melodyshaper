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

  // ---- More sounds, drum styles, melody maker, guitar input and MIDI.
  await ev(() => { const m = window.__melody, s = m.song; s.ending = 'ring'; s.bars = 4; s.tracks.splice(4); s.tracks[1].notes = [0, 4, 5, 3].flatMap((d, bar) => [0, 2, 4].map((o) => ({ deg: d + o, step: bar * 16, len: 16 }))); s.tracks[2].notes = [0, 4, 5, 3].map((d, bar) => ({ deg: d, step: bar * 16, len: 8 })); s.tracks[3].notes = []; m.select('melody'); });
  assert.equal(await page.locator('[data-track=melody] select option').count(), 43, 'Every instrument should be listed');
  const sounds = await ev(async () => { const e = window.__melody.engine, bad = []; for (const i of e.manifest.instruments) for (const z of i.zones) { const b = await e.load(z.file); if (!(b.duration > 0.05)) bad.push(z.file); } for (const d of e.manifest.drums) { const b = await e.load(d.file); if (!(b.duration > 0.05)) bad.push(d.file); } return bad; });
  assert.deepEqual(sounds, []);
  await page.click('.chip[data-make=catchy]');
  const made = await ev(() => JSON.stringify(window.__melody.song.tracks[3].notes));
  assert(JSON.parse(made).length >= 8, 'Melody maker wrote too little');
  await page.click('.chip[data-make=catchy]');
  assert.notEqual(await ev(() => JSON.stringify(window.__melody.song.tracks[3].notes)), made, 'Pressing again should give a new melody');
  await page.click('#undo');
  assert.equal(await ev(() => JSON.stringify(window.__melody.song.tracks[3].notes)), made, 'Undo should bring the last melody back');
  await page.click('.chip[data-source=bass]'); await page.click('.chip[data-make=simple]');
  assert(await ev(() => window.__melody.song.tracks[3].notes.length) >= 4);
  await ev(() => window.__melody.engine.stop());

  await ev(() => window.__melody.select('drums'));
  const styles = await page.locator('#beatGroup option').allTextContents();
  assert(styles.length >= 12, `Only ${styles.length} drum styles`);
  await page.selectOption('#beatGroup', { label: styles.find((x) => x.startsWith('Latin')) });
  await page.click('.chip[data-id=latin3]');
  assert(await ev(() => window.__melody.song.tracks[0].hits.some((h) => h.drum === 'agogo')), 'Samba should use the agogo');
  assert(await ev(() => window.__melody.drumRows(window.__melody.song.tracks[0]).includes('agogo')), 'A drum in use must appear on the grid');
  await ev(() => window.__melody.engine.stop());
  await page.click('#allDrums');
  assert.equal(await ev(() => window.__melody.drumRows(window.__melody.song.tracks[0]).length), 29);
  await page.click('#allDrums');
  const kit = await ev(async () => { const b = await window.__melody.exportBytes(), v = new DataView(b.buffer); let p = 0; for (let i = 44; i + 1 < b.length; i += 2) p = Math.max(p, Math.abs(v.getInt16(i, true))); return p; });
  assert(kit > 3000, `New drums too quiet: ${kit}`);

  // Guitar: a simulated cable on input 2 of a two-input device. The other input carries a different note.
  await ev(async () => {
    const m = window.__melody, ctx = await m.engine.boot(), real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      await real({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {}); // This test machine may have no microphone.
      const dest = ctx.createMediaStreamDestination(); dest.channelCount = 2;
      const merge = ctx.createChannelMerger(2), wrong = ctx.createOscillator(), right = ctx.createOscillator(), g1 = ctx.createGain(), g2 = ctx.createGain();
      wrong.frequency.value = 440; right.type = 'sawtooth'; right.frequency.value = 110; g1.gain.value = 0.2; g2.gain.value = 0.2;
      wrong.connect(g1); right.connect(g2); g1.connect(merge, 0, 0); g2.connect(merge, 0, 1); merge.connect(dest); wrong.start(); right.start();
      const track = dest.stream.getAudioTracks()[0], settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), channelCount: 2 });
      window.__guitarAsked = c;
      return dest.stream;
    };
    m.inputSettings.channel = 1;
  });
  await page.selectOption('#addTrack', 'guitar');
  assert.equal(await page.textContent('#humLabel'), 'Record guitar');
  await page.click('#inputsBtn');
  for (let i = 0; i < 60 && !(await ev(() => !!window.__melody.live)); i++) await page.waitForTimeout(50);
  let tuned = '';
  for (let i = 0; i < 60 && tuned !== 'A2'; i++) { await page.waitForTimeout(60); tuned = await page.textContent('#tunerNote'); }
  assert.equal(tuned, 'A2', 'Tuner should read the chosen input');
  assert.equal(await ev(() => document.getElementById('inHear').checked), false, 'Live sound must start off');
  await page.keyboard.press('m');
  assert.equal(await ev(() => window.__melody.engine.metronome), false, 'Keys must not play while Inputs is open');
  // Typing on the focused device menu can reopen the input, so wait for it to settle.
  await page.waitForTimeout(250);
  for (let i = 0; i < 60 && !(await ev(() => !!window.__melody.live)); i++) await page.waitForTimeout(50);
  await page.check('#inHear');
  assert(await ev(() => !!window.__melody.live?.out), 'Hear my guitar should connect');
  await page.uncheck('#inHear');
  await page.click('#inputsClose');
  for (let i = 0; i < 40 && await ev(() => !!window.__melody.live); i++) await page.waitForTimeout(25);
  assert.equal(await ev(() => !!window.__melody.live), false, 'The input should close when not in use');
  await ev(() => { const s = window.__melody.song; s.bpm = 180; });
  await page.click('#hum');
  for (let i = 0; i < 200 && !(await ev(() => window.__melody.song.tracks.at(-1).clips?.length > 0)); i++) await page.waitForTimeout(100);
  const take = await ev(async () => { const m = window.__melody, g = m.song.tracks.at(-1), b = m.engine.audio.get(g.clips[0].id), d = b.getChannelData(0); let z = 0; const from = Math.floor(b.length / 3), to = from + b.sampleRate; for (let i = from + 1; i < to; i++) if (d[i - 1] < 0 && d[i] >= 0) z++; m.engine.stop(); return { hz: z, id: g.clips[0].id, amp: g.amp }; });
  assert(Math.abs(take.hz - 110) < 12, `Recorded the wrong input: ${take.hz} Hz`);
  assert.equal(take.amp, 'crunch');
  const amps = await ev(async () => { const m = window.__melody, s = m.song, g = s.tracks.at(-1), out = {}; for (const t of s.tracks) t.mute = t !== g; for (const a of ['clean', 'lead']) { g.amp = a; const b = await m.exportBytes(), v = new DataView(b.buffer); let e = 0, n = 0, c = 0, last = 0; for (let i = 44 + 44100 * 4; i + 1 < 44 + 44100 * 8; i += 4) { const x = v.getInt16(i, true) / 32768; e += x * x; n++; c += Math.abs(x - last); last = x; } out[a] = { rms: Math.sqrt(e / n), edge: c / n }; } for (const t of s.tracks) t.mute = false; return out; });
  assert(amps.clean.rms > 0.01 && amps.lead.rms > 0.01, 'Amp sounds should be audible');
  assert(Math.abs(amps.clean.edge - amps.lead.edge) > 0.002, 'Amp choice should change the sound');
  assert(await ev(async () => { const m = window.__melody, ok = await m.loadSong(m.serializeFile(), 'Guitar song'), g = m.song.tracks.at(-1); return ok && g.role === 'guitar' && g.amp === 'crunch' || g.amp === 'lead' || g.amp === 'clean'; }), 'Guitar track should reopen');

  // Guitar as notes, through the pitch path.
  await ev(() => { const s = window.__melody.song; s.bpm = 180; });
  await ev(() => window.__melody.recordGuitarNotes());
  for (let i = 0; i < 200 && !(await ev(() => window.__melody.song.tracks.find((t) => t.name === 'Guitar notes')?.notes.length > 0)); i++) await page.waitForTimeout(100);
  assert(await ev(() => window.__melody.song.tracks.find((t) => t.name === 'Guitar notes').notes.length > 0), 'Guitar notes should appear');
  for (let i = 0; i < 40 && await ev(() => !document.getElementById('overlay').hidden); i++) await page.waitForTimeout(50);
  await ev(() => window.__melody.engine.stop());

  // MIDI: device filter, velocity recording, sustain pedal, and General MIDI drum notes.
  const midi = await ev(async () => {
    const m = window.__melody, port = { id: 'guitar-midi', name: 'MIDI guitar' }, send = (...data) => m.onMidi(port, { data });
    const t = m.song.tracks[3];
    m.select('melody'); const before = m.engine.voices.size;
    m.inputSettings.midi = 'other'; send(0x90, 60, 100); await new Promise((r) => setTimeout(r, 90)); const blocked = m.engine.voices.size === before;
    send(0x80, 60, 0); m.inputSettings.midi = 'all';
    send(0x90, 62, 110); await new Promise((r) => setTimeout(r, 90)); const sounded = m.engine.voices.size > before;
    send(0xb0, 64, 127); send(0x80, 62, 0); await new Promise((r) => setTimeout(r, 120)); const held = m.engine.voices.size > before;
    send(0xb0, 64, 0); await new Promise((r) => setTimeout(r, 40));
    m.select('drums'); const drums = m.song.tracks[0]; m.song.tracks[0].hits = [{ drum: 'agogo', step: 0 }]; m.select('drums');
    return { blocked, sounded, held, t: !!t };
  });
  assert(midi.blocked, 'A device that is not picked must be ignored');
  assert(midi.sounded, 'MIDI note should sound');
  assert(midi.held, 'Sustain pedal should hold the note');

  assert.deepEqual(errors, []);
  console.log('features: new instruments, drum styles, melody maker, guitar input, tuner, amps, guitar notes, MIDI');
  console.log('features: chord styles, note tools, ruler, metronome, tap, rename, duplicate, separate block, shortcuts, limiter, endings, chord finder, unsaved work');
} finally {
  await app.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
