import { CHORD_STYLES, METERS, PROGRESSIONS, SCALES, NOTE_NAMES, TRACK_BASE, beatHits, beatsFor, bassFromChords, chordLabel, chordNotes, degToMidi, fitChords, midiName, nearestDeg, notesForChords, rowCount, stepSeconds } from './theory.mjs';
import { Engine, encodeMidi } from './engine.mjs';
import { notesToGrid } from './pitch.mjs';
import { SECTION_NAMES, addSection, duplicateTrack, unlinkBlock, flatten, forEachPart, initSections, loadSection, moveBlock, removeBlock, removeTrack, repeatSection, storeActive, switchSection } from './arrange.mjs';

const $ = (id) => document.getElementById(id);
const COLORS = { drums: '#fbbf24', chords: '#a78bfa', bass: '#2dd4bf', melody: '#ff7ab6', vocal: '#7dd3fc' };
const GUTTER = 72;
const DRUM_ORDER = ['crash', 'openhat', 'hat', 'shaker', 'tamb', 'cowbell', 'clap', 'snare', 'tom', 'conga', 'kick'];
const info = await window.melody.info();
if (info.platform === 'win32') document.body.classList.add('win');
const manifest = await (await fetch('samples/manifest.json')).json();
const engine = new Engine(manifest);
const DRUM_NAMES = Object.fromEntries(manifest.drums.map((d) => [d.id, d.name]));

const MAX_TRACKS = 16;
const kindOf = (role) => (role === 'drums' ? 'drums' : role === 'vocal' ? 'audio' : 'inst');
const defaultFx = (role) => ({ pan: 0, reverb: role === 'drums' ? 0.04 : role === 'bass' ? 0.05 : 0.18, echo: 0, tone: 0 });
const DEFAULT_INST = { chords: 'piano', bass: 'bass', melody: 'flute' };
const blank = () => initSections({
  version: 1, name: 'My song', key: 0, scale: 'major', meter: '4/4', bpm: 100, bars: 4, swing: 0, ending: 'ring',
  tracks: [
    { id: 'drums', role: 'drums', fx: defaultFx('drums'), kind: 'drums', name: 'Drums', vol: 0.9, mute: false, solo: false, hits: [] },
    { id: 'chords', role: 'chords', fx: defaultFx('chords'), kind: 'inst', name: 'Chords', inst: 'piano', vol: 0.75, mute: false, solo: false, notes: [] },
    { id: 'bass', role: 'bass', fx: defaultFx('bass'), kind: 'inst', name: 'Bass', inst: 'bass', vol: 0.9, mute: false, solo: false, notes: [] },
    { id: 'melody', role: 'melody', fx: defaultFx('melody'), kind: 'inst', name: 'Melody', inst: 'flute', vol: 0.9, mute: false, solo: false, notes: [] },
  ],
});

// Anything read from a file is checked, so a damaged song can't break the app.
function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tracks)) throw new Error('bad song');
  const base = blank();
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  base.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : base.name;
  base.key = int(raw.key, 0, 11, 0);
  base.scale = Object.hasOwn(SCALES, raw.scale) ? raw.scale : 'major';
  base.bpm = int(raw.bpm, 60, 180, 100);
  base.meter = Object.hasOwn(METERS, raw.meter) ? raw.meter : '4/4';
  base.swing = typeof raw.swing === 'number' && raw.swing >= 0 && raw.swing <= 0.6 ? raw.swing : 0;
  base.ending = raw.ending === 'fade' ? 'fade' : 'ring';
  const barSteps = METERS[base.meter].barSteps, rows = rowCount(base.scale);
  const validBars = (b) => ([4, 8, 16].includes(b) ? b : 4);
  const vel = (n) => (typeof n.vel === 'number' && n.vel >= 0.05 && n.vel <= 1 ? { vel: n.vel } : {});
  const cleanPart = (t, p, bars) => {
    const steps = bars * barSteps;
    if (t.kind === 'audio') return { clips: (Array.isArray(p?.clips) ? p.clips : []).filter((c) => c && typeof c.id === 'string' && /^c[a-z0-9]{8,24}$/.test(c.id) && int(c.step, 0, steps - 1, -1) >= 0).map((c) => ({ id: c.id, step: c.step })).slice(0, 64) };
    if (t.kind === 'drums') return { hits: (Array.isArray(p?.hits) ? p.hits : []).filter((h) => h && DRUM_ORDER.includes(h.drum) && int(h.step, 0, steps - 1, -1) >= 0).map((h) => ({ drum: h.drum, step: h.step, ...vel(h) })).slice(0, 5000) };
    return { notes: (Array.isArray(p?.notes) ? p.notes : []).filter((n) => n && int(n.deg, 0, rows - 1, -1) >= 0 && int(n.step, 0, steps - 1, -1) >= 0 && int(n.len, 1, steps, 0) > 0)
      .map((n) => ({ deg: n.deg, step: n.step, len: Math.min(n.len, steps - n.step), ...vel(n) })).slice(0, 5000) };
  };
  const used = new Set(), tracks = [];
  for (const r of raw.tracks.slice(0, MAX_TRACKS)) {
    if (!r || !['drums', 'chords', 'bass', 'melody', 'vocal'].includes(r.role) || typeof r.id !== 'string' || !/^[a-z0-9-]{1,24}$/.test(r.id) || used.has(r.id)) continue;
    used.add(r.id);
    const t = { id: r.id, role: r.role, kind: kindOf(r.role), name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 24) : r.role, vol: typeof r.vol === 'number' && r.vol >= 0 && r.vol <= 1 ? r.vol : 0.85, mute: !!r.mute, solo: !!r.solo };
    const num = (v, lo, hi, d) => (typeof v === 'number' && v >= lo && v <= hi ? v : d), d = defaultFx(r.role);
    t.fx = { pan: num(r.fx?.pan, -1, 1, d.pan), reverb: num(r.fx?.reverb, 0, 1, d.reverb), echo: num(r.fx?.echo, 0, 1, d.echo), tone: num(r.fx?.tone, -1, 1, d.tone) };
    if (t.kind === 'inst') t.inst = engine.inst[r.inst] ? r.inst : DEFAULT_INST[r.role];
    if (r.role === 'chords' && CHORD_STYLES.some((x) => x.id === r.style)) t.style = r.style;
    tracks.push(t);
  }
  if (!tracks.length) throw new Error('bad song');
  base.tracks = tracks;
  const rawSections = Array.isArray(raw.sections) && raw.sections.length ? raw.sections.slice(0, 32) : [{ id: 's1', name: 'Verse', bars: raw.bars, parts: Object.fromEntries(raw.tracks.filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t])) }];
  const ids = new Set();
  base.sections = [];
  for (const r of rawSections) {
    if (!r || typeof r.id !== 'string' || !/^s\d{1,4}$/.test(r.id) || ids.has(r.id)) continue;
    ids.add(r.id);
    const bars = validBars(r.bars);
    base.sections.push({ id: r.id, name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 20) : 'Section', bars, parts: Object.fromEntries(tracks.map((t) => [t.id, cleanPart(t, r.parts?.[t.id], bars)])) });
  }
  if (!base.sections.length) throw new Error('bad song');
  base.arrangement = (Array.isArray(raw.arrangement) ? raw.arrangement : []).filter((id) => ids.has(id)).slice(0, 128);
  if (!base.arrangement.length) base.arrangement = base.sections.map((x) => x.id);
  base.sections = base.sections.filter((x) => base.arrangement.includes(x.id));
  loadSection(base, base.arrangement.includes(raw.active) ? raw.active : base.arrangement[0]);
  return base;
}
const serialize = () => { storeActive(song); return JSON.stringify(song); };

let song = blank();
let selected = 'melody';
let dirty = false, past = [], future = [], picked = {}, playMode = 'section', activeBlock = -1;
// A removed track (or an undo) can leave the selection stale, so fall back to the first track.
const track = () => song.tracks.find((t) => t.id === selected) || song.tracks[0];
const totalSteps = () => song.bars * METERS[song.meter].barSteps;

function toast(msg, action) {
  const el = $('toast');
  el.textContent = msg;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.run; el.append(b); }
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), action ? 7000 : 3200);
}

function commit(fn) {
  past.push(JSON.stringify(song));
  if (past.length > 100) past.shift();
  future = [];
  fn();
  changed();
}
function changed() {
  dirty = true;
  engine.invalidate();
  $('undo').disabled = !past.length;
  $('redo').disabled = !future.length;
  clearTimeout(changed.t);
  changed.t = setTimeout(() => { changed.t = null; window.melody.autosave(serialize()); }, 400);
  if (engine.playing && !session) engine.project = playMode === 'song' ? flatten(song) : song;
  engine.syncMix(song);
  draw();
}
function travel(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(song));
  const keep = engine.project === song;
  song = JSON.parse(from.pop());
  if (keep) engine.project = song;
  renderAll();
  changed();
}

// ---------------------------------------------------------------- panels
// Swaps a label for a text box. Enter or clicking away keeps the name, Escape cancels.
function inlineEdit(el, value, max, done) {
  const box = document.createElement('input');
  box.className = 'inlineName'; box.value = value; box.maxLength = max; box.spellcheck = false; box.setAttribute('aria-label', 'Name');
  let finished = false;
  const finish = (keep) => { if (finished) return; finished = true; const next = box.value.trim(); done(keep && next && next !== value ? next : null); };
  box.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
  box.onblur = () => finish(true);
  box.onpointerdown = (e) => e.stopPropagation();
  box.onclick = (e) => e.stopPropagation();
  el.replaceChildren(box);
  box.focus(); box.select();
}

function renderControls() {
  $('songName').value = song.name;
  $('key').value = song.key; $('scale').value = song.scale;
  $('bpm').value = song.bpm; $('bpmOut').textContent = `${song.bpm} BPM`;
  $('bars').value = song.bars;
  $('meter').value = song.meter;
  $('swing').value = song.swing; $('swing').disabled = METERS[song.meter].den !== 4;
}

