// 音频：全部用 WebAudio 实时合成（生成式 BGM + 环境音 + 音效），无需音频文件
const A = { ctx: null, on: { music: true, sfx: true }, mood: null, step: 0, nextT: 0, timer: null, song: null };
try { const s = JSON.parse(localStorage.getItem('island.audio') || '{}'); Object.assign(A.on, s); } catch { /* 无痕模式 */ }

const midi = m => 440 * 2 ** ((m - 69) / 12);
let noiseBuf, reverb;

export function initAudio() {
  if (A.ctx) { A.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  const ctx = A.ctx = new C();
  A.master = ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(ctx.destination);
  A.music = ctx.createGain(); A.music.gain.value = A.on.music ? 0.55 : 0; A.music.connect(A.master);
  A.sfx = ctx.createGain(); A.sfx.gain.value = A.on.sfx ? 0.8 : 0; A.sfx.connect(A.master);
  A.amb = ctx.createGain(); A.amb.gain.value = A.on.sfx ? 0.5 : 0; A.amb.connect(A.master);
  // 白噪声与混响
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  reverb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length) ** 2.4; }
  reverb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.32; reverb.connect(wet); wet.connect(A.music);
  initAmbience();
  A.timer = setInterval(schedule, 25);
  document.addEventListener('visibilitychange', () => document.hidden ? ctx.suspend() : ctx.resume());
}

export function setEnabled(kind, on) {
  A.on[kind] = on;
  try { localStorage.setItem('island.audio', JSON.stringify(A.on)); } catch { /* ignore */ }
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  if (kind === 'music') A.music.gain.setTargetAtTime(on ? 0.55 : 0, t, 0.2);
  else { A.sfx.gain.setTargetAtTime(on ? 0.8 : 0, t, 0.1); A.amb.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.3); }
}
export const isEnabled = kind => A.on[kind];

/* ================== 乐器 ================== */
function env(g, t, a, peak, dec, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + dec);
}
function out(node, send = 0.4) {
  node.connect(A.music);
  if (send) { const s = A.ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(reverb); }
}
function pluck(t, m, vol = 0.18, dur = 0.9) {
  const ctx = A.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
  for (const [type, mul, v] of [['triangle', 1, 1], ['sine', 2, 0.35]]) {
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = midi(m) * mul; og.gain.value = v;
    o.connect(og); og.connect(f); o.start(t); o.stop(t + dur + 0.05);
  }
  env(g, t, 0.006, vol, dur); f.connect(g); out(g, 0.35);
}
function bell(t, m, vol = 0.1, dur = 2.2) {
  const ctx = A.ctx, g = ctx.createGain();
  for (const [mul, v] of [[1, 1], [2.76, 0.4], [5.4, 0.15]]) {
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = midi(m) * mul; og.gain.value = v;
    o.connect(og); og.connect(g); o.start(t); o.stop(t + dur);
  }
  env(g, t, 0.01, vol, dur); out(g, 0.7);
}
function pad(t, notes, dur, vol = 0.05, cutoff = 900) {
  const ctx = A.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = cutoff; f.connect(g);
  for (const m of notes) for (const det of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(m); o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + dur + 1.6);
  }
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(1.2, dur * 0.4));
  g.gain.setValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
  out(g, 0.6);
}
function bass(t, m, dur, vol = 0.12) {
  const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = midi(m);
  o.connect(g); env(g, t, 0.02, vol, dur * 0.9); o.start(t); o.stop(t + dur); out(g, 0);
}
function kick(t, vol = 0.5) {
  const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  env(g, t, 0.003, vol, 0.25); o.connect(g); o.start(t); o.stop(t + 0.3); out(g, 0);
}
function tom(t, f0 = 200, vol = 0.35) {
  const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.25);
  env(g, t, 0.003, vol, 0.3); o.connect(g); o.start(t); o.stop(t + 0.35); out(g, 0.2);
}
function hat(t, vol = 0.06, open = false) {
  const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
  s.connect(f); f.connect(g); env(g, t, 0.002, vol, open ? 0.25 : 0.05); s.start(t, Math.random()); s.stop(t + 0.3); out(g, 0);
}
function shaker(t, vol = 0.04) {
  const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 5000; f.Q.value = 1;
  s.connect(f); f.connect(g); env(g, t, 0.01, vol, 0.08); s.start(t, Math.random()); s.stop(t + 0.15); out(g, 0);
}

