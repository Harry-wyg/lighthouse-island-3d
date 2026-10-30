// 游戏状态与系统：信号记录、任务、好感度、成就、收集、体力、存档、服务端接口
import { choose as uiChoose, toast, updateHud, setTracker } from './ui.js';
import { setMarker } from './world.js';
import { sfx } from './audio.js';
import { computeResult } from './score.js';

export const SHELLS = [
  { e: '🐚', n: '月光扇贝' }, { e: '🐚', n: '粉红宝螺' }, { e: '🐚', n: '虎斑凤螺' }, { e: '✨', n: '一捧星砂' },
  { e: '🐚', n: '鹦鹉螺' }, { e: '🦪', n: '珍珠母贝' }, { e: '🟣', n: '紫海胆壳' }, { e: '🪸', n: '蓝珊瑚枝' },
  { e: '🦪', n: '白砗磲' }, { e: '🐚', n: '夕阳榧螺' }, { e: '⭐', n: '五角海星' }, { e: '🍾', n: '漂流瓶' },
];
export const NPC_BIO = {
  chen: '船上的大副，务实、讲规矩，嘴硬心软。腿上有旧伤。',
  lu: '船上的厨师助理，热情、敏感，会为一点小事开心一整天。',
  mu: '安静的大学生，生着病也不愿麻烦别人。',
  ma: '在岛上住了四十年的老人，似乎在等什么人。',
};
export const ACHIEVEMENTS = [
  { id: 'firestar', e: '🔥', n: '篝火之星', d: '社交电量见底，依然去放了孔明灯' },
  { id: 'loner', e: '🌊', n: '独行者', d: '独自走完礁石区' },
  { id: 'shell6', e: '🐚', n: '拾贝人', d: '收集 6 种贝壳' },
  { id: 'shell12', e: '🏆', n: '图鉴大师', d: '收集全部 12 种贝壳' },
  { id: 'packer', e: '🎒', n: '收纳大师', d: '一次把背包整理到位' },
  { id: 'planner', e: '📋', n: '计划通', d: '严格按计划完成风暴准备' },
  { id: 'drummer', e: '🥁', n: '鼓王', d: '打鼓连击达到 20' },
  { id: 'friend', e: '💞', n: '岛上挚友', d: '任意一位伙伴好感度达到 80' },
  { id: 'everyone', e: '🤝', n: '所有人的朋友', d: '四位伙伴好感度都达到 50' },
  { id: 'runner', e: '⚡', n: '风暴跑者', d: '一次都没摔倒就跑完风暴' },
  { id: 'mystery', e: '🗝️', n: '守塔人之谜', d: '解开守塔人的秘密' },
  { id: 'journal', e: '📔', n: '日志控', d: '翻开日志 5 次' },
];

const blank = () => ({
  v: 2, name: '旅人', look: { shirt: 0xff8a5b, hair: 0x3a2a20, hairStyle: 'short' }, day: 0,
  signals: [], moments: [], parts: [], hearts: { chen: 20, lu: 20, mu: 20, ma: 10 }, shells: [], bag: [], achievements: [],
  flags: {}, mystery: 0, note: '', stamina: null, staminaMax: 6, journalOpens: 0, startedAt: Date.now(), playId: null,
});
export const G = blank();
export function resetGame() { Object.assign(G, blank()); quests.length = 0; }

/* ---------- 信号 ---------- */
export function add(dim, v, w = 1, key = '', moment = null, stress = false) {
  if (!w) return;
  G.signals.push({ dim, v: Math.max(-1, Math.min(1, v)), w, key, day: G.day, stress });
  if (moment) G.moments.push({ dim, v, w, text: moment, day: G.day });
}
export const O = (t, dim, v, w = 1, key = '', m = null) => ({ t, dim, v, w, key, m });
export async function choose(prompt, opts, cfg = {}) {
  const r = await uiChoose(prompt, opts, cfg);
  if (r.o) add(r.o.dim, r.o.v, r.o.w, r.o.key, typeof r.o.m === 'function' ? r.o.m(r.rt) : r.o.m, cfg.timer > 0);
  track('choice', { key: r.o?.key, v: r.o?.v, rt: +r.rt.toFixed(2) });
  return r;
}

/* ---------- 任务 ---------- */
export const quests = [];
export function addQuest(q) {
  const it = { kind: 'main', done: false, ...q }; quests.push(it);
  toast(`新${it.kind === 'main' ? '主线' : it.kind === 'hidden' ? '谜题' : '支线'}：${it.title}`, it.kind === 'main' ? '📜' : it.kind === 'hidden' ? '🗝️' : '📌');
  sfx('pick'); refreshTracker(); return it;
}
export function questStep(id, step, target) {
  const q = quests.find(x => x.id === id); if (!q) return;
  q.step = step; if (target !== undefined) q.target = target; refreshTracker();
}
export function completeQuest(id, silent = false) {
  const q = quests.find(x => x.id === id); if (!q || q.done) return;
  q.done = true; if (!silent) { toast(`完成：${q.title}`, '✅', 'good'); sfx('quest'); }
  refreshTracker(); track('quest', { id });
}
export const hasQuest = id => quests.some(q => q.id === id && !q.done);
export function refreshTracker() {
  const act = quests.filter(q => !q.done);
  const tq = act.find(q => q.kind === 'main' && q.target) || act.find(q => q.target) || act[0];
  setTracker(tq || null); setMarker(tq?.target || null);
}