function renderTracks() {
  const host = $('tracks');
  host.textContent = '';
  selected = track().id;
  for (const t of song.tracks) {
    const card = document.createElement('div');
    card.className = `track${t.id === selected ? ' sel' : ''}`;
    card.style.setProperty('--c', COLORS[t.role]);
    card.dataset.track = t.id;
    const top = document.createElement('div'); top.className = 'top';
    const sw = document.createElement('span'); sw.className = 'swatch';
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = t.name;
    const toggle = (label, title, prop) => {
      const b = document.createElement('button');
      b.className = `tog${t[prop] ? ' on' : ''}`; b.textContent = label; b.title = title;
      b.onclick = (e) => { e.stopPropagation(); commit(() => { t[prop] = !t[prop]; }); renderTracks(); };
      return b;
    };
    const del = document.createElement('button');
    del.className = 'tog del'; del.textContent = '×'; del.title = `Remove ${t.name}`; del.setAttribute('aria-label', del.title); del.disabled = song.tracks.length < 2;
    del.onclick = (e) => {
      e.stopPropagation();
      commit(() => { removeTrack(song, t.id); });
      engine.removeBus(t.id);
      renderAll();
      toast(`${t.name} removed. Undo brings it back.`);
    };
    nm.title = 'Double-click to rename';
    nm.ondblclick = (e) => { e.stopPropagation(); inlineEdit(nm, t.name, 24, (name) => { if (name) commit(() => { t.name = name; }); renderTracks(); renderFx(); }); };
    const dup = document.createElement('button');
    dup.className = 'tog dup'; dup.textContent = '⧉'; dup.title = `Duplicate ${t.name}`; dup.setAttribute('aria-label', dup.title); dup.disabled = song.tracks.length >= MAX_TRACKS;
    dup.onclick = (e) => {
      e.stopPropagation();
      commit(() => { selected = duplicateTrack(song, t.id); });
      renderAll();
      engine.boot().then(() => engine.ensure(song));
    };
    top.append(sw, nm, toggle('M', 'Mute', 'mute'), toggle('S', 'Solo', 'solo'), dup, del);
    card.append(top);
    if (t.kind === 'inst') {
      const s = document.createElement('select');
      s.setAttribute('aria-label', `${t.name} instrument`);
      for (const group of [...new Set(manifest.instruments.map((i) => i.group))]) {
        const og = document.createElement('optgroup'); og.label = group;
        for (const i of manifest.instruments) if (i.group === group) og.append(new Option(i.name, i.id, false, i.id === t.inst));
        s.append(og);
      }
      s.onchange = async () => { commit(() => { t.inst = s.value; }); await engine.boot(); await engine.ensure(song); engine.preview(song, t, 0); };
      card.append(s);
    } else {
      const f = document.createElement('div'); f.className = 'fixed'; f.textContent = t.kind === 'audio' ? 'Your voice' : 'Real drum kit'; card.append(f);
    }
    const v = document.createElement('input');
    v.type = 'range'; v.min = 0; v.max = 1; v.step = 0.01; v.value = t.vol; v.setAttribute('aria-label', `${t.name} volume`);
    v.oninput = () => { t.vol = Number(v.value); engine.syncMix(song); };
    v.onchange = () => changed();
    card.append(v);
    // Selecting must not rebuild the cards, or an instrument menu being opened would vanish.
    card.onpointerdown = () => {
      if (selected === t.id) return;
      selected = t.id;
      host.querySelectorAll('.track').forEach((c) => c.classList.toggle('sel', c.dataset.track === t.id));
      selection.clear();
      renderStarters();
      renderPads();
      renderFx();
      draw();
    };
    host.append(card);
  }
  if (song.tracks.length < MAX_TRACKS) {
    const add = document.createElement('select');
    add.id = 'addTrack'; add.className = 'adder'; add.setAttribute('aria-label', 'Add a track');
    add.add(new Option('+ Add track', ''));
    for (const [role, label] of [['vocal', 'Vocals (your voice)'], ['melody', 'Melody'], ['chords', 'Chords'], ['bass', 'Bass'], ['drums', 'Drums']]) add.add(new Option(label, role));
    add.onchange = () => { if (add.value) addTrack(add.value); };
    host.append(add);
  }
}

function addTrack(role) {
  const same = song.tracks.filter((t) => t.role === role).length;
  let n = 1;
  while (song.tracks.some((t) => t.id === `${role}-${n}`)) n++;
  const base = { drums: 'Drums', chords: 'Chords', bass: 'Bass', melody: 'Melody', vocal: 'Vocals' }[role];
  const t = { id: `${role}-${n}`, role, kind: kindOf(role), name: same ? `${base} ${same + 1}` : base, fx: defaultFx(role), vol: 0.8, mute: false, solo: false };
  if (role === 'drums') t.hits = []; else if (role === 'vocal') t.clips = []; else { t.inst = { melody: 'sax', chords: 'strings', bass: 'cello' }[role]; t.notes = []; }
  commit(() => { song.tracks.push(t); });
  selected = t.id;
  renderTracks(); renderStarters(); renderPads(); renderFx(); draw();
  engine.boot().then(() => engine.ensure(song));
}

function renderSections() {
  const host = $('sections');
  host.textContent = '';
  song.arrangement.forEach((id, index) => {
    const s = song.sections.find((x) => x.id === id);
    const b = document.createElement('div');
    b.className = `block${id === song.active ? ' sel' : ''}`;
    b.dataset.index = index; b.dataset.section = id; b.draggable = true; b.style.flexGrow = s.bars;
    const label = document.createElement('button'); label.className = 'blockName'; label.textContent = s.name;
    const bars = document.createElement('span'); bars.className = 'blockBars'; bars.textContent = `${s.bars}`;
    const rename = () => {
      const el = [...host.querySelectorAll('.block')][index]?.querySelector('.blockName');
      if (!el) return;
      el.parentElement.draggable = false;
      inlineEdit(el, s.name, 20, (name) => { if (name) commit(() => { s.name = name; }); renderSections(); });
    };
    label.title = 'Double-click to rename';
    label.onclick = (e) => {
      if (e.detail >= 2) return rename();
      if (id === song.active) return;
      switchSection(song, id);
      if (engine.playing && playMode === 'section') engine.start(song);
      renderAll();
    };
    label.append(bars);
    const x = document.createElement('button'); x.className = 'blockDel'; x.textContent = '×'; x.title = `Remove ${s.name}`; x.setAttribute('aria-label', x.title);
    x.hidden = song.arrangement.length < 2;
    x.onclick = () => { commit(() => { removeBlock(song, index); }); renderAll(); };
    b.append(label, x);
    if (song.arrangement.filter((v) => v === id).length > 1) {
      const split = document.createElement('button');
      split.className = 'blockSplit'; split.textContent = '⧉'; split.title = 'Make this one separate, so edits only change this block'; split.setAttribute('aria-label', split.title);
      split.onclick = () => { commit(() => { unlinkBlock(song, index); }); if (engine.playing && playMode === 'section') engine.start(song); renderAll(); };
      b.append(split);
    }
    b.ondragstart = (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); };
    b.ondragover = (e) => { e.preventDefault(); b.classList.add('over'); };
    b.ondragleave = () => b.classList.remove('over');
    b.ondrop = (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (from !== index) { commit(() => { moveBlock(song, from, index); }); renderAll(); }
    };
    host.append(b);
  });
  const add = document.createElement('select');
  add.id = 'addSection'; add.className = 'adder'; add.setAttribute('aria-label', 'Add a section');
  add.add(new Option('+ Section', ''));
  const fresh = document.createElement('optgroup'); fresh.label = 'New';
  for (const n of SECTION_NAMES) fresh.append(new Option(n, `new:${n}`));
  add.append(fresh);
  const again = document.createElement('optgroup'); again.label = 'Repeat';
  for (const x of song.sections) again.append(new Option(x.name, `repeat:${x.id}`));
  add.append(again);
  add.onchange = () => {
    const [kind, value] = add.value.split(':');
    if (kind === 'new') {
      const count = song.sections.filter((x) => x.name === value || x.name.startsWith(`${value} `)).length;
      commit(() => { addSection(song, count ? `${value} ${count + 1}` : value); });
    } else if (kind === 'repeat') commit(() => { repeatSection(song, value); });
    renderAll();
  };
  host.append(add);
  const ending = document.createElement('select');
  ending.id = 'ending'; ending.className = 'endingPick'; ending.title = 'How the finished song ends'; ending.setAttribute('aria-label', 'Song ending');
  ending.add(new Option('Ending: Let ring', 'ring')); ending.add(new Option('Ending: Fade out', 'fade'));
  ending.value = song.ending;
  ending.onchange = () => commit(() => { song.ending = ending.value; });
  host.append(ending);
  activeBlock = -1;
}

// Chord options worked out from the melody, shown whenever the chords track is open.
function renderFits(t) {
  const wrap = document.createElement('div'); wrap.className = 'fits';
  const lead = document.createElement('span'); lead.className = 'lead'; lead.textContent = 'Fits your tune'; wrap.append(lead);
  const melody = song.tracks.filter((x) => x.role === 'melody' && !x.mute).flatMap((x) => x.notes);
  const options = fitChords(melody, { key: song.key, scale: song.scale, meter: song.meter, bars: song.bars });
  if (!options.length) {
    const hint = document.createElement('p'); hint.textContent = 'Hum a tune and chords that match it appear here.'; wrap.append(hint);
  }
  const barSteps = METERS[song.meter].barSteps, n = SCALES[song.scale].steps.length;
  const current = Array.from({ length: song.bars }, (_, bar) => {
    const here = t.notes.filter((x) => x.step === bar * barSteps);
    return here.length ? Math.min(...here.map((x) => x.deg)) % n : -1;
  }).join();
  options.forEach((option, i) => {
    const names = option.degrees.map((d) => chordLabel(d, song.key, song.scale)).join('  ');
    const b = document.createElement('button');
    b.className = `fit${option.degrees.join() === current ? ' on' : ''}`; b.dataset.fit = i; b.title = names;
    const label = document.createElement('span'); label.textContent = names;
    const match = document.createElement('small'); match.textContent = `${option.match}%`; match.title = `${option.match}% of your tune is in these chords`;
    b.append(label, match);
    b.onclick = () => {
      commit(() => { t.notes = notesForChords(option.degrees, song.meter); });
      picked.prog = null;
      renderStarters();
      startPreview();
      const bass = song.tracks.find((x) => x.role === 'bass');
      if (bass) toast('Chords added.', { label: bass.notes.length ? 'Update bass' : 'Add bass', run: () => { commit(() => { bass.notes = bassFromChords(t.notes, song.scale, song.meter); }); toast('Bass now follows your chords.'); } });
    };
    wrap.append(b);
  });
  $('starters').prepend(wrap);
}