/* ================== 生成式曲目 ==================
   每首：bpm、和弦进行（每小节一个和弦，MIDI 音高）、音阶、各声部开关 */
const SONGS = {
  title:    { bpm: 76,  prog: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]], scale: [72, 74, 76, 79, 81, 84], arp: 'broken', lead: 'bell', padVol: 0.045 },
  day:      { bpm: 104, prog: [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]], scale: [72, 74, 77, 79, 81, 84], arp: 'strum', lead: 'pluck', padVol: 0.025, perc: 'shaker', bass: true },
  forest:   { bpm: 84,  prog: [[50, 57, 60, 64], [52, 55, 59, 62], [50, 57, 60, 64], [48, 55, 59, 62]], scale: [74, 76, 77, 79, 81, 83, 86], arp: 'sparse', lead: 'bell', padVol: 0.05 },
  night:    { bpm: 70,  prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], scale: [69, 72, 74, 76, 79], arp: 'broken', lead: 'pluck', padVol: 0.05, leadVol: 0.1 },
  tense:    { bpm: 88,  prog: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], scale: [62, 64, 65, 67, 69, 70], arp: 'stab', lead: null, padVol: 0.05, bass: true },
  prep:     { bpm: 128, prog: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], scale: [76, 78, 79, 81, 83], arp: 'run', lead: null, padVol: 0.03, perc: 'drive', bass: true },
  festival: { bpm: 118, prog: [[55, 59, 62], [48, 52, 55], [50, 54, 57], [55, 59, 62]], scale: [79, 81, 83, 86, 88, 91], arp: 'strum', lead: 'pluck', padVol: 0.02, perc: 'toms', bass: true },
  storm:    { bpm: 140, prog: [[48, 51, 55], [44, 48, 51], [41, 44, 48], [43, 47, 50]], scale: [60, 63, 65, 67], arp: 'run', lead: null, padVol: 0.06, perc: 'storm', bass: true, cutoff: 600 },
  dream:    { bpm: 60,  prog: [[51, 55, 58, 62], [48, 51, 55, 58], [44, 48, 51, 55], [46, 50, 53, 58]], scale: [75, 77, 79, 82, 84, 87], arp: 'sparse', lead: 'bell', padVol: 0.05 },
  ending:   { bpm: 80,  prog: [[48, 52, 55, 59], [55, 59, 62], [57, 60, 64], [53, 57, 60, 64]], scale: [72, 74, 76, 79, 81, 84, 86], arp: 'broken', lead: 'bell', padVol: 0.06, bass: true, leadVol: 0.13 },
};

export function playMusic(mood) {
  if (!A.ctx || A.mood === mood) return;
  A.mood = mood; A.song = mood ? SONGS[mood] : null; A.step = 0;
  A.nextT = A.ctx.currentTime + 0.15;
  // 交叉淡化
  const t = A.ctx.currentTime;
  A.music.gain.cancelScheduledValues(t);
  A.music.gain.setValueAtTime(A.on.music ? 0.1 : 0, t);
  A.music.gain.linearRampToValueAtTime(A.on.music ? 0.55 : 0, t + 1.5);
}
let duckOn = false;
export function duck(on) {
  if (!A.ctx || duckOn === on) return; duckOn = on;
  A.music.gain.setTargetAtTime(A.on.music ? (on ? 0.2 : 0.55) : 0, A.ctx.currentTime, 0.3);
}

// 播放自带音轨的视频时静音全部合成音频
export function silence(on) {
  if (!A.ctx) return;
  A.master.gain.setTargetAtTime(on ? 0 : 0.9, A.ctx.currentTime, 0.15);
}

