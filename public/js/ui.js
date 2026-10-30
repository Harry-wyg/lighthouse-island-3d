// 界面层：对话、选项、提示、任务追踪、日志、背包、设置、过场、视频
import { W, project, triggerInteract, setQuality } from './world.js';
import { sfx, babble, heartbeat, duck, silence, setEnabled, isEnabled } from './audio.js';
import { IMG, ready } from './assets.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const NPC = {
  me:   { n: '你',  c: '#ff8a5b', pitch: 360 },
  chen: { n: '老陈', c: '#c9774a', pitch: 170 },
  lu:   { n: '小鹿', c: '#e07aa3', pitch: 520 },
  mu:   { n: '阿木', c: '#3f9e93', pitch: 260 },
  ma:   { n: '阿嬷', c: '#8b6fcf', pitch: 300 },
  vil:  { n: '村民', c: '#b08a5a', pitch: 240 },
};
let G = null, CH = null;
export function bindState(g, chars) { G = g; CH = chars; }
const fmt = t => t.replace(/\{name\}/g, G?.name || '旅人');

/* ================== 对话 ================== */
function portrait(who, mood) {
  if (!who || who === 'me') return '';
  const url = ready(IMG.portrait(who, mood || 'calm')) || ready(IMG.portrait(who, 'calm'));
  const n = NPC[who];
  return url ? `<div class="portrait"><img src="${url}" alt=""></div>` : `<div class="portrait ph" style="--c:${n.c}"><span>${n.n.slice(-1)}</span></div>`;
}
export function say(text, who, mood) {
  return new Promise(res => {
    const d = $('#dialog'), n = who ? NPC[who] : null;
    const ch = who && CH?.[who]?.setMood ? CH[who] : null; // vil 是村民数组，没有单个角色
    if (ch) { if (mood) ch.setMood(mood); if (['idle', 'sit'].includes(ch.anim)) { ch._prev = ch.anim; ch.setAnim(ch.anim === 'sit' ? 'sitTalk' : 'talk'); } }
    d.innerHTML = portrait(who, mood) + `<div class="dbody">${n ? `<div class="who" style="--c:${n.c}">${who === 'me' ? esc(G.name) : n.n}</div>` : ''}<div class="txt"></div></div><div class="next">▼</div>`;
    d.classList.toggle('narr', !who); d.classList.remove('done'); d.classList.add('show');
    const t = $('.txt', d), full = fmt(text);
    let i = 0, done = false;
    const iv = setInterval(() => { i++; t.textContent = full.slice(0, i); if (n && i % 2 === 0 && full[i] !== ' ') babble(n.pitch); if (i >= full.length) finish(); }, 28);
    function finish() { clearInterval(iv); t.textContent = full; done = true; d.classList.add('done'); }
    d.onclick = () => {
      if (!done) return finish();
      d.onclick = null; sfx('page');
      if (ch && ch._prev) { ch.setAnim(ch._prev); ch._prev = null; }
      res();
    };
  });
}
// lines: '旁白' | [who, text, mood?]
export async function talk(lines) {
  for (const l of lines) Array.isArray(l) ? await say(l[1], l[0], l[2]) : await say(l);
  $('#dialog').classList.remove('show');
  await wait(180);
}
addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && $('#dialog').classList.contains('show') && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); $('#dialog').click(); }
  const c = $('#choice.show'); if (c && /^[1-4]$/.test(e.key)) $$('.opt:not(:disabled)', c)[Number(e.key) - 1]?.click();
});

