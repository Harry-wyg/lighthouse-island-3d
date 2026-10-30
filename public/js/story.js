// 剧情脚本：序章 + 七天 + 梦境加时 + 点灯结局
import * as THREE from 'three';
import { W, P, at, LOC, heightAt, setTime, setWeather, camTo, camSet, camFollow, addInter, removeInter, waitInteract, ring, footprints, spawnShell, lockZone, unlockZone, releaseLanterns, flash, shake, tween, setThunderHandler } from './world.js';
import { makeChar, CAST, VILLAGER_LOOKS } from './characters.js';
import { talk, toast, dayCard, fade, letterbox, caption, flashScreen, confetti, updateHud, hud, wait, playVideo } from './ui.js';
import { playMusic, setAmbience, sfx } from './audio.js';
import { G, O, choose, add, addQuest, questStep, completeQuest, hasQuest, heart, unlock, gainShell, addItem, useStamina, gainPart, saveGame, track, bindChars } from './game.js';
import * as MG from './minigames.js';
import { videoFor } from './assets.js';
import { pctOf, dimScore } from './score.js';

export const CH = {};
const V = (x, z) => new THREE.Vector3(x, 0, z);

/* ================== 角色与通用工具 ================== */
export function setupCast() {
  CH.me = makeChar({ ...G.look, isPlayer: true, scale: 0.9, speed: 5 });
  W.player = CH.me;
  for (const k of ['chen', 'lu', 'mu', 'ma']) CH[k] = makeChar(CAST[k]);
  CH.vil = VILLAGER_LOOKS.concat(VILLAGER_LOOKS).map(l => makeChar(l));
  bindChars(CH);
  setThunderHandler(() => sfx('thunder'));
  // 主角在场景中预放
  CH.me.place(at('camp'));
  ['chen', 'lu', 'mu', 'ma'].forEach(k => CH[k].place(V(0, 300)));
  CH.vil.forEach((v, i) => { const a = i / CH.vil.length * 6.28; v.place(P(25 + Math.cos(a) * 4.5, -5 + Math.sin(a) * 4.5), a + Math.PI); v.setAnim('idle'); });
  lockZone('forest', -20, -4, 11); lockZone('village', 25, -5, 11);
}
function put(k, x, z, anim = 'idle', faceTo = null) {
  const c = CH[k]; c.stop(); c.root.visible = true; c.place(V(x, z)); c.setAnim(anim); c.setMood('calm'); c.setAlert(false);
  if (faceTo) { c.root.rotation.y = Math.atan2(faceTo.x - x, faceTo.z - z); c.faceY = null; }
  return c;
}
const hide = k => { CH[k].root.visible = false; CH[k].place(V(0, 300)); };
const firePos = () => at('camp');
// 自由探索：直到 promise 完成
async function roam(p) {
  W.roaming = true; W.control = true; camFollow();
  try { return await p; } finally { W.roaming = false; W.control = false; W.player.stop(); }
}
// 走到某处附近
function reach(pos, r = 3) {
  return new Promise(res => {
    const f = () => { if (W.player.pos.distanceTo(pos) < r) { queueMicrotask(() => { const i = W.updaters.indexOf(f); if (i >= 0) W.updaters.splice(i, 1); }); res(); } };
    W.updaters.push(f);
  });
}
// 对话镜头：从两人连线的侧面取景（略偏向主角身后），保证双方都在画面里
function focus(chars, dist = 7, h = 3.2) {
  const up = new THREE.Vector3(0, 1, 0), mid = new THREE.Vector3(); chars.forEach(c => mid.add(c.pos)); mid.divideScalar(chars.length);
  const toCam = W.camera.position.clone().sub(mid).setY(0).normalize();
  let dir = toCam;
  if (chars.length >= 2) {
    let a = chars[0].pos, b = chars[1].pos, span = 0;
    for (const x of chars) for (const y of chars) { const d = x.pos.distanceTo(y.pos); if (d > span) { span = d; a = x.pos; b = y.pos; } }
    const ab = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    if (ab.lengthSq() > 0.01) {
      dir = new THREE.Vector3(-ab.z, 0, ab.x).normalize();
      if (dir.dot(toCam) < 0) dir.negate();
      // 往主角一侧偏一点，做出过肩镜头的感觉
      const me = chars.includes(CH.me) ? CH.me.pos : null;
      // 竖屏画面窄：更多地转到主角身后（过肩），横屏可以更侧面
      const portrait = W.camera.aspect < 1;
      if (me) { const side = new THREE.Vector3(me.x - mid.x, 0, me.z - mid.z).normalize(); dir.addScaledVector(side, portrait ? 1.6 : 0.35).normalize(); }
      dist = Math.max(dist * (portrait ? 0.85 : 0.7), span * (portrait ? 1.1 : 1.25) + (portrait ? 4.2 : 3.2));
    } else dist = Math.max(dist * 0.7, span * 1.25 + 3.2);
  }
  const pos = mid.clone().addScaledVector(dir, dist).add(up.clone().multiplyScalar(h));
  pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 1.5);
  return camTo(pos, mid.clone().setY(mid.y + 1.4), 0.9);
}
async function cine(fn) { W.control = false; letterbox(true); try { await fn(); } finally { letterbox(false); camFollow(); } }
async function teleport(x, z, ry = Math.PI) { await fade(true, 450); CH.me.stop(); CH.me.place(V(x, z), ry); W.yaw = 0; W.camera.position.copy(P(x, z, 10).add(new THREE.Vector3(0, 0, 13))); await fade(false, 450); }
async function newDay(n, title, sub, time = 'day', music = 'day') {
  G.day = n; G.stamina = null; updateHud(); track('day', { day: n });
  await fade(true, 500);
  await dayCard(n, title, sub);
  setTime(time, 0); playMusic(music);
  setAmbience({ waves: 0.18, birds: time === 'day' ? 0.12 : 0, fire: 0 });
  saveGame();
}
function shell(x, z) {
  if (!P(x, z).y || heightAt(x, z) < 0.2) return;
  const id = 'shell' + x + '_' + z, m = spawnShell(x, z, Math.random() * 6 | 0);
  addInter({ id, pos: P(x, z), radius: 1.8, label: '捡起贝壳', mesh: m, onInteract: async () => { W.player.setAnim('kneel'); await wait(400); W.player.setAnim('idle'); W.scene.remove(m); removeInter(id); gainShell(); } });
}
function npcInter(k, label, onInteract, r = 2.6) {
  return addInter({ id: 'npc_' + k, pos: CH[k].pos, radius: r, label, mesh: CH[k].root, onInteract });
}
function giveHeart(k, d) { heart(k, d); }
function lighthouseDoor() {
  addInter({ id: 'lhdoor', pos: W.lighthouse.door(), radius: 2.6, label: '灯塔的门', onInteract: async () => {
    await talk([`灯塔的门半掩着，里面的灯室空空荡荡。还缺 ${6 - G.parts.length} 个零件。`, '站在这里能看到整座岛，和岛外一望无际的海。']);
  } });
}

