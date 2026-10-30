// 3D 世界：地形、海洋、天空、植被、建筑、天气、粒子、交互、镜头
import * as THREE from 'three';
import { initPost, resizePost, renderPost, postPreset } from './post.js';

/* ================== 噪声与地形高度 ================== */
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const flatten = (h, x, z, cx, cz, r, target) => { const d = Math.hypot(x - cx, z - cz); return h + (target - h) * (1 - ss(r * 0.6, r, d)); };

export function heightAt(x, z) {
  const ang = Math.atan2(z, x), r = Math.hypot(x, z);
  const R = 40 + 3 * Math.sin(ang * 3 + 0.5) + 2 * Math.sin(ang * 5 + 2);
  let h = 2.2 * (1 - ss(R - 14, R + 1, r)) - 1.4;
  h += (1 - ss(R - 20, R - 12, r)) * vnoise(x * 0.12, z * 0.12) * 1.6;
  h += 10 * Math.exp(-((x - 6) ** 2 + (z + 30) ** 2) / 90);   // 灯塔崖
  h += 5 * Math.exp(-((x + 13) ** 2 + (z + 17) ** 2) / 70);   // 山洞丘
  h = flatten(h, x, z, 0, 16, 9, 1.0);    // 营地
  h = flatten(h, x, z, 25, -5, 9, 1.3);   // 渔村
  h = flatten(h, x, z, -25, -9, 5, 1.1);  // 守塔人小屋
  return h;
}
// 地点坐标（y 自动贴地）
export const LOC = {
  wake: [6, 30], camp: [0, 16], reef: [20, 21], maNet: [12, 9], forest: [-20, -2], hut: [-25, -9], cave: [-13, -10.5],
  village: [25, -5], lighthouse: [6, -30], wreck: [34, 9], shore: [2, 27], hill: [-4, -6], tide: [10, 27],
};
export const P = (x, z, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);
export const at = (k, dy = 0) => P(LOC[k][0], LOC[k][1], dy);

/* ================== 全局状态 ================== */
export const W = {
  scene: null, camera: null, renderer: null, clock: new THREE.Clock(), player: null,
  inters: new Map(), zones: new Map(), obstacles: [], updaters: [], tweens: [],
  control: false, roaming: false, busy: false, cg: false, yaw: 0, zoom: 1, look: new THREE.Vector3(),
  uTime: { value: 0 }, uWind: { value: 1 }, waveAmp: 1, weather: 'clear', time: 'day', quality: 'high',
  onNear: null, onTapGround: null, near: null, keys: new Set(),
};
const mats = {};
export const mat = (hex, extra = {}) => {
  const k = hex + JSON.stringify(extra);
  return mats[k] ||= new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.85, metalness: 0, ...extra });
};
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function mergeColored(list) {
  // list: [[geometry, hexColor], ...] → 单个带顶点色的几何体
  const parts = list.map(([g, c]) => [g.index ? g.toNonIndexed() : g, new THREE.Color(c)]);
  const n = parts.reduce((a, [g]) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of parts) {
    pos.set(g.attributes.position.array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
export function canvasTex(draw, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTex = canvasTex((x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
}, 64, 64);
const cloudTex = canvasTex((x, w) => {
  for (let i = 0; i < 7; i++) {
    const cx = 30 + Math.random() * 68, cy = 40 + Math.random() * 48, r = 22 + Math.random() * 20;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
});
export function emojiSprite(str, size = 1.2) {
  const t = canvasTex((x, w) => { x.font = `${w * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(str, w / 2, w / 2 + 6); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.setScalar(size); s.renderOrder = 10; return s;
}

/* ================== 时间与天气预设 ================== */
const PRESETS = {
  dawn:  { top: 0xf39d8b, bottom: 0xffe2c0, fog: 0xf3c4ab, sun: 0xffc59a, sunI: 1.7, hs: 0xffd7c2, hg: 0x6b5a4a, hI: 1.0, sunPos: [60, 16, 40], sea: 0x5aa3b8, stars: 0, lamps: 0.2 },
  day:   { top: 0x4fa9e8, bottom: 0xdcf1ff, fog: 0xbfe1f3, sun: 0xfff1d6, sunI: 2.6, hs: 0xe4f4ff, hg: 0x7a6a50, hI: 1.15, sunPos: [30, 60, 25], sea: 0x2a9cbc, stars: 0, lamps: 0 },
  dusk:  { top: 0x4b3d7e, bottom: 0xff9a74, fog: 0xc4847f, sun: 0xff9a66, sunI: 1.5, hs: 0xffb38a, hg: 0x3a3050, hI: 0.85, sunPos: [-60, 12, 30], sea: 0x4c5f98, stars: 0.25, lamps: 0.7 },
  night: { top: 0x060a22, bottom: 0x22305e, fog: 0x18223f, sun: 0x9fb4ff, sunI: 0.5, hs: 0x4a5a9a, hg: 0x101828, hI: 0.6, sunPos: [-20, 50, -30], sea: 0x142048, stars: 1, lamps: 1 },
  storm: { top: 0x1c232e, bottom: 0x4a5462, fog: 0x3a434f, sun: 0xaab4c4, sunI: 0.6, hs: 0x7a8494, hg: 0x222830, hI: 0.75, sunPos: [0, 60, 0], sea: 0x2a3946, stars: 0, lamps: 0.6 },
};
const cur = {};
for (const k in PRESETS.day) cur[k] = Array.isArray(PRESETS.day[k]) ? [...PRESETS.day[k]] : (typeof PRESETS.day[k] === 'number' && k.match(/top|bottom|fog|sun$|hs|hg|sea/) ? new THREE.Color(PRESETS.day[k]) : PRESETS.day[k]);
const COLOR_KEYS = ['top', 'bottom', 'fog', 'sun', 'hs', 'hg', 'sea'];

/* ================== 初始化 ================== */
let sky, stars, sun, hemi, ocean, oceanBase, terrain, clouds = [], rain, sparks, fireflies, lanternGroup;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

export function initWorld(container) {
  const coarse = matchMedia('(pointer:coarse)').matches;
  W.quality = localStorage.getItem('island.quality') || (coarse ? 'low' : 'high');
  const renderer = W.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, W.quality === 'high' ? 2 : 1.5));
  renderer.shadowMap.enabled = W.quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const scene = W.scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe1f3, 70, 260);
  W.camera = new THREE.PerspectiveCamera(48, 1, 0.3, 1200);
  W.camera.position.set(0, 30, 80);

  // 天空
  sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 top, bottom, sunCol, sunDir; varying vec3 vP;
      void main(){ float h = clamp(vP.y * 1.7 + 0.12, 0., 1.); vec3 c = mix(bottom, top, pow(h, .75));
      float s = max(dot(vP, normalize(sunDir)), 0.); c += sunCol * (pow(s, 400.) * 2. + pow(s, 12.) * .22);
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -1; scene.add(sky);
  const sp = []; const rnd = mulberry(7);
  for (let i = 0; i < 700; i++) { const t = rnd() * Math.PI * 2, p = Math.acos(rnd() * 0.9); sp.push(Math.sin(p) * Math.cos(t) * 450, Math.cos(p) * 450 + 20, Math.sin(p) * Math.sin(t) * 450); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  // 光照
  hemi = new THREE.HemisphereLight(0xffffff, 0x777766, 1.1); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 160 });
  sun.shadow.bias = -0.0008; scene.add(sun, sun.target);

  buildTerrain(); buildOcean(); buildVegetation(); buildClouds();
  buildCamp(); buildHut(); buildVillage(); buildLighthouse(); buildCave(); buildWreck(); buildShip(); buildBoat();
  buildParticles();
  applyPreset('day', 1);
  bindInput(renderer.domElement);
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); resizePost(w, h, renderer.getPixelRatio()); W.camera.aspect = w / h;
    W.camera.fov = w / h < 0.75 ? 58 : 46; W.camera.updateProjectionMatrix();
  };
  initPost(renderer, scene, W.camera); postPreset('day', 'clear');
  addEventListener('resize', resize); resize();
  renderer.setAnimationLoop(loop);
}

export function setQuality(q) {
  W.quality = q; try { localStorage.setItem('island.quality', q); } catch { /* ignore */ }
  W.renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : 1.5));
  const sz = W.renderer.getSize(new THREE.Vector2()); resizePost(sz.x, sz.y, W.renderer.getPixelRatio());
  W.renderer.shadowMap.enabled = q === 'high';
  W.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
}

/* ================== 地形与海洋 ================== */
function buildTerrain() {
  // 平滑着色 + 逐顶点连续混色（沙滩→草地、森林、岩壁、小路过渡更自然）
  const g = new THREE.PlaneGeometry(132, 132, 132, 132); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  const C = { under: new THREE.Color(0xc2a774), wet: new THREE.Color(0xdcc08c), sand: new THREE.Color(0xf4dfab), grass: new THREE.Color(0x8cc96c), grass2: new THREE.Color(0x74b85e), forest: new THREE.Color(0x58985a), rock: new THREE.Color(0xa59e92), path: new THREE.Color(0xdcc590), dirt: new THREE.Color(0xb89a6a) };
  const c = new THREE.Color(), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = p.getY(i);
    const slope = Math.hypot(heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5));
    const n1 = vnoise(x * 0.35, z * 0.35), n2 = vnoise(x * 0.09 + 7, z * 0.09 + 3);
    c.copy(C.under).lerp(C.wet, ss(-0.6, 0.15, h)).lerp(C.sand, ss(0.15, 0.55, h));
    t.copy(C.grass2).lerp(C.grass, n2);
    const forest = (1 - ss(-14, -9, x)) * (1 - ss(15, 20, Math.abs(z)));
    t.lerp(C.forest, forest * 0.85);
    c.lerp(t, ss(0.95, 1.3, h + (n1 - 0.5) * 0.45));
    c.lerp(C.rock, ss(0.95, 1.3, slope + (n1 - 0.5) * 0.4) * ss(0.8, 1.4, h));
    c.lerp(C.dirt, ss(0.7, 1.0, slope) * 0.3 * ss(1, 1.5, h));
    const pathD = distToSeg(x, z, 0, 14, 4, -22);
    c.lerp(C.path, (1 - ss(0.7, 1.4, pathD + (n1 - 0.5) * 0.4)) * ss(0.9, 1.2, h));
    c.multiplyScalar(0.94 + n1 * 0.1);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  terrain.receiveShadow = true; terrain.name = 'terrain'; W.scene.add(terrain); W.terrain = terrain;
}
function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function buildOcean() {
  // 水深贴图：把地形高度烘焙成 256² 纹理，片元里据此算浅水颜色和岸边浪花
  const N = 256, SPAN = 150, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * SPAN - SPAN / 2, z = (j + 0.5) / N * SPAN - SPAN / 2;
    data[j * N + i] = Math.round(Math.min(1, Math.max(0, (-heightAt(x, z) + Math.max(0, Math.hypot(x, z) - 41) * 0.35 + 1) / 5)) * 255);
  }
  const depthTex = new THREE.DataTexture(data, N, N, THREE.RedFormat);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
  const g = new THREE.PlaneGeometry(760, 760, 150, 150); g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x2a9cbc, flatShading: true, roughness: 0.22, metalness: 0.1, transparent: true });
  W.oceanU = { uTime: W.uTime, uAmp: { value: 1 }, uDepth: { value: depthTex }, uShallow: { value: new THREE.Color(0x5ee6d6) }, uFoam: { value: new THREE.Color(0xffffff) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, W.oceanU);
    sh.vertexShader = 'uniform float uTime; uniform float uAmp; varying vec3 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float t = uTime;
      transformed.y += uAmp * (sin(position.x * .08 + t * .9) * .35 + sin(position.z * .11 - t * 1.1) * .3 + sin((position.x + position.z) * .05 + t * .6) * .25
        + sin(position.x * .43 - t * 2.1) * .05 + sin(position.z * .37 + t * 1.7) * .05);
      vW = transformed;`);
    sh.fragmentShader = 'uniform float uTime; uniform sampler2D uDepth; uniform vec3 uShallow; uniform vec3 uFoam; varying vec3 vW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 duv = (vW.xz + ${(SPAN / 2).toFixed(1)}) / ${SPAN.toFixed(1)};
      float inside = step(0., duv.x) * step(duv.x, 1.) * step(0., duv.y) * step(duv.y, 1.);
      float depth = mix(4., texture2D(uDepth, duv).r * 5. - 1., inside);
      depth -= vW.y * .6;
      float n = sin(vW.x * .9 + uTime * .7) * sin(vW.z * .8 - uTime * .5);
      vec3 shallow = uShallow;
      diffuseColor.rgb = mix(shallow, diffuseColor.rgb, smoothstep(.15, 2.6, depth));
      float shore = 1. - smoothstep(.0, .42 + n * .08, depth);
      float bands = smoothstep(.72, .96, sin(depth * 9. - uTime * 1.8 + n * 1.5)) * (1. - smoothstep(.3, 1.6, depth));
      float foam = clamp(shore * .95 + bands * .55, 0., 1.);
      diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, foam);
      diffuseColor.a = clamp(mix(.62, .93, smoothstep(.1, 2.2, depth)) + foam * .4, 0., 1.);`);
  };
  m.customProgramCacheKey = () => 'ocean2';
  ocean = new THREE.Mesh(g, m);
  ocean.receiveShadow = true; ocean.renderOrder = 2; ocean.frustumCulled = false; W.scene.add(ocean);
}
function updateOcean() { W.oceanU.uAmp.value = W.waveAmp; }

export const waveAt = (x, z) => { const t = W.uTime.value, a = W.waveAmp; return a * (Math.sin(x * 0.08 + t * 0.9) * 0.35 + Math.sin(z * 0.11 - t * 1.1) * 0.3 + Math.sin((x + z) * 0.05 + t * 0.6) * 0.25 + Math.sin(x * 0.43 - t * 2.1) * 0.05 + Math.sin(z * 0.37 + t * 1.7) * 0.05); };

/* ================== 植被（实例化 + 风动 Shader） ================== */
function windMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = W.uTime; sh.uniforms.uWind = W.uWind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float ph = instanceMatrix[3].x * .3 + instanceMatrix[3].z * .2;
      #else
      float ph = 0.;
      #endif
      float k = max(position.y - 1., 0.);
      transformed.x += sin(uTime * 1.6 + ph) * uWind * .045 * k;
      transformed.z += cos(uTime * 1.3 + ph) * uWind * .035 * k;`);
  };
  return m;
}
function instanced(geo, material, list) {
  const m = new THREE.InstancedMesh(geo, material, list.length), d = new THREE.Object3D();
  list.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0); d.scale.setScalar(it.s || 1); if (it.sy) d.scale.y = it.sy; d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  m.castShadow = true; m.receiveShadow = true; W.scene.add(m); return m;
}
const AVOID = [[0, 16, 10], [25, -5, 11], [20, 21, 5], [6, 30, 4], [-25, -9, 6], [-13, -11, 6], [6, -30, 6], [12, 9, 4], [-4, -6, 5], [10, 27, 4]];
const free = (x, z, pad = 0) => AVOID.every(([ax, az, r]) => Math.hypot(x - ax, z - az) > r + pad) && distToSeg(x, z, 0, 14, 4, -22) > 2;
// 按高度给合并几何体的顶点色加明暗（树冠上亮下暗，更立体）
function shadeByHeight(geo, y0, y1, lo = 0.72, hi = 1.12) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) { const k = lo + (hi - lo) * Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
  return geo;
}
// 不规则的“土豆形”球体：树冠、石头、灌木
function blob(r, detail, seed, amp = 0.18) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, v = new THREE.Vector3();
  const rnd = mulberry(seed), off = [rnd() * 10, rnd() * 10, rnd() * 10];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.1 + off[0]) * Math.sin(v.y * 2.3 + off[1]) * Math.sin(v.z * 1.9 + off[2]);
    v.multiplyScalar(1 + n * amp); p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
