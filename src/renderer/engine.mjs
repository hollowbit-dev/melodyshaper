import { degToMidi, expandStyle, METERS, stepSeconds, TRACK_BASE } from './theory.mjs';

const LOOKAHEAD = 0.14;
const DRUM_LEVEL = { hat: 0.5, openhat: 0.5, shaker: 0.5, tamb: 0.5, cowbell: 0.55, crash: 0.6, conga: 0.75, ride: 0.45, rim: 0.7, lowconga: 0.75, bongo: 0.7, lowbongo: 0.7, claves: 0.55, woodblock: 0.55, agogo: 0.5, triangle: 0.4, guiro: 0.5, cabasa: 0.45, sleigh: 0.45, gong: 0.55 };
const DEFAULT_FX = { pan: 0, reverb: 0.16, echo: 0, tone: 0 };
const GM_PROGRAM = { piano: 0, grand: 0, epiano: 4, organ: 19, glock: 9, vibes: 11, marimba: 12, chimes: 14, kalimba: 108, strum: 25, bass: 32, viola: 41, cello: 42, pizz: 45, harp: 46, strings: 48, trumpet: 56, trombone: 57, horn: 60, sax: 66, oboe: 68, clarinet: 71, flute: 73, harpsichord: 6, clavi: 7, xylo: 13, handchimes: 14, folkharp: 46, dantranh: 107, mbira: 108, violinpizz: 45, cellopizz: 45, violin: 40, tremolo: 44, bowedbass: 43, piccolo: 72, recorder: 74, ocarina: 79, harmonica: 22, saxello: 64, bassoon: 70, tuba: 58, mutetrumpet: 59 };
export const GM_DRUM = { kick: 36, snare: 38, clap: 39, hat: 42, tom: 47, shaker: 70, openhat: 46, crash: 49, tamb: 54, cowbell: 56, conga: 63, ride: 51, rim: 37, lowtom: 45, lowconga: 64, bongo: 60, lowbongo: 61, cajon: 35, cajonslap: 40, framedrum: 41, darbuka: 62, claves: 75, woodblock: 76, agogo: 67, triangle: 81, guiro: 73, cabasa: 69, sleigh: 83, gong: 52 };
// Amp sounds for a guitar track. The recording stays clean, so the sound can be changed after playing.
export const AMPS = [
  { id: 'clean', name: 'Clean', drive: 1.2, low: 70, high: 9000, level: 1 },
  { id: 'warm', name: 'Warm', drive: 2.5, low: 80, high: 5200, level: 0.9 },
  { id: 'crunch', name: 'Crunch', drive: 7, low: 90, high: 5600, level: 0.62 },
  { id: 'drive', name: 'Overdrive', drive: 18, low: 100, high: 5000, level: 0.5 },
  { id: 'lead', name: 'Lead', drive: 42, low: 130, high: 4400, level: 0.42 },
];
function ampCurve(drive) {
  const curve = new Float32Array(2049), top = Math.tanh(drive);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i - 1024) / 1024) * drive) / top;
  return curve;
}

const DRIVE = 1.3; // how hard the mix is pushed into the limiter
const RING_SECONDS = 3;

// How a finished song ends: the last notes ring out, or the last two bars fade away.
export function endingPlan(project) {
  const m = METERS[project.meter], total = project.bars * m.barSteps, stepSec = stepSeconds(project.bpm, project.meter);
  if (project.ending === 'fade') {
    const steps = Math.min(m.barSteps * 2, Math.floor(total / 2));
    return { ring: 0, fadeFrom: total - steps, tail: 0.15, total, stepSec };
  }
  return { ring: RING_SECONDS, fadeFrom: total, tail: RING_SECONDS, total, stepSec };
}

function fadeOut(param, at, seconds, ring) {
  const curve = new Float32Array(64);
  for (let i = 0; i < curve.length; i++) {
    const x = i / (curve.length - 1);
    curve[i] = ring ? Math.pow(1 - x, 2.5) : Math.pow(Math.cos((x * Math.PI) / 2), 2);
  }
  param.setValueCurveAtTime(curve, at, Math.max(0.02, seconds));
}

function impulse(ctx) {
  const len = Math.floor(ctx.sampleRate * 1.3), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let seed = 22222 + c * 7919, low = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      low += ((seed / 1073741823.5 - 1) - low) * 0.42;
      d[i] = low * Math.pow(1 - i / len, 3.2);
    }
  }
  return b;
}