/* ================== 选项 ================== */
export function choose(prompt, opts, { timer = 0 } = {}) {
  return new Promise(res => {
    const c = $('#choice'); c.innerHTML = '';
    c.append(el('div', 'q', esc(fmt(prompt))));
    let tm;
    if (timer) {
      const bar = el('div', 'timer', '<i></i>'); bar.firstChild.style.animationDuration = timer + 's'; c.append(bar);
      tm = setTimeout(() => finish(null), timer * 1000); heartbeat(true); duck(true);
    }
    shuffle(opts).forEach((o, i) => {
      const b = el('button', 'opt', `<span class="k">${i + 1}</span>${esc(fmt(o.t))}`);
      b.style.animationDelay = i * 80 + 'ms';
      b.onclick = () => finish(o, b); b.onpointerenter = () => sfx('hover'); c.append(b);
    });
    requestAnimationFrame(() => c.classList.add('show'));
    const t0 = performance.now(); let over = false;
    function finish(o, b) {
      if (over) return; over = true; clearTimeout(tm);
      if (timer) { heartbeat(false); duck(false); }
      $$('button', c).forEach(x => x.disabled = true);
      if (b) { b.classList.add('picked'); sfx('confirm'); }
      const rt = (performance.now() - t0) / 1000;
      setTimeout(() => { c.classList.remove('show'); setTimeout(() => res({ o, rt }), 220); }, 420);
    }
  });
}