/* ================== 序章 ================== */
async function stormCG() {
  const s = W.ship;
  s.group.visible = true; setWeather('storm'); setTime('storm', 0); playMusic('storm'); setAmbience({ waves: 0.3, wind: 0.25, rain: 0.2 });
  let rock = true; const rocker = (dt, t) => { if (rock) { s.group.rotation.z = Math.sin(t * 1.3) * 0.18; s.group.rotation.x = Math.sin(t * 0.9) * 0.1; s.group.position.y = 0.6 + Math.sin(t * 1.1) * 0.6; } };
  W.updaters.push(rocker);
  letterbox(true);
  camSet(new THREE.Vector3(16, 3, 128), new THREE.Vector3(0, 2, 110));
  await fade(false, 1200);
  await caption('三天前，一艘开往南方群岛的客船，遇上了百年一遇的风暴。', 3200);
  camTo(new THREE.Vector3(-10, 6, 124), new THREE.Vector3(0, 2, 110), 5);
  flash(); sfx('thunder', 0.2); await caption('浪越来越高，船身发出可怕的断裂声。', 2800);
  flash(); shake(1.2, 0.5); sfx('thunder'); flashScreen('#fff', 600);
  rock = false;
  await tween(1.6, k => { s.front.rotation.z = -k * 0.6; s.front.position.x = k * 2; s.back.rotation.z = k * 0.5; s.back.position.x = -k * 1.5; s.group.position.y = 0.6 - k * 2; });
  await caption('你只记得自己抱着一块木板，在黑暗里漂了很久很久……', 3000);
  await fade(true, 1200);
  W.updaters.splice(W.updaters.indexOf(rocker), 1);
  s.group.visible = false; setWeather('clear'); setAmbience({ waves: 0.18 });
}
export async function prologue() {
  G.day = 0; updateHud(); track('day', { day: 0 });
  await fade(true, 300);
  await dayCard(0, '漂流', '风暴过后，你醒在一座陌生的岛上');
  const opening = await videoFor('opening');
  if (opening) await playVideo(opening); else await stormCG();
  // 沙滩醒来
  setTime('dawn', 0); playMusic('title'); setAmbience({ waves: 0.22, birds: 0.05 });
  const [wx, wz] = LOC.wake;
  CH.me.place(V(wx, wz), 0.4); CH.me.setAnim('lie'); CH.me.setMood('calm');
  letterbox(true);
  camSet(P(wx + 1.2, wz + 1.5, 2.2), P(wx, wz, 0.4));
  await fade(false, 1500);
  await talk(['……哗——哗——', '海浪一下一下拍着你的脚踝。', '你睁开眼，脸贴着湿漉漉的沙子，嘴里全是咸味。']);
  CH.me.setAnim('idle'); await wait(500);
  camTo(P(wx - 2, wz + 4, 2.4), P(wx, wz, 1.6), 1.2);
  await MG.createCharacter(look => CH.me.setLook(look));
  CH.me.setLook(G.look);
  // 拉远，露出灯塔
  CH.me.face(at('lighthouse')); CH.me.setAnim('lookUp');
  await camTo(P(wx + 6, wz + 10, 9), P(6, -30, 12), 3.5);
  await talk(['远处的山崖上，立着一座熄灭的灯塔。', '沙滩上有一串新鲜的脚印，一直延伸到岛的里面。']);
  CH.me.setAnim('idle'); letterbox(false);
  hud(true); updateHud();
  await choose('口袋里有一本泡湿的《荒岛生存指南》，要先翻一翻吗？', [
    O('翻一翻，心里有底再出发', 'JP', 1, 0.3, 'p.guide'),
    O('不看了，边走边摸索', 'JP', -1, 0.3, 'p.guide'),
  ]).then(({ o }) => o.v > 0
    ? talk(['📖 第一页：点击地面就能走过去，拖动屏幕可以转动视角。', '📖 第二页：走近发光的东西或人，会出现交互按钮。', '📖 第三页：右上角的日志里能看到任务、伙伴和收集。', '📖 最后一页：岛上没有对错，跟着自己的心走。'])
    : talk(['你把指南塞回口袋。反正……也就是一座岛嘛。', '（小提示：点击地面移动，拖动屏幕旋转视角）']));
  const fp = footprints(P(wx - 1, wz - 1), P(1, 21), 18);
  addQuest({ id: 'p.camp', title: '顺着脚印走', desc: '脚印通向岛的里面，也许那里有人。', target: at('camp') });
  // 营地里的人
  put('chen', 2.5, 19, 'work'); put('lu', -2, 18.5, 'idle'); put('mu', -3, 16.2, 'cough');
  CH.chen.face(at('camp'));
  await roam(reach(at('camp'), 9));
  completeQuest('p.camp'); W.scene.remove(fp);
}