// 椰子叶：沿长度下垂、中脉隆起、两侧锯齿小叶
function frond(len = 3.4, w = 0.75) {
  const segs = 10, pos = [];
  const pt = (s, side) => {
    const x = s * len, droop = -Math.pow(s, 1.8) * 1.6 + s * 0.5;
    const width = w * Math.sin(Math.PI * Math.min(1, s * 1.15)) * (side === 0 ? 0 : 1);
    const saw = side === 0 ? 0 : (Math.floor(s * 22) % 2 ? 0.75 : 1);
    return [x, droop + (side === 0 ? 0.08 : -0.04), side * width * saw];
  };
  for (let i = 0; i < segs; i++) {
    const a = i / segs, b = (i + 1) / segs;
    for (const side of [1, -1]) {
      const p0 = pt(a, 0), p1 = pt(b, 0), q0 = pt(a, side), q1 = pt(b, side);
      if (side > 0) pos.push(...p0, ...q0, ...p1, ...p1, ...q0, ...q1); else pos.push(...p0, ...p1, ...q0, ...p1, ...q1, ...q0);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
function buildVegetation() {
  const rnd = mulberry(42);
  // 椰子树：弯曲分节树干（深浅环纹）+ 9 片下垂椰叶 + 椰子
  const palmParts = [];
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.CylinderGeometry(0.17 - i * 0.012, 0.2 - i * 0.012, 0.66, 7); seg.translate(0, 0.33, 0);
    seg.rotateZ(-i * 0.045); seg.translate(i * i * 0.012 + i * 0.05, i * 0.62, 0); palmParts.push([seg, i % 2 ? 0x8e6c48 : 0xa47e56]);
  }
  const top = [0.62, 4.35];
  for (let i = 0; i < 9; i++) {
    const f = frond(2.9 + (i % 3) * 0.35, 0.7); f.rotateZ(0.25 + (i % 2) * 0.18); f.rotateY(i / 9 * Math.PI * 2 + (i % 2) * 0.2); f.translate(top[0], top[1], 0);
    palmParts.push([f, [0x4f9e47, 0x5fb553, 0x6cc25c][i % 3]]);
  }
  for (let i = 0; i < 4; i++) { const co = new THREE.SphereGeometry(0.17, 7, 5); co.translate(top[0] + Math.cos(i * 1.6) * 0.22, top[1] - 0.25, Math.sin(i * 1.6) * 0.22); palmParts.push([co, 0x6b4a2a]); }
  const palms = [];
  for (let i = 0; i < 500 && palms.length < 52; i++) {
    const a = rnd() * Math.PI * 2, r = 25 + rnd() * 11, x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
    if (h > 0.55 && h < 2.4 && free(x, z, 1)) { palms.push({ x, y: h - 0.1, z, ry: rnd() * 6.3, rz: (rnd() - 0.5) * 0.3, s: 0.85 + rnd() * 0.45 }); W.obstacles.push([x, z, 0.5]); }
  }
  const palmMat = windMaterial(); palmMat.side = THREE.DoubleSide;
  instanced(shadeByHeight(mergeColored(palmParts), 0, 5, 0.8, 1.1), palmMat, palms);
  // 阔叶树：圆润的多团树冠
  const tree = (c1, c2, seed) => shadeByHeight(mergeColored([
    [new THREE.CylinderGeometry(0.2, 0.34, 2.4, 7).translate(0, 1.2, 0), 0x7a5a3a],
    [new THREE.CylinderGeometry(0.08, 0.12, 1.2, 5).rotateZ(-0.7).translate(0.5, 2.3, 0), 0x7a5a3a],
    [blob(1.55, 1, seed).translate(0, 3.3, 0), c1],
    [blob(1.15, 1, seed + 1).translate(0.95, 3.9, 0.3), c2],
    [blob(1.05, 1, seed + 2).translate(-0.8, 3.75, -0.4), c2],
    [blob(0.95, 1, seed + 3).translate(0.1, 4.65, -0.1), c1],
  ]), 0.5, 5.4, 0.62, 1.15);
  // 松树：分层锥体，下沿略外翻
  const pineLayer = (r, h, y) => { const g = new THREE.ConeGeometry(r, h, 9, 1); g.translate(0, y, 0); return g; };
  const pine = shadeByHeight(mergeColored([
    [new THREE.CylinderGeometry(0.16, 0.26, 1.8, 6).translate(0, 0.9, 0), 0x6e5032],
    [pineLayer(1.9, 2.2, 2.4), 0x3c7a48], [pineLayer(1.5, 2.0, 3.5), 0x458a4f], [pineLayer(1.1, 1.8, 4.5), 0x50995a], [pineLayer(0.65, 1.4, 5.4), 0x5ca765],
  ]), 1, 6, 0.7, 1.12);
  const ta = [], tb = [], tp = [];
  for (let i = 0; i < 1600 && ta.length + tb.length + tp.length < 130; i++) {
    const x = -42 + rnd() * 84, z = -40 + rnd() * 80, h = heightAt(x, z);
    if (h < 1.1 || h > 7 || !free(x, z, 1.5)) continue;
    const forest = x < -11 && Math.abs(z) < 19;
    if (!forest && rnd() > 0.12) continue;
    const it = { x, y: h - 0.15, z, ry: rnd() * 6.3, s: 0.75 + rnd() * 0.55 };
    (rnd() < 0.4 ? tp : rnd() < 0.5 ? ta : tb).push(it); W.obstacles.push([x, z, 0.7 * it.s]);
  }
  const wm = windMaterial();
  instanced(tree(0x5aa457, 0x6dbb62, 11), wm, ta); instanced(tree(0x4f9a52, 0x67b45c, 23), wm, tb); instanced(pine, wm, tp);
  // 灌木、草丛、花、蘑菇、蕨类
  const bush = shadeByHeight(mergeColored([[blob(0.7, 1, 5).translate(0, 0.45, 0), 0x63ad58], [blob(0.5, 1, 6).translate(0.55, 0.32, 0.2), 0x74bf66], [blob(0.42, 1, 7).translate(-0.45, 0.3, -0.15), 0x6bb75f]]), 0, 1.1, 0.7, 1.12);
  const blade = (i, n) => { const a = i / n * 6.28, g = new THREE.ConeGeometry(0.055, 0.55 + (i % 3) * 0.2, 3); g.translate(0, 0.3, 0); g.rotateZ(Math.cos(a) * 0.35); g.rotateX(Math.sin(a) * 0.35); g.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12); return g; };
  const grass = shadeByHeight(mergeColored(Array.from({ length: 7 }, (_, i) => [blade(i, 7), i % 2 ? 0x7cc46a : 0x5fae5a])), 0, 0.8, 0.65, 1.15);
  const petal = (a, c) => [new THREE.SphereGeometry(0.075, 6, 4).scale(1, 0.4, 1).translate(Math.cos(a) * 0.08, 0.42, Math.sin(a) * 0.08), c];
  const flower = mergeColored([[new THREE.CylinderGeometry(0.015, 0.02, 0.42, 4).translate(0, 0.21, 0), 0x4f9a48], ...[0, 1, 2, 3, 4].map(i => petal(i / 5 * 6.28, 0xffffff)), [new THREE.SphereGeometry(0.05, 6, 4).translate(0, 0.44, 0), 0xffe08a]]);
  const mushroom = mergeColored([[new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6).translate(0, 0.15, 0), 0xf3ead8], [new THREE.SphereGeometry(0.2, 8, 5, 0, 6.29, 0, 1.4).scale(1, 0.75, 1).translate(0, 0.28, 0), 0xd9533f]]);
  const fernLeaf = i => { const f = frond(0.9, 0.18); f.rotateZ(0.9); f.rotateY(i / 6 * 6.28); return [f, i % 2 ? 0x3f8a46 : 0x4c9a52]; };
  const fern = mergeColored([0, 1, 2, 3, 4, 5].map(fernLeaf));
  const bl = [], gl = [], fl = [], ml = [], fe = [];
  for (let i = 0; i < 4000 && gl.length < 520; i++) {
    const x = -40 + rnd() * 80, z = -40 + rnd() * 80, h = heightAt(x, z);
    if (h < 1.1 || h > 8 || !free(x, z)) continue;
    const forest = x < -11 && Math.abs(z) < 19, r = rnd();
    if (r < 0.1 && bl.length < 60) bl.push({ x, y: h - 0.1, z, ry: rnd() * 6, s: 0.6 + rnd() * 0.7 });
    else if (!forest && r < 0.3 && fl.length < 240) {
      // 花丛：一次撒 3~5 朵
      for (let k = 0; k < 3 + (rnd() * 3 | 0); k++) { const fx = x + (rnd() - 0.5) * 1.2, fz = z + (rnd() - 0.5) * 1.2; fl.push({ x: fx, y: heightAt(fx, fz) - 0.02, z: fz, ry: rnd() * 6, s: 0.8 + rnd() * 0.6, c: [0xff8fb0, 0xffe066, 0xffffff, 0xb59cff, 0xff9a5a][rnd() * 5 | 0] }); }
    } else if (forest && r < 0.22 && ml.length < 40) ml.push({ x, y: h - 0.02, z, ry: rnd() * 6, s: 0.7 + rnd() * 0.8 });
    else if (forest && r < 0.45 && fe.length < 90) fe.push({ x, y: h - 0.05, z, ry: rnd() * 6, s: 0.8 + rnd() * 0.7 });
    else gl.push({ x, y: h - 0.05, z, ry: rnd() * 6, s: 0.7 + rnd() * 0.6 });
  }
  instanced(bush, wm, bl);
  const gm = instanced(grass, wm, gl); gm.castShadow = false;
  const fm = instanced(flower, wm, fl); fm.castShadow = false;
  const col = new THREE.Color(); fl.forEach((f, i) => fm.setColorAt(i, col.set(f.c))); fm.instanceColor.needsUpdate = true;
  const fernMat = windMaterial(); fernMat.side = THREE.DoubleSide;
  const fem = instanced(fern, fernMat, fe); fem.castShadow = false;
  instanced(mushroom, mat(0xffffff, { vertexColors: true }), ml).castShadow = false;
  // 石头：不规则形状 + 灰度变化；礁石区更密
  const rocks = [];
  for (let i = 0; i < 30; i++) { const a = rnd() * 6.3, r = 1.5 + rnd() * 6; const x = 20 + Math.cos(a) * r, z = 21 + Math.sin(a) * r; if (Math.hypot(x - 20, z - 21) < 2) continue; rocks.push({ x, y: heightAt(x, z) - 0.2, z, rx: rnd(), ry: rnd() * 6, s: 0.4 + rnd() * 1.1, sy: 0.5 + rnd() * 0.5 }); }
  for (let i = 0; i < 400 && rocks.length < 66; i++) { const x = -42 + rnd() * 84, z = -42 + rnd() * 84, h = heightAt(x, z); if (h > -0.6 && h < 9 && free(x, z, 1) && rnd() < 0.3) rocks.push({ x, y: h - 0.2, z, rx: rnd(), ry: rnd() * 6, s: 0.4 + rnd() * 1.4, sy: 0.6 + rnd() * 0.5 }); }
  const rockGeo = shadeByHeight(mergeColored([[blob(1, 1, 77, 0.22), 0xa39b8e]]), -0.8, 1, 0.75, 1.1);
  const rm = instanced(rockGeo, mat(0xffffff, { vertexColors: true }), rocks);
  rocks.forEach((r, i) => rm.setColorAt(i, col.setHSL(0.09 + rnd() * 0.03, 0.08 + rnd() * 0.08, 0.5 + rnd() * 0.16).multiplyScalar(1.6))); rm.instanceColor.needsUpdate = true;
  rocks.forEach(r => r.s > 0.9 && W.obstacles.push([r.x, r.z, r.s * 0.8]));
  // 沙滩上的漂流木和海星
  const drift = [];
  for (let i = 0; i < 200 && drift.length < 14; i++) { const a = rnd() * 6.28, r = 33 + rnd() * 6, x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z); if (h > 0.3 && h < 0.9 && free(x, z)) drift.push({ x, y: h + 0.05, z, ry: rnd() * 6, s: 0.6 + rnd() * 0.8 }); }
  const log = mergeColored([[new THREE.CylinderGeometry(0.12, 0.16, 2, 6).rotateZ(Math.PI / 2), 0xc9b291], [new THREE.CylinderGeometry(0.05, 0.07, 0.6, 5).rotateZ(0.8).translate(0.4, 0.2, 0), 0xc0a885]]);
  instanced(log, mat(0xffffff, { vertexColors: true }), drift);
  const star = new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.07 : 0.2, a = i / 10 * 6.28; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } return s; })(), { depth: 0.04, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const stars2 = [];
  for (let i = 0; i < 200 && stars2.length < 12; i++) { const a = rnd() * 6.28, r = 34 + rnd() * 5, x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z); if (h > 0.2 && h < 0.8 && free(x, z)) stars2.push({ x, y: h + 0.02, z, ry: rnd() * 6, s: 0.8 + rnd() * 0.6 }); }
  instanced(star, mat(0xf08a5a), stars2).castShadow = false;
}
function buildClouds() {
  // 圆润的积云：多个平滑球体合并，底部压平
  const rnd = mulberry(3), cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, transparent: true, opacity: 0.96, fog: false });
  W.cloudMat = cm;
  for (let i = 0; i < 16; i++) {
    const parts = [];
    for (let k = 0; k < 6; k++) { const r = 3.5 + rnd() * 4; parts.push(new THREE.SphereGeometry(r, 14, 10).translate((k - 2.5) * 4.2 + rnd() * 2, rnd() * 2.2 + (k > 1 && k < 4 ? 2 : 0), rnd() * 4 - 2)); }
    const geo = mergeGeometries(parts), pp = geo.attributes.position;
    for (let v = 0; v < pp.count; v++) if (pp.getY(v) < -1) pp.setY(v, -1 + (pp.getY(v) + 1) * 0.15);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, cm);
    const a = rnd() * 6.3, r = 110 + rnd() * 140;
    m.position.set(Math.cos(a) * r, 45 + rnd() * 35, Math.sin(a) * r); m.scale.y = 0.7;
    m.userData = { a, r, sp: 0.004 + rnd() * 0.006 };
    W.scene.add(m); clouds.push(m);
  }
}
// 简单的几何体合并（仅 position + normal）
function mergeGeometries(list) {
  const geos = list.map(g => g.index ? g.toNonIndexed() : g), n = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return out;
}

