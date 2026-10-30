// 卡通角色：Q 版比例（大头、圆润四肢）+ 分段光照 + 描边 + 程序化动作（待机、走、跑、坐、挥手、欢呼、难过、生气、哭、干活、跳舞、打鼓、躺……）
import * as THREE from 'three';
import { W, heightAt, walkable, emojiSprite } from './world.js';
import { sfx } from './audio.js';
import { toon, outline, blobShadow } from './toon.js';

const damp = (a, b, k) => a + (b - a) * k;
const OL = 0.018; // 描边宽度

// 几何体变换后合并（同材质的小部件合成一个 Mesh，减少 draw call）
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
function G(geo, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE);
  tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(tmpM); return g;
}
function merge(list) {
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere(); return out;
}
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cap = (r, len, rs = 8) => new THREE.CapsuleGeometry(r, len, 3, rs);
const lathe = pts => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 14);

// 共享几何体（所有角色复用）
const GEO = {
  head: sph(0.42, 20, 14),
  ear: sph(0.08, 8, 6),
  nose: sph(0.032, 8, 6),
  eye: sph(0.06, 10, 7),
  hi: sph(0.02, 5, 4),
  brow: cap(0.014, 0.08, 5),
  mouthLine: cap(0.013, 0.05, 5),
  smile: new THREE.TorusGeometry(0.055, 0.014, 5, 10, Math.PI),
  open: sph(0.045, 10, 7),
  blush: new THREE.CircleGeometry(0.055, 12),
  torso: lathe([[0.001, -0.02], [0.27, 0], [0.32, 0.1], [0.34, 0.26], [0.31, 0.44], [0.23, 0.58], [0.001, 0.62]]),
  collar: new THREE.TorusGeometry(0.17, 0.045, 6, 14),
  belt: new THREE.CylinderGeometry(0.295, 0.295, 0.07, 14, 1, true),
  buckle: new THREE.BoxGeometry(0.08, 0.06, 0.03),
  shoulder: sph(0.115, 10, 7),
  sleeve: cap(0.1, 0.18),
  forearm: cap(0.072, 0.17),
  hand: sph(0.088, 10, 7),
  shorts: sph(0.3, 12, 8),
  leg: cap(0.125, 0.55),
  shoe: sph(0.14, 10, 7),
  skirt: lathe([[0.2, -0.45], [0.44, -0.45], [0.45, -0.4], [0.31, -0.04], [0.27, 0.06]]),
  belly: sph(0.3, 12, 9),
};