/* ================== DAY 1 · E/I ================== */
export async function day1() {
  if (G.day < 1) {
    // 接序章：营地初遇
    G.day = 1; updateHud();
  } else {
    await newDay(1, '沙滩上的人们', '主线：找到灯油');
    put('chen', 2.5, 19, 'work'); put('lu', -2, 18.5, 'idle'); put('mu', -3, 16.2, 'cough');
    CH.me.place(V(2, 24), Math.PI);
    await fade(false, 600);
  }
  saveGame(); playMusic('day'); setTime('day', 3); setAmbience({ waves: 0.18, birds: 0.12 });
  await cine(async () => {
    CH.lu.face(CH.me.pos); CH.chen.face(CH.me.pos); CH.mu.face(CH.me.pos);
    CH.lu.setAnim('wave'); CH.chen.setAnim('wave');
    await focus([CH.me, CH.lu, CH.chen], 8);
    await talk([['chen', '嘿！还有一个活着的！快过来！', 'surprised']]);
    CH.lu.setAnim('idle'); CH.chen.setAnim('idle');
    await talk([
      ['chen', '我叫老陈，船上的大副。这是小鹿，那边那个是阿木。', 'happy'],
      ['lu', '你没受伤吧？我们刚生了火，正在煮海带汤～', 'happy'],
      ['mu', '……你好。咳、咳。'],
      ['chen', '你叫什么？……{name}？好名字。'],
      ['chen', '看到崖上那座灯塔了吗？只要把它重新点亮，过往的船就能看见我们。'],
      ['chen', '不过灯塔缺了好几样零件。得在这岛上一点点找回来。', 'calm'],
    ]);
  });
  await choose('今天该怎么开始？', [
    O('留在营地边干活边聊，先认识每个人', 'EI', 1, 1, 'd1.start', '刚上岛的第一天，你选择先和大家待在一起'),
    O('一个人去礁石区转转，安静地摸清这座岛', 'EI', -1, 1, 'd1.start', '刚上岛的第一天，你选择一个人去礁石区走走'),
  ]);
  // 自由探索：主线 + 两条互斥支线（体力只够做一条）
  G.stamina = 6; G.staminaMax = 6; updateHud();
  put('ma', LOC.maNet[0], LOC.maNet[1], 'work');
  addQuest({ id: 'd1.ma', title: '找到岛上的居民', desc: '老陈说东边的小路上见过一个人影。', target: at('maNet') });
  toast('今天体力有 6 点，支线任务会消耗体力', '⚡');
  CH.lu.setAlert(true, '💬');
  let sideFirst = null;
  const sideDone = { lu: false, reef: false };
  npcInter('lu', '和小鹿说话', async () => {
    if (sideFirst === 'lu') return talk([['lu', '快去叫老陈和阿木呀～', 'happy']]);
    if (sideFirst === 'reef') return talk([['lu', '你去礁石那边玩啦？下次再一起办自我介绍会吧！']]);
    await focus([CH.me, CH.lu], 5);
    await talk([['lu', '{name}！我想办个「自我介绍会」，让大家快点熟起来！', 'happy'], ['lu', '你能帮我去叫老陈和阿木吗？要跑好几趟哦。']]);
    const { o } = await choose('要帮小鹿吗？（消耗 4 点体力）', [O('好呀，我去叫人！', 'EI', 0.8, 0.8, 'd1.side'), O('我想先自己走走，下次吧', 'EI', -0.3, 0.4, 'd1.side')]);
    camFollow();
    if (o.v < 0) return;
    if (!useStamina(4)) return toast('体力不够了', '😮‍💨');
    sideFirst = sideFirst || 'lu'; CH.lu.setAlert(false);
    addQuest({ id: 'd1.party', title: '自我介绍会', desc: '去叫老陈和阿木（0/2）', kind: 'side', target: CH.chen.pos });
    let n = 0;
    const call = (k, line) => npcInter(k, '叫' + (k === 'chen' ? '老陈' : '阿木'), async () => {
      await focus([CH.me, CH[k]], 5); await talk(line); removeInter('npc_' + k); n++;
      questStep('d1.party', n < 2 ? `去叫老陈和阿木（${n}/2）` : '回去找小鹿', n < 2 ? (k === 'chen' ? CH.mu.pos : CH.chen.pos) : CH.lu.pos);
      if (n === 2) npcInter('lu', '告诉小鹿人到齐了', async () => {
        removeInter('npc_lu');
        await cine(async () => {
          put('chen', 2.4, 18.6, 'sit', firePos()); put('mu', -2.4, 18.5, 'sit', firePos()); put('lu', 3, 16, 'sit', firePos());
          CH.me.place(V(0.3, 19.6)); CH.me.face(firePos()); CH.me.setAnim('sit');
          await camTo(P(0, 24, 4), P(0, 17, 1), 1.2);
          await talk([['lu', '我先来！我叫小鹿，最喜欢做饭，梦想是开一家海边小餐馆！', 'happy'], ['chen', '老陈。跑了三十年船。……就这些。'], ['mu', '我、我叫阿木……在读大学。谢谢你们照顾我。'], ['lu', '轮到你啦，{name}！']]);
          await choose('轮到你了，你会——', [O('站起来大方地介绍，还讲了个笑话', 'EI', 1, 0.8, 'd1.intro', '自我介绍会上，你站起来讲了个笑话'), O('简单说两句，然后把话题交给下一个人', 'EI', -1, 0.8, 'd1.intro')]);
          await talk([['lu', '太好了！以后我们就是一个小队啦！', 'happy']]);
          CH.me.setAnim('idle'); put('chen', 2.5, 19, 'work'); put('mu', -3, 16.2, 'cough'); put('lu', -2, 18.5, 'idle');
        });
        giveHeart('lu', 15); giveHeart('mu', 5); completeQuest('d1.party'); sideDone.lu = true;
      });
    }, 2.8);
    call('chen', [['chen', '自我介绍？……行吧，等我搬完这块石头。', 'calm']]);
    call('mu', [['mu', '我……也可以去吗？好的。咳。', 'happy']]);
  });
  const reefM = ring(at('reef'), 0x8fe3ff, 1.4);
  addInter({ id: 'reef', pos: at('reef'), radius: 2.6, label: '礁石区的潮池', onInteract: async () => {
    if (sideFirst === 'reef') return;
    if (sideFirst === 'lu') return talk(['潮池里有很多闪闪发光的东西，不过今天已经没力气了。']);
    await talk(['礁石之间有一片安静的潮池，水下好像有很多漂亮的贝壳。', '这里只有海浪声。']);
    const { o } = await choose('要一个人在这里捡贝壳吗？（消耗 4 点体力）', [O('好，就我一个人，慢慢捡', 'EI', -0.8, 0.8, 'd1.side'), O('还是回去找大家吧', 'EI', 0.3, 0.4, 'd1.side')]);
    if (o.v > 0) return;
    if (!useStamina(4)) return toast('体力不够了', '😮‍💨');
    sideFirst = sideFirst || 'reef'; W.scene.remove(reefM);
    addQuest({ id: 'd1.reef', title: '潮池拾贝', desc: '捡起 5 枚贝壳（0/5）', kind: 'side' });
    let n = 0;
    [[17.5, 19], [22, 18.5], [23.5, 22.5], [19, 24], [16, 22.5]].forEach(([x, z]) => {
      const id = 'rs' + x, m = spawnShell(x, z, n);
      addInter({ id, pos: P(x, z), radius: 1.8, label: '捡起贝壳', mesh: m, onInteract: async () => {
        W.player.setAnim('kneel'); await wait(350); W.player.setAnim('idle'); W.scene.remove(m); removeInter(id); gainShell(); n++;
        questStep('d1.reef', `捡起 5 枚贝壳（${n}/5）`);
        if (n === 5) { completeQuest('d1.reef'); unlock('loner'); add('EI', -0.5, 0.5, 'd1.reefDone', '第一天，你一个人在礁石区安安静静地捡了 5 枚贝壳'); sideDone.reef = true; }
      } });
    });
  } });
  // 主线：遇见阿嬷
  const maDone = new Promise(res => npcInter('ma', '补渔网的老人', async () => {
    await cine(async () => {
      CH.ma.face(CH.me.pos); await focus([CH.me, CH.ma], 5.5);
      await talk(['小路边，一位陌生的老人正坐着补渔网。', '她抬头看了你一眼，又低下头继续干活。']);
      await choose('你会……', [
        O('主动上前打招呼：「您好！您是岛上的人吗？」', 'EI', 1, 1, 'd1.ma', '遇见陌生的阿嬷，你主动上前搭话'),
        O('在旁边站一会儿，看她补网，等她先开口', 'EI', -1, 1, 'd1.ma', '遇见陌生的阿嬷，你安静地等她先开口'),
      ]);
      CH.ma.setAnim('talk');
      await talk([['ma', '……年轻人，你们是从那艘破船上来的吧。'], ['ma', '我在这岛上住了四十年了，大家叫我阿嬷。修灯塔？', 'surprised'], ['ma', '我那儿有一罐灯油，拿去吧。灯塔……也该亮一亮了。', 'calm']]);
      CH.ma.setAnim('work');
    });
    gainPart(0); addItem('🛢️', '灯油'); toast('获得灯塔零件：灯油（1/6）', '🛢️', 'good'); giveHeart('ma', 10);
    removeInter('npc_ma'); completeQuest('d1.ma'); res();
  }, 3));
  shell(-9, 27); shell(14, 30);
  lighthouseDoor();
  await roam(maDone.then(async () => {
    // 已接的支线需要做完
    while ((sideFirst === 'lu' && !sideDone.lu) || (sideFirst === 'reef' && !sideDone.reef)) await wait(300);
  }));
  ['npc_lu', 'npc_chen', 'npc_mu', 'reef'].forEach(removeInter); W.scene.remove(reefM); CH.lu.setAlert(false);
  if (!sideFirst) add('EI', 0, 0.1, 'd1.noSide');
  G.stamina = null; updateHud();

  // 夜晚篝火：自己走过去选座位
  await fade(true, 800);
  setTime('night', 0); playMusic('night'); setAmbience({ waves: 0.15, fire: 0.5 });
  W.campfire.setLit(true); hide('ma');
  put('chen', -1.2, 19.3, 'sit', firePos()); put('lu', 1.2, 19.4, 'sit', firePos()); put('mu', 3.2, 15.4, 'sit', firePos());
  CH.chen.setAnim('sitTalk');
  CH.me.place(V(0, 25), Math.PI);
  await fade(false, 800);
  await talk(['夜幕降临，大家围坐在篝火旁。老陈在讲他跑船时遇到鲸鱼的故事。']);
  addQuest({ id: 'd1.seat', title: '找个位置坐下', desc: '篝火边有三个空位，走过去坐下。' });
  const seats = [
    { id: 'seatA', x: 0, z: 20.2, label: '坐进热闹的一圈', v: 1, m: '篝火晚会上，你坐进了最热闹的那一圈' },
    { id: 'seatB', x: 3.8, z: 13.8, label: '坐到阿木身边', v: -0.5, m: '篝火晚会上，你坐到了一个人待着的阿木身边' },
    { id: 'seatC', x: -6.2, z: 15.5, label: '坐到树影下', v: -1, m: '篝火晚会上，你选了树影下安静的位置' },
  ];
  const rings = seats.map(s => ring(P(s.x, s.z), 0xffd34a, 0.8));
  const t0 = performance.now();
  const seat = await roam(new Promise(res => seats.forEach(s => addInter({ id: s.id, pos: P(s.x, s.z), radius: 1.6, label: s.label, onInteract: async () => res(s) }))));
  seats.forEach(s => removeInter(s.id)); rings.forEach(r => W.scene.remove(r)); completeQuest('d1.seat', true);
  add('EI', seat.v, 1.1, 'd1.seat', seat.m); track('seat', { seat: seat.id, sec: Math.round((performance.now() - t0) / 1000) });
  CH.me.place(V(seat.x, seat.z)); CH.me.face(firePos()); CH.me.setAnim('sit');
  await cine(async () => {
    await camTo(P(seat.x * 0.5 + 0, (seat.z + 16) / 2 + 6, 3.5), P(0, 16, 1.2), 1.2);
    if (seat.id === 'seatA') { await talk([['lu', '{name}快坐快坐！老陈刚讲到鲸鱼把船顶起来了！', 'happy'], ['chen', '……那鲸鱼比船还大，我们都以为要完了。', 'happy']]); giveHeart('lu', 5); giveHeart('chen', 5); }
    if (seat.id === 'seatB') { await talk([['mu', '……你怎么坐这儿了？', 'surprised'], ['mu', '其实，我不太会和很多人一起聊天。谢谢你。', 'happy']]); giveHeart('mu', 12); }
    if (seat.id === 'seatC') { await talk(['从这里看过去，火光映着每个人的脸。', '海浪声和笑声混在一起，你觉得很安心。']); }
    const bat = MG.battery();
    await talk(['篝火聊到了深夜。大家轮流讲自己为什么会在那艘船上。']);
    await bat.drain(32);
    CH.lu.setAnim('idle'); put('lu', 1.2, 19.4, 'cheer');
    await talk([['lu', '我们去海边放孔明灯吧！我做了好几个，一人一个，一起放！', 'happy']]);
    const { o } = await choose('你的社交电量还剩 32%……', [
      O('走！人多才好玩，电量什么的不重要', 'EI', 1, 1, 'd1.lantern', '社交电量只剩三成时，你还是跟大家去放了孔明灯'),
      O('「你们去吧，我回帐篷歇会儿。」', 'EI', -1, 1, 'd1.lantern', '社交电量只剩三成时，你选择回帐篷安静一下'),
    ]);
    if (o.v > 0) {
      unlock('firestar');
      await fade(true, 500);
      ['chen', 'lu', 'mu'].forEach((k, i) => { put(k, -2 + i * 2, 26.5, 'lookUp'); CH[k].root.rotation.y = Math.PI; });
      CH.me.place(V(3.5, 26.3), Math.PI); CH.me.setAnim('lookUp');
      camSet(P(1, 21, 3), P(1, 27, 3)); await fade(false, 500);
      releaseLanterns(P(1, 27), 7, 'sky'); sfx('whoosh');
      await camTo(P(1, 20, 2), P(1, 34, 16), 6);
      await talk([['lu', '许个愿吧！希望我们都能平安回家！', 'happy']]);
      await bat.fill(45);
    } else {
      await fade(true, 600); CH.me.place(V(-1, 11.5), 0); CH.me.setAnim('sleep');
      camSet(P(0, 14, 3), P(-1, 11, 0.5)); await fade(false, 600);
      await talk(['帐篷外传来大家的笑声，你听着海浪，慢慢闭上了眼睛。']);
      await bat.fill(80);
    }
    await choose('躺下之前你想：明天要「充满电」，最好的方式是——', [O('和大家一起热热闹闹地吃顿早饭，聊聊天', 'EI', 1, 1, 'd1.recharge'), O('一个人早起，听着海浪发会儿呆', 'EI', -1, 1, 'd1.recharge')]);
    bat.remove();
  });
  await choose('明天要分组去森林里找零件。你希望——', [O('四个人一起去，路上还能说说话', 'EI', 1, 0.8, 'd1.group'), O('两两分组，或者干脆我自己一路', 'EI', -1, 0.8, 'd1.group')]);
  W.campfire.setLit(false); CH.me.setAnim('idle');
}