function showChords() {
  let t = song.tracks.find((x) => x.role === 'chords');
  if (!t) { addTrack('chords'); t = track(); }
  selected = t.id;
  selection.clear();
  renderTracks(); renderStarters(); renderPads(); renderFx(); draw();
}

function chipRow(lead, items, active, onPick) {
  const host = $('starters');
  host.textContent = '';
  const l = document.createElement('span'); l.className = 'lead'; l.textContent = lead; host.append(l);
  for (const it of items) {
    const b = document.createElement('button');
    b.className = `chip${it.id === active ? ' on' : ''}`; b.textContent = it.name; b.dataset.id = it.id;
    b.onclick = () => onPick(it);
    host.append(b);
  }
}

function renderBarChords(t) {
  const host = $('starters'), barSteps = METERS[song.meter].barSteps, n = SCALES[song.scale].steps.length;
  const sep = document.createElement('span'); sep.className = 'lead sep'; sep.textContent = 'Each bar'; host.append(sep);
  for (let bar = 0; bar < song.bars; bar++) {
    const start = bar * barSteps, here = t.notes.filter((x) => x.step === start);
    const root = here.length ? Math.min(...here.map((x) => x.deg)) % n : -1;
    const pick = document.createElement('select');
    pick.className = 'barChord'; pick.dataset.bar = bar; pick.setAttribute('aria-label', `Chord for bar ${bar + 1}`);
    pick.add(new Option('–', '-1', false, root < 0));
    for (let d = 0; d < n; d++) pick.add(new Option(chordLabel(d, song.key, song.scale), d, false, d === root));
    pick.onchange = async () => {
      const d = Number(pick.value);
      commit(() => {
        t.notes = t.notes.filter((x) => x.step < start || x.step >= start + barSteps);
        if (d >= 0) for (const off of [0, 2, 4]) t.notes.push({ deg: d + off, step: start, len: barSteps });
      });
      picked.prog = null;
      await engine.boot(); await engine.ensure(song);
      if (d >= 0 && !engine.playing) for (const off of [0, 2, 4]) engine.preview(song, t, d + off);
    };
    host.append(pick);
  }
}

const startPreview = async () => { await engine.boot(); await engine.ensure(song); if (!engine.playing) play(); };

function renderStarters() {
  const t = track(), steps = totalSteps();
  setHumLabel();
  if (t.role === 'drums') chipRow('Pick a beat', beatsFor(song.meter), picked.beat, (b) => { picked.beat = b.id; commit(() => { t.hits = beatHits(b, steps); }); renderStarters(); startPreview(); });
  else if (t.role === 'chords') {
    chipRow('Pick chords', PROGRESSIONS, picked.prog, (p) => { picked.prog = p.id; commit(() => { t.notes = chordNotes(p, song.scale, steps, song.meter); }); renderStarters(); startPreview(); });
    const lead = document.createElement('span'); lead.className = 'lead sep'; lead.textContent = 'Play them as'; $('starters').append(lead);
    for (const style of CHORD_STYLES) {
      const b = document.createElement('button');
      b.className = `chip${(t.style || 'block') === style.id ? ' on' : ''}`; b.textContent = style.name; b.dataset.style = style.id;
      b.onclick = () => { commit(() => { t.style = style.id; }); renderStarters(); if (t.notes.length) startPreview(); };
      $('starters').append(b);
    }
    renderBarChords(t);
    renderFits(t);
  }
  else if (t.role === 'bass') chipRow('Quick start', [{ id: 'follow', name: 'Follow the chords' }, { id: 'clear', name: 'Clear' }], null, (x) => {
    if (x.id === 'clear') return commit(() => { t.notes = []; });
    const chords = song.tracks.find((c) => c.role === 'chords')?.notes || [];
    if (!chords.length) return toast('Pick some chords first, then the bass can follow them.');
    commit(() => { t.notes = bassFromChords(chords, song.scale, song.meter); });
    startPreview();
  });
  else if (t.kind === 'audio') chipRow('Your voice', [{ id: 'hum', name: 'Record' }, { id: 'clear', name: 'Clear' }], null, (x) => { if (x.id === 'hum') hum(); else commit(() => { t.clips = []; }); });
  else chipRow('Your tune', [{ id: 'hum', name: 'Hum it' }, { id: 'clear', name: 'Clear' }], null, (x) => { if (x.id === 'hum') hum(); else commit(() => { t.notes = []; }); });
  if (t.kind === 'inst' && t.role !== 'chords') renderTakeTools(t);
}

const FX = [['pan', 'Pan', -1, 1], ['reverb', 'Reverb', 0, 1], ['echo', 'Echo', 0, 1], ['tone', 'Tone', -1, 1]];
function renderFx() {
  const host = $('fx'), t = track();
  host.textContent = '';
  const title = document.createElement('span'); title.className = 'lead'; title.textContent = `${t.name} sound`; host.append(title);
  for (const [prop, label, min, max] of FX) {
    const l = document.createElement('label'); l.textContent = label;
    const r = document.createElement('input');
    r.type = 'range'; r.min = min; r.max = max; r.step = 0.01; r.value = t.fx[prop]; r.dataset.fx = prop;
    r.oninput = () => { if (r.dataset.undo !== '1') { r.dataset.undo = '1'; past.push(JSON.stringify(song)); future = []; } t.fx[prop] = Number(r.value); engine.syncMix(song); };
    r.onchange = () => { r.dataset.undo = ''; changed(); };
    r.ondblclick = () => { commit(() => { t.fx[prop] = defaultFx(t.role)[prop]; }); renderFx(); };
    l.append(r); host.append(l);
  }
}

function renderAll() { selection.clear(); renderControls(); renderTracks(); renderSections(); renderStarters(); renderPads(); renderFx(); resize(); }

// ---------------------------------------------------------------- piano roll
const canvas = $('roll'), g = canvas.getContext('2d');
const selection = new Set();
const ruler = $('ruler'), rg = ruler.getContext('2d');
let showGhosts = true;
let W = 0, H = 0, scroll = 0, zoomBars = 0, snap = 2, marquee = null, clip = null, pasteAt = 0;
const rowsFor = (t) => (t.kind === 'audio' ? 1 : t.kind === 'drums' ? DRUM_ORDER.length : rowCount(song.scale));
const items = (t) => (t.kind === 'audio' ? t.clips : t.kind === 'drums' ? t.hits : t.notes);
const rowOf = (t, n, rows) => (t.kind === 'audio' ? 0 : t.kind === 'drums' ? DRUM_ORDER.indexOf(n.drum) : rows - 1 - n.deg);
// A recording keeps its real length, so its width on the grid follows the current speed.
const clipSteps = (c) => { const b = engine.audio.get(c.id); return b ? Math.max(1, Math.ceil(b.duration / stepSeconds(song.bpm, song.meter))) : 4; };
const lenOf = (n) => (n.id ? clipSteps(n) : n.len || 1);
const peakCache = new Map();
function peaksFor(id) {
  if (peakCache.has(id)) return peakCache.get(id);
  const b = engine.audio.get(id);
  if (!b) return null;
  const d = b.getChannelData(0), out = new Float32Array(600), size = Math.max(1, Math.floor(d.length / out.length));
  let top = 1e-4;
  for (let i = 0; i < out.length; i++) { let p = 0; for (let k = i * size, e = Math.min(d.length, k + size); k < e; k += 4) p = Math.max(p, Math.abs(d[k])); out[i] = p; top = Math.max(top, p); }
  for (let i = 0; i < out.length; i++) out[i] /= top;
  peakCache.set(id, out);
  return out;
}
function metrics() {
  const t = track(), rows = rowsFor(t), steps = totalSteps(), barSteps = METERS[song.meter].barSteps;
  const visible = zoomBars ? Math.min(steps, zoomBars * barSteps) : steps;
  scroll = Math.max(0, Math.min(steps - visible, scroll));
  return { t, rows, steps, visible, rh: H / rows, cw: (W - GUTTER) / visible };
}