/* ================== 建筑与道具 ================== */
const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, c, seg = 8, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
const place = (o, x, z, ry = 0, dy = 0) => { o.position.set(x, heightAt(x, z) + dy, z); o.rotation.y = ry; W.scene.add(o); return o; };

/* ---------- 程序生成的贴图（木板、瓦片、条纹、石砖） ---------- */
const TEX = {};
function texPlanks(base = '#c9a074', vertical = false, rep = [1, 1]) {
  const k = 'pl' + base + vertical + rep;
  if (TEX[k]) return TEX[k];
  const t = canvasTex((x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const o = i * (vertical ? w : h) / n;
      x.fillStyle = `rgba(${i % 2 ? '255,255,255,.06' : '0,0,0,.06'})`;
      vertical ? x.fillRect(o, 0, w / n, h) : x.fillRect(0, o, w, h / n);
      x.fillStyle = 'rgba(60,35,20,.35)'; vertical ? x.fillRect(o, 0, 2, h) : x.fillRect(0, o, w, 2);
      for (let j = 0; j < 3; j++) { x.fillStyle = 'rgba(60,35,20,.12)'; const p = Math.random() * (vertical ? h : w); vertical ? x.fillRect(o + 4, p, w / n - 8, 1) : x.fillRect(p, o + 4, 1, h / n - 8); }
    }
  }, 128, 128);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); return TEX[k] = t;
}
function texShingles(base = '#b5533f') {
  const k = 'sh' + base; if (TEX[k]) return TEX[k];
  const t = canvasTex((x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const rows = 8, cols = 6;
    for (let r = 0; r < rows; r++) for (let c = 0; c <= cols; c++) {
      const cx = (c + (r % 2) * 0.5) * w / cols, cy = r * h / rows;
      x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`; x.beginPath(); x.ellipse(cx, cy + h / rows, w / cols / 2 - 1, h / rows * 0.95, 0, 0, Math.PI); x.fill();
      x.strokeStyle = 'rgba(40,20,10,.35)'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(cx, cy + h / rows, w / cols / 2 - 1, h / rows * 0.95, 0, 0, Math.PI); x.stroke();
    }
  }, 128, 128);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return TEX[k] = t;
}
function texStripes(a, b, n = 6) {
  const k = 'st' + a + b + n; if (TEX[k]) return TEX[k];
  const t = canvasTex((x, w, h) => { for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * w / n, 0, w / n + 1, h); } x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, h * 0.85, w, h * 0.15); }, 128, 64);
  return TEX[k] = t;
}
function texStone() {
  if (TEX.stone) return TEX.stone;
  const t = canvasTex((x, w, h) => {
    x.fillStyle = '#a8a196'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
      const sx = (c + (r % 2) * 0.5) * w / 5 - 6, sy = r * h / 6;
      x.fillStyle = `hsl(35,${6 + Math.random() * 8}%,${56 + Math.random() * 14}%)`; x.beginPath(); x.roundRect(sx + 2, sy + 2, w / 5 - 4, h / 6 - 4, 5); x.fill();
    }
  }, 128, 128);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return TEX.stone = t;
}
const texMat = (map, color = 0xffffff, extra = {}) => new THREE.MeshStandardMaterial({ map, color, roughness: 0.9, ...extra });
const meshOf = (geo, m, x = 0, y = 0, z = 0) => { const e = new THREE.Mesh(geo, m); e.position.set(x, y, z); e.castShadow = e.receiveShadow = true; return e; };
// 三角形截面的拉伸体（帐篷、山墙）
function prism(w, h, d) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g;
}

/* ---------- 帐篷：A 字形 + 门帘 + 拉绳地钉 ---------- */
function makeTent(c) {
  const g = new THREE.Group(), W2 = 2.7, H = 1.95, D = 2.9;
  const fabric = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide });
  // 两片斜面布：顶点直接按“屋檐→屋脊”插值，中间略向内凹
  for (const side of [-1, 1]) {
    const pg = new THREE.PlaneGeometry(1, 1, 8, 5), p = pg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5, sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.09;
      p.setXYZ(i, side * (W2 / 2 * (1 - v) - sag), H * v - sag * 0.4, (u - 0.5) * D);
    }
    pg.computeVertexNormals(); g.add(meshOf(pg, fabric));
  }
  // 后山墙 + 前门（深色开口 + 卷起的门帘）
  const back = meshOf(prism(W2, H, 0.03), fabric, 0, 0, -D / 2); g.add(back);
  const opening = new THREE.Mesh(prism(W2 * 0.55, H * 0.72, 0.02), new THREE.MeshBasicMaterial({ color: 0x2a1e1a })); opening.position.set(0, 0, D / 2 - 0.02); g.add(opening);
  const flapM = new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.82), roughness: 0.95, side: THREE.DoubleSide });
  for (const side of [-1, 1]) { const f = meshOf(prism(W2 * 0.48, H, 0.03), flapM, side * W2 * 0.27, 0, D / 2); f.scale.x = 0.55; g.add(f); const roll = meshOf(new THREE.CylinderGeometry(0.07, 0.07, H * 0.8, 6), flapM, side * W2 * 0.3, H * 0.42, D / 2 + 0.05); roll.rotation.z = side * 0.42; g.add(roll); }
  // 屋脊杆、门柱、地钉与拉绳
  const wood = mat(0x7a5634);
  g.add(meshOf(new THREE.CylinderGeometry(0.04, 0.04, D + 0.5, 5).rotateX(Math.PI / 2), wood, 0, H + 0.02, 0));
  g.add(meshOf(new THREE.CylinderGeometry(0.035, 0.035, H + 0.25, 5), wood, 0, (H + 0.25) / 2, D / 2 + 0.05));
  const rope = new THREE.LineBasicMaterial({ color: 0xe8dcc0 });
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pts = [new THREE.Vector3(sx * W2 * 0.3, H * 0.62, sz * D * 0.42), new THREE.Vector3(sx * (W2 / 2 + 0.7), 0.05, sz * (D / 2 + 0.3))];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), rope));
    g.add(meshOf(new THREE.CylinderGeometry(0.03, 0.01, 0.3, 4), wood, pts[1].x, 0.1, pts[1].z));
  }
  return g;
}

/* ---------- 木屋：石基 + 木板墙 + 人字屋顶（瓦片）+ 窗框百叶 + 花箱 + 烟囱 ---------- */
function buildHouse(x, z, ry, wall, roof, w = 3.6, d = 3.2) {
  const g = new THREE.Group(), H = 2.3, RH = 1.55;
  const wallHex = '#' + new THREE.Color(wall).getHexString(), roofHex = '#' + new THREE.Color(roof).getHexString();
  g.add(meshOf(new THREE.BoxGeometry(w + 0.2, 0.4, d + 0.2), texMat(texStone()), 0, 0.2, 0));
  const wm = texMat(texPlanks(wallHex, false, [1, 1]));
  g.add(meshOf(new THREE.BoxGeometry(w, H, d), wm, 0, 0.4 + H / 2, 0));
  // 山墙（前后）
  for (const s of [1, -1]) { const gb = meshOf(prism(w, RH, 0.05), texMat(texPlanks(wallHex, true, [1, 1])), 0, 0.4 + H, s * (d / 2 - 0.02)); g.add(gb); }
  // 两片屋顶板：屋脊沿前后方向（z），山墙在前后
  const slope = Math.hypot(w / 2 + 0.35, RH), ang = Math.atan2(RH, w / 2 + 0.35);
  const rt = texShingles(roofHex).clone(); rt.repeat.set(2, 1.4); rt.needsUpdate = true;
  const rmat = texMat(rt);
  for (const s of [1, -1]) {
    const r = meshOf(new THREE.BoxGeometry(slope + 0.1, 0.14, d + 0.6), rmat, s * (w / 2 + 0.35) / 2, 0.4 + H + RH / 2 + 0.06, 0);
    r.rotation.z = -s * ang; g.add(r);
  }
  g.add(meshOf(new THREE.BoxGeometry(0.2, 0.2, d + 0.7), mat(new THREE.Color(roof).multiplyScalar(0.7).getHex()), 0, 0.4 + H + RH + 0.05, 0));
  // 烟囱
  g.add(meshOf(new THREE.BoxGeometry(0.45, 1.3, 0.45), texMat(texStone()), w * 0.25, 0.4 + H + RH * 0.75, -d * 0.2));
  // 门（门框 + 门板 + 门把 + 台阶）
  const fz = d / 2 + 0.03, trim = mat(0xf3eadb);
  g.add(meshOf(new THREE.BoxGeometry(1.05, 1.75, 0.08), trim, -w * 0.18, 0.4 + 0.87, fz));
  g.add(meshOf(new THREE.BoxGeometry(0.85, 1.6, 0.08), texMat(texPlanks('#6e4a2c', true)), -w * 0.18, 0.4 + 0.8, fz + 0.03));
  g.add(meshOf(new THREE.SphereGeometry(0.05, 6, 4), mat(0xd4af37), -w * 0.18 + 0.28, 0.4 + 0.8, fz + 0.1));
  g.add(meshOf(new THREE.BoxGeometry(1.2, 0.18, 0.5), texMat(texStone()), -w * 0.18, 0.09, fz + 0.25));
  // 窗（发光玻璃 + 十字窗棂 + 百叶 + 花箱）
  const glass = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb050, emissiveIntensity: 0, roughness: 0.3 });
  (W.windows ||= []).push(glass);
  const wx = w * 0.22, wy = 0.4 + 1.35;
  g.add(meshOf(new THREE.BoxGeometry(0.85, 0.75, 0.06), trim, wx, wy, fz));
  g.add(meshOf(new THREE.BoxGeometry(0.7, 0.6, 0.06), glass, wx, wy, fz + 0.02));
  g.add(meshOf(new THREE.BoxGeometry(0.05, 0.6, 0.08), trim, wx, wy, fz + 0.04), meshOf(new THREE.BoxGeometry(0.7, 0.05, 0.08), trim, wx, wy, fz + 0.04));
  const shutter = mat(new THREE.Color(roof).multiplyScalar(0.85).getHex());
  for (const s of [-1, 1]) g.add(meshOf(new THREE.BoxGeometry(0.32, 0.75, 0.05), shutter, wx + s * 0.6, wy, fz + 0.01));
  g.add(meshOf(new THREE.BoxGeometry(0.9, 0.18, 0.22), texMat(texPlanks('#8a5a34')), wx, wy - 0.48, fz + 0.1));
  for (let i = 0; i < 4; i++) g.add(meshOf(new THREE.SphereGeometry(0.08, 6, 4), mat([0xff7aa0, 0xffd34a, 0xffffff, 0xff8a5b][i]), wx - 0.3 + i * 0.2, wy - 0.33, fz + 0.12));
  // 侧窗
  const sx = w / 2 + 0.03;
  const sideGlass = meshOf(new THREE.BoxGeometry(0.06, 0.55, 0.6), glass, sx, wy, 0); g.add(sideGlass, meshOf(new THREE.BoxGeometry(0.05, 0.7, 0.75), trim, sx - 0.01, wy, 0));
  W.obstacles.push([x, z, Math.max(w, d) * 0.62]);
  return place(g, x, z, ry);
}

/* ---------- 箱子：木板贴图 + 边框 ---------- */
function crate(s, x, y, z, ry = 0) {
  const g = new THREE.Group();
  g.add(meshOf(new THREE.BoxGeometry(s, s, s), texMat(texPlanks('#c39461')), 0, 0, 0));
  const fr = mat(0x7a5634);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.add(meshOf(new THREE.BoxGeometry(0.07, s + 0.02, 0.07), fr, a * s / 2, 0, b * s / 2)); g.add(meshOf(new THREE.BoxGeometry(s + 0.02, 0.07, 0.07), fr, 0, a * s / 2, b * s / 2)); g.add(meshOf(new THREE.BoxGeometry(0.07, 0.07, s + 0.02), fr, a * s / 2, b * s / 2, 0)); }
  g.position.set(x, y, z); g.rotation.y = ry; return g;
}

let _flameTex = null;
function flameTex() {
  return _flameTex ||= canvasTex((x, w, h) => {
    const g = x.createRadialGradient(w / 2, h * 0.72, 0, w / 2, h * 0.72, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(w / 2, 0); x.bezierCurveTo(w * 0.62, h * 0.35, w, h * 0.55, w / 2, h); x.bezierCurveTo(0, h * 0.55, w * 0.38, h * 0.35, w / 2, 0); x.fill();
  }, 64, 128);
}
function makeFire(scale = 1) {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), mat(0x8a857c)); s.position.set(Math.cos(i / 8 * 6.28) * 0.95, 0.12, Math.sin(i / 8 * 6.28) * 0.95); g.add(s); }
  for (let i = 0; i < 3; i++) { const l = cyl(0.11, 0.11, 1.4, 0x6e4a2c, 6); l.rotation.set(Math.PI / 2 - 0.35, i * 2.1, 0); l.position.y = 0.3; g.add(l); }
  const flame = new THREE.Group(); flame.visible = false;
  // 火焰：多层加色精灵（泪滴形渐变），各自抖动，内芯偏白、外焰偏红
  const layers = [[0xff5a1a, 1.5, 0.55, 0], [0xff8a2a, 1.25, 0.75, 1.3], [0xffb43a, 1.0, 0.9, 2.1], [0xffd77a, 0.75, 1, 0.7], [0xfff4d0, 0.45, 1, 2.9]];
  const sprites = [];
  for (let k = 0; k < 2; k++) layers.forEach(([c, s, o, ph], i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.userData = { s: s * (k ? 0.8 : 1), ph: ph + k * 1.7, dx: k ? (i % 2 ? 0.18 : -0.18) : 0 };
    sp.position.set(sp.userData.dx, 0.35 + s * 0.45, 0); flame.add(sp); sprites.push(sp);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a30, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(4.5); glow.position.y = 0.8; flame.add(glow);
  // 炭火
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.85 })); ember.rotation.x = -Math.PI / 2; ember.position.y = 0.06; flame.add(ember);
  const light = new THREE.PointLight(0xff9040, 0, 22, 1.6); light.position.y = 1.5; g.add(flame, light);
  g.scale.setScalar(scale);
  const api = { group: g, lit: false, setLit(on) { api.lit = on; flame.visible = on; light.intensity = on ? 18 : 0; } };
  W.updaters.push((dt, t) => {
    if (!api.lit) return;
    sprites.forEach(sp => { const u = sp.userData, f = 1 + Math.sin(t * 11 + u.ph) * 0.12 + Math.sin(t * 23 + u.ph * 2) * 0.06; sp.scale.set(u.s * 0.75 * (2 - f), u.s * 1.5 * f, 1); sp.position.x = u.dx + Math.sin(t * 5 + u.ph) * 0.05; });
    light.intensity = (W.time === 'day' ? 6 : 18) * (0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.07);
    glow.material.opacity = 0.5 + Math.sin(t * 11) * 0.1; ember.material.opacity = 0.7 + Math.sin(t * 3) * 0.15;
  });
  return api;
}
function buildCamp() {
  const [cx, cz] = LOC.camp;
  W.campfire = makeFire(); place(W.campfire.group, cx, cz);
  W.obstacles.push([cx, cz, 1.3]);
  const tent = (x, z, ry, c) => { W.obstacles.push([x, z, 1.8]); return place(makeTent(c), x, z, ry); };
  W.tents = [tent(-5.5, 12.5, 0.5, 0xe8a25a), tent(5.5, 12, -0.5, 0x6fa8dc), tent(-1, 9.5, 0, 0xd96c6c)];
  // 木箱、水桶、柴火、晒网架、信号旗
  W.crates = new THREE.Group(); W.crates.add(crate(0.9, 0, 0.45, 0, 0.1), crate(0.8, 0.95, 0.4, 0.2, -0.2), crate(0.7, 0.4, 1.25, 0.1, 0.4)); place(W.crates, 7.5, 16.5, 0.3); W.obstacles.push([7.9, 16.6, 1.2]);
  W.barrel = new THREE.Group(); W.barrel.add(cyl(0.48, 0.42, 1.1, 0x7a5434, 10, 0, 0.55, 0), cyl(0.5, 0.5, 0.08, 0x4a4a4a, 10, 0, 0.85, 0), cyl(0.5, 0.5, 0.08, 0x4a4a4a, 10, 0, 0.25, 0)); place(W.barrel, -7.5, 17); W.obstacles.push([-7.5, 17, 0.6]);
  W.woodpile = new THREE.Group(); for (let i = 0; i < 7; i++) { const l = cyl(0.16, 0.16, 1.6, 0x8a6038, 6, 0, 0.18 + Math.floor(i / 3) * 0.3, (i % 3) * 0.34 - 0.34 + (i > 5 ? 0.17 : 0)); l.rotation.z = Math.PI / 2; W.woodpile.add(l); } place(W.woodpile, -6, 21, 0.4); W.obstacles.push([-6, 21, 0.9]);
  W.netRack = new THREE.Group();
  W.netRack.add(cyl(0.08, 0.08, 2.2, 0x6e4a2c, 6, -1.4, 1.1, 0), cyl(0.08, 0.08, 2.2, 0x6e4a2c, 6, 1.4, 1.1, 0));
  const netTex = canvasTex((x, w) => { x.strokeStyle = 'rgba(240,235,220,.9)'; x.lineWidth = 3; for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, w); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); } });
  W.net = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.5), new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }));
  W.net.position.y = 1.35; W.netRack.add(W.net); place(W.netRack, 4, 24, 0.2);
  const pole = new THREE.Group(); pole.add(cyl(0.07, 0.09, 5, 0x8a6a48, 6, 0, 2.5, 0));
  const fg = new THREE.PlaneGeometry(1.6, 1, 8, 1); W.flagBase = Float32Array.from(fg.attributes.position.array);
  W.flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: 0xe8553a, side: THREE.DoubleSide, flatShading: true })); W.flag.position.set(0.8, 4.4, 0); pole.add(W.flag);
  place(pole, 9, 13); W.flagPole = pole; W.obstacles.push([9, 13, 0.3]);
  W.updaters.push((dt, t) => {
    const p = W.flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = W.flagBase[i * 3] + 0.8; p.array[i * 3 + 2] = Math.sin(x * 3 - t * 6 * W.uWind.value ** 0.5) * 0.12 * x * W.uWind.value ** 0.6; }
    p.needsUpdate = true;
  });
  // 篝火周围的木墩座位
  W.logSeats = [[3, 0], [-3, 0.2], [0.3, -3], [2.2, 2.6], [-2.4, 2.5]].map(([dx, dz]) => { const l = cyl(0.35, 0.38, 0.45, 0x8a6038, 8); return place(l, cx + dx, cz + dz, 0, 0.22); });
}
function buildHut() {
  const [x, z] = LOC.hut;
  W.hut = buildHouse(x, z, 0.6, 0x9b7b5b, 0x5d4636);
  // 小屋旁的旧信箱
  const post = new THREE.Group(); post.add(cyl(0.06, 0.06, 1.2, 0x6e4a2c, 6, 0, 0.6, 0), box(0.5, 0.35, 0.3, 0x3d6e8f, 0, 1.25, 0)); place(post, x + 3.2, z + 2.6, 0.4);
}
function buildVillage() {
  const [vx, vz] = LOC.village;
  const roofs = [0xd65a4a, 0x4a7ed6, 0xe0a83a, 0x5aa86a];
  [[vx + 5, vz - 5, -0.6], [vx - 4, vz - 6, 0.5], [vx + 7, vz + 3, -1.3], [vx - 1, vz + 7, 3.0]].forEach(([x, z, r], i) => buildHouse(x, z, r, 0xefe3cf, roofs[i], 3.2, 3));
  W.villageFire = makeFire(1.3); place(W.villageFire.group, vx, vz); W.obstacles.push([vx, vz, 1.6]);
  // 灯笼串
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xe8553a, emissive: 0xff7a3a, emissiveIntensity: 0, roughness: 0.6 });
  W.lanternMat = lanternMat;
  const posts = [[vx - 6, vz - 1], [vx - 1, vz - 7], [vx + 6, vz - 2], [vx + 4, vz + 6], [vx - 4, vz + 4]];
  posts.forEach(([x, z]) => place(cyl(0.08, 0.1, 3.4, 0x6e4a2c, 6, 0, 1.7, 0), x, z));
  posts.forEach(([x, z], i) => {
    const [x2, z2] = posts[(i + 1) % posts.length];
    for (let k = 1; k < 5; k++) {
      const t = k / 5, lx = x + (x2 - x) * t, lz = z + (z2 - z) * t, sag = Math.sin(t * Math.PI) * 0.6;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8).scale(1, 1.3, 1), lanternMat); l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8).translate(0, 0.2, 0), mat(0x3a2a20)), new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8).translate(0, -0.2, 0), mat(0x3a2a20)));
      l.position.set(lx, heightAt(x, z) * (1 - t) + heightAt(x2, z2) * t + 3.2 - sag, lz); l.scale.y = 1.3; W.scene.add(l);
    }
  });
  // 三个摊位
  W.booths = {};
  [['drum', vx - 6, vz + 1.5, 0xd65a4a], ['lantern', vx + 1, vz - 7.5, 0x4a7ed6], ['cook', vx + 6.5, vz + 0.5, 0xe0a83a]].forEach(([k, x, z, c]) => {
    const g = new THREE.Group(); g.add(box(2, 0.9, 1, 0xa87a48, 0, 0.45, 0), cyl(0.05, 0.05, 2.2, 0x6e4a2c, 5, -0.9, 1.1, -0.4), cyl(0.05, 0.05, 2.2, 0x6e4a2c, 5, 0.9, 1.1, -0.4));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.5), [mat(c), mat(c), texMat(texStripes('#' + new THREE.Color(c).getHexString(), '#fff4e0', 8)), mat(c), mat(c), mat(c)]); roof.position.y = 2.2; roof.rotation.x = 0.15; roof.castShadow = true; g.add(roof);
    for (let i = 0; i < 8; i++) { const v = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 3), mat(i % 2 ? 0xfff4e0 : c)); v.rotation.x = Math.PI; v.position.set(-1.05 + i * 0.3, 2.0, 0.78); g.add(v); }
    if (k === 'drum') g.add(cyl(0.45, 0.4, 0.5, 0xc0392b, 10, 0, 1.15, 0));
    if (k === 'cook') g.add(cyl(0.4, 0.3, 0.4, 0x555555, 10, 0, 1.1, 0));
    if (k === 'lantern') for (let i = 0; i < 3; i++) g.add(box(0.25, 0.3, 0.25, 0xfff0c0, -0.6 + i * 0.6, 1.05, 0));
    W.booths[k] = place(g, x, z, Math.atan2(vx - x, vz - z)); W.obstacles.push([x, z, 1.1]);
  });
  // 码头
  const dock = new THREE.Group(); for (let i = 0; i < 6; i++) dock.add(box(1.6, 0.15, 0.9, 0x9a7650, 0, 0.6, i * 1)); for (let i = 0; i < 3; i++) dock.add(cyl(0.1, 0.1, 2, 0x6e4a2c, 6, 0.8, -0.2, i * 2.4), cyl(0.1, 0.1, 2, 0x6e4a2c, 6, -0.8, -0.2, i * 2.4));
  dock.position.set(vx + 12, 0, vz + 2); dock.rotation.y = Math.PI / 2 - 0.3; W.scene.add(dock);
}
function buildLighthouse() {
  const [x, z] = LOC.lighthouse, g = new THREE.Group();
  const H = 13, seg = 6, smooth = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  // 石砌底座 + 台阶
  g.add(meshOf(new THREE.CylinderGeometry(2.9, 3.2, 1.1, 24), texMat(texStone()), 0, 0.55, 0));
  for (let i = 0; i < 3; i++) g.add(meshOf(new THREE.BoxGeometry(1.6, 0.22, 0.45), texMat(texStone()), 0, 0.11 + i * 0.22, 3.55 - i * 0.35));
  // 红白相间塔身（平滑）+ 每段之间的细腰线
  for (let i = 0; i < seg; i++) {
    const r0 = 2.2 - i * 0.12, r1 = 2.2 - (i + 1) * 0.12, y = 1.1 + (H - 1.1) / seg * (i + 0.5);
    g.add(meshOf(new THREE.CylinderGeometry(r1, r0, (H - 1.1) / seg, 28), smooth(i % 2 ? 0xd95a48 : 0xf6f2ea), 0, y, 0));
    if (i) g.add(meshOf(new THREE.TorusGeometry(r0 + 0.02, 0.05, 6, 28).rotateX(Math.PI / 2), smooth(0xe8e2d6), 0, 1.1 + (H - 1.1) / seg * i, 0));
  }
  // 塔身小窗
  for (let i = 0; i < 3; i++) { const y = 3.8 + i * 3.1, r = 2.2 - (y - 1.1) / (H - 1.1) * 0.72 + 0.01, a = 0.5 + i * 2.2; const w = meshOf(new THREE.BoxGeometry(0.42, 0.62, 0.12), smooth(0x2e3a52), Math.sin(a) * r, y, Math.cos(a) * r); w.rotation.y = a; g.add(w); }
  // 拱门
  const door = meshOf(new THREE.BoxGeometry(0.95, 1.45, 0.3), texMat(texPlanks('#6e4a2c', true)), 0, 1.82, 2.1); g.add(door);
  g.add(meshOf(new THREE.TorusGeometry(0.52, 0.08, 6, 12, Math.PI), smooth(0xe8e2d6), 0, 2.55, 2.27));
  // 观景平台 + 栏杆
  const ink = smooth(0x34394d);
  g.add(meshOf(new THREE.CylinderGeometry(2.05, 1.6, 0.35, 28), ink, 0, H + 0.1, 0));
  g.add(meshOf(new THREE.TorusGeometry(1.95, 0.05, 6, 32).rotateX(Math.PI / 2), ink, 0, H + 1.0, 0));
  g.add(meshOf(new THREE.TorusGeometry(1.95, 0.035, 6, 32).rotateX(Math.PI / 2), ink, 0, H + 0.6, 0));
  for (let i = 0; i < 20; i++) { const a = i / 20 * 6.28; g.add(meshOf(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 4), ink, Math.cos(a) * 1.95, H + 0.65, Math.sin(a) * 1.95)); }
  // 灯室：玻璃 + 竖向窗框
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.9, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.28, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })); glass.position.y = H + 1.25; g.add(glass);
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; g.add(meshOf(new THREE.BoxGeometry(0.08, 1.9, 0.08), ink, Math.cos(a) * 1.15, H + 1.25, Math.sin(a) * 1.15)); }
  g.add(meshOf(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 24), ink, 0, H + 2.2, 0));
  // 圆顶 + 通风球 + 避雷针
  g.add(meshOf(new THREE.SphereGeometry(1.3, 24, 10, 0, 6.29, 0, Math.PI / 2), smooth(0xd95a48), 0, H + 2.25, 0));
  g.add(meshOf(new THREE.SphereGeometry(0.22, 12, 8), ink, 0, H + 3.6, 0));
  g.add(meshOf(new THREE.CylinderGeometry(0.02, 0.03, 0.9, 4), ink, 0, H + 4.1, 0));
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x59607a, emissive: 0x000000, roughness: 0.3 });
  const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), lampMat); lamp.position.y = H + 1.15; g.add(lamp);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); lampGlow.scale.setScalar(9); lampGlow.position.y = H + 1.15; g.add(lampGlow);
  // 光束：两个开口锥体，绕 Y 轴旋转
  const beam = new THREE.Group(); beam.position.y = H + 1.15; beam.visible = false;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const dir of [1, -1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(7, 90, 24, 1, true), beamMat); c.rotation.z = dir * Math.PI / 2; c.position.x = -dir * 45; beam.add(c); }
  g.add(beam);
  const light = new THREE.PointLight(0xffffff, 0, 60, 1.4); light.position.y = H + 1.15; g.add(light);
  place(g, x, z, 0, -0.3); W.obstacles.push([x, z, 3]);
  W.lighthouse = {
    group: g, top: () => new THREE.Vector3(x, heightAt(x, z) + H + 0.85, z), door: () => P(x, z + 4.2),
    light(hex) {
      const c = new THREE.Color(hex);
      lampMat.color.copy(c); lampMat.emissive.copy(c); lampMat.emissiveIntensity = 3;
      lampGlow.material.color.copy(c); lampGlow.material.opacity = 0.9; beamMat.color.copy(c); beam.visible = true; light.color.copy(c); light.intensity = 60;
    },
  };
  W.updaters.push(dt => { if (beam.visible) beam.rotation.y += dt * 0.6; });
}
function buildCave() {
  const [x, z] = LOC.cave, g = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2, 0.9, 6, 10, Math.PI), mat(0x7f786e)); arch.position.y = 0.2; g.add(arch);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2, 12, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0b0b10 })); hole.position.set(0, 0.2, -0.3); g.add(hole);
  for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.6, 0), mat(0x8a8378)); r.position.set(-3 + i * 1.5, 0.2, -1 - Math.random()); g.add(r); }
  place(g, x, z - 1.5, 0); W.cave = g;
}
function buildWreck() {
  const [x, z] = LOC.wreck, g = new THREE.Group();
  const hull = box(6, 1.6, 2.4, 0x6e4a2c, 0, 0.3, 0); hull.rotation.set(0.3, 0, 0.25); g.add(hull);
  const mast = cyl(0.12, 0.15, 6, 0x5a3b26, 6, 1, 2.5, 0); mast.rotation.z = -0.7; g.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), new THREE.MeshStandardMaterial({ color: 0xe8e0cc, side: THREE.DoubleSide, flatShading: true })); sail.position.set(2.4, 3.6, 0.2); sail.rotation.z = -0.7; g.add(sail);
  g.position.set(x, -0.2, z); g.rotation.y = 0.9; W.scene.add(g);
}
function buildShip() {
  // 序章风暴中的客船（远海）
  const g = new THREE.Group(), front = new THREE.Group(), back = new THREE.Group();
  front.add(box(5, 2.2, 4, 0x2f3a4a, 2.5, 0, 0), box(3, 1.6, 3, 0xe8e2d4, 2, 1.8, 0)); const bow = new THREE.Mesh(new THREE.ConeGeometry(2, 3, 4), mat(0x2f3a4a)); bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.position.set(6.5, 0, 0); front.add(bow);
  back.add(box(5, 2.2, 4, 0x2f3a4a, -2.5, 0, 0), box(3, 2.4, 3, 0xe8e2d4, -2.5, 2.2, 0), cyl(0.5, 0.6, 2, 0xc0392b, 8, -2.5, 4.2, 0));
  const win = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc060, emissiveIntensity: 1.5 });
  for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.05), win); w.position.set(-3.6 + i * 0.7, 2.2, 1.52); back.add(w); }
  g.add(front, back); g.position.set(0, 0.6, 110); g.visible = false; W.scene.add(g);
  W.ship = { group: g, front, back };
}
function buildBoat() {
  const g = new THREE.Group();
  const hull = box(4, 1, 1.6, 0x8a5a3a, 0, 0.3, 0); g.add(hull);
  g.add(cyl(0.08, 0.1, 5, 0x5a3b26, 6, 0, 2.8, 0));
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), new THREE.MeshStandardMaterial({ color: 0xfff4dc, side: THREE.DoubleSide, flatShading: true })); sail.position.set(0.9, 3, 0); sail.rotation.y = Math.PI / 2; g.add(sail);
  const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); lamp.scale.setScalar(3); lamp.position.set(-1.8, 1.3, 0); g.add(lamp);
  g.position.set(60, 0, -170); g.visible = false; W.scene.add(g); W.boat = g;
}

/* ================== 粒子 ================== */
function buildParticles() {
  // 篝火火星
  const N = 40, sg = new THREE.BufferGeometry(), sp = new Float32Array(N * 3), life = new Float32Array(N);
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffb060, size: 0.18, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  W.scene.add(sparks);
  W.updaters.push(dt => {
    const fires = [W.campfire, W.villageFire].filter(f => f.lit);
    sparks.visible = fires.length > 0; if (!fires.length) return;
    for (let i = 0; i < N; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { const f = fires[i % fires.length].group.position; life[i] = 0.8 + Math.random() * 1.2; sp[i * 3] = f.x + (Math.random() - 0.5) * 0.6; sp[i * 3 + 1] = f.y + 0.6; sp[i * 3 + 2] = f.z + (Math.random() - 0.5) * 0.6; }
      sp[i * 3 + 1] += dt * 1.8; sp[i * 3] += Math.sin(life[i] * 6 + i) * dt * 0.4;
    }
    sg.attributes.position.needsUpdate = true;
  });
  // 雨
  const R = 1400, rg = new THREE.BufferGeometry(), rp = new Float32Array(R * 6);
  for (let i = 0; i < R; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; rp.set([x, y, z, x + 0.15, y - 0.9, z], i * 6); }
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc8d4e6, transparent: true, opacity: 0.45 })); rain.visible = false; rain.frustumCulled = false; W.scene.add(rain);
  W.updaters.push(dt => {
    if (!rain.visible) return;
    const c = W.camera.position;
    for (let i = 0; i < R; i++) {
      let y = rp[i * 6 + 1] - dt * 34;
      if (y < -2) { y = 28; rp[i * 6] = (Math.random() - 0.5) * 60; rp[i * 6 + 2] = (Math.random() - 0.5) * 60; }
      rp[i * 6 + 1] = y; rp[i * 6 + 3] = rp[i * 6] + 0.15; rp[i * 6 + 4] = y - 0.9; rp[i * 6 + 5] = rp[i * 6 + 2];
    }
    rain.position.set(c.x, c.y - 14, c.z - 6); rg.attributes.position.needsUpdate = true;
  });
  // 萤火虫（夜晚森林）
  const F = 50, fg = new THREE.BufferGeometry(), fp = new Float32Array(F * 3), fo = [];
  for (let i = 0; i < F; i++) { const x = -30 + Math.random() * 18, z = -16 + Math.random() * 30; fo.push([x, z, Math.random() * 6]); }
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xd8ff7a, size: 0.35, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  W.scene.add(fireflies);
  W.updaters.push((dt, t) => {
    fireflies.visible = W.time === 'night' || W.time === 'dusk'; if (!fireflies.visible) return;
    fo.forEach(([x, z, p], i) => fp.set([x + Math.sin(t * 0.5 + p) * 1.5, heightAt(x, z) + 1 + Math.sin(t * 0.8 + p * 2) * 0.6, z + Math.cos(t * 0.4 + p) * 1.5], i * 3));
    fg.attributes.position.needsUpdate = true;
  });
  lanternGroup = new THREE.Group(); W.scene.add(lanternGroup);
}
// 孔明灯（sky）或河灯（river）
export function releaseLanterns(origin, n = 6, mode = 'sky') {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xff9a40, emissiveIntensity: 1.2, flatShading: true }));
    const g = new THREE.Group(); g.add(body, s); s.scale.setScalar(1.6);
    g.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.5, (Math.random() - 0.5) * 3));
    g.userData = { v: mode === 'sky' ? new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.1 + Math.random() * 0.6, -0.3 - Math.random() * 0.4) : new THREE.Vector3((Math.random() - 0.3) * 0.8, 0, 0.6 + Math.random() * 0.6), mode, life: 40, delay: i * 0.6 };
    g.visible = false; lanternGroup.add(g);
  }
}
function updateLanterns(dt, t) {
  for (const g of [...lanternGroup.children]) {
    const u = g.userData;
    if (u.delay > 0) { u.delay -= dt; continue; }
    g.visible = true; u.life -= dt;
    g.position.addScaledVector(u.v, dt);
    if (u.mode === 'river') g.position.y = waveAt(g.position.x, g.position.z) + 0.2; else g.position.x += Math.sin(t + g.id) * dt * 0.2;
    if (u.life <= 0) lanternGroup.remove(g);
  }
}

/* ================== 时间、天气、闪电 ================== */
function applyPreset(name, k) {
  const p = PRESETS[name];
  for (const key in p) {
    if (COLOR_KEYS.includes(key)) cur[key].lerp(new THREE.Color(p[key]), k);
    else if (Array.isArray(p[key])) cur[key] = cur[key].map((v, i) => v + (p[key][i] - v) * k);
    else cur[key] += (p[key] - cur[key]) * k;
  }
  sky.material.uniforms.top.value.copy(cur.top); sky.material.uniforms.bottom.value.copy(cur.bottom);
  sky.material.uniforms.sunCol.value.copy(cur.sun).multiplyScalar(W.weather === 'storm' ? 0 : 1);
  sky.material.uniforms.sunDir.value.set(...cur.sunPos).normalize();
  W.scene.fog.color.copy(cur.fog);
  hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hI;
  sun.color.copy(cur.sun); sun.intensity = cur.sunI;
  ocean.material.color.copy(cur.sea);
  stars.material.opacity = cur.stars;
  W.cloudMat.color.copy(cur.fog).lerp(new THREE.Color(0xffffff), W.weather === 'storm' ? 0.1 : 0.55);
  W.cloudMat.emissive.copy(W.cloudMat.color); W.cloudMat.emissiveIntensity = 0.12 + cur.sunI * 0.08;
  (W.windows || []).forEach(m => m.emissiveIntensity = cur.lamps * 1.4);
  if (W.lanternMat) W.lanternMat.emissiveIntensity = cur.lamps * 0.9;
}
export function setTime(name, dur = 2.5) {
  W.time = name; postPreset(name, W.weather);
  if (!dur) { applyPreset(name, 1); return Promise.resolve(); }
  let last = 0;
  return tween(dur, k => { const step = (k - last) / (1 - last || 1); last = k; applyPreset(name, Math.min(1, step)); }, x => x);
}
export function setWeather(w) {
  W.weather = w; postPreset(W.time, w);
  const storm = w === 'storm';
  rain.visible = storm; W.uWind.value = storm ? 4.5 : 1; W.waveAmp = storm ? 2.6 : 1;
  W.scene.fog.near = storm ? 30 : 70; W.scene.fog.far = storm ? 140 : 260;
}
let flashT = 0, nextBolt = 4;
export function flash() { flashT = 0.25; }
let onThunder = null;
export const setThunderHandler = fn => { onThunder = fn; };

/* ================== 补间与镜头 ================== */
const easeIO = x => x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
export function tween(dur, fn, ease = easeIO) { return new Promise(res => W.tweens.push({ t: 0, dur, fn, ease, res })); }
export function camTo(pos, look, dur = 2, ease = easeIO) {
  W.cg = true;
  const p0 = W.camera.position.clone(), l0 = W.look.clone();
  return tween(dur, k => { W.camera.position.lerpVectors(p0, pos, k); W.look.lerpVectors(l0, look, k); W.camera.lookAt(W.look); }, ease);
}
export function camSet(pos, look) { W.cg = true; W.camera.position.copy(pos); W.look.copy(look); W.camera.lookAt(look); }
export function camFollow() { W.cg = false; }
export function shake(dur = 0.5, amp = 0.3) { W.shakeT = dur; W.shakeA = amp; }

/* ================== 交互物与区域 ================== */
let markerMesh;
export function setMarker(pos) {
  if (!markerMesh) {
    markerMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0xffd34a, emissive: 0xffb020, emissiveIntensity: 1, flatShading: true }));
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd34a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); gl.scale.setScalar(3); markerMesh.add(gl);
    W.scene.add(markerMesh);
  }
  W.markerPos = pos ? pos.clone() : null; markerMesh.visible = !!pos;
}
export function addInter(o) {
  const it = { radius: 2.2, enabled: true, label: '查看', waiters: [], ...o };
  if (it.mesh) it.mesh.traverse(m => { m.userData.interId = it.id; });
  W.inters.set(it.id, it); return it;
}
export function removeInter(id) { const it = W.inters.get(id); if (it?.mesh && it.removeMesh) W.scene.remove(it.mesh); W.inters.delete(id); if (W.near === it) { W.near = null; W.onNear?.(null); } }
export const waitInteract = id => new Promise(res => W.inters.get(id).waiters.push(res));
export async function triggerInteract(it) {
  if (W.busy || !it.enabled) return;
  W.busy = true; W.control = false; W.player?.stop(); W.onNear?.(null); W.near = null;
  if (W.player && it.pos) W.player.face(it.pos);
  try {
    if (it.onInteract) await it.onInteract(it);
    const ws = it.waiters.splice(0); ws.forEach(r => r(it));
  } finally { W.busy = false; W.control = W.roaming; }
}
export function ring(pos, color = 0xffd34a, r = 0.9) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.7, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos).add(new THREE.Vector3(0, 0.06, 0)); W.scene.add(m);
  W.updaters.push((dt, t) => { m.material.opacity = 0.5 + Math.sin(t * 4) * 0.3; m.scale.setScalar(1 + Math.sin(t * 4) * 0.06); });
  return m;
}
export function footprints(from, to, n = 14) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x9c8058, transparent: true, opacity: 0.6, depthWrite: false });
  const dir = new THREE.Vector3().subVectors(to, from), side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  for (let i = 0; i < n; i++) {
    const p = from.clone().lerp(to, i / n).addScaledVector(side, i % 2 ? 0.25 : -0.25);
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8), m); f.scale.set(0.7, 1.3, 1);
    f.rotation.x = -Math.PI / 2; f.rotation.z = -Math.atan2(dir.x, dir.z) + Math.PI; f.position.set(p.x, heightAt(p.x, p.z) + 0.04, p.z); g.add(f);
  }
  W.scene.add(g); return g;
}
const SHELL_COLORS = [0xffc6c6, 0xfff0c4, 0xd9c7ff, 0xc4f0ff, 0xffd9a8, 0xe8e8e8];
export function spawnShell(x, z, idx = 0) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, 6), new THREE.MeshStandardMaterial({ color: SHELL_COLORS[idx % SHELL_COLORS.length], flatShading: true, emissive: 0x332211, emissiveIntensity: 0.4 }));
  s.rotation.x = Math.PI / 2.4; g.add(s);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff6c0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(1.2); sp.position.y = 0.3; g.add(sp);
  g.position.set(x, heightAt(x, z) + 0.15, z); W.scene.add(g);
  W.updaters.push((dt, t) => { sp.material.opacity = 0.4 + Math.sin(t * 5 + x) * 0.4; g.rotation.y += dt; });
  return g;
}
export function lockZone(id, x, z, r) {
  const g = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * 6.28, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    s.position.set(x + Math.cos(a) * r * 0.85, heightAt(x + Math.cos(a) * r * 0.85, z + Math.sin(a) * r * 0.85) + 2 + Math.random() * 1.5, z + Math.sin(a) * r * 0.85);
    s.scale.setScalar(7 + Math.random() * 3); g.add(s);
  }
  W.scene.add(g); W.zones.set(id, { x, z, r, g });
}
export function unlockZone(id) {
  const zn = W.zones.get(id); if (!zn) return Promise.resolve();
  W.zones.delete(id);
  return tween(1.8, k => zn.g.children.forEach(s => { s.material.opacity = 0.85 * (1 - k); s.position.y += 0.03; })).then(() => W.scene.remove(zn.g));
}
export function walkable(x, z) {
  if (heightAt(x, z) < 0.18) return false;
  for (const zn of W.zones.values()) if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return false;
  for (const [ox, oz, r] of W.obstacles) if (Math.hypot(x - ox, z - oz) < r) return false;
  return true;
}
const v3 = new THREE.Vector3();
export function project(pos) {
  v3.copy(pos).project(W.camera);
  const r = W.renderer.domElement.getBoundingClientRect();
  return { x: (v3.x + 1) / 2 * r.width, y: (1 - v3.y) / 2 * r.height, behind: v3.z > 1, w: r.width, h: r.height };
}

/* ================== 输入 ================== */
function bindInput(el) {
  const pts = new Map(); let start = null, dragged = false, pinch0 = 0, zoom0 = 1;
  el.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now(), yaw: W.yaw }; dragged = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = W.zoom; dragged = true; }
  });
  el.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; W.zoom = Math.min(1.6, Math.max(0.6, zoom0 * pinch0 / Math.hypot(a[0] - b[0], a[1] - b[1]))); return; }
    if (start && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 10) dragged = true;
    if (dragged && start && !W.cg) W.yaw = start.yaw - (e.clientX - start.x) * 0.006;
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (start && !dragged && performance.now() - start.t < 450 && pts.size === 0) tap(e.clientX, e.clientY);
    if (pts.size === 0) start = null;
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => { pts.delete(e.pointerId); start = null; });
  el.addEventListener('wheel', e => { W.zoom = Math.min(1.6, Math.max(0.6, W.zoom * (1 + e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) W.keys.add(k);
    if ((k === 'e' || k === ' ') && W.control && W.near && !e.repeat && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); triggerInteract(W.near); }
    if (k === 'q') W.yaw += 0.3;
  });
  addEventListener('keyup', e => W.keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => W.keys.clear());
}
let tapRing;
function tap(cx, cy) {
  if (!W.control || !W.player) return;
  const r = W.renderer.domElement.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, W.camera);
  // 先检测可交互物体
  const meshes = []; W.inters.forEach(it => { if (it.enabled && it.mesh) meshes.push(it.mesh); });
  const hit = ray.intersectObjects(meshes, true)[0];
  if (hit) {
    let o = hit.object; while (o && !o.userData.interId) o = o.parent;
    const it = o && W.inters.get(o.userData.interId);
    if (it) {
      const dest = it.pos.clone().add(W.player.pos.clone().sub(it.pos).setY(0).normalize().multiplyScalar(Math.min(1.2, it.radius * 0.6)));
      W.player.moveTo(dest).then(() => { if (W.control && W.player.pos.distanceTo(it.pos) < it.radius + 0.6) triggerInteract(it); });
      return;
    }
  }
  const g = ray.intersectObject(terrain)[0];
  if (!g) return;
  W.onTapGround?.(g.point);
  W.player.moveTo(g.point);
  if (!tapRing) { tapRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })); tapRing.rotation.x = -Math.PI / 2; W.scene.add(tapRing); }
  tapRing.position.copy(g.point).add(new THREE.Vector3(0, 0.08, 0)); tapRing.userData.t = 0.6;
}

/* ================== 主循环 ================== */
const camOff = new THREE.Vector3(), desired = new THREE.Vector3(), lookTarget = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0, fpsChecked = false;
function loop() {
  const dt = Math.min(W.clock.getDelta(), 0.05), t = (W.uTime.value += dt);
  for (const tw of [...W.tweens]) { tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.ease(k)); if (k >= 1) { W.tweens.splice(W.tweens.indexOf(tw), 1); tw.res(); } }
  for (const u of W.updaters) u(dt, t);
  updateOcean(); updateLanterns(dt, t);
  clouds.forEach(c => { c.userData.a += c.userData.sp * dt * W.uWind.value; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; });
  sky.position.copy(W.camera.position); stars.position.copy(W.camera.position);
  // 键盘移动
  if (W.control && W.player && W.keys.size) {
    let fx = 0, fz = 0;
    if (W.keys.has('w') || W.keys.has('arrowup')) fz -= 1; if (W.keys.has('s') || W.keys.has('arrowdown')) fz += 1;
    if (W.keys.has('a') || W.keys.has('arrowleft')) fx -= 1; if (W.keys.has('d') || W.keys.has('arrowright')) fx += 1;
    if (fx || fz) {
      const c = Math.cos(W.yaw), s = Math.sin(W.yaw);
      W.player.walkDir(new THREE.Vector3(fx * c + fz * s, 0, -fx * s + fz * c).normalize(), dt);
    }
  }
  // 附近的交互物
  if (W.control && W.player && !W.busy) {
    let best = null, bd = 1e9;
    W.inters.forEach(it => { if (!it.enabled || !it.pos) return; const d = it.pos.distanceTo(W.player.pos); if (d < it.radius && d < bd) { bd = d; best = it; } });
    if (best !== W.near) { W.near = best; W.onNear?.(best); }
  } else if (W.near) { W.near = null; W.onNear?.(null); }
  // 任务标记
  if (markerMesh?.visible) { markerMesh.position.copy(W.markerPos).add(new THREE.Vector3(0, 3.2 + Math.sin(t * 3) * 0.25, 0)); markerMesh.rotation.y += dt * 2; }
  if (tapRing?.userData.t > 0) { tapRing.userData.t -= dt; tapRing.material.opacity = tapRing.userData.t / 0.6; tapRing.scale.setScalar(1 + (0.6 - tapRing.userData.t) * 2); }
  // 闪电
  if (W.weather === 'storm') { nextBolt -= dt; if (nextBolt <= 0) { flash(); nextBolt = 4 + Math.random() * 7; setTimeout(() => onThunder?.(), 300 + Math.random() * 900); } }
  if (flashT > 0) { flashT -= dt; hemi.intensity = cur.hI + (flashT > 0.12 || flashT < 0.06 ? 3 : 0.5); if (flashT <= 0) hemi.intensity = cur.hI; }
  // 镜头跟随
  if (!W.cg && W.player) {
    camOff.set(Math.sin(W.yaw) * 13 * W.zoom, 10.5 * W.zoom, Math.cos(W.yaw) * 13 * W.zoom);
    desired.copy(W.player.pos).add(camOff);
    const gh = heightAt(desired.x, desired.z) + 2.5; if (desired.y < gh) desired.y = gh;
    W.camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
    lookTarget.copy(W.player.pos).add(new THREE.Vector3(0, 1.4, 0));
    W.look.lerp(lookTarget, 1 - Math.exp(-dt * 6)); W.camera.lookAt(W.look);
  }
  if (W.shakeT > 0) { W.shakeT -= dt; W.camera.position.x += (Math.random() - 0.5) * W.shakeA; W.camera.position.y += (Math.random() - 0.5) * W.shakeA; }
  // 阴影相机跟随
  const focus = W.player ? W.player.pos : W.look;
  sun.target.position.copy(focus); sun.position.copy(focus).add(new THREE.Vector3(...cur.sunPos).normalize().multiplyScalar(60));
  renderPost(W.renderer, W.scene, W.camera, W.quality === 'high');
  // 首 6 秒帧率过低自动降画质
  if (!fpsChecked && W.player) { fpsAcc += dt; fpsN++; if (fpsAcc > 6) { fpsChecked = true; if (fpsN / fpsAcc < 26 && W.quality === 'high') { setQuality('low'); W.onAutoLow?.(); } } }
}
