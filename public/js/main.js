// 入口：WebGL 检测 → 场景初始化 → 标题页 → 序章 / 读档 → 七天 → 点灯 → 结果页
import * as THREE from 'three';
import { W, initWorld, setTime, camSet, setWeather, unlockZone, triggerInteract, setMarker } from './world.js';
import { initAudio, playMusic, setAmbience, sfx } from './audio.js';
import { $, el, bindState, hud, setTracker, updateHud, toast, talk, fade, openJournal, openBag, openSettings, wait } from './ui.js';
import { G, quests, SHELLS, NPC_BIO, ACHIEVEMENTS, connect, startPlay, loadSave, applySave, clearSave, resetGame, submitResult, fetchResult, unlock, addQuest, NET, track, saveGame } from './game.js';
import { IMG, ready, preload } from './assets.js';
import { computeResult, temperOf } from './score.js';
import { CH, setupCast, prologue, day1, day2, day3, day4, day5, day6, day7, caveCarving } from './story.js';
import { showResult, pickMoments, TEMPER } from './result.js';

const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
if (!hasWebGL()) location.replace('lite.html' + location.search);

const DAYS = [prologue, day1, day2, day3, day4, day5, day6];
const GAME = { quests, SHELLS, NPC_BIO, ACHIEVEMENTS };

// 标题页 / 分享页背景：镜头绕岛缓慢旋转
let orbit = null;
function startOrbit(r = 70, h = 34, look = new THREE.Vector3(4, 4, -2)) {
  let a = 0.6; orbit = dt => { a += dt * 0.05; camSet(new THREE.Vector3(Math.sin(a) * r, h, Math.cos(a) * r), look); };
  W.updaters.push(orbit);
}
function stopOrbit() { const i = W.updaters.indexOf(orbit); if (i >= 0) W.updaters.splice(i, 1); orbit = null; }

function bindHud() {
  $('#btnJournal').onclick = () => { openJournal(GAME); if (G.journalOpens >= 5) unlock('journal'); };
  $('#btnBag').onclick = () => openBag();
  $('#btnSettings').onclick = () => openSettings(async () => { await clearSave(); location.href = location.pathname; });
  W.onAutoLow = () => toast('检测到设备较吃力，已切换到流畅画质', '⚙️');
}

function titleScreen(save) {
  return new Promise(res => {
    const art = ready(IMG.title);
    const t = el('div', 'overlay title', `
      ${art ? `<img class="keyart" src="${art}" alt="">` : ''}
      <div class="tbox">
        <div class="logo"><span>灯塔岛</span><small>七日漂流</small></div>
        <div class="slogan">不做一道题，七天看清你自己</div>
        <div class="tbtns">
          ${save ? `<button class="btn cont">继续漂流 · ${save.day ? 'DAY ' + save.day : '序章'}</button>` : ''}
          <button class="btn ${save ? 'ghost' : ''} start">${save ? '重新开始' : '开始漂流'}</button>
        </div>
        <div class="tmeta">约 20 分钟 · 建议戴耳机 🎧 ${NET.online ? '' : '· 离线模式'}</div>
      </div>`);
    $('#app').append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    const go = async mode => {
      initAudio(); sfx('confirm');
      t.classList.remove('in'); await wait(500); t.remove(); res(mode);
    };
    $('.start', t).onclick = () => go('new');
    if (save) $('.cont', t).onclick = () => go('continue');
    // 首次交互即启用音频（标题音乐）
    const first = () => { initAudio(); playMusic('title'); removeEventListener('pointerdown', first); };
    addEventListener('pointerdown', first);
  });
}

// 读档后恢复世界状态（区域解锁、隐藏任务）
function restoreWorld() {
  if (G.day >= 3) unlockZone('forest');
  if (G.day >= 6) unlockZone('village');
  if (G.mystery >= 1 && G.mystery < 4) {
    const steps = ['', '山洞口的岩壁上，好像刻着同样的螺旋符号。', '问问阿嬷，照片上的人是谁（潮灯节时她会在渔村）', '去渔村码头看看那条旧木船'];
    addQuest({ id: 'mys', title: '守塔人之谜', desc: steps[G.mystery], kind: 'hidden' });
    if (G.mystery === 1) caveCarving();
  }
  updateHud();
}

async function finale() {
  const typeNow = () => computeResult(G.signals, NET.weights).type;
  const lamp = () => TEMPER[temperOf(typeNow())].hex;
  await day7(lamp, G.mystery >= 4);
  const tp = TEMPER[temperOf(typeNow())];
  await talk([`是${tp.n}的光。`, `阿嬷眯起眼睛：「${tp.w}……四十年了，我第一次见到这种颜色。」`, ['ma', '孩子，这座岛会照出每个人心里的样子。来看看你的吧。', 'happy']]);
  hud(false); setTracker(null); setMarker(null);
  const R = await submitResult(pickMoments(G.signals, G.moments, NET.weights));
  await clearSave();
  if (R.id) history.replaceState(null, '', `?r=${R.id}`);
  startOrbit(60, 26, W.lighthouse.top());
  showResult(R, { own: true, onReplay: () => { location.href = location.pathname; } });
}

async function play(mode, save) {
  stopOrbit();
  if (mode === 'continue' && save) applySave(save); else { resetGame(); await clearSave(); }
  await startPlay();
  setupCast();
  bindState(G, CH);
  bindHud();
  if (mode === 'continue') {
    restoreWorld(); hud(true);
    setTime('day', 0); setWeather('clear'); setAmbience({ waves: 0.18 });
    toast(`从 ${G.day ? 'DAY ' + G.day : '序章'} 继续`, '📖');
  }
  const startDay = mode === 'continue' ? G.day : 0;
  track('start', { mode, day: startDay });
  for (let d = startDay; d < DAYS.length; d++) {
    await DAYS[d]();
    if (d === 0) { await day1(); d = 1; }
  }
  await finale();
}

async function sharedView(id) {
  setTime('night', 0);
  let R = null; try { R = await fetchResult(id); } catch { /* 无效链接 */ }
  if (!R) { toast('这个分享链接已失效', '🔗'); history.replaceState(null, '', location.pathname); return false; }
  W.lighthouse.light(TEMPER[temperOf(R.type)].hex);
  startOrbit(60, 26, W.lighthouse.top());
  bindState(G, {}); fade(false, 600);
  showResult(R, { own: false, onReplay: () => { location.href = location.pathname; } });
  addEventListener('pointerdown', () => { initAudio(); playMusic('ending'); }, { once: true });
  return true;
}

(async function main() {
  initWorld($('#scene'));
  // 自动化测试钩子：?debug
  if (new URLSearchParams(location.search).has('debug')) window.__island = { W, G, quests, triggerInteract, stopOrbit, setTime, setWeather, THREE };
  bindState(G, {});
  const loading = $('#loading');
  await Promise.all([preload(), connect()]);
  loading.classList.add('hide'); setTimeout(() => loading.remove(), 600);
  const r = new URLSearchParams(location.search).get('r');
  if (r && await sharedView(r)) return;
  setTime('dusk', 0); startOrbit(); fade(false, 900);
  const save = await loadSave();
  const mode = await titleScreen(save);
  await fade(true, 500);
  await play(mode, save);
})().catch(e => {
  console.error(e);
  const b = el('div', 'overlay modal', `<div class="panel pop"><div class="ptitle">😵 出了点问题</div><div class="phint">${String(e?.message || e)}</div><button class="btn">刷新重试</button></div>`);
  $('.btn', b).onclick = () => { try { saveGame(); } catch { /* ignore */ } location.reload(); };
  $('#app').append(b);
});
