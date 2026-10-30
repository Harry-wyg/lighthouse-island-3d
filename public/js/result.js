// 结果页：角色卡、四维条、关键时刻、压力模式、成就收集、校准反馈、分享海报
import { $, $$, el, esc, modal, toast } from './ui.js';
import { DIMS, LETTER_NAME, temperOf, opposite, computeResult } from './score.js';
import { IMG, ready } from './assets.js';
import { sfx } from './audio.js';
import { G, ACHIEVEMENTS, SHELLS, sendFeedback, markShared, track } from './game.js';

export const ROLES = {
  INTJ: { e: '🏗️', n: '灯塔设计师', t: '别人还在慌，你已经画好了蓝图。', d: '你习惯站在高处看全局，擅长把混乱变成系统。在岛上，你是那个默默算清材料、工期和风险的人。你不需要很多人理解你，但你的计划往往是对的。', s: ['战略眼光', '独立判断', '追求卓越'], b: '太相信自己的方案时，容易忽略别人的感受和节奏。' },
  INTP: { e: '🔭', n: '星图解谜者', t: '你想知道的不是怎么做，而是为什么。', d: '你对规律和原理有天生的好奇心。墙上的符号、灯塔的机关，在你眼里都是有趣的谜题。你想得很深，常在别人没注意的地方发现关键。', s: ['逻辑分析', '好奇心', '跳出框架'], b: '想得多、说得少，答案在脑子里转了一百遍还没说出口。' },
  ENTJ: { e: '⚓', n: '远航船长', t: '风暴来时，大家会下意识看向你。', d: '你天生会组织、会决策，能在混乱中迅速定下方向，并推着大家往前走。修灯塔这件事交给你，马上就有了时间表。', s: ['领导力', '果断', '目标感'], b: '推进得太快时，可能会让身边的人觉得被落下。' },
  ENTP: { e: '💡', n: '奇想发明家', t: '规则？那只是一个可以被改进的版本。', d: '你脑子里总在冒新点子，喜欢辩论，喜欢尝试没人试过的方法。在岛上，你可能用椰子壳和渔网发明出一个奇怪但好用的东西。', s: ['创意', '应变', '口才'], b: '新点子太多，旧点子还没收尾。' },
  INFJ: { e: '🌙', n: '潮汐预言者', t: '你总能读懂别人没说出口的话。', d: '你安静，却有很强的洞察力，能感受到人群里细微的情绪变化，对未来也常有准确的直觉。你在意意义，希望自己做的事真正帮到别人。', s: ['洞察力', '共情', '坚定的信念'], b: '把太多情绪藏在心里，容易一个人累坏。' },
  INFP: { e: '🐚', n: '拾贝诗人', t: '你在沙滩上捡到的，不只是贝壳。', d: '你心里有一片很丰富的海。你忠于自己的价值观，对美和意义很敏感，愿意温柔地对待每一个人。在荒岛上，你是那个会给日落起名字的人。', s: ['理想主义', '真诚', '想象力'], b: '理想和现实落差太大时，容易陷入自我怀疑。' },
  ENFJ: { e: '🔥', n: '篝火引路人', t: '你让每个人都觉得自己被看见了。', d: '你天生懂得凝聚人心，能看见每个人的长处，并把大家聚到一起。有你在，营地里的争吵会少一半。', s: ['感染力', '责任感', '善于鼓舞'], b: '太照顾别人，常常忘了照顾自己。' },
  ENFP: { e: '🪁', n: '追风探险家', t: '这座岛的每一个角落，你都想去看看。', d: '你热情、好奇、充满能量，总能在平凡的事里发现惊喜。你的乐观会传染，困境在你眼里更像一场冒险。', s: ['热情', '创造力', '连接他人'], b: '兴趣来得快去得也快，容易半路转向。' },
  ISTJ: { e: '📋', n: '补给管理员', t: '每一瓶水去了哪里，你都记得。', d: '你踏实、可靠、讲原则，相信把每件小事做好就是最好的办法。营地的物资清单在你手里，从来不会出错。', s: ['可靠', '细致', '执行力'], b: '面对突如其来的变化时，会比别人更不安。' },
  ISFJ: { e: '🩹', n: '守夜医者', t: '别人睡着时，你还在默默守着。', d: '你温和细心，记得每个人的小习惯，总在别人开口之前就准备好了一切。你的照顾不张扬，却让整个营地都安心。', s: ['体贴', '耐心', '忠诚'], b: '不擅长拒绝，容易把别人的事都扛在自己肩上。' },
  ESTJ: { e: '📣', n: '营地总指挥', t: '分工、排班、物资——交给你就对了。', d: '你务实、高效、有条理，喜欢清晰的规则和明确的目标。在你的安排下，营地像一台运转良好的机器。', s: ['组织力', '果断', '责任心'], b: '坚持「正确的做法」时，可能显得不够灵活。' },
  ESFJ: { e: '🍲', n: '炊烟守护者', t: '营地里最暖的那缕炊烟，是你升起的。', d: '你热心、周到，很在意大家是否和睦、是否吃饱穿暖。你擅长把一群陌生人变成一个家。', s: ['热心', '协调力', '重视他人'], b: '太在意别人的评价，偶尔会委屈自己。' },
  ISTP: { e: '🔧', n: '修船匠', t: '少说话，多动手，问题自然就解决了。', d: '你冷静、务实，对工具和机械有天然的手感。别人还在讨论时，你已经把卡住的齿轮拆开又装好了。', s: ['动手能力', '冷静', '随机应变'], b: '不爱表达，容易让人觉得有点距离感。' },
  ISFP: { e: '🎨', n: '珊瑚画师', t: '你用自己的方式，把荒岛过成了诗。', d: '你温柔、敏感，活在当下，对色彩、声音和气味都有细腻的感知。你不喜欢被规则束缚，更愿意跟着内心走。', s: ['审美力', '温柔', '真实'], b: '遇到冲突时习惯往后退，把想法藏起来。' },
  ESTP: { e: '🏄', n: '冲浪先锋', t: '风浪越大，你越兴奋。', d: '你行动力爆表，反应快、胆子大，喜欢在现场解决问题。风暴里第一个冲出去找零件的人，多半就是你。', s: ['行动力', '临场反应', '敢于冒险'], b: '冲得太快时，可能会忽略长远的后果。' },
  ESFP: { e: '🎉', n: '篝火主持人', t: '有你在的地方，就是派对现场。', d: '你热情、有趣、活在当下，能让周围的人都放松下来。荒岛生活到了你手里，也能变成一场狂欢。', s: ['感染力', '乐观', '亲和力'], b: '不爱做长远规划，偶尔会被现实追着跑。' },
};
export const PARTNER = { INTJ: 'ENFP', INTP: 'ENTJ', ENTJ: 'INTP', ENTP: 'INFJ', INFJ: 'ENTP', INFP: 'ENFJ', ENFJ: 'INFP', ENFP: 'INTJ', ISTJ: 'ESFP', ISFJ: 'ESTP', ESTJ: 'ISTP', ESFJ: 'ISFP', ISTP: 'ESTJ', ISFP: 'ESFJ', ESTP: 'ISFJ', ESFP: 'ISTJ' };
export const TEMPER = {
  NT: { c: '#8b7bff', hex: 0x8b7bff, n: '紫色', w: '理性者之光' },
  NF: { c: '#3ecf8e', hex: 0x3ecf8e, n: '绿色', w: '理想者之光' },
  SJ: { c: '#4a90ff', hex: 0x4a90ff, n: '蓝色', w: '守护者之光' },
  SP: { c: '#f5a623', hex: 0xf5a623, n: '金色', w: '探索者之光' },
};