/* ================== 提示 / 过场 ================== */
export function toast(msg, icon = '✨', kind = '') {
  const t = el('div', 'toast ' + kind, `<span class="ti">${icon}</span><span>${msg}</span>`);
  $('#toasts').append(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100);
}
export async function dayCard(n, title, sub) {
  const o = el('div', 'overlay daycard', `<div class="cal"><div class="cm">DAY</div><div class="cd">${n || '·'}</div></div><div class="dt">${title}</div><div class="ds">${sub}</div>`);
  $('#app').append(o); sfx('page'); await wait(50); o.classList.add('in');
  await wait(2200); o.classList.remove('in'); await wait(700); o.remove();
}
export function fade(black, dur = 600) {
  const f = $('#fade'); f.style.transitionDuration = dur + 'ms'; f.classList.toggle('on', black);
  return wait(dur);
}
export function letterbox(on) { $('#app').classList.toggle('cine', on); }
export async function caption(text, ms = 2600) {
  const c = $('#caption'); c.textContent = fmt(text); c.classList.add('show'); await wait(ms); c.classList.remove('show'); await wait(400);
}
export function flashScreen(color = '#fff', ms = 500) {
  const f = el('div', 'flashscreen'); f.style.background = color; $('#app').append(f);
  requestAnimationFrame(() => f.classList.add('go')); setTimeout(() => f.remove(), ms + 100);
}
export function confetti(n = 60) {
  const box = el('div', 'confetti'); $('#app').append(box);
  for (let i = 0; i < n; i++) { const p = el('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = `hsl(${Math.random() * 360},85%,65%)`; p.style.animationDelay = Math.random() * 0.6 + 's'; p.style.animationDuration = 1.8 + Math.random() * 1.4 + 's'; box.append(p); }
  setTimeout(() => box.remove(), 4000);
}

/* ================== 面板（小游戏容器） ================== */
export function panel(html, cls = '') {
  closePanel();
  const p = el('div', 'panelwrap', `<div class="panel pop ${cls}">${html}</div>`);
  $('#app').append(p); return $('.panel', p);
}
export function closePanel() { $$('.panelwrap').forEach(p => p.remove()); }

/* ================== HUD / 任务追踪 / 交互按钮 ================== */
const PART_ICONS = ['🛢️', '⚙️', '🔍', '🪢', '🔥', '💎'], PART_NAMES = ['灯油', '齿轮', '镜片', '绳索', '火种', '透镜'];
export const DAY_TITLES = ['序章 · 漂流', '沙滩上的人们', '岛屿的秘密', '争吵', '风暴将至', '潮灯节', '风暴', '点亮灯塔'];
export function updateHud() {
  if (!G) return;
  $('#hudDay').innerHTML = `<b>${G.day ? 'DAY ' + G.day : '序章'}</b><span>${DAY_TITLES[G.day]}</span>`;
  $('#hudParts').innerHTML = PART_ICONS.map((e, i) => `<span class="${G.parts.includes(i) ? 'got' : ''}" title="${PART_NAMES[i]}">${e}</span>`).join('');
  const st = $('#stamina');
  if (G.stamina != null) { st.hidden = false; st.innerHTML = `<span>体力</span>${Array.from({ length: G.staminaMax }, (_, i) => `<i class="${i < G.stamina ? 'on' : ''}"></i>`).join('')}`; } else st.hidden = true;
}
export function hud(show) { $('#hud').classList.toggle('show', show); }

export function setTracker(q) {
  const t = $('#tracker');
  if (!q) { t.classList.remove('show'); $('#edgeArrow').hidden = true; return; }
  t.innerHTML = `<div class="tk">${q.kind === 'main' ? '主线' : q.kind === 'hidden' ? '谜' : '支线'}</div><div class="tt">${q.title}</div><div class="td">${q.step || q.desc || ''}</div>`;
  t.classList.add('show');
}
// 屏幕边缘箭头：任务目标不在屏幕内时指向它
W.updaters.push(() => {
  const a = $('#edgeArrow'); if (!a) return;
  if (!W.markerPos || W.cg || !W.control) { a.hidden = true; return; }
  const p = project(W.markerPos.clone().setY(W.markerPos.y + 3));
  const m = 36, inside = !p.behind && p.x > m && p.x < p.w - m && p.y > m + 50 && p.y < p.h - m;
  a.hidden = inside; if (inside) return;
  let dx = p.x - p.w / 2, dy = p.y - p.h / 2; if (p.behind) { dx = -dx; dy = -dy; }
  const ang = Math.atan2(dy, dx), r = Math.min((p.w / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (p.h / 2 - m - 30) / Math.abs(Math.sin(ang) || 1e-6));
  a.style.transform = `translate(${p.w / 2 + Math.cos(ang) * r - 18}px, ${p.h / 2 + Math.sin(ang) * r - 18}px) rotate(${ang}rad)`;
  const d = W.player ? Math.round(W.player.pos.distanceTo(W.markerPos)) : 0; a.dataset.d = d + 'm';
});

W.onNear = it => {
  const b = $('#interactBtn');
  if (!it) { b.classList.remove('show'); return; }
  b.innerHTML = `<span class="ik">${matchMedia('(pointer:coarse)').matches ? '👆' : 'E'}</span>${it.label}`; b.classList.add('show');
  b.onclick = () => triggerInteract(it);
};

/* ================== 弹窗：日志 / 背包 / 设置 ================== */
export function modal(html) {
  const m = el('div', 'overlay modal', `<div class="panel pop">${html}</div>`);
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('.close')) { sfx('click'); m.remove(); } });
  $('#app').append(m); return m;
}
export function openJournal(game) {
  sfx('page'); G.journalOpens = (G.journalOpens || 0) + 1;
  const tab = (id, name) => `<button data-t="${id}">${name}</button>`;
  const m = modal(`<div class="ptitle">📔 回声岛生存日志</div><div class="tabs">${tab('q', '任务')}${tab('p', '伙伴')}${tab('c', '图鉴')}${tab('a', '成就')}</div><div class="jbody"></div><button class="btn ghost close">合上日志</button>`);
  const body = $('.jbody', m);
  const views = {
    q: () => {
      const act = game.quests.filter(q => !q.done), dn = game.quests.filter(q => q.done);
      return `<div class="jsec">进行中</div>${act.map(q => `<div class="qrow ${q.kind}"><b>${q.title}</b><span>${q.step || q.desc || ''}</span></div>`).join('') || '<div class="empty">暂时没有任务</div>'}
        <div class="jsec">已完成</div>${dn.map(q => `<div class="qrow done"><b>✓ ${q.title}</b></div>`).join('') || '<div class="empty">——</div>'}
        <div class="jsec">灯塔零件 ${G.parts.length}/6</div><div class="parts">${PART_ICONS.map((e, i) => `<span class="${G.parts.includes(i) ? 'got' : ''}">${e}<em>${PART_NAMES[i]}</em></span>`).join('')}</div>`;
    },
    p: () => ['chen', 'lu', 'mu', 'ma'].map(k => {
      const h = G.hearts[k] || 0, url = ready(IMG.portrait(k, 'calm'));
      return `<div class="prow"><div class="av" style="background:${NPC[k].c}">${url ? `<img src="${url}">` : NPC[k].n.slice(-1)}</div><div><div class="nm">${NPC[k].n}</div><div class="hearts">${[0, 1, 2, 3, 4].map(i => `<i class="${h >= (i + 1) * 20 ? 'on' : ''}">❤</i>`).join('')}<small>${h}</small></div><div class="inf">${game.NPC_BIO[k]}</div></div></div>`;
    }).join(''),
    c: () => `<div class="phint">在沙滩和礁石区能找到闪光的贝壳，已收集 ${G.shells.length}/12</div><div class="shells">${game.SHELLS.map((s, i) => {
      const got = G.shells.includes(i), url = ready(IMG.shell(i + 1));
      return `<div class="shell ${got ? 'got' : ''}">${got ? (url ? `<img src="${url}">` : `<span>${s.e}</span>`) : '<span>？</span>'}<em>${got ? s.n : '未发现'}</em></div>`;
    }).join('')}</div>`,
    a: () => game.ACHIEVEMENTS.map(a => `<div class="ach ${G.achievements.includes(a.id) ? 'got' : ''}"><span>${a.e}</span><div><b>${a.n}</b><small>${a.d}</small></div></div>`).join(''),
  };
  const show = k => { $$('.tabs button', m).forEach(b => b.classList.toggle('on', b.dataset.t === k)); body.innerHTML = views[k](); };
  $$('.tabs button', m).forEach(b => b.onclick = () => { sfx('click'); show(b.dataset.t); });
  show('q');
}
export function openBag() {
  sfx('click');
  const items = G.bag.slice(0, 16);
  modal(`<div class="ptitle">🎒 背包</div><div class="phint">捡到的东西都在这里。</div><div class="baggrid">${Array.from({ length: 16 }, (_, i) => items[i] ? `<div class="slot" title="${items[i].n}">${items[i].e}<em>${items[i].n}</em></div>` : '<div class="slot empty"></div>').join('')}</div><button class="btn ghost close">关闭</button>`);
}
export function openSettings(onRestart) {
  sfx('click');
  const m = modal(`<div class="ptitle">⚙️ 设置</div>
    <label class="srow"><span>音乐</span><input type="checkbox" data-k="music" ${isEnabled('music') ? 'checked' : ''}></label>
    <label class="srow"><span>音效</span><input type="checkbox" data-k="sfx" ${isEnabled('sfx') ? 'checked' : ''}></label>
    <label class="srow"><span>画质</span><select><option value="high" ${W.quality === 'high' ? 'selected' : ''}>高（阴影 + 高清）</option><option value="low" ${W.quality === 'low' ? 'selected' : ''}>流畅</option></select></label>
    <div class="phint" style="margin-top:10px">拖动屏幕旋转视角，双指或滚轮缩放。电脑上可用 WASD 移动、E 交互、Q 转向。</div>
    <button class="btn ghost restart">重新开始</button><button class="btn close">继续游戏</button>`);
  $$('input[type=checkbox]', m).forEach(i => i.onchange = () => setEnabled(i.dataset.k, i.checked));
  $('select', m).onchange = e => setQuality(e.target.value);
  $('.restart', m).onclick = () => { if (confirm('确定从头开始吗？当前进度会被清除。')) onRestart(); };
}

/* ================== 视频 ================== */
export function playVideo(url) {
  return new Promise(res => {
    const o = el('div', 'overlay video', `<video src="${url}" playsinline webkit-playsinline autoplay></video><button class="skip">跳过 ›</button>`);
    $('#app').append(o);
    silence(true);
    const v = $('video', o), end = () => { silence(false); o.remove(); res(); };
    v.onended = end; v.onerror = end; $('.skip', o).onclick = end;
    v.play().catch(() => { v.muted = true; v.play().catch(end); });
  });
}
