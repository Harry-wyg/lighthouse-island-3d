// 后期：MSAA 抗锯齿 + 泛光（篝火、灯笼、灯塔、窗户）+ 调色与暗角
// 低画质直接渲染，不走后期链
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.12 }, uContrast: { value: 1.06 }, uVignette: { value: 0.32 }, uTint: { value: new THREE.Color(1, 1, 1) }, uLift: { value: 0.012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette, uLift; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(.2126, .7152, .0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - .18) * uContrast + .18;
      c.rgb = c.rgb * uTint + uLift;
      vec2 d = vUv - .5; float v = 1. - dot(d, d) * uVignette * 2.2;
      c.rgb *= clamp(v, 0., 1.);
      gl_FragColor = vec4(max(c.rgb, 0.), c.a);
    }`,
};

let composer = null, bloom = null, grade = null;
export function initPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.55, 0.86);
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader); composer.addPass(grade);
  composer.addPass(new OutputPass());
  return composer;
}
export function resizePost(w, h, pr) { if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); } }
export function renderPost(renderer, scene, camera, useComposer) {
  if (useComposer && composer) composer.render(); else renderer.render(scene, camera);
}
// 随时段调整：夜晚泛光更强、暗角更重；风暴降饱和
export function postPreset(time, weather) {
  if (!bloom) return;
  const night = time === 'night', dusk = time === 'dusk', storm = weather === 'storm' || time === 'storm';
  bloom.strength = night ? 0.95 : dusk ? 0.7 : 0.45;
  bloom.threshold = night ? 0.6 : 0.86;
  grade.uniforms.uSat.value = storm ? 0.78 : night ? 1.0 : 1.12;
  grade.uniforms.uVignette.value = night ? 0.5 : storm ? 0.45 : 0.3;
  grade.uniforms.uTint.value.set(...(dusk ? [1.04, 0.98, 0.95] : night ? [0.95, 0.98, 1.06] : [1, 1, 1]));
}