/* ================== DAY 2 · S/N ================== */
export async function day2() {
  await newDay(2, '岛屿的秘密', '主线：找到齿轮', 'dawn', 'day');
  put('chen', 2.5, 19, 'work'); put('lu', -2, 18.5, 'idle'); put('mu', -3, 16.2, 'sit'); put('ma', 1, 21, 'idle');
  CH.me.place(V(1, 24.5), Math.PI); W.yaw = 0;
  setTime('day', 6);
  await fade(false, 600);
  await cine(async () => {
    CH.ma.face(CH.me.pos); await focus([CH.me, CH.ma], 5);
    await talk([['ma', '早啊。灯塔以前的守塔人，就住在森林深处的小屋里。'], ['ma', '他十年前出海，再也没回来。齿轮……也许在他那儿。', 'sad'], ['ma', '森林里的雾，今早散了。']]);
    await choose('趁着出发前，你更想先问阿嬷——', [
      O('「森林里哪儿有淡水？哪些果子能吃？」', 'SN', 1, 1, 'd2.ask', '出发前，你先问阿嬷哪里有淡水、哪些果子能吃'),
      O('「这座岛为什么叫回声岛？有什么传说吗？」', 'SN', -1, 1, 'd2.ask', '出发前，你先问阿嬷这座岛有什么传说'),
    ]);
  });
  await unlockZone('forest'); toast('森林的雾散了', '🌲');
  hide('ma'); setAmbience({ waves: 0.12, birds: 0.2 });
  const [hx, hz] = LOC.hut, door = P(hx + Math.sin(0.6) * 2.7, hz + Math.cos(0.6) * 2.7);
  addQuest({ id: 'd2.hut', title: '守塔人的小屋', desc: '穿过森林，找到守塔人住过的小屋。', target: door });
  shell(-30, 14); shell(28, 18); lighthouseDoor();
  await roam(new Promise(res => addInter({ id: 'hut', pos: door, radius: 2.8, label: '推开小屋的门', mesh: W.hut, onInteract: async () => {
    sfx('door'); await fade(true, 400);
    await fade(false, 200);
    await MG.hutSearch(() => {
      if (!hasQuest('mys')) { G.mystery = 1; addQuest({ id: 'mys', title: '守塔人之谜', desc: '日记夹着一张照片。山洞口的岩壁上，好像刻着同样的螺旋符号。', kind: 'hidden', target: P(-11, -9) }); add('SN', -0.4, 0.3, 'mys.1'); }
    });
    await talk(['小屋地板下有一个生锈的铁箱，齿轮就卡在里面的机关中。']);
    await MG.gearPuzzle();
    removeInter('hut'); res();
  } })));
  gainPart(1); addItem('⚙️', '齿轮'); toast('获得灯塔零件：齿轮（2/6）', '⚙️', 'good'); completeQuest('d2.hut');
  caveCarving();
  // 小鹿拉你去山坡看云
  put('lu', LOC.hill[0] + 1.5, LOC.hill[1], 'wave');
  addQuest({ id: 'd2.hill', title: '山坡上的小鹿', desc: '小鹿在中间的山坡上朝你招手。', target: at('hill') });
  await roam(reach(at('hill'), 3.5));
  completeQuest('d2.hill', true);
  await cine(async () => {
    CH.lu.setAnim('lie'); CH.me.place(V(LOC.hill[0] - 0.5, LOC.hill[1]), 0); CH.me.setAnim('lie');
    await camTo(P(LOC.hill[0], LOC.hill[1] + 3, 4), P(LOC.hill[0], LOC.hill[1] - 30, 40), 1.6);
    await talk([['lu', '累了吧？躺一会儿嘛，你看天上！', 'happy']]);
    await MG.clouds(choose, O);
    await talk([['lu', '嘿嘿，你说的好有意思。', 'happy']]); giveHeart('lu', 8);
    CH.me.setAnim('idle'); CH.lu.setAnim('idle');
  });
  addQuest({ id: 'd2.back', title: '回营地', desc: '把齿轮带回营地。', target: at('camp') });
  await roam(reach(at('camp'), 6));
  completeQuest('d2.back', true);
  put('ma', 1, 21, 'idle');
  await cine(async () => {
    CH.ma.face(CH.me.pos); await focus([CH.me, CH.ma], 5);
    await talk([['ma', '回来啦？那屋里都有些什么？']]);
    await choose('你脱口而出的是——', [
      O('「桌上有 7 个果子，窗台有半截蜡烛，门口还有脚印。」', 'SN', 1, 1, 'd2.recall', '阿嬷问小屋里有什么，你一口气报出了果子、蜡烛和脚印'),
      O('「感觉……有人在那里等了很久很久。」', 'SN', -1, 1, 'd2.recall', '阿嬷问小屋里有什么，你说「感觉有人在那里等了很久」'),
    ]);
    await choose('那你觉得，守塔人去哪儿了？', [O('脚印往东边去了，应该先顺着东边找找', 'SN', 1, 0.8, 'd2.guess'), O('地图上写着「回去」……他也许是想回到某个地方', 'SN', -1, 0.8, 'd2.guess')]);
    await talk([['ma', '……是吗。', 'sad']]);
  });
  hide('ma');
}
export function caveCarving() {
  if (W.inters.has('carving')) return;
  addInter({ id: 'carving', pos: P(-11, -9), radius: 2.4, label: '岩壁上的刻痕', onInteract: async () => {
    if (G.mystery !== 1) return talk(['岩壁上刻着一圈圈螺旋，不知道是什么意思。']);
    await talk(['岩壁上刻着和小屋里一样的螺旋，旁边还有一行小字：「每一圈，是一年。」', '数一数，一共有十圈。', '……照片上的人，会是谁呢？']);
    G.mystery = 2; questStep('mys', '问问阿嬷，照片上的人是谁（潮灯节时她会在渔村）', null); add('SN', -0.5, 0.3, 'mys.2'); removeInter('carving');
  } });
}