// 关键时刻：每个维度挑一条与结果方向一致、权重最高的
export function pickMoments(signals, moments, weights) {
  const R = computeResult(signals, weights), picks = [];
  for (const d in DIMS) {
    const L = R.letters[d], sign = L === DIMS[d][0] ? 1 : -1;
    const m = moments.filter(x => x.dim === d && Math.sign(x.v) === sign).sort((a, b) => b.w - a.w)[0];
    if (m) picks.push({ day: m.day, dim: d, text: m.text, letter: L });
  }
  return picks.sort((a, b) => a.day - b.day);
}

function roleArt(type, role) {
  const url = ready(IMG.role(type));
  return url ? `<img class="roleimg" src="${url}" alt="${role.n}">` : `<div class="emo">${role.e}</div>`;
}

// R: { id?, type, pct, letters, balanced, shifts, moments, name, stats }；own=是否本人刚玩完
export function showResult(R, { own = true, onReplay } = {}) {
  const role = ROLES[R.type], tp = TEMPER[temperOf(R.type)];
  const mate = PARTNER[R.type], foe = opposite(R.type);
  const bg = ready(IMG.temper(temperOf(R.type)));
  const bars = Object.keys(DIMS).map(d => {
    const [a, b] = DIMS[d], pa = R.pct[d], pb = 100 - pa, win = R.letters[d];
    return `<div class="bar"><div class="lb"><span class="${win === a ? '' : 'dim'}">${a} ${LETTER_NAME[a]} ${pa}%</span><span class="${win === b ? '' : 'dim'}">${pb}% ${LETTER_NAME[b]} ${b}</span></div><div class="tr"><i data-w="${pa}"></i></div>${R.balanced.includes(d) ? '<div class="bal">⚖️ 平衡型：两种倾向你都能自如切换</div>' : ''}</div>`;
  }).join('');
  const moms = (R.moments || []).map(m => `<li><span class="d">DAY ${m.day}</span><span>${esc(m.text)}</span><span class="k">${m.letter}</span></li>`).join('');
  const shifts = (R.shifts || []).map(s => `平时你偏向 <b>${s.from}（${LETTER_NAME[s.from]}）</b>，但在风暴中会切换到 <b>${s.to}（${LETTER_NAME[s.to]}）</b>`);
  const st = R.stats || {};
  const extra = own ? `
      <div class="card"><h3>🏅 这趟漂流</h3>
        <div class="statrow"><div><b>${st.minutes ?? '-'}</b><small>分钟</small></div><div><b>${G.shells.length}/12</b><small>贝壳</small></div><div><b>${G.achievements.length}/${ACHIEVEMENTS.length}</b><small>成就</small></div><div><b>${G.mystery >= 4 ? '✓' : '?'}</b><small>守塔人之谜</small></div></div>
        <div class="achs">${ACHIEVEMENTS.map(a => `<span class="${G.achievements.includes(a.id) ? 'got' : ''}" title="${a.n}：${a.d}">${a.e}</span>`).join('')}</div>
        <div class="shellsmini">${SHELLS.map((s, i) => `<span class="${G.shells.includes(i) ? 'got' : ''}">${G.shells.includes(i) ? s.e : '·'}</span>`).join('')}</div>
      </div>
      ${G.note ? `<div class="card"><h3>✉️ 留给未来的话</h3><div class="quote">${esc(G.note)}</div></div>` : ''}
      <div class="card fb"><h3>🎯 测得准吗？</h3><p class="phint">帮我们校准：如果你做过其他 MBTI 测试，结果是？</p>
        <div class="typepick">${Object.keys(DIMS).map(d => `<div class="seg" data-d="${d}"><button data-l="${DIMS[d][0]}">${DIMS[d][0]}</button><button data-l="${DIMS[d][1]}">${DIMS[d][1]}</button></div>`).join('')}</div>
        <div class="stars">${[1, 2, 3, 4, 5].map(i => `<button data-s="${i}">★</button>`).join('')}<small>准确度</small></div>
        <button class="btn ghost send">提交反馈</button></div>` : `
      <div class="card"><p>这是 <b>${esc(R.name || '旅人')}</b> 在灯塔岛上的漂流报告。</p><p class="phint">七天，没有一道题。你会成为哪一种光？</p></div>`;
  const r = el('div', '', `
    <div class="rhead" ${bg ? `style="background-image:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.45)),url(${bg})"` : ''}>
      <span class="tag">${tp.w}</span>${roleArt(R.type, role)}<div class="type">${R.type}</div><div class="role">${role.n}</div><div class="tl">「${role.t}」</div>
      ${own ? '' : `<div class="who">— ${esc(R.name || '旅人')} 的结果 —</div>`}
    </div>
    <div class="rbody">
      <div class="card"><h3>🧭 你的四维倾向</h3>${bars}</div>
      <div class="card"><h3>🏝️ 岛上的你</h3><p>${role.d}</p></div>
      ${moms ? `<div class="card"><h3>🎞️ 你的关键时刻</h3><ul class="mom">${moms}</ul></div>` : ''}
      ${shifts.length ? `<div class="card"><h3>🌪️ 压力模式</h3><p>${shifts.join('；<br>')}。<br>压力会让人切换到不常用的一面，这很正常，也是你的另一种力量。</p></div>` : ''}
      <div class="card"><h3>✨ 你的优势</h3><div class="pills">${role.s.map(x => `<span>${x}</span>`).join('')}</div><h3 style="margin-top:16px">🌫️ 你的盲点</h3><p>${role.b}</p></div>
      <div class="card"><h3>🤝 岛上搭档</h3><div class="mates">
        <div class="mate"><div class="e">${ROLES[mate].e}</div><div class="t">${mate}</div><div class="n">${ROLES[mate].n}</div><div class="h">💞 最合拍</div></div>
        <div class="mate"><div class="e">${ROLES[foe].e}</div><div class="t">${foe}</div><div class="n">${ROLES[foe].n}</div><div class="h">⚡ 最需要磨合</div></div>
      </div></div>
      ${extra}
      <div class="rbtns">${own ? '<button class="btn poster">生成分享海报</button>' : ''}${own && R.id ? '<button class="btn ghost link">复制分享链接</button>' : ''}<button class="btn ghost again">${own ? '再漂流一次' : '我也去漂流'}</button></div>
      <div class="disc">本测试基于 MBTI 理论框架，结合情境选择与行为数据进行估算，<br>仅供娱乐与自我探索，不作为心理诊断依据。</div>
    </div>`);
  r.id = 'result'; r.style.setProperty('--tc', tp.c);
  $('#app').append(r);
  requestAnimationFrame(() => r.classList.add('show'));
  setTimeout(() => $$('.tr i', r).forEach(i => { i.style.width = i.dataset.w + '%'; }), 400);
  $('.again', r).onclick = () => { sfx('click'); onReplay ? onReplay() : (location.href = location.pathname); };
  if (!own) return r;
  track('result', { type: R.type });
  $('.poster', r).onclick = async () => {
    sfx('click'); const url = await makePoster(R, role, tp);
    const m = modal(`<div id="posterBox"><img src="${url}" alt="分享海报"><div class="phint" style="text-align:center;margin:10px 0 0">手机长按图片保存，电脑可点击下载</div><div class="row"><a class="btn" download="灯塔岛-${R.type}.png" href="${url}">下载海报</a><button class="btn ghost close">关闭</button></div></div>`);
    m.style.zIndex = 60; if (R.id) markShared(R.id); track('poster', {});
  };
  const link = $('.link', r);
  if (link) link.onclick = async () => {
    const u = `${location.origin}${location.pathname}?r=${R.id}`;
    try { await navigator.clipboard.writeText(u); toast('链接已复制', '🔗'); } catch { prompt('复制这个链接分享给朋友：', u); }
    markShared(R.id); track('shareLink', {});
  };
  // 校准反馈
  const self = {}; let stars = 0;
  $$('.seg', r).forEach(s => $$('button', s).forEach(b => b.onclick = () => { $$('button', s).forEach(x => x.classList.remove('on')); b.classList.add('on'); self[s.dataset.d] = b.dataset.l; sfx('click'); }));
  $$('.stars button', r).forEach(b => b.onclick = () => { stars = +b.dataset.s; $$('.stars button', r).forEach(x => x.classList.toggle('on', +x.dataset.s <= stars)); sfx('click'); });
  $('.send', r).onclick = async () => {
    const t = Object.keys(DIMS).map(d => self[d] || '').join('');
    if (!R.id) return toast('离线模式下无法提交反馈', '📡');
    if (t.length < 4 && !stars) return toast('选一下类型或者打个分吧', '🙂');
    try { await sendFeedback(R.id, t.length === 4 ? t : '', stars); $('.fb', r).innerHTML = '<h3>🎯 谢谢你的反馈！</h3><p class="phint">它会帮我们把这座岛调得更准。</p>'; sfx('achieve'); }
    catch { toast('提交失败，稍后再试', '📡'); }
  };
  return r;
}

