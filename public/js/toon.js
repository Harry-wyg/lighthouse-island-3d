// 卡通渲染工具：分段光照材质 + 法线外扩描边（角色与重点道具共用，保证画风统一）
import * as THREE from 'three';

// 4 段明暗渐变：暗部不压死，保留柔和
const gradient = (() => {
  const d = new Uint8Array([90, 150, 215, 255]);
  const t = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const cache = new Map();
// unique: true → 返回独立实例（需要单独改颜色时，如可换色的衣服、头发）
export function toon(color, { unique = false, ...extra } = {}) {
  const k = color + JSON.stringify(extra);
  if (!unique && cache.has(k)) return cache.get(k);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra });
  if (!unique) cache.set(k, m);
  return m;
}

// 描边：沿法线外扩的背面壳，线宽按世界单位，不随距离变细太多
const outlineMats = new Map();
export function outlineMat(width = 0.022, color = 0x2a2030) {
  const k = width + '_' + color;
  if (outlineMats.has(k)) return outlineMats.get(k);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'outline' + k;
  outlineMats.set(k, m); return m;
}
// 给一个 Mesh 加描边（共享几何体，不额外占内存）
export function outline(mesh, width, color) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(width, color));
  o.userData.isOutline = true; o.castShadow = false; o.receiveShadow = false; o.raycast = () => {};
  mesh.add(o); return mesh;
}
// 对一个 Group 内所有（未标记 noOutline 的）Mesh 加描边
export function outlineAll(group, width, color) {
  const list = [];
  group.traverse(o => { if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline && !o.isInstancedMesh) list.push(o); });
  list.forEach(m => outline(m, width, color));
  return group;
}
// 柔和的接触阴影（圆形渐变贴片），低画质关闭实时阴影时角色依然“站在地上”
let blobTex = null;
export function blobShadow(r = 0.6, opacity = 0.35) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.raycast = () => {};
  return m;
}