function resize() {
  const r = $('rollWrap').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  W = r.width - 2; H = r.height - 2;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  ruler.style.width = `${W}px`;
  ruler.width = Math.round(W * dpr); ruler.height = Math.round(20 * dpr);
  rg.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function rounded(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }

function draw() {
  if (!W) return;
  const { t, rows, steps, visible, rh, cw } = metrics();
  const color = COLORS[t.role], meter = METERS[song.meter], X = (s) => GUTTER + (s - scroll) * cw;
  g.clearRect(0, 0, W, H);
  g.font = '11px -apple-system, "Segoe UI", sans-serif';
  g.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) {
    const y = r * rh, deg = rows - 1 - r;
    const isRoot = t.kind === 'inst' && deg % SCALES[song.scale].steps.length === 0;
    g.fillStyle = isRoot ? 'rgba(255,255,255,.055)' : r % 2 ? 'rgba(255,255,255,.012)' : 'transparent';
    g.fillRect(GUTTER, y, W - GUTTER, rh);
    g.fillStyle = isRoot ? '#f1eff7' : '#807d90';
    const label = t.kind === 'audio' ? 'Voice' : t.kind === 'drums' ? DRUM_NAMES[DRUM_ORDER[r]] : midiName(degToMidi(deg, song.key, song.scale, TRACK_BASE[t.role]));
    g.fillText(label, 8, y + rh / 2, GUTTER - 12);
  }
  g.save();
  g.beginPath(); g.rect(GUTTER, 0, W - GUTTER, H); g.clip();
  for (let s = scroll; s <= Math.min(steps, scroll + visible); s++) {
    if (cw < 7 && s % meter.beatSteps) continue;
    g.fillStyle = s % meter.barSteps === 0 ? 'rgba(255,255,255,.2)' : s % meter.beatSteps === 0 ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.03)';
    g.fillRect(X(s), 0, 1, H);
  }
  if (showGhosts && t.kind === 'inst') {
    const perOctave = SCALES[song.scale].steps.length;
    for (const o of song.tracks) {
      if (o === t || o.kind !== 'inst' || o.mute) continue;
      const shift = ((TRACK_BASE[o.role] - TRACK_BASE[t.role]) / 12) * perOctave;
      g.fillStyle = COLORS[o.role]; g.globalAlpha = 0.16;
      for (const n of o.notes) {
        if (n.step + n.len < scroll || n.step > scroll + visible) continue;
        g.fillRect(X(n.step) + 1, (rows - 1 - foldDeg(n.deg + shift, rows)) * rh + 3, Math.max(2, n.len * cw - 2), Math.max(2, rh - 6));
      }
      g.globalAlpha = 1;
    }
  }
  for (const n of items(t)) {
    if (n.step + lenOf(n) < scroll || n.step > scroll + visible) continue;
    const r = rowOf(t, n, rows), on = selection.has(n);
    const x = X(n.step) + (t.kind === 'drums' ? 1.5 : 1), w = t.kind === 'drums' ? Math.max(2, cw - 3) : Math.max(3, lenOf(n) * cw - 2), y = r * rh + 1.5, h = rh - 3;
    g.globalAlpha = 0.4 + 0.6 * (n.vel ?? 1);
    g.fillStyle = color;
    rounded(x, y, w, h, 4); g.fill();
    g.globalAlpha = 1;
    if (t.kind === 'audio') {
      const peaks = peaksFor(n.id);
      if (peaks) {
        g.fillStyle = 'rgba(10,20,32,.72)';
        const mid = y + h / 2, columns = Math.max(1, Math.floor(w / 2));
        for (let c = 0; c < columns; c++) { const a = peaks[Math.floor((c / columns) * peaks.length)] * (h / 2 - 4); g.fillRect(x + c * 2, mid - a, 1.2, Math.max(1, a * 2)); }
      }
    }
    if (on) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; rounded(x, y, w, h, 4); g.stroke(); }
  }
  if (marquee) {
    g.fillStyle = 'rgba(167,139,250,.16)'; g.strokeStyle = 'rgba(167,139,250,.9)'; g.lineWidth = 1;
    const mx = Math.min(marquee.x0, marquee.x1) + GUTTER, my = Math.min(marquee.y0, marquee.y1);
    g.fillRect(mx, my, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0));
    g.strokeRect(mx, my, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0));
  }
  g.restore();
  const hints = { drums: ['Pick a beat below', 'or click squares to place hits'], chords: ['Pick chords below', 'every row is in key, so nothing sounds wrong'], bass: ['Let the bass follow your chords', 'or draw your own notes'], melody: ['Hum a melody', 'or click anywhere to draw notes'], vocal: ['Record your voice', 'it plays along with your song'] };
  const e = $('empty');
  if (!items(t).length) { const [a, b] = hints[t.role]; e.textContent = ''; const big = document.createElement('b'); big.textContent = a; e.append(big, b); } else e.textContent = '';
  drawRuler(steps, visible, cw);
  syncVelocity();
}

function drawRuler(steps, visible, cw) {
  const meter = METERS[song.meter], X = (s) => GUTTER + (s - scroll) * cw;
  rg.clearRect(0, 0, W, 20);
  rg.font = '10px -apple-system, "Segoe UI", sans-serif'; rg.textBaseline = 'middle';
  for (let s = Math.ceil(scroll / meter.beatSteps) * meter.beatSteps; s <= Math.min(steps, scroll + visible); s += meter.beatSteps) {
    const isBar = s % meter.barSteps === 0;
    rg.fillStyle = isBar ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.1)';
    rg.fillRect(X(s), isBar ? 3 : 13, 1, isBar ? 17 : 7);
    if (isBar && s < steps && meter.barSteps * cw > 18) { rg.fillStyle = '#a5a2b4'; rg.fillText(String(s / meter.barSteps + 1), X(s) + 5, 9); }
  }
}

function syncVelocity() {
  const v = $('velocity'), tools = $('noteTools'), t = track();
  tools.disabled = !selection.size || t.kind === 'audio';
  for (const o of tools.options) if (['harmony', 'shorter', 'longer'].includes(o.value)) o.disabled = t.kind !== 'inst';
  v.disabled = !selection.size;
  if (selection.size && document.activeElement !== v) v.value = [...selection][0].vel ?? 1;
}

let gesture = null;
const locate = (ev) => {
  const rect = canvas.getBoundingClientRect(), m = metrics();
  const x = ev.clientX - rect.left - GUTTER, y = ev.clientY - rect.top;
  const step = Math.max(0, Math.min(m.steps - 1, Math.floor(x / m.cw) + scroll)), row = Math.max(0, Math.min(m.rows - 1, Math.floor(y / m.rh)));
  return { ...m, x, y, step, row };
};
canvas.addEventListener('pointerdown', async (ev) => {
  const shift = ev.shiftKey, pointer = ev.pointerId;
  const at = locate(ev);
  if (at.x < 0) return;
  canvas.setPointerCapture(pointer);
  const { t, rows, steps, step, row, cw, x } = at;
  const hit = t.kind === 'audio'
    ? t.clips.find((c) => step >= c.step && step < c.step + lenOf(c))
    : t.kind === 'drums'
    ? t.hits.find((h) => h.drum === DRUM_ORDER[row] && h.step === step)
    : t.notes.find((n) => n.deg === rows - 1 - row && step >= n.step && step < n.step + n.len);
  if (shift) {
    if (hit) { if (selection.has(hit)) selection.delete(hit); else selection.add(hit); draw(); return; }
    gesture = { type: 'marquee', base: new Set(selection) };
    marquee = { x0: x, y0: at.y, x1: x, y1: at.y };
    return;
  }
  if (hit && selection.has(hit) && selection.size > 1) {
    past.push(JSON.stringify(song)); future = [];
    gesture = { type: 'group', from: [...selection].map((n) => ({ n, step: n.step, deg: n.deg })), step, row, moved: false };
    return;
  }
  if (selection.size) { selection.clear(); draw(); }
  await engine.boot();
  await engine.ensure(song);
  if (t.kind === 'audio') {
    if (!hit) return;
    selection.add(hit);
    past.push(JSON.stringify(song)); future = [];
    gesture = { type: 'group', from: [{ n: hit, step: hit.step }], step, row, moved: false, keep: true };
    draw();
    return;
  }
  if (t.kind === 'drums') {
    const drum = DRUM_ORDER[row];
    commit(() => { if (hit) t.hits = t.hits.filter((h) => h !== hit); else t.hits.push({ drum, step }); });
    if (!hit) engine.previewDrum(song, t, drum);
    gesture = { type: 'paint', add: !hit, drum };
    return;
  }
  const deg = rows - 1 - row;
  if (hit) {
    const nearEnd = x + scroll * cw > (hit.step + hit.len) * cw - Math.min(10, hit.len * cw / 3);
    past.push(JSON.stringify(song)); future = [];
    gesture = { type: nearEnd ? 'resize' : 'move', note: hit, grab: step - hit.step, moved: false };
  } else {
    const start = Math.floor(step / snap) * snap;
    let note;
    commit(() => { note = { deg, step: start, len: Math.min(snap, steps - start) }; t.notes.push(note); });
    engine.preview(song, t, deg);
    gesture = { type: 'resize', note, moved: true, fresh: true };
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!gesture) return;
  const { t, rows, steps, step, row, x, y, cw, rh } = locate(ev);
  if (gesture.type === 'marquee') {
    marquee.x1 = x; marquee.y1 = y;
    const s0 = Math.floor(Math.min(marquee.x0, x) / cw) + scroll, s1 = Math.floor(Math.max(marquee.x0, x) / cw) + scroll;
    const r0 = Math.floor(Math.min(marquee.y0, y) / rh), r1 = Math.floor(Math.max(marquee.y0, y) / rh);
    selection.clear();
    for (const n of gesture.base) selection.add(n);
    for (const n of items(t)) { const r = rowOf(t, n, rows); if (r >= r0 && r <= r1 && n.step <= s1 && n.step + lenOf(n) > s0) selection.add(n); }
    draw();
  } else if (gesture.type === 'group') {
    const isDrum = t.kind !== 'inst';
    let dx = step - gesture.step, dy = isDrum ? 0 : gesture.row - row;
    for (const f of gesture.from) {
      dx = Math.max(-f.step, Math.min(steps - lenOf(f.n) - f.step, dx));
      if (!isDrum) dy = Math.max(-f.deg, Math.min(rows - 1 - f.deg, dy));
    }
    for (const f of gesture.from) { f.n.step = f.step + dx; if (!isDrum) f.n.deg = f.deg + dy; }
    if (dx || dy) gesture.moved = true;
    changed();
  } else if (gesture.type === 'paint') {
    const has = t.hits.some((h) => h.drum === gesture.drum && h.step === step);
    if (gesture.add && !has) { t.hits.push({ drum: gesture.drum, step }); changed(); }
    if (!gesture.add && has) { t.hits = t.hits.filter((h) => !(h.drum === gesture.drum && h.step === step)); changed(); }
  } else if (gesture.type === 'resize') {
    const end = Math.ceil((step + 1) / snap) * snap;
    const len = Math.max(1, Math.min(steps - gesture.note.step, end - gesture.note.step));
    if (len !== gesture.note.len) { gesture.note.len = len; gesture.moved = true; changed(); }
  } else {
    const nextStep = Math.max(0, Math.min(steps - gesture.note.len, step - gesture.grab)), deg = rows - 1 - row;
    if (nextStep !== gesture.note.step || deg !== gesture.note.deg) {
      const newPitch = deg !== gesture.note.deg;
      gesture.note.step = nextStep; gesture.note.deg = deg; gesture.moved = true;
      if (newPitch) engine.preview(song, t, deg);
      changed();
    }
  }
});
function clearOverlaps(t, keep) {
  if (t.kind === 'audio') return;
  if (t.kind === 'drums') {
    const seen = new Set(), ordered = [...keep, ...t.hits.filter((h) => !keep.has(h))];
    t.hits = ordered.filter((h) => { const k = `${h.drum}:${h.step}`; if (seen.has(k)) return false; seen.add(k); return true; });
    return;
  }
  t.notes = t.notes.filter((o) => keep.has(o) || ![...keep].some((n) => o.deg === n.deg && o.step < n.step + n.len && o.step + o.len > n.step));
}
const endGesture = () => {
  if (!gesture) return;
  const { t } = metrics(), done = gesture;
  gesture = null;
  if (done.type === 'marquee') { marquee = null; draw(); return; }
  if (done.type === 'group') {
    if (!done.moved) { past.pop(); if (!done.keep) selection.clear(); draw(); return; }
    clearOverlaps(t, new Set(selection));
    changed();
    return;
  }
  if ((done.type === 'move' || done.type === 'resize') && !done.moved && !done.fresh) {
    t.notes = t.notes.filter((n) => n !== done.note);
    changed();
  } else if ((done.type === 'move' || done.type === 'resize') && !done.fresh) {
    clearOverlaps(t, new Set([done.note]));
    changed();
  }
};
canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);
canvas.addEventListener('wheel', (ev) => {
  if (!zoomBars) return;
  ev.preventDefault();
  const { cw } = metrics(), d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
  wheelRest += d / cw;
  const whole = Math.trunc(wheelRest);
  if (whole) { wheelRest -= whole; scroll += whole; draw(); }
}, { passive: false });
let wheelRest = 0;