export function makeChar(o = {}) {
  const opt = { skin: 0xf2c9a0, shirt: 0xff8a5b, pants: 0x3d4a6b, hair: 0x3a2a20, hairStyle: 'short', shoe: 0x5a3e30, eye: 0x2a1f2e, scale: 0.9, speed: 4.6, ...o };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mesh = (geo, m, x = 0, y = 0, z = 0, ol = OL) => {
    const e = new THREE.Mesh(geo, m); e.position.set(x, y, z); e.castShadow = true;
    if (ol) outline(e, ol); return e;
  };
  const skinM = toon(opt.skin), shirtM = toon(opt.shirt, { unique: true }), hairM = toon(opt.hair, { unique: true });
  const pantsM = toon(opt.pants), shoeM = toon(opt.shoe), eyeM = toon(opt.eye), whiteM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mouthM = toon(0x8a3440), collarM = toon(0xf4efe6), beltM = toon(0x4a3426), goldM = toon(0xf2c94c);

  // ---------- 骨架：body → hips → spine → neck → head ----------
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  const spine = new THREE.Group(); hips.add(spine);
  const neck = new THREE.Group(); neck.position.y = 0.6; spine.add(neck);
  const head = new THREE.Group(); head.position.y = 0.38; neck.add(head);

  // ---------- 躯干 ----------
  spine.add(mesh(GEO.torso, shirtM));
  const collar = mesh(GEO.collar, collarM, 0, 0.575, 0, 0.012); collar.rotation.x = Math.PI / 2; spine.add(collar);
  spine.add(mesh(GEO.belt, beltM, 0, 0.03, 0, 0.012), mesh(GEO.buckle, goldM, 0, 0.03, 0.3, 0));
  if (opt.belly) { const b = mesh(GEO.belly, shirtM, 0, 0.24, 0.1); b.scale.set(1, 0.9, 0.85); spine.add(b); }
  if (opt.scarf) {
    const sm = toon(opt.scarf);
    const ring = mesh(new THREE.TorusGeometry(0.21, 0.075, 8, 18), sm, 0, 0.6, 0.01); ring.rotation.x = Math.PI / 2 - 0.15; spine.add(ring);
    const tail = mesh(cap(0.06, 0.2), sm, 0.14, 0.42, 0.25); tail.rotation.set(0.25, 0, 0.25); tail.scale.z = 0.5; spine.add(tail);
  }

  // ---------- 头部 ----------
  const headMesh = new THREE.Mesh(merge([
    G(GEO.head, 0, 0, 0, 1.04, 0.97, 1),
    G(GEO.ear, 0.415, -0.03, 0, 0.55, 1, 0.8), G(GEO.ear, -0.415, -0.03, 0, 0.55, 1, 0.8),
  ]), skinM);
  headMesh.castShadow = true; outline(headMesh, OL); head.add(headMesh);
  const nose = new THREE.Mesh(GEO.nose, skinM); nose.position.set(0, -0.055, 0.415); head.add(nose);
  // 眼睛（组：眼球 + 高光），眨眼时缩放组的 y
  const makeEye = side => {
    const g = new THREE.Group(); g.position.set(side * 0.15, -0.01, 0.375); g.rotation.y = side * 0.37;
    const e = new THREE.Mesh(GEO.eye, eyeM); e.scale.set(0.85, 1.3, 0.45); g.add(e);
    const h = new THREE.Mesh(GEO.hi, whiteM); h.position.set(0.014, 0.035, 0.03); g.add(h);
    const h2 = new THREE.Mesh(GEO.hi, whiteM); h2.scale.setScalar(0.5); h2.position.set(-0.015, -0.03, 0.028); g.add(h2);
    head.add(g); return g;
  };
  const eyeL = makeEye(1), eyeR = makeEye(-1);
  const makeBrow = side => {
    const g = new THREE.Group(); g.position.set(side * 0.155, 0.135, 0.37); g.rotation.y = side * 0.38;
    const b = new THREE.Mesh(GEO.brow, hairM); b.rotation.z = Math.PI / 2; g.add(b); head.add(g); return g;
  };
  const browL = makeBrow(1), browR = makeBrow(-1);
  const mouthG = new THREE.Group(); mouthG.position.set(0, -0.15, 0.39); mouthG.rotation.x = -0.25; head.add(mouthG);
  const mLine = new THREE.Mesh(GEO.mouthLine, mouthM); mLine.rotation.z = Math.PI / 2;
  const mSmile = new THREE.Mesh(GEO.smile, mouthM); mSmile.rotation.z = Math.PI; mSmile.position.y = 0.035;
  const mFrown = new THREE.Mesh(GEO.smile, mouthM); mFrown.position.y = -0.03;
  const mOpen = new THREE.Mesh(GEO.open, mouthM);
  mouthG.add(mLine, mSmile, mFrown, mOpen);
  const blushM = new THREE.MeshBasicMaterial({ color: 0xff8a9a, transparent: true, opacity: 0.4, depthWrite: false });
  for (const s of [1, -1]) { const b = new THREE.Mesh(GEO.blush, blushM); b.position.set(s * 0.25, -0.1, 0.33); b.rotation.y = s * 0.62; b.scale.y = 0.7; head.add(b); }
  if (opt.glasses) {
    const lens = new THREE.TorusGeometry(0.085, 0.013, 6, 16), rod = len => new THREE.CylinderGeometry(0.011, 0.011, len, 5);
    head.add(new THREE.Mesh(merge([
      G(lens, 0.15, -0.01, 0.43, 1, 1, 1, 0, 0.3), G(lens, -0.15, -0.01, 0.43, 1, 1, 1, 0, -0.3),
      G(rod(0.11), 0, 0.005, 0.44, 1, 1, 1, 0, 0, Math.PI / 2),
      G(rod(0.36), 0.37, 0, 0.2, 1, 1, 1, Math.PI / 2, 0, 0), G(rod(0.36), -0.37, 0, 0.2, 1, 1, 1, Math.PI / 2, 0, 0),
    ]), toon(0x2a2a30)));
  }
  if (opt.beard) {
    const bd = mesh(GEO.belly, hairM, 0, -0.3, 0.2); bd.scale.set(1.15, 0.62, 0.72); head.add(bd);
    head.add(new THREE.Mesh(merge([G(cap(0.03, 0.08), 0.06, -0.1, 0.41, 1, 1, 0.7, 0, 0.3, 1.25), G(cap(0.03, 0.08), -0.06, -0.1, 0.41, 1, 1, 0.7, 0, -0.3, -1.25)]), hairM));
  }

  // ---------- 头发 ----------
  const hairG = new THREE.Group(); head.add(hairG);
  function buildHair(style) {
    hairG.clear();
    const parts = [];
    // 发包：上半球略大于头，向后倾斜，后脑更低
    parts.push(G(new THREE.SphereGeometry(0.455, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0.03, -0.035, style === 'bob' ? 1.08 : 1.05, 1, 1.04, -0.68, 0, 0));
    if (style !== 'spiky') {
      // 刘海：沿额头一圈的扁圆块
      const n = style === 'bob' ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * (style === 'bob' ? 2.0 : 1.6);
        parts.push(G(sph(0.14, 9, 6), Math.sin(a) * 0.37, 0.29 - Math.abs(a) * 0.05, Math.cos(a) * 0.31, 1, 0.6, 0.5, 0.6, a, 0));
      }
    }
    if (style === 'short') parts.push(G(sph(0.12, 8, 6), 0.36, 0.08, 0.12, 0.6, 1.2, 0.9), G(sph(0.12, 8, 6), -0.36, 0.08, 0.12, 0.6, 1.2, 0.9));
    if (style === 'spiky') {
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, tilt = 0.75;
        const dir = new THREE.Vector3(Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt)).normalize();
        const p = dir.clone().multiplyScalar(0.42), e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
        parts.push(G(new THREE.ConeGeometry(0.11, 0.3, 6), p.x, p.y + 0.02, p.z - 0.04, 1, 1, 1, e.x, e.y, e.z));
      }
      parts.push(G(new THREE.ConeGeometry(0.12, 0.34, 8), 0, 0.46, 0.05, 1, 1, 1, 0.3, 0, 0));
      for (const s of [-1, 0, 1]) parts.push(G(new THREE.ConeGeometry(0.08, 0.2, 7), s * 0.14, 0.3, 0.34, 1, 1, 1, 1.9, 0, -s * 0.25));
    }
    if (style === 'long') {
      parts.push(G(cap(0.2, 0.42), 0, -0.32, -0.24, 1.9, 1, 0.6, 0.12, 0, 0));
      for (const s of [1, -1]) parts.push(G(cap(0.1, 0.36), s * 0.36, -0.26, 0.02, 1, 1, 0.8, 0, 0, s * -0.12));
    }
    if (style === 'bob') {
      for (const s of [1, -1]) parts.push(G(sph(0.17, 10, 7), s * 0.36, -0.12, 0.04, 0.75, 1.25, 1.05));
      parts.push(G(sph(0.3, 12, 8), 0, -0.14, -0.22, 1.45, 0.95, 0.85));
    }
    if (style === 'ponytail') {
      [[0.12, -0.5, 0.13], [-0.04, -0.6, 0.12], [-0.21, -0.62, 0.105], [-0.36, -0.57, 0.085], [-0.48, -0.5, 0.06]]
        .forEach(([y, z, r]) => parts.push(G(sph(r, 9, 7), 0, y, z)));
    }
    if (style === 'bun') parts.push(G(sph(0.17, 10, 8), 0, 0.46, -0.1), G(sph(0.08, 8, 6), 0.1, 0.52, -0.02));
    const hm = new THREE.Mesh(merge(parts), hairM); hm.castShadow = true; outline(hm, OL); hairG.add(hm);
    if (style === 'ponytail') { const tie = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 12), toon(0xff7aa8)); tie.position.set(0, 0.17, -0.44); tie.rotation.x = 0.5; hairG.add(tie); }
    if (style === 'bun') { const tie = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 14), toon(0xe0a83a)); tie.position.set(0, 0.36, -0.08); tie.rotation.x = Math.PI / 2 - 0.3; hairG.add(tie); }
  }
  buildHair(opt.hairStyle);
  if (opt.cap) {
    const cm = toon(0x2d3a5a), brimM = toon(0x1d2438);
    const crown = mesh(new THREE.SphereGeometry(0.47, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), cm, 0, 0.06, -0.01); crown.scale.set(1.04, 0.95, 1.04); head.add(crown);
    head.add(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.09, 20, 1, true), brimM, 0, 0.2, 0, 0));
    const brim = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.035, 18, 1, false, -Math.PI / 2, Math.PI), brimM, 0, 0.17, 0.3, 0.012); brim.scale.z = 0.95; brim.rotation.x = 0.12; head.add(brim);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.02), goldM); badge.position.set(0, 0.3, 0.43); badge.rotation.x = -0.45; head.add(badge);
  }

  // ---------- 手臂（肩为枢轴） ----------
  const makeArm = side => {
    const g = new THREE.Group(); g.position.set(side * 0.37, 0.5, 0);
    g.add(mesh(GEO.shoulder, shirtM), mesh(GEO.sleeve, shirtM, 0, -0.17, 0));
    const fore = new THREE.Mesh(merge([G(GEO.forearm, 0, -0.42, 0.015), G(GEO.hand, 0, -0.6, 0.03, 0.95, 1.05, 0.9)]), skinM);
    fore.castShadow = true; outline(fore, OL); g.add(fore);
    spine.add(g); return g;
  };
  const armL = makeArm(1), armR = makeArm(-1);

  // ---------- 腿（髋为枢轴） ----------
  const shorts = mesh(GEO.shorts, pantsM, 0, -0.02, 0); shorts.scale.set(1, 0.42, 0.88); hips.add(shorts);
  const makeLeg = side => {
    const g = new THREE.Group(); g.position.set(side * 0.15, 0, 0);
    g.add(mesh(GEO.leg, pantsM, 0, -0.4, 0));
    const sh = mesh(GEO.shoe, shoeM, 0, -0.84, 0.06); sh.scale.set(1, 0.62, 1.45); g.add(sh);
    hips.add(g); return g;
  };
  const legL = makeLeg(1), legR = makeLeg(-1);
  if (opt.skirt) hips.add(mesh(GEO.skirt, toon(opt.skirt), 0, 0, 0));

  // 接触阴影
  const blob = blobShadow(0.55, 0.32); blob.position.y = 0.03; root.add(blob);
  root.scale.setScalar(opt.scale);

  // 头顶表情气泡 / 任务提示
  let bubble = null, bubbleT = 0, alert = null, eyeOpen = 1;
  const MOODS = {
    //        眉倾角  眉高   嘴型      嘴大小  眼睁开  腮红
    calm:      [0,     0,    'smile', 0.6,   1,     0.35],
    happy:     [-0.12, 0.02, 'smile', 1.15,  0.55,  0.6],
    sad:       [-0.38, 0.01, 'frown', 0.75,  0.85,  0.2],
    angry:     [0.42, -0.02, 'line',  1.1,   0.8,   0.15],
    surprised: [0,     0.05, 'open',  1,     1.15,  0.35],
  };
  function applyMouth(talking) {
    const [, , shape, size] = MOODS[c.mood];
    mLine.visible = mSmile.visible = mFrown.visible = mOpen.visible = false;
    if (talking) { mOpen.visible = true; mOpen.scale.set(0.85, 0.35 + 0.8 * Math.abs(Math.sin(c.t * 13)), 0.45); return; }
    const m = { line: mLine, smile: mSmile, frown: mFrown, open: mOpen }[shape];
    m.visible = true;
    if (shape === 'open') m.scale.set(1, 1.15, 0.45); else m.scale.setScalar(size);
  }
  const c = {
    root, opt, pos: root.position, anim: 'idle', mood: 'calm', t: Math.random() * 10, target: null, path: null, resolve: null,
    rot: { hipsY: 0.92, hipsRY: 0, spineX: 0, spineZ: 0, headX: 0, headY: 0, aLX: 0, aLZ: 0.15, aRX: 0, aRZ: -0.15, lLX: 0, lRX: 0, bodyY: 0, bodyX: 0, bodyZ: 0 },
    stepT: 0, blinkT: 2 + Math.random() * 3, speed: opt.speed, isPlayer: !!opt.isPlayer,
    setLook(look) { if (look.shirt != null) shirtM.color.set(look.shirt); if (look.hair != null) hairM.color.set(look.hair); if (look.hairStyle) buildHair(look.hairStyle); },
    setAnim(a) { c.anim = a; },
    setMood(m) {
      c.mood = MOODS[m] ? m : 'calm';
      const [tilt, by, , , eo, bl] = MOODS[c.mood];
      browL.rotation.z = tilt; browR.rotation.z = -tilt; browL.position.y = browR.position.y = 0.135 + by;
      eyeOpen = eo; blushM.opacity = bl;
      applyMouth(false);
    },
    emote(str, dur = 1.8) {
      if (bubble) head.remove(bubble);
      bubble = emojiSprite(str, 0.7); bubble.position.set(0.45, 0.68, 0); head.add(bubble); bubbleT = dur;
    },
    setAlert(on, str = '❗') {
      if (alert) { root.remove(alert); alert = null; }
      if (on) { alert = emojiSprite(str, 0.9); alert.position.y = 2.85; root.add(alert); }
    },
    place(v, ry) { root.position.set(v.x, heightAt(v.x, v.z), v.z); if (ry != null) root.rotation.y = ry; W.scene.add(root); return c; },
    face(p) { c.faceY = Math.atan2(p.x - root.position.x, p.z - root.position.z); },
    lookAtChar(o) { c.face(o.pos); },
    stop() { c.target = null; if (c.resolve) { c.resolve(false); c.resolve = null; } if (['walk', 'run'].includes(c.anim)) c.anim = 'idle'; },
    moveTo(p, run = false) {
      c.stop(); c.target = new THREE.Vector3(p.x, 0, p.z); c.run = run; c.anim = run ? 'run' : 'walk';
      return new Promise(r => { c.resolve = r; });
    },
    walkDir(dir, dt) {
      c.target = null; if (c.resolve) { c.resolve(false); c.resolve = null; }
      step(dir, dt, c.speed); c.anim = 'walk'; c.manual = 0.12;
    },
    update(dt) {
      c.t += dt;
      if (c.target) {
        const d = new THREE.Vector3(c.target.x - root.position.x, 0, c.target.z - root.position.z), dist = d.length();
        if (dist < 0.15) { c.target = null; c.anim = 'idle'; c.resolve?.(true); c.resolve = null; }
        else if (!step(d.normalize(), dt, c.run ? c.speed * 1.7 : c.speed)) { c.target = null; c.anim = 'idle'; c.resolve?.(false); c.resolve = null; }
      }
      if (c.manual > 0) { c.manual -= dt; if (c.manual <= 0 && !c.target) c.anim = 'idle'; }
      if (c.faceY != null) {
        let dy = c.faceY - root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        root.rotation.y += dy * Math.min(1, dt * 10); if (Math.abs(dy) < 0.01) c.faceY = null;
      }
      if (!c.lie) root.position.y = damp(root.position.y, heightAt(root.position.x, root.position.z), Math.min(1, dt * 12));
      pose(dt);
      // 眨眼 / 闭眼 / 说话口型
      c.blinkT -= dt; const blink = c.blinkT < 0.12 ? 0.12 : 1; if (c.blinkT < 0) c.blinkT = 2.5 + Math.random() * 3;
      eyeL.scale.y = eyeR.scale.y = c.anim === 'sleep' || c.anim === 'cry' ? 0.1 : blink * eyeOpen;
      const talking = c.anim === 'talk' || c.anim === 'sitTalk';
      if (talking || c.wasTalking) { applyMouth(talking); c.wasTalking = talking; }
      blob.visible = !c.lie;
      if (bubble) { bubbleT -= dt; bubble.position.y = 0.68 + Math.sin(c.t * 4) * 0.05; if (bubbleT <= 0) { head.remove(bubble); bubble = null; } }
      if (alert) alert.position.y = 2.85 + Math.sin(c.t * 3) * 0.12;
    },
  };
  function step(dir, dt, speed) {
    // 避障：前方不可走时，尝试左右偏转
    for (const off of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
      const nx = root.position.x + d.x * speed * dt, nz = root.position.z + d.z * speed * dt;
      if (walkable(nx, nz) || !walkable(root.position.x, root.position.z)) {
        root.position.x = nx; root.position.z = nz; c.faceY = Math.atan2(d.x, d.z);
        c.stepT -= dt; if (c.isPlayer && c.stepT <= 0) { sfx('step'); c.stepT = c.run ? 0.22 : 0.32; }
        return true;
      }
    }
    return false;
  }
  function pose(dt) {
    const t = c.t, T = { hipsY: 0.92, hipsRY: 0, spineX: 0, spineZ: 0, headX: 0, headY: 0, aLX: 0, aLZ: 0.15, aRX: 0, aRZ: -0.15, lLX: 0, lRX: 0, bodyY: 0, bodyX: 0, bodyZ: 0 };
    const S = Math.sin;
    switch (c.anim) {
      case 'idle': T.spineX = 0.03 * S(t * 1.6); T.headY = 0.18 * S(t * 0.45); T.headX = 0.04 * S(t * 0.8); T.aLZ = 0.16 + 0.03 * S(t * 1.6); T.aRZ = -T.aLZ; break;
      case 'walk': case 'run': {
        const f = c.anim === 'run' ? 12 : 8.5, a = c.anim === 'run' ? 0.95 : 0.6, s = S(t * f);
        T.lLX = a * s; T.lRX = -a * s; T.aLX = -a * 0.8 * s; T.aRX = a * 0.8 * s; T.aLZ = 0.18; T.aRZ = -0.18;
        T.bodyY = Math.abs(S(t * f)) * (c.anim === 'run' ? 0.12 : 0.06); T.spineX = c.anim === 'run' ? 0.22 : 0.05; T.hipsRY = 0.08 * s; T.headY = -0.06 * s; break;
      }
      case 'talk': T.aRX = -0.7 + 0.3 * S(t * 4); T.aRZ = -0.25; T.headX = 0.06 * S(t * 3); T.headY = 0.1 * S(t * 0.7); break;
      case 'wave': T.aRZ = -2.6 + 0.35 * S(t * 9); T.headY = 0.1; T.headX = -0.08; T.spineZ = 0.06; break;
      case 'cheer': T.aLZ = 2.5 + 0.2 * S(t * 10); T.aRZ = -2.5 - 0.2 * S(t * 10); T.bodyY = Math.abs(S(t * 6)) * 0.35; T.headX = -0.2; break;
      case 'sad': T.headX = 0.45; T.spineX = 0.22; T.aLZ = 0.06; T.aRZ = -0.06; T.aLX = 0.15; T.aRX = 0.15; break;
      case 'angry': T.aLZ = 0.85; T.aRZ = -0.85; T.aLX = 0.35; T.aRX = 0.35; T.headX = -0.12 + 0.05 * S(t * 14); T.spineX = -0.05; break;
      case 'sit': case 'sitTalk': T.hipsY = 0.42; T.lLX = -1.45; T.lRX = -1.45; T.aLX = -0.75; T.aRX = -0.75; T.aLZ = 0.12; T.aRZ = -0.12; T.spineX = 0.08 + 0.03 * S(t * 1.5);
        if (c.anim === 'sitTalk') { T.aRX = -1 + 0.3 * S(t * 4); T.headY = 0.1 * S(t); } break;
      case 'cry': T.hipsY = 0.42; T.lLX = -1.6; T.lRX = -1.6; T.spineX = 0.45 + 0.04 * S(t * 18); T.headX = 0.45; T.aLX = -2.1; T.aRX = -2.1; T.aLZ = -0.4; T.aRZ = 0.4; break;
      case 'work': T.spineX = 0.5; T.aLX = -1.2 + 0.45 * S(t * 6); T.aRX = -1.2 + 0.45 * S(t * 6); T.headX = 0.15; T.bodyY = 0.03 * S(t * 6); break;
      case 'carry': T.aLX = -1.1; T.aRX = -1.1; T.aLZ = -0.25; T.aRZ = 0.25; T.spineX = -0.08; T.lLX = 0.5 * S(t * 7); T.lRX = -0.5 * S(t * 7); break;
      case 'cough': { const k = (t % 2.2) < 0.5 ? 1 : 0; T.spineX = 0.15 + k * 0.4 * Math.abs(S(t * 25)); T.aRX = -1.6 * k; T.aRZ = -0.15 + 0.35 * k; T.headX = 0.2 + k * 0.2; T.hipsY = 0.42; T.lLX = -1.45; T.lRX = -1.45; break; }
      case 'dance': T.hipsRY = 0.4 * S(t * 4); T.aLZ = 1.6 + 0.8 * S(t * 4); T.aRZ = -1.6 + 0.8 * S(t * 4 + 3); T.bodyY = Math.abs(S(t * 8)) * 0.15; T.lLX = 0.3 * S(t * 8); T.lRX = -0.3 * S(t * 8); T.spineZ = 0.12 * S(t * 4); T.headY = 0.2 * S(t * 4); break;
      case 'drum': T.aLX = -1.0 + 0.6 * S(t * 12); T.aRX = -1.0 - 0.6 * S(t * 12); T.headX = 0.1 * S(t * 6); break;
      case 'hug': T.aLX = -1.4; T.aRX = -1.4; T.aLZ = -0.5; T.aRZ = 0.5; T.spineX = 0.1; break;
      case 'point': T.aRX = -1.5; T.aRZ = -0.2; T.headY = -0.2; break;
      case 'lookUp': T.headX = -0.55; T.spineX = -0.15; break;
      case 'brace': T.spineX = 0.35; T.aLX = -0.9; T.aRX = -1.6; T.aRZ = -0.4; T.lLX = -0.4; T.lRX = 0.4; T.headX = 0.2; T.bodyZ = 0.05 * S(t * 9); break;
      case 'kneel': T.hipsY = 0.55; T.lLX = -1.4; T.lRX = 0.4; T.spineX = 0.35; T.aLX = -0.9; T.aRX = -1.1; T.headX = 0.3; break;
      case 'ignite': T.aLX = -1.6; T.aRX = -1.6; T.aLZ = -0.35; T.aRZ = 0.35; T.headX = -0.3; T.spineX = -0.1; break;
      case 'sleep': case 'lie': T.bodyX = -Math.PI / 2; T.bodyY = 0.42; T.aLZ = 0.45; T.aRZ = -0.45; T.headY = 0.2 * S(t * 0.3); break;
    }
    if (c.anim === 'sleep' || c.anim === 'lie') c.lie = true; else c.lie = false;
    const k = 1 - Math.exp(-dt * 12), r = c.rot;
    for (const key in T) r[key] = damp(r[key], T[key], k);
    hips.position.y = r.hipsY; hips.rotation.y = r.hipsRY; spine.rotation.x = r.spineX; spine.rotation.z = r.spineZ;
    neck.rotation.x = r.headX; neck.rotation.y = r.headY;
    armL.rotation.x = r.aLX; armL.rotation.z = r.aLZ; armR.rotation.x = r.aRX; armR.rotation.z = r.aRZ;
    legL.rotation.x = r.lLX; legR.rotation.x = r.lRX;
    body.position.y = r.bodyY; body.rotation.x = r.bodyX; body.rotation.z = r.bodyZ;
    // 呼吸
    spine.scale.y = 1 + Math.sin(c.t * 1.8) * 0.012;
  }
  c.setMood('calm');
  W.updaters.push(dt => c.update(dt));
  return c;
}