function schedule() {
  const ctx = A.ctx; if (!ctx || !A.song || ctx.state !== 'running') return;
  while (A.nextT < ctx.currentTime + 0.12) {
    playStep(A.song, A.step, A.nextT);
    A.nextT += 60 / A.song.bpm / 2; // 八分音符
    A.step++;
  }
}
function playStep(s, step, t) {
  const bar = Math.floor(step / 8) % s.prog.length, pos = step % 8, chord = s.prog[bar];
  const beat = 60 / s.bpm;
  if (pos === 0) {
    pad(t, chord.map(n => n), beat * 4, s.padVol, s.cutoff || 900);
    if (s.bass) bass(t, chord[0] - 12, beat * 2);
  }
  if (s.bass && pos === 4) bass(t, chord[0] - 12 + (s.arp === 'run' ? 7 : 0), beat * 2);
  const up = chord.map(n => n + 12);
  switch (s.arp) {
    case 'broken': if ([0, 2, 3, 5, 6].includes(pos)) pluck(t, up[[0, 2, 1, 2, 0, 1, 2, 1].at(pos) % up.length], 0.12); break;
    case 'strum': if ([0, 3, 4, 6].includes(pos)) up.forEach((n, i) => pluck(t + i * 0.018, n, 0.08, 0.5)); break;
    case 'sparse': if (pos === 0 || (pos === 5 && Math.random() < 0.6)) pluck(t, up.at(Math.floor(Math.random() * up.length)), 0.1, 1.6); break;
    case 'stab': if (pos === 0 || pos === 3 || pos === 6) up.forEach(n => pluck(t, n - 12, 0.07, 0.25)); break;
    case 'run': pluck(t, up[pos % up.length] - (pos % 2 ? 0 : 12), 0.07, 0.25); break;
  }
  // 旋律：在当前和弦附近随机游走
  if (s.lead && (pos === 0 || pos === 4 || (pos % 2 === 0 && Math.random() < 0.35))) {
    if (Math.random() < 0.75) {
      const n = s.scale.at(Math.floor(Math.random() * s.scale.length));
      s.lead === 'bell' ? bell(t, n, s.leadVol || 0.07) : pluck(t, n, s.leadVol || 0.09, 0.7);
    }
  }
  switch (s.perc) {
    case 'shaker': shaker(t, pos % 2 ? 0.03 : 0.05); break;
    case 'drive': if (pos % 4 === 0) kick(t, 0.4); hat(t, pos % 2 ? 0.05 : 0.03); break;
    case 'toms': if (pos === 0 || pos === 3 || pos === 6) tom(t, pos === 0 ? 160 : 220, 0.28); shaker(t, 0.03); break;
    case 'storm': if (pos === 0 || pos === 5) kick(t, 0.45); if (pos % 2 === 0) hat(t, 0.025); break;
  }
}

/* ================== 环境音 ================== */
const amb = {};
function noiseLoop(filterType, freq, q = 0.7) {
  const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = filterType; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(A.amb); s.start();
  return { g, f };
}
function initAmbience() {
  const ctx = A.ctx;
  amb.waves = noiseLoop('lowpass', 520);
  // 海浪起伏：LFO 调制音量
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.12;
  lfo.connect(lg); lg.connect(amb.waves.g.gain); lfo.start();
  amb.wind = noiseLoop('bandpass', 380, 0.6);
  amb.rain = noiseLoop('highpass', 2400);
  amb.fire = 0; amb.birds = 0; amb.crowd = noiseLoop('bandpass', 900, 1.4);
  setInterval(() => {
    if (!A.ctx || A.ctx.state !== 'running' || !A.on.sfx) return;
    const t = A.ctx.currentTime;
    if (amb.fire > 0.02 && Math.random() < 0.6) crackle(t + Math.random() * 0.2, amb.fire);
    if (amb.birds > 0.02 && Math.random() < 0.08) chirp(t, amb.birds);
  }, 120);
}
export function setAmbience({ waves = 0.18, wind = 0, rain = 0, fire = 0, birds = 0, crowd = 0 } = {}) {
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  amb.waves.g.gain.setTargetAtTime(waves, t, 0.8);
  amb.wind.g.gain.setTargetAtTime(wind, t, 0.8);
  amb.rain.g.gain.setTargetAtTime(rain, t, 0.8);
  amb.crowd.g.gain.setTargetAtTime(crowd, t, 0.8);
  amb.fire = fire; amb.birds = birds;
}
export function setFireLevel(v) { amb.fire = v; }
function crackle(t, vol) {
  const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 2500; f.Q.value = 3;
  s.connect(f); f.connect(g); g.connect(A.amb); env(g, t, 0.001, vol * 1.6, 0.03 + Math.random() * 0.05); s.start(t, Math.random()); s.stop(t + 0.1);
}
function chirp(t, vol) {
  const ctx = A.ctx, n = 2 + (Math.random() * 3 | 0), base = 2400 + Math.random() * 1500;
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), tt = t + i * 0.11;
    o.frequency.setValueAtTime(base, tt); o.frequency.exponentialRampToValueAtTime(base * 1.4, tt + 0.07);
    o.connect(g); g.connect(A.amb); env(g, tt, 0.005, vol * 0.3, 0.08); o.start(tt); o.stop(tt + 0.1);
  }
}