// ---------------------------------------------------------------- editing
function removeSelected() {
  if (!selection.size) return;
  const t = track(), gone = new Set(selection);
  commit(() => { const left = items(t).filter((n) => !gone.has(n)); if (t.kind === 'audio') t.clips = left; else if (t.kind === 'drums') t.hits = left; else t.notes = left; selection.clear(); });
}
function copySelected() {
  if (!selection.size) return false;
  const t = track(), list = [...selection], first = Math.min(...list.map((n) => n.step)), end = Math.max(...list.map((n) => n.step + lenOf(n)));
  clip = { kind: t.kind, length: end - first, items: list.map((n) => ({ ...n, step: n.step - first })) };
  pasteAt = end;
  return true;
}
function pasteClip(at = null) {
  if (!clip) return;
  const t = track();
  if (t.kind !== clip.kind) return toast(clip.kind === 'drums' ? 'Those are drum hits. Pick a drum track to paste them.' : 'Those are notes. Pick an instrument track to paste them.');
  const steps = totalSteps(), start = at ?? (engine.playing && playMode === 'section' ? Math.floor(engine.position() / snap) * snap : pasteAt);
  if (start >= steps) return toast('No room left in this section.');
  const added = new Set();
  commit(() => {
    for (const c of clip.items) {
      const step = start + c.step;
      if (step >= steps) continue;
      const n = { ...c, step };
      if (t.kind !== 'drums') n.len = Math.min(c.len, steps - step);
      items(t).push(n); added.add(n);
    }
    clearOverlaps(t, added);
    selection.clear();
    added.forEach((n) => selection.add(n));
  });
  pasteAt = start + clip.length;
}
function selectAll() { for (const n of items(track())) selection.add(n); draw(); }
function nudge(dx, dy) {
  if (!selection.size) return;
  const t = track(), { rows, steps } = metrics(), list = [...selection];
  if (t.kind !== 'inst') dy = 0;
  for (const n of list) {
    dx = Math.max(-n.step, Math.min(steps - lenOf(n) - n.step, dx));
    if (t.kind === 'inst') dy = Math.max(-n.deg, Math.min(rows - 1 - n.deg, dy));
  }
  if (!dx && !dy) return;
  commit(() => { for (const n of list) { n.step += dx; if (t.kind === 'inst') n.deg += dy; } clearOverlaps(t, new Set(list)); });
  if (dy && t.kind === 'inst' && list.length === 1) engine.preview(song, t, list[0].deg);
}

// Works only on notes the person chose.
function noteTool(tool) {
  if (!selection.size) return;
  const t = track(), { rows, steps } = metrics(), list = [...selection];
  if (t.kind === 'audio' || (t.kind === 'drums' && tool !== 'reverse')) return;
  commit(() => {
    if (tool === 'harmony') {
      const added = [];
      for (const n of list) {
        const deg = n.deg + 2;
        if (deg >= rows || t.notes.some((o) => o.deg === deg && o.step < n.step + n.len && o.step + o.len > n.step)) continue;
        const copy = { ...n, deg };
        t.notes.push(copy); added.push(copy);
      }
      added.forEach((n) => selection.add(n));
      if (!added.length) toast('No room for a harmony above these notes.');
      return;
    }
    if (tool === 'reverse') {
      const first = Math.min(...list.map((n) => n.step)), end = Math.max(...list.map((n) => n.step + lenOf(n)));
      for (const n of list) n.step = first + end - n.step - lenOf(n);
    } else if (tool === 'shorter') for (const n of list) n.len = Math.max(1, Math.floor(n.len / 2));
    else if (tool === 'longer') for (const n of list) n.len = Math.min(steps - n.step, n.len * 2);
    clearOverlaps(t, new Set(list));
    if (t.kind === 'inst') {
      for (const n of [...list].sort((a, b) => a.step - b.step)) {
        const next = list.filter((o) => o.deg === n.deg && o.step > n.step).reduce((m, o) => Math.min(m, o.step), Infinity);
        if (n.step + n.len > next) n.len = next - n.step;
      }
    }
  });
}

// ---------------------------------------------------------------- playing and recording live
const KEY_ROW = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
const held = new Map();
let recording = false, liveOctave = 0;

const recStep = (pos) => (Math.round(pos / snap) * snap) % totalSteps();
function foldDeg(deg, rows) {
  const n = SCALES[song.scale].steps.length;
  while (deg < 0) deg += n;
  while (deg >= rows) deg -= n;
  return deg;
}
async function liveOn(id, pick, vel = 0.85) {
  if (held.has(id) || session || track().kind === 'audio') return;
  const entry = {};
  held.set(id, entry);
  await engine.boot();
  await engine.ensure(song);
  if (held.get(id) !== entry) return;
  const t = track(), capture = recording && engine.playing && playMode === 'section';
  const place = (n) => {
    n.step = recStep(engine.position() || 0);
    if (n.step >= engine.step) engine.skipOnce.add(n);
    items(t).push(n);
    entry.note = n; entry.track = t; entry.from = engine.position() || 0;
  };
  if (t.kind === 'drums') {
    const drum = DRUM_ORDER[DRUM_ORDER.length - 1 - (pick % DRUM_ORDER.length)];
    engine.previewDrum(song, t, drum, vel);
    if (capture) { const before = t.hits.length; place({ drum, vel: +vel.toFixed(2) }); const n = t.hits[before]; if (t.hits.some((h) => h !== n && h.drum === drum && h.step === n.step)) t.hits.pop(); entry.note = null; changed(); }
    return;
  }
  const deg = foldDeg(pick, rowsFor(t));
  entry.voice = engine.liveVoice(song, t, deg, vel);
  if (capture) { place({ deg, len: snap, vel: +vel.toFixed(2) }); changed(); }
}
function liveOff(id) {
  const h = held.get(id);
  if (!h) return;
  held.delete(id);
  h.voice?.stop();
  if (h.note && engine.playing) {
    const total = totalSteps(), played = ((engine.position() || 0) - h.from + total) % total;
    h.note.len = Math.max(snap, Math.min(total - h.note.step, Math.round(played / snap) * snap));
    clearOverlaps(h.track, new Set([h.note]));
    changed();
  }
}
const KEY_LABELS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'"];
const padPick = (t, i) => (t.kind === 'drums' ? i : i + SCALES[song.scale].steps.length * liveOctave);
let padSignature = '';
function renderPads() {
  const t = track(), sign = `${t.id}|${t.kind}|${t.role}|${song.key}|${song.scale}|${liveOctave}`;
  if (sign === padSignature) return;
  padSignature = sign;
  const host = $('pads');
  host.textContent = '';
  host.hidden = t.kind === 'audio';
  if (t.kind === 'audio') return;
  host.style.setProperty('--c', COLORS[t.role]);
  const title = document.createElement('span'); title.className = 'lead'; title.textContent = t.kind === 'drums' ? 'Tap the drums' : 'Play in key';
  const grid = document.createElement('div'); grid.className = 'padGrid';
  KEY_ROW.forEach((code, i) => {
    const pick = padPick(t, i);
    const name = t.kind === 'drums' ? DRUM_NAMES[DRUM_ORDER[DRUM_ORDER.length - 1 - (pick % DRUM_ORDER.length)]] : midiName(degToMidi(foldDeg(pick, rowsFor(t)), song.key, song.scale, TRACK_BASE[t.role]));
    const b = document.createElement('button');
    b.className = 'pad'; b.textContent = name; b.dataset.pad = i; b.title = name;
    const k = document.createElement('kbd'); k.textContent = KEY_LABELS[i]; b.append(k);
    const id = `pad${i}`;
    b.onpointerdown = (e) => { b.setPointerCapture(e.pointerId); liveOn(id, padPick(track(), i)); };
    b.onpointerup = () => liveOff(id);
    b.onpointercancel = () => liveOff(id);
    grid.append(b);
  });
  host.append(title, grid);
}
function setRecUi() { $('rec').classList.toggle('on', recording); $('rec').setAttribute('aria-pressed', String(recording)); }
async function toggleRec() {
  if (recording) { stopRec(); return; }
  if (track().kind === 'audio') { hum(); return; }
  if (!engine.playing || playMode !== 'section') await play();
  past.push(JSON.stringify(song)); future = [];
  recording = true;
  engine.click = true;
  setRecUi();
  $('undo').disabled = false;
  toast('Recording. Play the A to L keys or a MIDI keyboard.');
}
function stopRec() {
  recording = false;
  engine.click = false;
  for (const id of [...held.keys()]) liveOff(id);
  setRecUi();
}
async function connectMidi() {
  if (!navigator.requestMIDIAccess) return;
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const listen = (input) => {
      input.onmidimessage = ({ data: [status, note, velocity] }) => {
        const kind = status & 0xf0, id = `midi${note}`;
        if (kind === 0x90 && velocity > 0) {
          const t = track();
          liveOn(id, t.kind === 'drums' ? note : nearestDeg(note, song.key, song.scale, TRACK_BASE[t.role], -14, 28), 0.25 + (velocity / 127) * 0.75);
        } else if (kind === 0x80 || kind === 0x90) liveOff(id);
      };
    };
    for (const input of access.inputs.values()) listen(input);
    access.onstatechange = ({ port }) => {
      if (port.type !== 'input') return;
      if (port.state === 'connected' && !port.onmidimessage) { listen(port); toast(`${port.name || 'MIDI keyboard'} connected.`); }
    };
  } catch { /* No MIDI permission or no MIDI support: the computer keyboard still works. */ }
}