/* ================== DAY 3 · T/F ================== */
export async function day3() {
  await newDay(3, '争吵', '主线：找回镜片', 'day', 'tense');
  put('chen', 1.5, 19.5, 'angry', firePos()); put('lu', -1.5, 19.5, 'angry', firePos()); put('mu', -3, 16.2, 'cough');
  CH.chen.face(CH.lu.pos); CH.lu.face(CH.chen.pos);
  CH.me.place(V(0, 24), Math.PI);
  await fade(false, 600);
  await cine(async () => {
    await focus([CH.chen, CH.lu, CH.mu], 7);
    CH.chen.setMood('angry'); CH.lu.setMood('angry'); CH.mu.setMood('sad');
    await talk(['第三天早上，食物和水都只剩一半了。阿木发起了高烧。', ['chen', '我一天搬几十块石头，阿木躺了一整天，凭什么吃一样多？', 'angry'], ['lu', '老陈！阿木是生病了，又不是偷懒！', 'angry'], ['mu', '……没关系，我少吃点就行。', 'sad'], '大家都看向你。']);
    await choose('你开口说——', [
      O('「按劳分配吧，规则清楚，大家才不会互相猜忌。」', 'TF', 1, 1, 'd3.rule', '食物不够时，你提议按劳分配，让规则说话'),
      O('「阿木病了，先照顾他。这不是谁吃亏的问题。」', 'TF', -1, 1, 'd3.rule', '食物不够时，你站出来说先照顾生病的阿木'),
    ]).then(({ o }) => o.v > 0 ? (giveHeart('chen', 8), CH.lu.setAnim('sad')) : (giveHeart('mu', 8), giveHeart('lu', 5), CH.chen.setAnim('sad')));
    await talk([['chen', '……行吧。水由你来分，我们都听你的。', 'calm']]);
  });
  const cnt = await MG.water();
  CH.mu.setMood(cnt.mu >= 3 ? 'happy' : 'sad'); CH.chen.setMood(cnt.chen >= 3 ? 'happy' : 'sad');
  if (cnt.mu >= 3) giveHeart('mu', 8); if (cnt.chen >= 3) giveHeart('chen', 6); if (cnt.lu >= 2) giveHeart('lu', 4);
  await talk([cnt.mu > cnt.chen ? ['chen', '……哼。算了，阿木确实需要。', 'calm'] : cnt.chen > cnt.mu ? ['lu', '……阿木只有这么点吗？', 'sad'] : ['chen', '一样多，挺公平。', 'calm']]);
  CH.chen.setAnim('work'); CH.lu.setAnim('idle'); playMusic('day');
  // 潮间带：小鹿哭 vs 镜片闪光，先走向哪边？
  put('lu', 6, 27, 'cry', V(6, 40));
  const glintPos = P(11, 27.5), glint = spawnShell(11, 27.5, 3); glint.scale.setScalar(1.6);
  await talk(['下午，小鹿蹲在海边哭得停不下来。她把刚找到的灯塔镜片弄丢了。', '浅滩上，有个东西在阳光下一闪一闪。']);
  addQuest({ id: 'd3.lens', title: '找回镜片', desc: '小鹿在海边哭；浅滩上有东西在闪光。', target: null });
  let first = null;
  const lensDone = new Promise(res => {
    const finish = () => { if (first && W.inters.has('lu3') === false && W.inters.has('glint') === false) res(); };
    addInter({ id: 'lu3', pos: P(6, 27), radius: 2.4, label: '走向小鹿', mesh: CH.lu.root, onInteract: async () => {
      if (!first) { first = 'lu'; add('TF', -1, 1, 'd3.tide', '小鹿弄丢镜片哭起来时，你先走到她身边安慰她'); }
      CH.me.setAnim('hug'); await focus([CH.me, CH.lu], 4.5);
      await talk([['lu', '我……我把镜片弄丢了。大家一定会怪我的……', 'sad']]);
      await talk([['me', '没人会怪你，你已经很努力了。'], ['lu', '……嗯。谢谢你，{name}。', 'happy']]);
      CH.me.setAnim('idle'); CH.lu.setAnim('idle'); giveHeart('lu', first === 'lu' ? 12 : 6); removeInter('lu3'); camFollow(); finish();
    } });
    addInter({ id: 'glint', pos: glintPos, radius: 2, label: '浅滩里的闪光', mesh: glint, onInteract: async () => {
      if (!first) { first = 'glint'; add('TF', 1, 1, 'd3.tide', '小鹿弄丢镜片哭起来时，你先去浅滩把镜片找了回来'); }
      CH.me.setAnim('kneel'); await wait(600); W.scene.remove(glint); CH.me.setAnim('cheer');
      await talk(['是镜片！它卡在两块石头之间，一点都没坏。']); CH.me.setAnim('idle'); removeInter('glint');
      if (W.inters.has('lu3')) await talk(['……小鹿还蹲在那边哭呢。']);
      else giveHeart('lu', 6);
      finish();
    } });
  });
  await roam(lensDone);
  gainPart(2); addItem('🔍', '镜片'); toast('获得灯塔零件：镜片（3/6）', '🔍', 'good'); completeQuest('d3.lens');
  shell(-14, 28); shell(30, 16);
  // 夜里撞见老陈偷吃
  await fade(true, 700); setTime('night', 0); playMusic('night'); setAmbience({ waves: 0.12 });
  put('chen', 7.2, 15.2, 'work', V(7.9, 16.6)); put('lu', 0, 300); hide('lu'); put('mu', -1, 11.5, 'sleep');
  CH.me.place(V(4.5, 13.5), 1.5);
  camSet(P(3, 18, 3.2), P(7, 15.5, 1)); await fade(false, 700);
  await cine(async () => {
    await talk(['深夜，你起来喝水，正好撞见老陈蹲在物资箱边，偷偷吃一罐罐头。']);
    CH.chen.face(CH.me.pos); CH.chen.setAnim('idle'); CH.chen.setMood('surprised'); CH.chen.emote('😳');
    await talk([['chen', '……被你看到了。', 'surprised'], ['chen', '我腿上的旧伤又犯了，饿得睡不着。', 'sad']]);
    const { o } = await choose('你会——', [
      O('「规则就是规则。明天你的那份要扣掉，大家才会服气。」', 'TF', 1, 1, 'd3.chen', '撞见老陈偷吃罐头，你坚持按规则扣掉他明天的份'),
      O('「腿疼怎么不早说？这罐算我的，明天我跟大家解释。」', 'TF', -1, 1, 'd3.chen', '撞见老陈偷吃罐头，你选择替他打圆场'),
    ]);
    await talk([o.v > 0 ? ['chen', '……你说得对。是我不对。', 'sad'] : ['chen', '……谢了，小子。这个人情我记下了。', 'happy']]);
    giveHeart('chen', o.v > 0 ? 3 : 12);
    await choose('躺下之后，你更在意今天的哪件事？', [O('分配到底合不合理，明天要不要改改规则', 'TF', 1, 0.8, 'd3.reflect'), O('大家今天是不是都受了委屈，关系有没有变差', 'TF', -1, 0.8, 'd3.reflect')]);
  });
}