export class Engine {
  constructor(manifest) {
    this.manifest = manifest;
    this.inst = Object.fromEntries(manifest.instruments.map((i) => [i.id, i]));
    this.buffers = new Map();
    this.loading = new Map();
    this.ctx = null;
    this.playing = false;
    this.exclude = null;
    this.click = false;
    this.voices = new Set();
    this.skipOnce = new WeakSet();
    this.audio = new Map();
    this.metronome = false;
    this.styleCache = new WeakMap();
  }

  // Chord styles are worked out once per edit, because this runs on every step of playback.
  played(t, meter) {
    if (t.role !== 'chords' || !t.style || t.style === 'block') return t.notes;
    const hit = this.styleCache.get(t.notes);
    if (hit && hit.style === t.style && hit.meter === meter && hit.size === t.notes.length) return hit.list;
    const list = expandStyle(t.notes, t.style, meter);
    this.styleCache.set(t.notes, { style: t.style, meter, size: t.notes.length, list });
    return list;
  }
  invalidate() { this.styleCache = new WeakMap(); }

  async boot() {
    if (!this.ctx) {
      this.booting ||= (async () => {
        const ctx = new AudioContext({ latencyHint: 'interactive' });
        const limited = await this.addLimiter(ctx);
        this.limitDelay = limited ? Math.max(2, Math.round(ctx.sampleRate * 0.005)) / ctx.sampleRate : 0;
        this.graph = this.buildGraph(ctx, limited);
        this.ctx = ctx;
      })();
      await this.booting;
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  async addLimiter(ctx) {
    try { await ctx.audioWorklet.addModule('limiter-worklet.js'); return true; } catch { return false; }
  }

  buildGraph(ctx, limited = false) {
    const master = ctx.createGain(); master.gain.value = 0.85;
    const ending = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.18;
    const verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
    const delay = ctx.createDelay(2), feedback = ctx.createGain(), damp = ctx.createBiquadFilter();
    feedback.gain.value = 0.36; damp.type = 'lowpass'; damp.frequency.value = 3200;
    delay.connect(damp); damp.connect(feedback); feedback.connect(delay); damp.connect(master);
    verb.connect(master); master.connect(ending); ending.connect(comp);
    if (limited) {
      const drive = ctx.createGain(); drive.gain.value = DRIVE;
      const limiter = new AudioWorkletNode(ctx, 'melody-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      comp.connect(drive); drive.connect(limiter); limiter.connect(ctx.destination);
    } else comp.connect(ctx.destination);
    return { master, ending, verb, delay, tracks: new Map() };
  }

  // Each track: volume -> tone -> pan -> mix, with sends to the shared reverb and echo.
  trackBus(ctx, graph, track, soloed) {
    let bus = graph.tracks.get(track.id);
    if (!bus) {
      const input = ctx.createGain(), tone = ctx.createBiquadFilter(), pan = ctx.createStereoPanner(), verbSend = ctx.createGain(), echoSend = ctx.createGain();
      tone.type = 'highshelf'; tone.frequency.value = 2400;
      let amp = null;
      if (track.role === 'guitar') {
        amp = { shaper: ctx.createWaveShaper(), low: ctx.createBiquadFilter(), high: ctx.createBiquadFilter(), level: ctx.createGain() };
        amp.shaper.oversample = '4x'; amp.low.type = 'highpass'; amp.high.type = 'lowpass';
        input.connect(amp.shaper); amp.shaper.connect(amp.low); amp.low.connect(amp.high); amp.high.connect(amp.level); amp.level.connect(tone);
      } else input.connect(tone);
      tone.connect(pan); pan.connect(graph.master);
      pan.connect(verbSend); verbSend.connect(graph.verb);
      pan.connect(echoSend); echoSend.connect(graph.delay);
      bus = { input, tone, pan, verbSend, echoSend, amp, ampId: '', key: '' };
      graph.tracks.set(track.id, bus);
    }
    if (bus.amp && bus.ampId !== (track.amp || 'crunch')) {
      const a = AMPS.find((x) => x.id === track.amp) || AMPS[2];
      bus.amp.shaper.curve = ampCurve(a.drive); bus.amp.low.frequency.value = a.low; bus.amp.high.frequency.value = a.high; bus.amp.level.gain.value = a.level;
      bus.ampId = a.id;
    }
    const on = !track.mute && (!soloed || track.solo), fx = track.fx || DEFAULT_FX;
    const key = `${on ? track.vol : 0}|${fx.pan}|${fx.reverb}|${fx.echo}|${fx.tone}`;
    if (key !== bus.key) {
      const offline = ctx instanceof OfflineAudioContext;
      const set = (param, v) => { if (offline) param.value = v; else param.setTargetAtTime(v, ctx.currentTime, 0.012); };
      set(bus.input.gain, on ? track.vol : 0);
      set(bus.pan.pan, fx.pan);
      set(bus.verbSend.gain, fx.reverb);
      set(bus.echoSend.gain, fx.echo);
      set(bus.tone.gain, fx.tone * 10);
      bus.key = key;
    }
    return bus.input;
  }

  syncMix(project) {
    if (!this.ctx) return;
    const soloed = project.tracks.some((t) => t.solo);
    for (const t of project.tracks) this.trackBus(this.ctx, this.graph, t, soloed);
  }

  setClip(id, samples, sampleRate) {
    const b = new AudioBuffer({ length: Math.max(1, samples.length), numberOfChannels: 1, sampleRate });
    b.copyToChannel(samples, 0);
    this.audio.set(id, b);
    return b;
  }

  removeBus(id) {
    const bus = this.graph?.tracks.get(id);
    if (bus) { bus.input.disconnect(); if (bus.amp) Object.values(bus.amp).forEach((n) => n.disconnect()); bus.tone.disconnect(); bus.pan.disconnect(); bus.verbSend.disconnect(); bus.echoSend.disconnect(); this.graph.tracks.delete(id); }
  }

  async load(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    if (!this.loading.has(file)) {
      this.loading.set(file, (async () => {
        const res = await fetch(`samples/${file}`);
        if (!res.ok) throw new Error(`Missing sound: ${file}`);
        const decoder = this.ctx || new OfflineAudioContext(2, 1, 48000);
        const buf = await decoder.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(file, buf);
        return buf;
      })());
    }
    return this.loading.get(file);
  }

  async ensure(project) {
    const files = new Set();
    for (const t of project.tracks) {
      if (t.kind === 'drums') this.manifest.drums.forEach((d) => files.add(d.file));
      else if (t.kind === 'inst') this.inst[t.inst].zones.forEach((z) => files.add(z.file));
    }
    await Promise.all([...files].map((f) => this.load(f)));
  }

  zone(instId, midi) {
    let best = null, gap = Infinity;
    for (const z of this.inst[instId].zones) {
      const g = Math.abs(z.root - midi);
      if (g < gap) { gap = g; best = z; }
    }
    return best;
  }

  voice(ctx, out, instId, midi, when, dur, vel = 0.8, live = false) {
    const def = this.inst[instId], z = this.zone(instId, midi), buffer = this.buffers.get(z.file);
    if (!buffer) return;
    const src = ctx.createBufferSource(), env = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (midi - z.root - z.cents / 100) / 12);
    const attack = def.sustain ? 0.025 : 0.002, end = when + Math.max(0.06, dur);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(vel, when + attack);
    env.gain.setValueAtTime(vel, end);
    env.gain.setTargetAtTime(0, end, def.release / 3);
    src.connect(env); env.connect(out);
    src.start(when);
    src.stop(end + def.release * 2);
    if (live) { this.voices.add(src); src.onended = () => { this.voices.delete(src); env.disconnect(); }; }
  }

  drum(ctx, out, id, when, vel = 0.9, live = false) {
    const buffer = this.buffers.get(`drums/${id}.opus`);
    if (!buffer) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffer; g.gain.value = vel;
    src.connect(g); g.connect(out); src.start(when);
    if (live) { this.voices.add(src); src.onended = () => { this.voices.delete(src); g.disconnect(); }; }
  }

  scheduleStep(ctx, graph, project, step, when, live, ring = 0) {
    const stepSec = stepSeconds(project.bpm, project.meter), soloed = project.tracks.some((t) => t.solo);
    const m = METERS[project.meter], lastBeat = project.bars * m.barSteps - m.countSteps;
    graph.delay.delayTime.value = Math.min(1.9, stepSec * 3);
    // Swing pushes every second eighth note late. 6/8 already has its own lilt.
    if (project.swing && METERS[project.meter].den === 4 && step % 4 === 2) when += project.swing * stepSec;
    for (const t of project.tracks) {
      if (live && t.id === this.exclude) continue;
      const out = this.trackBus(ctx, graph, t, soloed);
      if (t.kind === 'audio') {
        for (const c of t.clips) {
          const buffer = this.audio.get(c.id);
          if (c.step !== step || !buffer) continue;
          const src = ctx.createBufferSource();
          src.buffer = buffer; src.connect(out); src.start(when);
          if (live) { this.voices.add(src); src.onended = () => this.voices.delete(src); }
        }
      } else if (t.kind === 'drums') {
        for (const h of t.hits) {
          if (h.step !== step) continue;
          if (live && this.skipOnce.delete(h)) continue;
          this.drum(ctx, out, h.drum, when, (DRUM_LEVEL[h.drum] ?? 0.9) * (h.vel ?? 1), live);
        }
      } else {
        for (const n of this.played(t, project.meter)) {
          if (n.step !== step) continue;
          const source = n.from || n;
          if (live && n.step === source.step && this.skipOnce.delete(source)) continue;
          this.voice(ctx, out, t.inst, degToMidi(n.deg, project.key, project.scale, TRACK_BASE[t.role]), when + (n.delay || 0), n.len * stepSec * 0.96 + (ring && n.step + n.len > lastBeat ? ring : 0), (t.role === 'chords' ? 0.5 : 0.78) * (n.vel ?? 1), live);
        }
      }
    }
  }

  tick(ctx, at, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.22, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.035);
    o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 0.04);
  }