let clockText = '';
function animate() {
  const pos = engine.playing ? engine.position() : null;
  const head = $('playhead');
  let block = -1;
  if (pos !== null && playMode === 'song') block = engine.project.blocks.findIndex((b) => pos >= b.start && pos < b.end);
  if (block !== activeBlock) {
    activeBlock = block;
    document.querySelectorAll('#sections .block').forEach((el, i) => el.classList.toggle('now', i === block));
  }
  if (pos === null || playMode === 'song') head.style.opacity = 0;
  else {
    let m = metrics();
    if (zoomBars && (pos < scroll || pos >= scroll + m.visible)) {
      const page = METERS[song.meter].barSteps * zoomBars;
      scroll = Math.floor(pos / page) * page;
      draw();
      m = metrics();
    }
    head.style.opacity = 0.9;
    head.style.transform = `translateX(${GUTTER + (pos - scroll) * m.cw}px)`;
  }
  const m = METERS[song.meter], at = pos === null ? 0 : Math.floor(pos);
  const label = `${Math.floor(at / m.barSteps) + 1}.${Math.floor((at % m.barSteps) / m.countSteps) + 1}`;
  if (label !== clockText) { clockText = label; $('clock').textContent = label; }
  if (!$('overlay').hidden) updateLevel();
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------- transport
async function play() {
  await engine.boot();
  await engine.ensure(song);
  engine.exclude = null; engine.click = false;
  engine.syncMix(song);
  playMode = 'section';
  engine.start(song);
  setPlayUi();
}
async function playSong() {
  if (engine.playing && playMode === 'song') return stop();
  await engine.boot();
  await engine.ensure(song);
  engine.exclude = null; engine.click = false;
  engine.syncMix(song);
  playMode = 'song';
  engine.start(flatten(song), songPlayback());
  setPlayUi();
}
// A full play-through runs once and finishes with the song's ending.
const songPlayback = () => ({ loop: false, ending: true, onEnd: () => { playMode = 'section'; setPlayUi(); } });
function setPlayUi() {
  const on = engine.playing;
  $('play').classList.toggle('on', on && playMode === 'section');
  $('play').setAttribute('aria-label', on && playMode === 'section' ? 'Stop' : 'Play this section');
  $('playSong').classList.toggle('on', on && playMode === 'song');
  $('playSong').textContent = on && playMode === 'song' ? 'Stop song' : 'Play song';
}
function stop() { if (recording) stopRec(); engine.stop(); playMode = 'section'; setPlayUi(); }
const toggle = () => (engine.playing ? stop() : play());
async function playFrom(step) {
  if (session) return;
  if (recording) stopRec();
  await engine.boot();
  await engine.ensure(song);
  engine.exclude = null; engine.click = false;
  engine.syncMix(song);
  playMode = 'section';
  engine.start(song, { from: step });
  setPlayUi();
}
function setMetronome(on) {
  engine.metronome = on;
  $('metronome').classList.toggle('on', on);
  $('metronome').setAttribute('aria-pressed', String(on));
}
// A new speed takes effect straight away, from the next step.
function retime() {
  if (!engine.playing || engine.finishing) return;
  const project = playMode === 'song' ? flatten(song) : song, total = project.bars * METERS[song.meter].barSteps;
  engine.start(project, { from: Math.ceil(engine.position() || 0) % total, ...(playMode === 'song' ? songPlayback() : {}) });
}
let taps = [], tapUndo = false;
function tapTempo(now = performance.now()) {
  if (taps.length && now - taps.at(-1) > 2000) taps = [];
  if (!taps.length) tapUndo = false;
  taps = [...taps, now].slice(-6);
  if (taps.length < 2) return toast('Keep tapping in time.');
  const bpm = Math.max(60, Math.min(180, Math.round((60000 * (taps.length - 1)) / (taps.at(-1) - taps[0]))));
  if (!tapUndo) { past.push(JSON.stringify(song)); future = []; tapUndo = true; }
  song.bpm = bpm;
  renderControls();
  retime();
  changed();
}

function setBars(bars) {
  commit(() => {
    const barSteps = METERS[song.meter].barSteps, oldSteps = song.bars * barSteps, steps = bars * barSteps;
    for (const t of song.tracks) {
      if (t.kind === 'audio') continue;
      if (t.kind === 'drums') {
        const out = [];
        for (let s = 0; s < steps; s++) for (const h of t.hits) if (h.step === s % oldSteps) out.push({ drum: h.drum, step: s });
        t.hits = out;
      } else {
        const out = [];
        for (let shift = 0; shift < steps; shift += oldSteps) for (const n of t.notes) if (n.step + shift < steps) out.push({ ...n, step: n.step + shift, len: Math.min(n.len, steps - n.step - shift) });
        t.notes = out;
      }
    }
    song.bars = bars;
  });
  renderControls();
}

function setMeter(meter) {
  const a = METERS[song.meter], b = METERS[meter];
  let lost = 0;
  const remap = (step) => {
    const bar = Math.floor(step / a.barSteps), pos = step - bar * a.barSteps;
    if (pos >= b.barSteps) { lost++; return -1; }
    return bar * b.barSteps + pos;
  };
  commit(() => {
    forEachPart(song, (part, t, section) => {
      const total = section.bars * b.barSteps;
      if (t.kind === 'audio') part.clips = part.clips.map((c) => ({ ...c, step: remap(c.step) })).filter((c) => c.step >= 0);
      else if (t.kind === 'drums') part.hits = part.hits.map((h) => ({ ...h, step: remap(h.step) })).filter((h) => h.step >= 0);
      else part.notes = part.notes.map((n) => {
        const step = remap(n.step), wholeBars = n.step % a.barSteps === 0 && n.len % a.barSteps === 0;
        return { ...n, step, len: Math.min(wholeBars ? (n.len / a.barSteps) * b.barSteps : n.len, total - step) };
      }).filter((n) => n.step >= 0);
    });
    song.meter = meter;
    picked.beat = null;
  });
  renderControls();
  renderStarters();
  if (engine.playing) { if (playMode === 'song') engine.start(flatten(song), songPlayback()); else engine.start(song); }
  if (lost) toast(`${lost} notes didn't fit in ${meter}. Undo brings them back.`);
}

function setScale(scale) {
  commit(() => {
    const oldN = SCALES[song.scale].steps.length, n = SCALES[scale].steps.length, rows = rowCount(scale);
    forEachPart(song, (part, t) => {
      if (t.kind !== 'inst') return;
      const seen = new Set();
      part.notes = part.notes.map((x) => {
        const oct = Math.floor(x.deg / oldN), rest = x.deg - oct * oldN;
        let deg = oct * n + Math.round((rest * n) / oldN);
        while (deg >= rows) deg -= n;
        return { ...x, deg };
      }).filter((x) => { const k = `${x.deg}:${x.step}`; if (seen.has(k)) return false; seen.add(k); return true; });
    });
    song.scale = scale;
  });
}

// ---------------------------------------------------------------- hum
let session = null, workletReady = null, lastTake = null;
function setHumLabel() { $('humLabel').textContent = { drums: 'Beatbox a beat', audio: 'Record vocals' }[track().kind] || 'Hum a melody'; }
const worker = new Worker('hum-worker.mjs', { type: 'module' });

function updateLevel() {
  if (!session || !session.analyser) return;
  const b = new Float32Array(512); session.analyser.getFloatTimeDomainData(b);
  let e = 0; for (const v of b) e += v * v;
  $('level').style.transform = `scaleX(${Math.min(1, Math.sqrt(e / b.length) * 7)})`;
}

function endSession() {
  const s = session;
  session = null;
  $('overlay').hidden = true;
  setHumLabel();
  if (!s) return;
  s.timers.forEach(clearTimeout);
  try { s.node?.disconnect(); s.source?.disconnect(); s.silent?.disconnect(); s.analyser?.disconnect(); } catch { /* already gone */ }
  s.stream?.getTracks().forEach((x) => x.stop());
  engine.click = false; engine.exclude = null;
}

async function hum() {
  if (session) return;
  if (recording) stopRec();
  let target = track();
  if (target.role === 'chords') {
    const lead = song.tracks.find((t) => t.role === 'melody');
    if (lead) { selected = lead.id; renderTracks(); renderStarters(); renderPads(); renderFx(); draw(); } else addTrack('melody');
    target = track();
  }
  stop();
  const ok = await window.melody.micAccess();
  if (!ok) return toast('Melodyshaper needs your microphone to hear you.', { label: 'Open settings', run: () => window.melody.openMicSettings() });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch {
    return toast('No microphone found. Plug one in and try again.');
  }
  const ctx = await engine.boot();
  await engine.ensure(song);
  workletReady ||= ctx.audioWorklet.addModule('capture-worklet.js');
  try {
    await workletReady;
  } catch {
    workletReady = null;
    stream.getTracks().forEach((x) => x.stop());
    return toast("Couldn't start listening. Try again.");
  }
  const s = session = { stream, timers: [], chunks: [] };
  s.source = ctx.createMediaStreamSource(stream);
  s.analyser = ctx.createAnalyser(); s.analyser.fftSize = 512;
  s.node = new AudioWorkletNode(ctx, 'melody-capture');
  s.silent = ctx.createGain(); s.silent.gain.value = 0;
  s.source.connect(s.analyser); s.source.connect(s.node); s.node.connect(s.silent); s.silent.connect(ctx.destination);
  s.node.port.onmessage = ({ data }) => s.chunks.push(data);

  const meter = METERS[song.meter], beat = stepSeconds(song.bpm, song.meter) * meter.countSteps, lead = 0.25;
  const startAt = ctx.currentTime + lead + beat * meter.count;
  $('overlay').hidden = false;
  $('overlayText').textContent = 'Get ready. Headphones work best.';
  for (let i = 0; i < meter.count; i++) {
    const at = ctx.currentTime + lead + beat * i;
    engine.tick(ctx, at, i === 0);
    s.timers.push(setTimeout(() => { $('count').textContent = meter.count - i; }, (at - ctx.currentTime) * 1000));
  }
  $('count').textContent = '';
  engine.exclude = target.id;
  engine.click = true;
  const t0 = engine.start(song, { delay: startAt - ctx.currentTime, loop: false, onEnd: () => setTimeout(() => finishHum(target, t0), 180) });
  s.timers.push(setTimeout(() => {
    $('count').textContent = { drums: 'Go', audio: 'Sing' }[target.kind] || 'Hum';
    $('overlayText').textContent = target.kind === 'audio' ? `Recording for ${song.bars} bars.` : target.kind === 'drums' ? `Beatbox for ${song.bars} bars. Try boom, tss and kah.` : `Hum or sing for ${song.bars} bars. Any note works.`;
  }, (startAt - ctx.currentTime) * 1000));
}

function finishHum(target, t0) {
  const s = session;
  if (!s) return;
  const ctx = engine.ctx, sr = ctx.sampleRate, first = Math.round(t0 * sr), stepSec = stepSeconds(song.bpm, song.meter), length = Math.round(totalSteps() * stepSec * sr);
  const samples = new Float32Array(length);
  for (const c of s.chunks) {
    const at = c.frame - first;
    if (at + c.data.length <= 0 || at >= length) continue;
    const from = Math.max(0, -at);
    samples.set(c.data.subarray(from, Math.min(c.data.length, length - at)), at + from);
  }
  endSession();
  $('humLabel').textContent = 'Listening back…';
  const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + (engine.limitDelay || 0);
  if (target.kind === 'audio') {
    setHumLabel();
    const skip = Math.min(samples.length - 1, Math.round(latency * sr)), take = samples.slice(skip);
    let peak = 0;
    for (let i = 0; i < take.length; i += 8) peak = Math.max(peak, Math.abs(take[i]));
    if (peak < 0.004) return toast("Couldn't hear anything. Check your microphone and try again.");
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    engine.setClip(id, take, sr);
    window.melody.clipSave({ id, bytes: encodeClip(take, sr) }).catch(() => toast("Couldn't keep that recording on disk. Save your song to be safe."));
    commit(() => { target.clips = [{ id, step: 0 }]; });
    toast('Recorded. Undo brings back the last take.');
    play();
    return;
  }
  const isBeat = target.kind === 'drums';
  const options = { stepSec, key: song.key, scale: song.scale, base: TRACK_BASE[target.role], steps: totalSteps(), latency };
  worker.onmessage = ({ data }) => {
    setHumLabel();
    if (data.error) return toast("Couldn't read that take. Try again.");
    if (isBeat) {
      if (!data.hits.length) return toast("Couldn't hear a beat. Try sharper sounds like boom and tss.");
      const had = target.hits.length;
      commit(() => { target.hits = data.hits; });
      const count = (d) => data.hits.filter((h) => h.drum === d).length;
      toast(`${count('kick')} kicks, ${count('snare')} snares, ${count('hat')} hats.${had ? ' Undo brings back the old beat.' : ''}`);
    } else {
      if (!data.notes.length) return toast("Couldn't hear a tune. Try humming a little louder.");
      const previous = target.notes.length;
      commit(() => { target.notes = data.notes; });
      lastTake = { trackId: target.id, section: song.active, sung: data.sung, options, grid: 2 };
      renderStarters();
      toast(`${data.notes.length} notes, all in key.${previous ? ' Undo brings back the old ones.' : ''}`, target.role === 'melody' ? { label: 'Find chords', run: showChords } : undefined);
    }
    play();
  };
  worker.postMessage({ mode: isBeat ? 'beat' : 'hum', samples, sampleRate: sr, options }, [samples.buffer]);
}

// Re-time or move the last hum without singing it again.
function renderTakeTools(t) {
  if (!lastTake || lastTake.trackId !== t.id || lastTake.section !== song.active || lastTake.options.scale !== song.scale || lastTake.options.key !== song.key) return;
  const host = $('starters');
  const sep = document.createElement('span'); sep.className = 'lead sep'; sep.textContent = 'Your take'; host.append(sep);
  for (const [grid, name] of [[4, 'Simple'], [2, 'Normal'], [1, 'Detailed']]) {
    const b = document.createElement('button');
    b.className = `chip${lastTake.grid === grid ? ' on' : ''}`; b.textContent = name; b.dataset.grid = grid;
    b.onclick = () => {
      lastTake.grid = grid;
      commit(() => { t.notes = notesToGrid(lastTake.sung, { ...lastTake.options, grid }); });
      renderStarters();
    };
    host.append(b);
  }
  const n = SCALES[song.scale].steps.length, rows = rowCount(song.scale);
  for (const [dir, name] of [[-1, 'Octave down'], [1, 'Octave up']]) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = name; b.dataset.octave = dir;
    b.disabled = t.notes.some((x) => x.deg + dir * n < 0 || x.deg + dir * n >= rows);
    b.onclick = () => { commit(() => { for (const x of t.notes) x.deg += dir * n; }); renderStarters(); };
    host.append(b);
  }
}