/* ================== DAY 4 · J/P ================== */
export async function day4() {
  await newDay(4, '风暴将至', '主线：找到绳索', 'day', 'prep');
  put('chen', 1.5, 20, 'idle'); put('lu', -1.5, 20, 'idle'); put('mu', -3, 16.2, 'sit'); put('ma', 0, 22, 'idle');
  CH.me.place(V(0, 25), Math.PI);
  setTime('dusk', 30); setAmbience({ waves: 0.25, wind: 0.08 }); W.uWind.value = 2;
  await fade(false, 600);
  await cine(async () => {
    CH.ma.face(CH.me.pos); await focus([CH.me, CH.ma, CH.chen], 7);
    await talk([['ma', '海鸟都往内陆飞了。今晚会有大风暴。', 'sad'], ['chen', '天黑之前，营地得全部收拾好！{name}，你来安排！', 'angry']]);
  });
  const plan = await MG.planBoard();
  // 在 3D 场景里跑去做每一项任务
  const targets = { roof: W.tents[0].position, water: W.barrel.position, wood: W.woodpile.position, net: W.netRack.position, food: W.crates.position, flag: W.flagPole.position };
  const names = Object.fromEntries(MG.PREP_TASKS.map(t => [t.id, t.e + ' ' + t.n]));
  const done = [], ringsM = {};
  addQuest({ id: 'd4.prep', title: '风暴前的准备', desc: plan.planned ? `按计划：${plan.order.map(id => names[id]).join(' → ')}` : '把 6 件事都做完（0/6）', target: plan.planned ? targets[plan.order[0]].clone() : null });
  let leakAsked = false;
  const prepDone = new Promise(res => MG.PREP_TASKS.forEach(t => {
    ringsM[t.id] = ring(targets[t.id].clone(), 0xffd34a, 1.2);
    addInter({ id: 'prep_' + t.id, pos: targets[t.id].clone(), radius: 3.2, label: names[t.id], onInteract: async () => {
      CH.me.setAnim('work'); sfx('gear'); await wait(1100); CH.me.setAnim('idle');
      if (t.id === 'food') W.crates.visible = false;
      if (t.id === 'net') W.net.visible = false;
      removeInter('prep_' + t.id); W.scene.remove(ringsM[t.id]); done.push(t.id); sfx('pick');
      const next = plan.planned ? plan.order.find(id => !done.includes(id)) : null;
      questStep('d4.prep', plan.planned ? (next ? `下一项：${names[next]}（${done.length}/6）` : '全部完成！') : `把 6 件事都做完（${done.length}/6）`, next ? targets[next].clone() : null);
      if (done.length === 3 && !leakAsked) {
        leakAsked = true; shake(0.4, 0.15); sfx('splash'); W.uWind.value = 3;
        await choose('哗啦——帐篷顶突然漏水了！你会——', [
          O('停一下，把剩下的任务重新排一遍', 'JP', 1, 1, 'd4.leak', '干到一半帐篷漏水，你停下来重新排了剩下的任务'),
          O('先冲过去补漏，剩下的到时候再说', 'JP', -1, 1, 'd4.leak', '干到一半帐篷漏水，你先冲过去补漏，其他的再说'),
        ]);
      }
      if (done.length === 6) res();
    } });
  }));
  await roam(prepDone);
  completeQuest('d4.prep');
  if (plan.planned) {
    const same = done.slice(0, 4).every((id, i) => id === plan.order[i]);
    add('JP', same ? 1 : -0.6, 0.5, 'd4.follow'); if (same) unlock('planner');
  }
  await talk([['ma', '最好再准备一个应急背包，万一要撤到山洞去。']]);
  await MG.pack();
  await talk([['ma', '绳索在我家仓库里，拿去把灯塔的吊篮固定好。'], ['ma', '风暴过去之后，来渔村过潮灯节吧。']]);
  gainPart(3); addItem('🪢', '绳索'); toast('获得灯塔零件：绳索（4/6）', '🪢', 'good'); hide('ma');
  setTime('night', 4);
  const { o } = await choose('离风暴到来还有一个多小时，海面安静得出奇。这段空闲时间，你会——', [
    O('再把物资清单核对一遍，心里踏实', 'JP', 1, 1, 'd4.free', '风暴前最后的空闲，你又把物资清单核对了一遍'),
    O('准备都做了，去海边看看风暴前的天空', 'JP', -1, 1, 'd4.free', '风暴前最后的空闲，你跑去海边看风暴前的天空'),
  ]);
  if (o.v < 0) {
    await cine(async () => {
      CH.me.place(V(2, 27), Math.PI); CH.me.setAnim('lookUp');
      await camTo(P(2, 23, 3), P(0, 60, 25), 3);
      await talk(['远处的海平线上，乌云压得很低，闪电在云里一亮一亮。', '你从来没有见过这么壮观的天空。']);
      CH.me.setAnim('idle');
    });
  } else {
    await talk(['淡水 10 桶、罐头 14 个、绷带 2 卷、手电 1 支……', '一样不少。你松了口气。']);
  }
  await choose('老陈问：「风暴过后，明天怎么安排？」', [O('「先定好几点集合、谁去哪儿，明早直接行动。」', 'JP', 1, 0.8, 'd4.tomorrow'), O('「等风停了看情况再说吧。」', 'JP', -1, 0.8, 'd4.tomorrow')]);
  W.crates.visible = true; W.net.visible = true;
}