// 主要角色外观
export const CAST = {
  chen: { skin: 0xe0b089, shirt: 0x3d6e8f, pants: 0x3a3a46, hair: 0x6a6a6a, hairStyle: 'short', shoe: 0x3a2a22, cap: true, beard: true, belly: true, scale: 1.0, speed: 4.4 },
  lu:   { skin: 0xf6d2b0, shirt: 0xffb3c7, pants: 0x6a8fd0, hair: 0x6b3a2a, hairStyle: 'ponytail', shoe: 0xffffff, skirt: 0xff8fb0, scale: 0.85, speed: 4.8 },
  mu:   { skin: 0xeac4a0, shirt: 0x7fb08a, pants: 0x4a4f63, hair: 0x2a2220, hairStyle: 'bob', shoe: 0x5a5a66, glasses: true, scale: 0.88, speed: 4.2 },
  ma:   { skin: 0xd9a87e, shirt: 0x8b6fcf, pants: 0x5a4a6a, hair: 0xd8d4cc, hairStyle: 'bun', shoe: 0x6a4a3a, scarf: 0xe0a83a, skirt: 0x6a5490, scale: 0.82, speed: 3.6 },
};
export const VILLAGER_LOOKS = [
  { skin: 0xd9a87e, shirt: 0xe0a83a, pants: 0x5a4a3a, hair: 0x2a2220, hairStyle: 'short', scale: 0.92 },
  { skin: 0xf2c9a0, shirt: 0x5aa86a, pants: 0x3a3a46, hair: 0x4a2a20, hairStyle: 'long', skirt: 0x2f8a7a, scale: 0.86 },
  { skin: 0xc99872, shirt: 0xd65a4a, pants: 0x3a3a46, hair: 0x1a1a1a, hairStyle: 'spiky', scale: 0.95 },
];