// ---------------------------------------------------------------- files
// Recordings: 4 bytes of sample rate, then 16-bit samples.
function encodeClip(samples, rate) {
  const out = new DataView(new ArrayBuffer(4 + samples.length * 2));
  out.setUint32(0, rate, true);
  for (let i = 0; i < samples.length; i++) out.setInt16(4 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(out.buffer);
}
function decodeClip(bytes) {
  if (bytes.byteLength < 6 || bytes.byteLength % 2) throw new Error('bad clip');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), rate = view.getUint32(0, true);
  if (rate < 8000 || rate > 192000) throw new Error('bad clip');
  const samples = new Float32Array((bytes.byteLength - 4) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(4 + i * 2, true) / 32768;
  return { samples, rate };
}
const toBase64 = (bytes) => { let out = ''; for (let i = 0; i < bytes.length; i += 32766) out += btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + 32766))); return out; };
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const usedClips = (x) => [...new Set(x.sections.flatMap((s) => Object.values(s.parts).flatMap((p) => (p.clips || []).map((c) => c.id))))];

// A saved song carries its recordings, so one file is the whole song.
function serializeFile() {
  storeActive(song);
  const audio = {};
  for (const id of usedClips(song)) {
    const b = engine.audio.get(id);
    if (b) audio[id] = toBase64(encodeClip(b.getChannelData(0), b.sampleRate));
  }
  return JSON.stringify({ ...song, audio });
}
async function restoreAudio(raw, parsed) {
  let missing = 0;
  for (const id of usedClips(parsed)) {
    if (engine.audio.has(id)) continue;
    try {
      let bytes = typeof raw.audio?.[id] === 'string' ? fromBase64(raw.audio[id]) : null;
      if (bytes) await window.melody.clipSave({ id, bytes });
      else bytes = await window.melody.clipLoad(id);
      if (!bytes) { missing++; continue; }
      const { samples, rate } = decodeClip(bytes);
      engine.setClip(id, samples, rate);
    } catch { missing++; }
  }
  if (missing) toast(`${missing} recording${missing > 1 ? 's' : ''} couldn't be found.`);
}
async function loadSong(text, name) {
  try {
    const raw = JSON.parse(text), parsed = sanitize(raw);
    await restoreAudio(raw, parsed);
    if (name) parsed.name = name;
    stop();
    song = parsed; past = []; future = []; picked = {}; lastTake = null;
    renderAll();
    $('undo').disabled = true; $('redo').disabled = true;
    dirty = false;
    return true;
  } catch {
    toast("That file isn't a Melodyshaper song, or it's damaged.");
    return false;
  }
}
// Remembers that this copy is safely in a file, so reopening the app won't ask to save it again.
function markSaved() {
  clearTimeout(changed.t); changed.t = null;
  dirty = false;
  storeActive(song);
  window.melody.autosave(JSON.stringify({ ...song, clean: true }));
}
async function save(saveAs = false) {
  try {
    const r = await window.melody.songSave({ text: serializeFile(), name: song.name, saveAs });
    if (!r) return false;
    song.name = r.name; renderControls(); markSaved(); toast('Saved.');
    return true;
  } catch { toast("Couldn't save. Try another folder."); return false; }
}
const hasWork = () => { storeActive(song); return song.sections.some((s) => Object.values(s.parts).some((p) => p.notes?.length || p.hits?.length || p.clips?.length)); };
let askUnsaved = (name) => window.melody.confirmUnsaved(name);
// Asks before anything replaces a song with unsaved changes. True means it's fine to continue.
async function keepWork() {
  if (session) { toast('Finish or cancel the recording first.'); return false; }
  if (!dirty || !hasWork()) return true;
  const answer = await askUnsaved(song.name);
  if (answer === 'cancel') return false;
  return answer === 'save' ? save() : true;
}
async function showSong(r) {
  if (!await loadSong(r.text, r.name)) return false;
  await window.melody.songAdopt(r.file);
  markSaved();
  return true;
}
async function openSong(r) { if (await keepWork()) await showSong(r); }
async function open() {
  if (!await keepWork()) return;
  try { const r = await window.melody.songOpen(); if (r) await showSong(r); } catch { toast("Couldn't open that file."); }
}
async function newSong() {
  const hadWork = dirty && hasWork();
  if (!await keepWork()) return;
  stop();
  await window.melody.songNew();
  const previous = serialize();
  song = blank(); past = hadWork && dirty ? [previous] : []; future = []; picked = {};
  renderAll();
  changed();
  dirty = false;
  if (past.length) toast('New song. Undo brings the last one back.');
}
const toMp3 = (wav) => new Promise((resolve, reject) => {
  const w = new Worker('mp3-worker.mjs', { type: 'module' });
  w.onmessage = ({ data }) => { w.terminate(); if (data.error) reject(new Error(data.error)); else resolve(data.bytes); };
  w.onerror = (e) => { w.terminate(); reject(e); };
  const copy = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
  w.postMessage({ wav: copy }, [copy]);
});
const hasContent = (t) => items(t).length > 0;
// One track on its own, with its effects, the same length as the full song so stems line up.
const stemsOf = (project) => project.tracks.filter(hasContent).map((t) => ({ name: t.name, project: { ...project, stem: true, tracks: project.tracks.map((x) => ({ ...x, solo: false, mute: x.id !== t.id })) } }));
let exporting = false;
async function exportAs(kind) {
  if (exporting) return;
  exporting = true;
  try {
    const project = flatten(song);
    if (kind === 'stems') {
      const stems = stemsOf(project);
      if (!stems.length) return toast('Add some notes first.');
      if (!await window.melody.stemFolder()) return;
      await engine.boot();
      let last = null;
      for (let i = 0; i < stems.length; i++) {
        toast(`Making stems… ${i + 1} of ${stems.length}`);
        last = await window.melody.stemWrite({ name: `${song.name} - ${stems[i].name}`, bytes: await engine.renderWav(stems[i].project) });
      }
      toast(`${stems.length} stems exported.`, { label: 'Show files', run: () => window.melody.reveal(last) });
      return;
    }
    let bytes;
    if (kind === 'midi') bytes = encodeMidi(project);
    else {
      toast('Making your audio file…');
      await engine.boot();
      bytes = await engine.renderWav(project);
      if (kind === 'mp3') bytes = await toMp3(bytes);
    }
    const file = await window.melody.exportFile({ kind, name: song.name, bytes });
    if (file) toast('Exported.', { label: 'Show file', run: () => window.melody.reveal(file) });
  } catch { toast("Couldn't export. Try another folder."); } finally { exporting = false; }
}