/* ================== DAY 5 · 潮灯节（全维度交叉验证） ================== */
export async function day5() {
  await newDay(5, '潮灯节', '主线：找到火种', 'dusk', 'festival');
  put('chen', 1.5, 20, 'idle'); put('lu', -1.5, 20, 'cheer'); put('mu', -3, 16.2, 'idle');
  CH.me.place(V(0, 23), Math.PI); W.uWind.value = 1;
  await fade(false, 600);
  await talk(['风暴擦着小岛过去了，没造成太大损失。', ['lu', '{name}！阿嬷说今晚渔村有潮灯节，我们快去！', 'happy']]);
  await unlockZone('village'); toast('通往渔村的路打开了', '🏮');
  addQuest({ id: 'd5.go', title: '去渔村过节', desc: '渔村在岛的东边。', target: at('village') });
  await roam(reach(at('village'), 12));
  completeQuest('d5.go', true);
  // 节日开场：镜头从海面飞向渔村
  setTime('night', 0); W.villageFire.setLit(true); setAmbience({ waves: 0.12, fire: 0.35, crowd: 0.05 });
  put('ma', 25, -1.5, 'idle'); put('chen', 21.5, -2, 'idle'); put('lu', 22, 0, 'dance'); put('mu', 28.5, -1, 'idle');
  CH.vil.forEach((v, i) => { const a = i / CH.vil.length * 6.28; v.place(P(25 + Math.cos(a) * 4.2, -5 + Math.sin(a) * 4.2)); v.face(at('village')); v.setAnim('dance'); });
  await cine(async () => {
    camSet(P(48, -5, 8), P(25, -5, 2)); await camTo(P(31, 3, 6), P(25, -5, 1.5), 4.5);
    releaseLanterns(P(36, -2), 10, 'river');
    await talk(['渔村里挂满了灯笼，海面上漂着一盏盏小小的河灯。', ['ma', '欢迎来到潮灯节。今晚，三个摊位随你逛。', 'happy'], '（三个摊位里，时间只够玩两个）']);
  });
  CH.me.place(V(25, 2), Math.PI);
  // 三选二摊位
  const booths = { drum: '🥁 打鼓表演', lantern: '🏮 放河灯许愿', cook: '🍲 帮小鹿做鱼汤' };
  const played = [];
  addQuest({ id: 'd5.booth', title: '逛摊位', desc: '三个摊位挑两个玩（0/2）', kind: 'side' });
  const boothsDone = new Promise(res => Object.entries(booths).forEach(([k, label]) => {
    const pos = W.booths[k].position.clone();
    addInter({ id: 'booth_' + k, pos, radius: 3, label, mesh: W.booths[k], onInteract: async () => {
      if (!played.length) add('EI', { drum: 0.8, lantern: -0.8, cook: 0 }[k], 0.7, 'd5.first', k === 'drum' ? '潮灯节上，你第一个冲向了打鼓表演' : k === 'lantern' ? '潮灯节上，你先去了安静的河灯摊' : null);
      if (k === 'drum') {
        await talk(['鼓摊前围满了村民，大家起哄让你来一段！']);
        CH.me.setAnim('drum'); const r = await MG.drum(); CH.me.setAnim('cheer'); confetti(40);
        await talk([['vil', `好！连击 ${r.best}！再来一个！`, 'happy']]); CH.me.setAnim('idle');
      } else if (k === 'lantern') {
        await talk(['河灯摊很安静，只有几个老人在折纸灯。']);
        await choose('你在河灯上写下的愿望是——', [O('「希望大家都能平平安安地回家」', 'TF', -0.6, 0.6, 'd5.wish'), O('「希望明天就能修好灯塔」', 'TF', 0.6, 0.6, 'd5.wish')]);
        releaseLanterns(P(36, -2), 3, 'river'); sfx('splash');
        await talk(['你的河灯慢慢漂远了，和其他的灯连成一条光带。']);
      } else {
        CH.lu.place(W.booths.cook.position.clone().add(new THREE.Vector3(-1.5, 0, 1.2))); CH.lu.setAnim('idle');
        await talk([['lu', '{name}来帮我！今晚要给全村做鱼汤！', 'happy']]);
        const r = await MG.cooking();
        await talk([['lu', r.match >= 3 ? '哇，就是阿嬷的味道！' : '嗯……味道很特别！大家好像也挺喜欢的！', 'happy']]); giveHeart('lu', 6);
      }
      played.push(k); removeInter('booth_' + k);
      questStep('d5.booth', `三个摊位挑两个玩（${played.length}/2）`);
      if (played.length === 2) { Object.keys(booths).filter(x => !played.includes(x)).forEach(x => removeInter('booth_' + x)); res(); }
    } });
  }));
  // 守塔人之谜（隐藏）
  if (G.mystery === 2) {
    CH.ma.setAlert(true, '❓');
    npcInter('ma', '问阿嬷照片的事', async () => {
      CH.ma.setAlert(false); removeInter('npc_ma');
      await cine(async () => {
        await focus([CH.me, CH.ma], 4.5);
        await talk([['ma', '……照片？给我看看。', 'surprised'], ['ma', '这是……他。我的老伴。他就是守塔人。', 'sad'], ['ma', '十年前他说出海去找灯塔的新零件，再也没回来。', 'sad'], ['ma', '码头边那条旧木船，是他亲手做的。我每天都去擦一擦。']]);
      });
      G.mystery = 3; questStep('mys', '去渔村码头看看那条旧木船', P(33, 1)); giveHeart('ma', 15);
      addInter({ id: 'oldboat', pos: P(33, 1), radius: 2.6, label: '旧木船', onInteract: async () => {
        await talk(['船舷内侧刻着一圈圈螺旋，最里面一圈刻着两个名字。', '船底压着一封没寄出的信：「等灯塔再亮起来，我就沿着光回家。」']);
        G.mystery = 4; completeQuest('mys'); unlock('mystery'); add('SN', -0.6, 0.4, 'mys.4', '你解开了守塔人之谜：他一直在等灯塔重新亮起'); removeInter('oldboat');
      } });
    });
  }
  await roam(boothsDone);
  completeQuest('d5.booth');
  await cine(async () => {
    await focus([CH.me, CH.lu, CH.chen], 7);
    CH.vil.forEach(v => v.setAnim('dance'));
    await choose('篝火边响起了鼓声，村民拉着你一起跳舞——', [
      O('跳就跳！跟着节奏乱跳也开心', 'EI', 1, 1, 'd5.dance', '潮灯节上，你被拉去跳舞，跳得很开心'),
      O('笑着摆摆手，在旁边打拍子看大家跳', 'EI', -1, 1, 'd5.dance', '潮灯节上，你在旁边打着拍子看大家跳舞'),
    ]).then(({ o }) => CH.me.setAnim(o.v > 0 ? 'dance' : 'idle'));
    await wait(1200); CH.me.setAnim('idle');
    await choose('你想送阿嬷一份谢礼，选了——', [
      O('一个结实的编织篮，她补渔网时正好用得上', 'SN', 1, 1, 'd5.gift', '给阿嬷挑谢礼时，你选了实用的编织篮'),
      O('一枚刻着星星的贝壳——「谢谢您为我们指路」', 'SN', -1, 1, 'd5.gift', '给阿嬷挑谢礼时，你选了寓意「指路」的星星贝壳'),
    ]);
    giveHeart('ma', 8);
    await choose('小鹿端来她做的另一锅鱼汤，咸得发苦。她眼睛亮亮地问：「好喝吗？」', [
      O('「有点咸了，下次盐少放一半会更好！」', 'TF', 1, 1, 'd5.soup', '小鹿的鱼汤太咸，你诚实地给了建议'),
      O('「好喝！今天辛苦你啦。」然后默默多喝几口水', 'TF', -1, 1, 'd5.soup', '小鹿的鱼汤太咸，你还是笑着说好喝'),
    ]);
    await choose('节日有一张手写的节目单——', [
      O('照着节目单的顺序，一个都不错过', 'JP', 1, 1, 'd5.program', '潮灯节上，你照着节目单一个一个看'),
      O('哪边热闹就往哪边跑', 'JP', -1, 1, 'd5.program', '潮灯节上，你哪边热闹就往哪边跑'),
    ]);
    CH.ma.face(CH.me.pos); await focus([CH.me, CH.ma], 4.5);
    await talk([['ma', '这是村里传了四十年的火种。', 'calm'], ['ma', '灯塔……就拜托你们了。', 'happy']]);
  });
  gainPart(4); addItem('🔥', '火种'); toast('获得灯塔零件：火种（5/6）', '🔥', 'good');
  if (W.inters.has('oldboat') || W.inters.has('npc_ma')) {
    // 给隐藏任务一点时间
    addQuest({ id: 'd5.rest', title: '回营地休息', desc: '节日要结束了。', target: at('camp'), kind: 'side' });
    await roam(reach(at('camp'), 8)); completeQuest('d5.rest', true);
  }
  ['npc_ma', 'oldboat'].forEach(removeInter); CH.ma.setAlert(false);
  W.villageFire.setLit(false);
}