const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); // 跨域（CDN）图片也能画进海报而不污染 canvas
async function makePoster(R, role, tp) {
  const W = 750, H = 1240, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const font = (s, w = 400) => `${w} ${s}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const wrap = (t, X, Y, maxW, lh) => { let line = '', y = Y; for (const ch of t) { if (x.measureText(line + ch).width > maxW) { x.fillText(line, X, y); line = ch; y += lh; } else line += ch; } x.fillText(line, X, y); return y; };
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, tp.c); g.addColorStop(1, '#1b2148');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const bgUrl = ready(IMG.temper(temperOf(R.type))), bg = bgUrl && await loadImg(bgUrl);
  if (bg) { x.globalAlpha = 0.55; x.drawImage(bg, 0, 0, W, H); x.globalAlpha = 1; }
  x.textAlign = 'center'; x.fillStyle = '#fff';
  x.font = font(32, 800); x.fillText('灯塔岛 · 七日漂流', W / 2, 92);
  x.font = font(22); x.globalAlpha = 0.8; x.fillText(`${R.name || G.name} 的漂流报告 · ${tp.w}`, W / 2, 132); x.globalAlpha = 1;
  x.fillStyle = '#fffaf0'; rr(50, 170, W - 100, 930, 40); x.fill();
  const artUrl = ready(IMG.role(R.type)), art = artUrl && await loadImg(artUrl);
  if (art) { x.save(); rr(255, 200, 240, 240, 28); x.clip(); x.drawImage(art, 255, 200, 240, 240); x.restore(); }
  else { x.font = font(150); x.fillText(role.e, W / 2, 360); }
  x.fillStyle = tp.c; x.font = font(112, 900); x.fillText(R.type, W / 2, 540);
  x.fillStyle = '#2b2a33'; x.font = font(46, 800); x.fillText(role.n, W / 2, 600);
  x.fillStyle = '#8a8597'; x.font = font(26); wrap(`「${role.t}」`, W / 2, 646, 560, 38);
  Object.keys(DIMS).forEach((d, i) => {
    const y = 720 + i * 68, [a, b] = DIMS[d], p = R.pct[d];
    x.font = font(24, 700); x.fillStyle = '#2b2a33';
    x.textAlign = 'left'; x.fillText(`${a} ${p}%`, 110, y);
    x.textAlign = 'right'; x.fillText(`${100 - p}% ${b}`, W - 110, y);
    x.fillStyle = '#eee8dc'; rr(110, y + 14, W - 220, 14, 7); x.fill();
    x.fillStyle = tp.c; rr(110, y + 14, Math.max(14, (W - 220) * p / 100), 14, 7); x.fill();
  });
  x.textAlign = 'center'; x.fillStyle = '#4a4656'; x.font = font(26, 400);
  wrap(G.note ? `✉️ ${G.note}` : `「${role.s.join(' · ')}」`, W / 2, 1020, 560, 40);
  x.fillStyle = '#fff'; x.font = font(26, 700); x.fillText('一场荒岛冒险，测出你的 MBTI', W / 2, 1160);
  x.globalAlpha = 0.6; x.font = font(20); x.fillText('不做一道题，七天看清你自己', W / 2, 1198);
  return c.toDataURL('image/png');
}
