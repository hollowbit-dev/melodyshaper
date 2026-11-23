// Song structure. A song is a list of section blocks; repeated blocks share the same notes.
// The section being edited lives on the tracks (track.notes / track.hits); every other section lives in section.parts.
import { METERS } from './theory.mjs';

export const SECTION_NAMES = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];
const copyPart = (t, p) => {
  if (t.kind === 'audio') return { clips: (p?.clips || []).map((c) => ({ ...c })) };
  if (t.kind === 'drums') return { hits: (p?.hits || []).map((h) => ({ ...h })) };
  return { notes: (p?.notes || []).map((n) => ({ ...n })) };
};
const section = (song, id) => song.sections.find((s) => s.id === id);

export function storeActive(song) {
  const s = section(song, song.active);
  s.bars = song.bars;
  s.parts = Object.fromEntries(song.tracks.map((t) => [t.id, copyPart(t, t)]));
}

export function loadSection(song, id) {
  const s = section(song, id);
  song.active = id;
  song.bars = s.bars;
  for (const t of song.tracks) Object.assign(t, copyPart(t, s.parts[t.id]));
}

export function initSections(song) {
  song.sections = [{ id: 's1', name: 'Verse', bars: song.bars, parts: {} }];
  song.active = 's1';
  song.arrangement = ['s1'];
  storeActive(song);
  return song;
}

export function switchSection(song, id) {
  if (id === song.active) return;
  storeActive(song);
  loadSection(song, id);
}

const nextId = (song) => {
  let n = 1;
  while (section(song, `s${n}`)) n++;
  return `s${n}`;
};

// A new section keeps the groove (drums, chords, bass) and leaves the melody free.
export function addSection(song, name) {
  storeActive(song);
  const from = section(song, song.active), id = nextId(song), parts = {};
  for (const t of song.tracks) parts[t.id] = t.role === 'melody' ? copyPart(t, null) : copyPart(t, from.parts[t.id]);
  song.sections.push({ id, name, bars: from.bars, parts });
  song.arrangement.push(id);
  loadSection(song, id);
  return id;
}

export function repeatSection(song, id) {
  storeActive(song);
  song.arrangement.push(id);
  loadSection(song, id);
}

export function removeBlock(song, index) {
  if (song.arrangement.length < 2) return false;
  storeActive(song);
  const [id] = song.arrangement.splice(index, 1);
  if (!song.arrangement.includes(id)) {
    song.sections = song.sections.filter((s) => s.id !== id);
    if (song.active === id) loadSection(song, song.arrangement[Math.min(index, song.arrangement.length - 1)]);
  }
  return true;
}

export function moveBlock(song, from, to) {
  const list = song.arrangement;
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return false;
  const [id] = list.splice(from, 1);
  list.splice(to, 0, id);
  return true;
}

export function removeTrack(song, id) {
  if (song.tracks.length < 2) return false;
  storeActive(song);
  song.tracks = song.tracks.filter((t) => t.id !== id);
  for (const s of song.sections) delete s.parts[id];
  return true;
}

// A full copy of a track, in every section, placed right below the original.
export function duplicateTrack(song, id) {
  storeActive(song);
  const at = song.tracks.findIndex((t) => t.id === id), from = song.tracks[at];
  let n = 1;
  while (song.tracks.some((t) => t.id === `${from.role}-${n}`)) n++;
  const copy = { ...from, id: `${from.role}-${n}`, name: `${from.name.slice(0, 19)} copy`, fx: { ...from.fx }, solo: false, ...copyPart(from, from) };
  song.tracks.splice(at + 1, 0, copy);
  for (const s of song.sections) s.parts[copy.id] = copyPart(from, s.parts[id]);
  return copy.id;
}

// Repeated blocks share notes. This gives one block its own copy to change freely.
export function unlinkBlock(song, index) {
  storeActive(song);
  const from = section(song, song.arrangement[index]);
  if (!from || song.arrangement.filter((x) => x === from.id).length < 2) return null;
  const id = nextId(song), base = from.name.replace(/ \d+$/, '');
  let k = 2;
  while (song.sections.some((s) => s.name === `${base} ${k}`)) k++;
  const parts = Object.fromEntries(song.tracks.map((t) => [t.id, copyPart(t, from.parts[t.id])]));
  song.sections.push({ id, name: `${base} ${k}`.slice(0, 20), bars: from.bars, parts });
  song.arrangement[index] = id;
  loadSection(song, id);
  return id;
}

// Runs fn(part, track, section) on every section's copy of every track.
export function forEachPart(song, fn) {
  storeActive(song);
  for (const s of song.sections) for (const t of song.tracks) fn(s.parts[t.id] ||= copyPart(t, null), t, s);
  loadSection(song, song.active);
}

// The whole song as one long part, for playback and export.
export function flatten(song) {
  storeActive(song);
  const barSteps = METERS[song.meter].barSteps;
  const tracks = song.tracks.map((t) => ({ ...t, ...copyPart(t, null) }));
  let offset = 0, bars = 0;
  const blocks = [];
  for (const id of song.arrangement) {
    const s = section(song, id);
    for (const t of tracks) {
      const p = s.parts[t.id];
      if (t.kind === 'audio') for (const c of p?.clips || []) t.clips.push({ ...c, step: c.step + offset });
      else if (t.kind === 'drums') for (const h of p?.hits || []) t.hits.push({ ...h, step: h.step + offset });
      else for (const n of p?.notes || []) t.notes.push({ ...n, step: n.step + offset });
    }
    blocks.push({ id, start: offset, end: offset + s.bars * barSteps });
    offset += s.bars * barSteps;
    bars += s.bars;
  }
  return { ...song, tracks, bars, blocks };
}