/* ================== 音效 ================== */
function tone(t, f, dur, vol, type = 'sine', to = null) {
  const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  o.connect(g); g.connect(A.sfx); env(g, t, 0.005, vol, dur); o.start(t); o.stop(t + dur + 0.05);
}
function noiseHit(t, dur, vol, type = 'lowpass', freq = 800) {
  const ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; s.connect(f); f.connect(g); g.connect(A.sfx);
  env(g, t, 0.005, vol, dur); s.start(t, Math.random()); s.stop(t + dur + 0.1);
}
const SFX = {
  click: t => tone(t, 880, 0.06, 0.12, 'triangle'),
  hover: t => tone(t, 1320, 0.03, 0.05, 'sine'),
  confirm: t => { tone(t, 660, 0.08, 0.14, 'triangle'); tone(t + 0.07, 990, 0.12, 0.14, 'triangle'); },
  page: t => noiseHit(t, 0.08, 0.08, 'bandpass', 3000),
  pick: t => { tone(t, 784, 0.1, 0.15, 'triangle'); tone(t + 0.08, 1175, 0.18, 0.15, 'triangle'); },
  quest: t => [72, 76, 79, 84].forEach((m, i) => tone(t + i * 0.09, midi(m), 0.3, 0.13, 'triangle')),
  part: t => { [72, 79, 84, 88, 91].forEach((m, i) => tone(t + i * 0.07, midi(m), 0.9, 0.09, 'sine')); noiseHit(t, 0.6, 0.05, 'highpass', 6000); },
  heart: t => { tone(t, midi(81), 0.15, 0.12, 'sine'); tone(t + 0.12, midi(88), 0.3, 0.12, 'sine'); },
  sad: t => { tone(t, midi(69), 0.25, 0.12, 'triangle'); tone(t + 0.2, midi(64), 0.4, 0.12, 'triangle'); },
  achieve: t => [76, 79, 83, 88].forEach((m, i) => tone(t + i * 0.06, midi(m), 0.5, 0.1, 'square')),
  step: t => noiseHit(t, 0.06, 0.05, 'lowpass', 500 + Math.random() * 300),
  thunder: t => { noiseHit(t, 2.6, 0.5, 'lowpass', 180); noiseHit(t, 0.3, 0.25, 'lowpass', 900); },
  splash: t => noiseHit(t, 0.5, 0.18, 'bandpass', 1200),
  gear: t => { noiseHit(t, 0.04, 0.2, 'bandpass', 2500); tone(t, 300, 0.05, 0.08, 'square'); },
  door: t => tone(t, 180, 0.5, 0.1, 'sawtooth', 120),
  pour: t => noiseHit(t, 0.6, 0.12, 'bandpass', 1800),
  wrong: t => tone(t, 220, 0.2, 0.12, 'square', 160),
  drumL: t => { tone(t, 150, 0.3, 0.5, 'sine', 80); noiseHit(t, 0.05, 0.1, 'lowpass', 1200); },
  drumH: t => { tone(t, 260, 0.25, 0.4, 'sine', 150); noiseHit(t, 0.04, 0.1, 'bandpass', 2500); },
  ignite: t => { noiseHit(t, 1.2, 0.3, 'lowpass', 1400); tone(t, 110, 1.5, 0.2, 'sine', 220); },
  whoosh: t => noiseHit(t, 0.4, 0.15, 'bandpass', 900),
  reveal: t => [60, 67, 72, 76, 79, 84].forEach((m, i) => tone(t + i * 0.12, midi(m), 1.2, 0.08, 'sine')),
};
export function sfx(name, delay = 0) {
  if (!A.ctx || !A.on.sfx || !SFX[name]) return;
  SFX[name](A.ctx.currentTime + delay);
}

// NPC 「咿咿呀呀」说话声（类似动物森友会），每个角色一个基础音高
export function babble(base = 300) {
  if (!A.ctx || !A.on.sfx) return;
  const t = A.ctx.currentTime, f = base * (0.85 + Math.random() * 0.35);
  tone(t, f, 0.045, 0.035, 'square', f * (0.9 + Math.random() * 0.2));
}

let hbTimer = null;
export function heartbeat(on) {
  clearInterval(hbTimer);
  if (!on || !A.ctx) return;
  const beat = () => { const t = A.ctx.currentTime; tone(t, 60, 0.12, 0.35, 'sine', 40); tone(t + 0.18, 55, 0.12, 0.28, 'sine', 38); };
  beat(); hbTimer = setInterval(beat, 800);
}