const actions = {
  new: newSong, open, save: () => save(false), saveAs: () => save(true), wav: () => exportAs('wav'), mp3: () => exportAs('mp3'), stems: () => exportAs('stems'), midi: () => exportAs('midi'),
  selectAll: () => { const el = document.activeElement; if (el?.tagName === 'INPUT' && el.type === 'text') el.select(); else selectAll(); },
  undo: () => { if (document.activeElement === $('songName')) document.execCommand('undo'); else travel(past, future); },
  redo: () => { if (document.activeElement === $('songName')) document.execCommand('redo'); else { if (!future.length) return; const f = future; travel(f, past); } },
};
window.melody.onMenu((a) => actions[a]?.());
window.melody.onOpenSong((s) => openSong(s));
window.addEventListener('beforeunload', () => { if (changed.t) window.melody.autosaveNow(serialize()); });

// ---------------------------------------------------------------- wiring
for (let i = 0; i < 12; i++) $('key').add(new Option(NOTE_NAMES[i], i));
for (const [id, s] of Object.entries(SCALES)) $('scale').add(new Option(s.name, id));
for (const id of Object.keys(METERS)) $('meter').add(new Option(id, id));
$('play').onclick = toggle;
$('playSong').onclick = playSong;
$('undo').onclick = actions.undo; $('redo').onclick = actions.redo;
$('newSong').onclick = newSong; $('open').onclick = open; $('save').onclick = () => save(false);
$('exportMenu').onchange = (e) => { const kind = e.target.value; e.target.value = ''; if (kind) exportAs(kind); };
$('hum').onclick = hum;
$('cancelHum').onclick = () => { engine.stop(); endSession(); };
$('key').onchange = (e) => { commit(() => { song.key = Number(e.target.value); }); renderStarters(); renderPads(); };
$('scale').onchange = (e) => { setScale(e.target.value); renderStarters(); renderPads(); };
$('bars').onchange = (e) => setBars(Number(e.target.value));
$('meter').onchange = (e) => setMeter(e.target.value);
let bpmStart = null;
$('bpm').oninput = (e) => {
  if (bpmStart === null) { bpmStart = JSON.stringify(song); }
  song.bpm = Number(e.target.value); $('bpmOut').textContent = `${song.bpm} BPM`;
  retime();
};
$('bpm').onchange = () => { if (bpmStart) { past.push(bpmStart); future = []; bpmStart = null; changed(); } };
let swingStart = null;
$('swing').oninput = (e) => { swingStart ??= JSON.stringify(song); song.swing = Number(e.target.value); };
$('swing').onchange = () => { if (swingStart) { past.push(swingStart); future = []; swingStart = null; changed(); } };
$('songName').oninput = (e) => { song.name = e.target.value; changed(); };
$('songName').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
window.addEventListener('keydown', (e) => {
  if ($('help').open || e.code !== 'Space' || /^(INPUT|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range') return;
  e.preventDefault();
  if (!session) toggle();
});
$('rec').onclick = toggleRec;
$('tap').onclick = () => tapTempo();
$('metronome').onclick = () => setMetronome(!engine.metronome);
$('ghosts').onchange = (e) => { showGhosts = e.target.checked; draw(); };
$('noteTools').onchange = (e) => { const tool = e.target.value; e.target.value = ''; if (tool) noteTool(tool); };
$('helpBtn').onclick = () => $('help').showModal();
$('helpClose').onclick = () => $('help').close();
$('help').onclick = (e) => { if (e.target === $('help')) $('help').close(); };
ruler.addEventListener('pointerdown', (e) => {
  const m = metrics(), beat = METERS[song.meter].beatSteps, x = e.clientX - ruler.getBoundingClientRect().left - GUTTER;
  const step = Math.max(0, Math.min(m.steps - 1, Math.floor(x / m.cw) + scroll));
  playFrom(Math.floor(step / beat) * beat);
});
$('snap').onchange = (e) => { snap = Number(e.target.value); };
$('zoom').onchange = (e) => { zoomBars = Number(e.target.value); scroll = 0; draw(); };
let velStart = null;
$('velocity').oninput = (e) => {
  if (!selection.size) return;
  velStart ??= JSON.stringify(song);
  for (const n of selection) n.vel = Number(e.target.value);
  draw();
};
$('velocity').onchange = () => { if (velStart) { past.push(velStart); future = []; velStart = null; changed(); } };
document.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') e.target.blur(); });
// A closed dropdown keeps focus after use, so only real text fields may take keys away from the instrument.
const typing = (el) => el?.tagName === 'INPUT' && el.type !== 'range';
document.addEventListener('copy', (e) => { if (!typing(document.activeElement) && copySelected()) e.preventDefault(); });
document.addEventListener('cut', (e) => { if (!typing(document.activeElement) && copySelected()) { e.preventDefault(); removeSelected(); } });
document.addEventListener('paste', (e) => { if (!typing(document.activeElement) && clip) { e.preventDefault(); pasteClip(); } });
window.addEventListener('keydown', (e) => {
  if (typing(e.target) || session || $('help').open) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod) {
    if (e.code === 'KeyD' && selection.size) { e.preventDefault(); copySelected(); pasteClip(); }
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); removeSelected(); return; }
  if (e.code === 'Escape') { selection.clear(); draw(); return; }
  const arrows = { ArrowLeft: [-snap, 0], ArrowRight: [snap, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.code];
  if (arrows && selection.size) {
    e.preventDefault();
    const octave = e.shiftKey ? SCALES[song.scale].steps.length : 1;
    nudge(arrows[0], arrows[1] * octave);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyR') { toggleRec(); return; }
  if (e.code === 'KeyM') { setMetronome(!engine.metronome); return; }
  if (e.code === 'KeyT') { tapTempo(); return; }
  if (e.code === 'Slash' && e.shiftKey) { $('help').showModal(); return; }
  if (e.code === 'KeyZ' || e.code === 'KeyX') {
    liveOctave = Math.max(0, Math.min(1, liveOctave + (e.code === 'KeyX' ? 1 : -1)));
    renderPads();
    toast(liveOctave ? 'Keyboard: high notes' : 'Keyboard: low notes');
    return;
  }
  const i = KEY_ROW.indexOf(e.code);
  if (i < 0) return;
  e.preventDefault();
  const n = SCALES[song.scale].steps.length;
  liveOn(e.code, track().kind === 'drums' ? i : i + n * liveOctave);
});
window.addEventListener('keyup', (e) => liveOff(e.code));
window.addEventListener('blur', () => { for (const id of [...held.keys()]) liveOff(id); });
connectMidi();
new ResizeObserver(resize).observe($('rollWrap'));

const auto = await window.melody.autosaveLoad();
if (auto) { try { const raw = JSON.parse(auto); song = sanitize(raw); await restoreAudio(raw, song); dirty = !raw.clean && hasWork(); } catch { song = blank(); dirty = false; } }
renderAll();
$('undo').disabled = true; $('redo').disabled = true;
animate();
// A song opened from Finder or Explorer still asks first if the last session had unsaved work.
const pending = await window.melody.songPending();
if (pending) await openSong(pending);
if (info.test) window.__melody = { get song() { return song; }, get dirty() { return dirty; }, setAsk: (fn) => { askUnsaved = fn; }, keepWork, openSong, newSong, showChords, engine, select: (id) => { selected = id; selection.clear(); renderTracks(); renderStarters(); renderPads(); renderFx(); draw(); }, hum, exportBytes: () => engine.renderWav(flatten(song)), midiBytes: () => encodeMidi(flatten(song)), flatten: () => flatten(song), playSong, serializeFile, loadSong, mp3Bytes: async () => [...(await toMp3(await engine.renderWav(flatten(song)))).slice(0, 4)], stemCount: () => stemsOf(flatten(song)).length, renderStem: async (i) => { const b = await engine.renderWav(stemsOf(flatten(song))[i].project), v = new DataView(b.buffer); let p = 0; for (let k = 44; k + 1 < b.length; k += 2) p = Math.max(p, Math.abs(v.getInt16(k, true))); return { size: b.length, peak: p }; }, noteTool, playFrom, tapTempo, setMetronome, selection, selectAll, copySelected, pasteClip, removeSelected, nudge, toggleRec, get recording() { return recording; } };
document.documentElement.dataset.ready = '1';