/* ---------- 好感度 / 成就 / 收集 / 体力 ---------- */
let CH = {};
export const bindChars = c => { CH = c; };
export function heart(k, d) {
  G.hearts[k] = Math.max(0, Math.min(100, (G.hearts[k] || 0) + d));
  const ch = CH[k];
  if (d > 0) { ch?.emote(d >= 10 ? '💖' : '❤️'); sfx('heart'); toast(`${({ chen: '老陈', lu: '小鹿', mu: '阿木', ma: '阿嬷' })[k]} 好感 +${d}`, '❤️', 'heart'); }
  else if (d < 0) { ch?.emote('💔'); sfx('sad'); toast(`${({ chen: '老陈', lu: '小鹿', mu: '阿木', ma: '阿嬷' })[k]} 好感 ${d}`, '💔', 'heart'); }
  if (Object.values(G.hearts).some(h => h >= 80)) unlock('friend');
  if (Object.values(G.hearts).every(h => h >= 50)) unlock('everyone');
}
export function unlock(id) {
  if (G.achievements.includes(id)) return;
  const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
  G.achievements.push(id); setTimeout(() => { toast(`成就解锁：${a.n}`, a.e, 'ach'); sfx('achieve'); }, 400); track('achievement', { id });
}
export function gainShell() {
  const left = SHELLS.map((_, i) => i).filter(i => !G.shells.includes(i));
  if (!left.length) return null;
  const i = left[Math.random() * left.length | 0]; G.shells.push(i);
  toast(`图鉴新收录：${SHELLS[i].n}`, SHELLS[i].e); sfx('pick');
  if (G.shells.length >= 6) unlock('shell6'); if (G.shells.length >= 12) unlock('shell12');
  return SHELLS[i];
}
export function addItem(e, n) { G.bag.push({ e, n }); }
export function useStamina(n) {
  if (G.stamina == null || G.stamina < n) return false;
  G.stamina -= n; updateHud(); return true;
}
export function gainPart(i) { if (!G.parts.includes(i)) G.parts.push(i); updateHud(); sfx('part'); }

/* ---------- 服务端 ---------- */
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(r.status); return r.json();
};
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
export const NET = { uid: ls.get('island.uid'), token: ls.get('island.token'), online: false, weights: {} };
export async function connect() {
  if (document.querySelector('meta[name="island-mode"]')?.content === 'static') return;
  try {
    if (!NET.uid) { const u = await api('POST', '/api/auth/guest'); NET.uid = u.uid; NET.token = u.token; ls.set('island.uid', u.uid); ls.set('island.token', u.token); }
    const cfg = await api('GET', '/api/config'); NET.weights = cfg.weights || {}; NET.online = true;
  } catch { NET.online = false; }
}
export async function startPlay() {
  G.startedAt = Date.now();
  if (!NET.online) return;
  try { G.playId = (await api('POST', '/api/play/start', { uid: NET.uid, token: NET.token })).playId; } catch { /* 离线 */ }
}
const snapshot = () => JSON.parse(JSON.stringify({ ...G, quests: undefined }));
export async function saveGame() {
  const s = snapshot(); ls.set('island.save', JSON.stringify(s));
  if (!NET.online) return;
  api('PUT', '/api/save', { uid: NET.uid, token: NET.token, save: s }).catch(() => {});
  if (G.playId) api('POST', '/api/play/progress', { playId: G.playId, day: G.day }).catch(() => {});
}
export async function loadSave() {
  let local = null; try { local = JSON.parse(ls.get('island.save')); } catch { /* ignore */ }
  let remote = null;
  if (NET.online) { try { remote = await api('GET', `/api/save?uid=${NET.uid}&token=${NET.token}`); } catch { /* ignore */ } }
  const s = [local, remote].filter(x => x && x.v === 2).sort((a, b) => (b.day || 0) - (a.day || 0))[0];
  return s && s.day > 0 ? s : null;
}
export function applySave(s) { resetGame(); Object.assign(G, s); }
export async function clearSave() {
  ls.del('island.save');
  if (NET.online) api('DELETE', '/api/save', { uid: NET.uid, token: NET.token }).catch(() => {});
}
// 结果：服务端计分（带权重热更新），离线时本地计算
export async function submitResult(moments) {
  const stats = { minutes: +((Date.now() - G.startedAt) / 60000).toFixed(1), shells: G.shells.length, achievements: G.achievements.length, hearts: G.hearts };
  if (NET.online) {
    try { return { ...(await api('POST', '/api/result', { uid: NET.uid, token: NET.token, playId: G.playId, name: G.name, signals: G.signals, moments, note: G.note, stats })), online: true }; } catch { /* 回退到本地 */ }
  }
  return { ...computeResult(G.signals, NET.weights), name: G.name, moments, stats, online: false };
}
export const fetchResult = id => api('GET', `/api/result/${encodeURIComponent(id)}`);
export const sendFeedback = (resultId, selfType, accuracy) => api('POST', '/api/feedback', { resultId, selfType, accuracy });
export const markShared = id => api('POST', `/api/result/${id}/share`).catch(() => {});

// 埋点：批量上报
const queue = [];
export function track(e, d) { if (NET.online) queue.push({ e, d, t: Date.now() }); }
setInterval(() => {
  if (!queue.length || !NET.online) return;
  const events = queue.splice(0, 50);
  api('POST', '/api/track', { uid: NET.uid, events }).catch(() => queue.unshift(...events));
}, 5000);