/* ================== DAY 6 · 风暴（压力测试） ================== */
export async function day6() {
  await newDay(6, '风暴', '主线：找回透镜', 'storm', 'storm');
  setWeather('storm'); setAmbience({ waves: 0.35, wind: 0.3, rain: 0.25 });
  put('chen', 1.5, 20, 'brace'); put('lu', -1.5, 20, 'brace'); put('mu', -3, 17, 'brace');
  CH.me.place(V(0, 23), Math.PI); CH.me.setAnim('brace');
  await fade(false, 600);
  await cine(async () => {
    await focus([CH.me, CH.chen, CH.lu], 7);
    await talk(['凌晨，真正的风暴来了。比昨天猛十倍。']);
    // 透镜被卷走
    const top = W.lighthouse.top();
    await camTo(top.clone().add(new THREE.Vector3(8, 2, 10)), top, 1.6);
    flash(); sfx('thunder'); shake(0.6, 0.3);
    const lens = spawnShell(top.x, top.z, 4); lens.position.copy(top); lens.scale.setScalar(2);
    await tween(2.2, k => { lens.position.set(top.x + k * 14, top.y + Math.sin(k * 3) * 3 - k * top.y, top.z + k * 50); W.camera.lookAt(lens.position); });
    W.scene.remove(lens);
    await talk(['一声巨响——灯塔顶层的窗户被吹开，刚装好的透镜被卷进了风里！', ['chen', '透镜没了，灯塔就点不亮了！', 'angry'], '（接下来是限时选择，跟着第一反应走！）']);
  });
  const Q = [
    ['透镜被卷走了！你第一反应是——', O('吹哨把所有人召集起来', 'EI', 1, 1, 'd6.react', rt => `风暴中透镜被卷走，你 ${rt.toFixed(1)} 秒内就吹哨召集了所有人`), O('自己先冲出去找', 'EI', -1, 1, 'd6.react', rt => `风暴中透镜被卷走，你 ${rt.toFixed(1)} 秒内就自己冲了出去`)],
    ['去哪儿找？', O('沿着潮水的方向，一寸一寸地搜', 'SN', 1, 1, 'd6.where'), O('凭直觉——它应该被冲进了那片礁湾', 'SN', -1, 1, 'd6.where', '风暴中找透镜，你凭直觉直奔那片礁湾')],
    ['老陈被落下的木梁砸伤了腿，大家乱成一团——', O('冷静分工：谁包扎、谁继续找透镜', 'TF', 1, 1, 'd6.hurt', '老陈受伤、大家乱成一团时，你冷静地开始分工'), O('先蹲下陪着老陈，稳住大家的情绪', 'TF', -1, 1, 'd6.hurt', '老陈受伤、大家乱成一团时，你先陪在他身边')],
    ['风暴间隙只有 10 分钟，你要出去——', O('先定好路线和撤回时间再出发', 'JP', 1, 1, 'd6.go'), O('边走边看，见机行事', 'JP', -1, 1, 'd6.go')],
  ];
  await MG.runner(async i => {
    const { o } = await choose(Q[i][0], [Q[i][1], Q[i][2]], { timer: 8 });
    if (!o) toast('你犹豫了一下——大家已经动起来了', '⏱️');
    if (i === 2 && o) giveHeart('chen', o.v < 0 ? 10 : 4);
  });
  await fade(true, 900);
  setWeather('clear'); setTime('dawn', 0); setAmbience({ waves: 0.2, birds: 0.08 }); playMusic('title');
  put('chen', 21, 20, 'sit'); put('lu', 18.5, 22.5, 'idle'); put('mu', 22.5, 22.5, 'idle');
  CH.me.place(V(19.5, 20), 0);
  camSet(P(16, 14, 5), P(20, 21, 1)); await fade(false, 900);
  await talk(['天亮时，风终于停了。', '你们在礁湾里找到了透镜。它卡在两块石头之间，竟然完好无损。', ['chen', '……腿没事，养两天就好。我们，差不多可以点灯了。', 'happy']]);
  gainPart(5); addItem('💎', '透镜'); toast('获得灯塔零件：透镜（6/6）', '💎', 'good');
  CH.me.setAnim('cheer'); CH.lu.setAnim('cheer'); await wait(1500); CH.me.setAnim('idle'); CH.lu.setAnim('idle');
}

/* ================== 梦境加时（某维度在 45%~55%） ================== */
const TIEBREAK = {
  EI: [['梦里你来到一座热闹的港口城市，你会——', '钻进人最多的集市，到处跟人聊天', '找一家安静的小咖啡馆，靠窗坐下'], ['梦里有人递给你一个麦克风——', '接过来，说两句', '笑着摆手，递给下一个人']],
  SN: [['梦里你收到一封没有署名的信，你先注意到——', '信纸的质地、字迹和邮戳', '字里行间似乎藏着的意思'], ['梦里有一扇紧闭的门——', '先看看门锁是什么结构', '想象门后会是怎样一个世界']],
  TF: [['梦里朋友做了一个你觉得不太好的决定——', '直接指出其中的问题', '先理解他为什么会这样选'], ['梦里你们要选一位队长——', '选能力最强的那个人', '选大家最信任的那个人']],
  JP: [['梦里你要去旅行——', '先做好一份详细攻略', '买张票就出发'], ['梦里你的书桌——', '每样东西都有固定的位置', '乱中有序，反正我知道东西在哪']],
};
export async function dream() {
  const dims = Object.keys(TIEBREAK).filter(d => Math.abs(pctOf(dimScore(G.signals, d)) - 50) <= 5);
  if (!dims.length) return;
  playMusic('dream'); $app().classList.add('dreaming');
  await talk(['那天夜里，你睡得很沉。', '你做了一个很长、很长的梦……']);
  for (const d of dims) for (const [q, a, b] of TIEBREAK[d]) await choose(q, [O(a, d, 1, 1, 'dream.' + d), O(b, d, -1, 1, 'dream.' + d)]);
  await talk(['……醒来时，窗外的海已经平静了。']);
  $app().classList.remove('dreaming');
}
const $app = () => document.getElementById('app');

/* ================== DAY 7 · 点亮灯塔 ================== */
export async function day7(lampColor, hiddenEnding) {
  await newDay(7, '点亮灯塔', '最后一夜', 'dusk', 'night');
  const door = W.lighthouse.door();
  put('chen', 3.5, -25.5, 'idle', door); put('lu', 8.5, -25.5, 'wave', door); put('mu', 6, -24.2, 'idle', door); put('ma', 9.5, -24, 'idle', door);
  CH.me.place(V(2, 10), Math.PI);
  await fade(false, 600);
  await dream();
  setTime('night', 8);
  addQuest({ id: 'd7.go', title: '去灯塔', desc: '大家都在灯塔下等你。', target: door });
  await roam(reach(door, 4.5));
  completeQuest('d7.go', true);
  await cine(async () => {
    await focus([CH.me, CH.lu, CH.ma], 7);
    await talk(['第七天的夜晚，你们终于站在了灯塔下。', '灯油、齿轮、镜片、绳索、火种、透镜——六样零件，一样不少。', ['lu', '{name}，你来装吧。这一路，是你带着我们走过来的。', 'happy']]);
  });
  await MG.assembly();
  await MG.note();
  // CG：点灯
  await cine(async () => {
    const top = W.lighthouse.top();
    CH.me.place(V(6, -25.4), Math.PI); CH.me.setAnim('ignite'); playMusic('ending');
    await camTo(top.clone().add(new THREE.Vector3(3, 0.5, 4)), top, 2.2);
    await talk(['你把火种凑近灯芯——']);
    sfx('ignite'); flashScreen('#fff', 900); W.lighthouse.light(typeof lampColor === 'function' ? lampColor() : lampColor); sfx('reveal', 0.5);
    await camTo(top.clone().add(new THREE.Vector3(30, 18, 30)), top, 4);
    ['chen', 'lu', 'mu'].forEach(k => CH[k].setAnim('cheer')); confetti(80);
    await camTo(top.clone().add(new THREE.Vector3(-40, 30, 50)), at('camp'), 5);
    await talk(['灯塔亮了。光束扫过整座小岛，扫过营地、森林、渔村，扫过一望无际的海。']);
    if (hiddenEnding) {
      const hiddenVid = await videoFor('hidden');
      if (hiddenVid) await playVideo(hiddenVid);
      else {
        W.boat.visible = true;
        await camTo(top.clone().add(new THREE.Vector3(10, 6, 14)), W.boat.position, 2);
        await tween(6, k => { W.boat.position.set(60 - k * 40, waveAt0(), -170 + k * 110); W.camera.lookAt(W.boat.position); });
      }
      await talk(['光束尽头，一条小船正朝着灯塔驶来。船头挂着一盏小灯。', ['ma', '……是他。他说过，等灯塔再亮起来，就沿着光回家。', 'happy']]);
    }
  });
}
const waveAt0 = () => 0.2;