  start(project, { delay = 0.06, from = 0, loop = true, onEnd = null, ending = false } = {}) {
    this.stop();
    this.project = project;
    this.playing = true;
    this.loop = loop;
    this.onEnd = onEnd;
    this.ending = ending;
    this.faded = false;
    this.step = from;
    this.t0 = this.ctx.currentTime + delay - from * stepSeconds(project.bpm, project.meter);
    this.nextTime = this.ctx.currentTime + delay;
    this.pump();
    this.timer = setInterval(() => this.pump(), 25);
    return this.t0;
  }

  pump() {
    if (!this.playing) return;
    const p = this.project, stepSec = stepSeconds(p.bpm, p.meter), m = METERS[p.meter], total = p.bars * m.barSteps;
    const plan = this.ending ? endingPlan(p) : null;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      if (this.step >= total) {
        if (!this.loop && plan) {
          // Stop adding notes, and let the ones already playing finish before the song ends.
          clearInterval(this.timer);
          this.finishing = true;
          if (plan.ring) fadeOut(this.graph.ending.gain, this.nextTime, plan.ring, true);
          const done = this.onEnd;
          this.endTimer = setTimeout(() => { this.stop(); if (done) done(); }, Math.max(0, this.nextTime + plan.tail - this.ctx.currentTime) * 1000);
          return;
        }
        if (!this.loop) {
          const done = this.onEnd;
          this.stop();
          if (done) done();
          return;
        }
        this.step = 0;
        this.t0 = this.nextTime;
      }
      if (plan && !plan.ring && !this.faded && this.step >= plan.fadeFrom) {
        this.faded = true;
        fadeOut(this.graph.ending.gain, this.nextTime, (total - this.step) * stepSec + plan.tail, false);
      }
      this.scheduleStep(this.ctx, this.graph, p, this.step, this.nextTime, true, plan?.ring || 0);
      if ((this.click || this.metronome) && this.step % m.countSteps === 0) this.tick(this.ctx, this.nextTime, this.step % m.barSteps === 0);
      this.step++;
      this.nextTime += stepSec;
    }
  }

  position() {
    if (!this.playing) return null;
    const p = this.project, lat = (this.ctx.outputLatency || 0) + (this.limitDelay || 0);
    const total = p.bars * METERS[p.meter].barSteps, s = (this.ctx.currentTime - lat - this.t0) / stepSeconds(p.bpm, p.meter);
    if (!this.loop && s >= total) return total - 0.001;
    return s < 0 ? (this.loop ? s + total : 0) : s % total;
  }

  stop() {
    this.playing = false;
    this.finishing = false;
    clearInterval(this.timer);
    clearTimeout(this.endTimer);
    const fade = this.graph?.ending.gain;
    if (fade) { fade.cancelScheduledValues(0); fade.setValueAtTime(1, this.ctx.currentTime); }
    for (const v of this.voices) { try { v.stop(); } catch { /* already ended */ } }
    this.voices.clear();
  }

  preview(project, track, deg) {
    if (!this.ctx) return;
    const out = this.trackBus(this.ctx, this.graph, { ...track, mute: false }, false);
    const midi = degToMidi(deg, project.key, project.scale, TRACK_BASE[track.role]);
    this.voice(this.ctx, out, track.inst, midi, this.ctx.currentTime + 0.005, 0.35, 0.7, true);
    this.syncMix(project);
  }

  // A note held on a keyboard: it rings until stop() is called.
  liveVoice(project, track, deg, vel = 0.8) {
    const ctx = this.ctx, def = this.inst[track.inst], midi = degToMidi(deg, project.key, project.scale, TRACK_BASE[track.role]);
    const z = this.zone(track.inst, midi), buffer = this.buffers.get(z.file);
    if (!buffer) return null;
    const out = this.trackBus(ctx, this.graph, { ...track, mute: false }, false);
    this.syncMix(project);
    const src = ctx.createBufferSource(), env = ctx.createGain(), at = ctx.currentTime + 0.003;
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (midi - z.root - z.cents / 100) / 12);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vel, at + (def.sustain ? 0.025 : 0.002));
    src.connect(env); env.connect(out); src.start(at);
    this.voices.add(src);
    src.onended = () => { this.voices.delete(src); env.disconnect(); };
    return { stop: () => {
      const now = ctx.currentTime;
      env.gain.cancelScheduledValues(now);
      env.gain.setTargetAtTime(0, now, def.release / 3);
      try { src.stop(now + def.release * 2); } catch { /* already ended */ }
    } };
  }

  previewDrum(project, track, id, vel = 0.9) {
    if (!this.ctx) return;
    this.drum(this.ctx, this.trackBus(this.ctx, this.graph, { ...track, mute: false }, false), id, this.ctx.currentTime + 0.005, vel, true);
    this.syncMix(project);
  }

  async renderWav(project) {
    await this.ensure(project);
    const rate = 44100, plan = endingPlan(project), { stepSec, total } = plan, seconds = 0.01 + total * stepSec + plan.tail + 0.02;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    // Stems skip the limiter, so they stay clean and add up properly in another music app.
    const graph = this.buildGraph(ctx, !project.stem && await this.addLimiter(ctx));
    graph.delay.delayTime.value = Math.min(1.9, stepSec * 3);
    for (let s = 0; s < total; s++) this.scheduleStep(ctx, graph, project, s, 0.01 + s * stepSec, false, plan.ring);
    const fadeAt = 0.01 + plan.fadeFrom * stepSec;
    fadeOut(graph.ending.gain, fadeAt, plan.ring || (total - plan.fadeFrom) * stepSec + plan.tail, !!plan.ring);
    return encodeWav(await ctx.startRendering());
  }
}

export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, n = buffer.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const text = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); text(8, 'WAVEfmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  text(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let peak = 0;
  for (const d of data) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, Math.round(data[c][i] * gain * 32767), true);
  return new Uint8Array(out.buffer);
}

export function encodeMidi(project) {
  const vlq = (v) => { const b = [v & 127]; while ((v >>= 7)) b.unshift((v & 127) | 128); return b; };
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const chunk = (id, body) => [...id].map((c) => c.charCodeAt(0)).concat(u32(body.length), body);
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0) & 127);
  const TICKS = 24;
  const tempo = Math.round(stepSeconds(project.bpm, project.meter) * 4 * 1000000); // MIDI tempo always counts quarter notes
  const tracks = [chunk('MTrk', [0, 255, 81, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 255, 88, 4, ...METERS[project.meter].midi, 0, 255, 47, 0])];
  let channel = 0;
  for (const t of project.tracks) {
    if (t.kind === 'audio') continue; // MIDI holds notes, not recorded sound
    const isDrum = t.kind === 'drums';
    if (!isDrum && channel === 9) channel++;
    const ch = isDrum ? 9 : channel++;
    const ev = [];
    if (isDrum) for (const h of t.hits) { ev.push({ at: h.step * TICKS, on: 1, n: GM_DRUM[h.drum], v: Math.max(1, Math.round(100 * (h.vel ?? 1))) }); ev.push({ at: h.step * TICKS + 6, on: 0, n: GM_DRUM[h.drum], v: 0 }); }
    else for (const n of expandStyle(t.notes, t.role === 'chords' ? t.style : null, project.meter)) {
      const m = degToMidi(n.deg, project.key, project.scale, TRACK_BASE[t.role]);
      const late = Math.round(((n.delay || 0) / stepSeconds(project.bpm, project.meter)) * TICKS);
      ev.push({ at: n.step * TICKS + late, on: 1, n: m, v: Math.max(1, Math.round(96 * (n.vel ?? 1))) }); ev.push({ at: Math.max(n.step * TICKS + late + 1, (n.step + n.len) * TICKS), on: 0, n: m, v: 0 });
    }
    ev.sort((a, b) => a.at - b.at || a.on - b.on);
    const name = ascii(t.name);
    const body = [0, 255, 3, name.length, ...name];
    if (!isDrum) body.push(0, 0xc0 | ch, GM_PROGRAM[t.inst] ?? 0);
    let last = 0;
    for (const e of ev) { body.push(...vlq(e.at - last), (e.on ? 0x90 : 0x80) | ch, e.n, e.v); last = e.at; }
    body.push(0, 255, 47, 0);
    tracks.push(chunk('MTrk', body));
  }
  return new Uint8Array([...chunk('MThd', [0, 1, 0, tracks.length, 0, TICKS * 4]), ...tracks.flat()]);
}
