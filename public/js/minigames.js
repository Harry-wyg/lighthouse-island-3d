// 小游戏（DOM / Canvas 面板，叠加在 3D 场景上）
import { panel, closePanel, $, $$, el, wait, shuffle, esc, NPC, toast } from './ui.js';
import { G, add, unlock } from './game.js';
import { sfx } from './audio.js';

/* ================== 角色创建 ================== */
export function createCharacter(onChange) {
  return new Promise(res => {
    const shirts = [0xff8a5b, 0x4a90ff, 0x3ecf8e, 0xe07aa3, 0x8b7bff, 0xf5a623], hairs = [0x3a2a20, 0x6b3a2a, 0xd8b06a, 0x1a1a1a];
    const styles = [['short', '短发'], ['long', '长发'], ['bob', '波波头'], ['ponytail', '马尾'], ['bun', '丸子头'], ['spiky', '刺猬头']];
    const look = { ...G.look };
    const hex = n => '#' + n.toString(16).padStart(6, '0');
    const p = panel(`<div class="ptitle">你是谁？</div><div class="phint">海水泡得你有点发懵，但你还记得自己的名字。</div>
      <input class="field" maxlength="8" placeholder="输入名字（最多 8 个字）" value="${G.name === '旅人' ? '' : esc(G.name)}">
      <div class="lab">发型</div><div class="chips">${styles.map(([k, n]) => `<button data-s="${k}" class="${look.hairStyle === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="lab">发色</div><div class="colors hc">${hairs.map(c => `<b style="background:${hex(c)}" data-c="${c}" class="${look.hair === c ? 'on' : ''}"></b>`).join('')}</div>
      <div class="lab">外套</div><div class="colors sc">${shirts.map(c => `<b style="background:${hex(c)}" data-c="${c}" class="${look.shirt === c ? 'on' : ''}"></b>`).join('')}</div>
      <button class="btn">就是我了</button>`, 'side');
    let changes = 0;
    const upd = () => { changes++; onChange(look); };
    $$('.chips button', p).forEach(b => b.onclick = () => { $$('.chips button', p).forEach(x => x.classList.remove('on')); b.classList.add('on'); look.hairStyle = b.dataset.s; sfx('click'); upd(); });
    $$('.hc b', p).forEach(b => b.onclick = () => { $$('.hc b', p).forEach(x => x.classList.remove('on')); b.classList.add('on'); look.hair = +b.dataset.c; sfx('click'); upd(); });
    $$('.sc b', p).forEach(b => b.onclick = () => { $$('.sc b', p).forEach(x => x.classList.remove('on')); b.classList.add('on'); look.shirt = +b.dataset.c; sfx('click'); upd(); });
    $('.btn', p).onclick = () => { G.name = $('input', p).value.trim().slice(0, 8) || '旅人'; G.look = look; G.flags.lookChanges = changes; sfx('confirm'); closePanel(); res(); };
  });
}

/* ================== 社交电量 ================== */
export function battery() {
  const w = el('div', 'battery-hud', `<div class="bat"><div class="bf"></div></div><div class="bl">社交电量 <b>100</b>%</div>`);
  $('#app').append(w);
  const bf = $('.bf', w), lb = $('b', w);
  let v = 100;
  return {
    async drain(to) { while (v > to) { v--; bf.style.width = v + '%'; lb.textContent = v; bf.style.background = v < 30 ? '#ff6b5b' : v < 60 ? '#ffc04d' : '#5fe08a'; await wait(22); } },
    async fill(to) { while (v < to) { v++; bf.style.width = v + '%'; lb.textContent = v; bf.style.background = v < 30 ? '#ff6b5b' : v < 60 ? '#ffc04d' : '#5fe08a'; await wait(14); } },
    get value() { return v; },
    remove() { w.remove(); },
  };
}

/* ================== 守塔人小屋搜查（S/N） ================== */
export function hutSearch(onDiary) {
  return new Promise(res => {
    const items = shuffle([
      { e: '👣', l: '门口的脚印', d: '门口有三串脚印，一串深、两串浅，都朝着东边。', k: 'S' },
      { e: '🍎', l: '桌上的野果', d: '木桌上有 7 个野果，其中 2 个已经发软，看起来放了三四天。', k: 'S' },
      { e: '🔧', l: '旧扳手', d: '一把磨损严重的扳手，握柄上缠着一圈褪色的蓝布。', k: 'S' },
      { e: '🕯️', l: '半截蜡烛', d: '半截蜡烛立在窗台上，底下积了 3 层蜡油。', k: 'S' },
      { e: '🧥', l: '挂着的外套', d: '一件深蓝色外套，左边口袋有个补丁，袖口磨得发白。', k: 'S' },
      { e: '🪵', l: '墙角的柴火', d: '墙角码着 12 根劈好的木柴，最上面一层落满了灰。', k: 'S' },
      { e: '🌀', l: '墙上的符号', d: '墙上刻着一圈圈螺旋，越往里越密，像是在倒数着什么。', k: 'N' },
      { e: '🗺️', l: '残缺的地图', d: '一张没画完的地图，边缘用很小的字写着：「回去」。', k: 'N' },
      { e: '🪞', l: '朝海的镜子', d: '一面镜子被特意摆成正对大海的角度，镜面擦得很干净。', k: 'N' },
      { e: '📖', l: '日记残页', d: '日记的最后一页，只写了一个字：「等」。旁边夹着一张泛黄的照片。', k: 'N', diary: true },
      { e: '🎐', l: '风铃', d: '门口的贝壳风铃，明明没有风，却好像一直在轻轻响。', k: 'N' },
      { e: '⏳', l: '停住的沙漏', d: '一只沙漏横放在架子上，沙子停在正中间。', k: 'N' },
    ]);
    const seen = [];
    const p = panel(`<div class="ptitle">🏚️ 守塔人的小屋</div><div class="phint">屋里很暗。点开物品仔细看看（至少看 5 样，看多少随你）</div><div class="grid4 hut"></div><div class="detail">……屋里有一股旧木头和海盐的味道。</div><button class="btn" disabled>离开小屋（0/5）</button>`);
    const grid = $('.grid4', p), det = $('.detail', p), btn = $('.btn', p);
    items.forEach(it => {
      const b = el('button', 'item', `<div class="e">${it.e}</div><div class="l">${it.l}</div>`);
      b.onclick = () => {
        det.textContent = it.d; sfx('click'); det.classList.remove('flash'); void det.offsetWidth; det.classList.add('flash');
        if (!seen.includes(it)) { seen.push(it); b.classList.add('seen'); if (it.diary) onDiary?.(); }
        btn.disabled = seen.length < 5; btn.textContent = `离开小屋（${Math.min(seen.length, 5)}/5）`;
      };
      grid.append(b);
    });
    btn.onclick = () => {
      const f5 = seen.slice(0, 5), s = f5.filter(x => x.k === 'S').length;
      add('SN', (s - 2.5) / 2.5, 0.9, 'd2.hut5');
      add('SN', seen[0].k === 'S' ? 1 : -1, 0.4, 'd2.hut1', `在守塔人的小屋里，你第一眼注意到的是「${seen[0].l}」`);
      G.flags.hutSeen = seen.length; closePanel(); sfx('door'); res(seen);
    };
  });
}

/* ================== 齿轮机关（S/N：先看刻痕还是先动手） ================== */
export function gearPuzzle() {
  return new Promise(res => {
    const st = [1 + (Math.random() * 5 | 0), 1 + (Math.random() * 5 | 0), 1 + (Math.random() * 5 | 0)]; // 外、中、内 当前角度（×60°）
    let moves = 0, hintAt = -1;
    const p = panel(`<div class="ptitle">⚙️ 生锈的机关</div><div class="phint">把三圈齿轮上的金色缺口都转到正上方。转动外圈会带动中圈，转动中圈会带动内圈。</div>
      <svg viewBox="-110 -110 220 220" class="gears">
        <g data-r="0"><circle r="100" class="ring r0"/><circle r="10" cy="-88" class="notch"/></g>
        <g data-r="1"><circle r="72" class="ring r1"/><circle r="9" cy="-60" class="notch"/></g>
        <g data-r="2"><circle r="44" class="ring r2"/><circle r="8" cy="-32" class="notch"/></g>
        <circle r="14" class="hub"/><path d="M0 -108 L-7 -100 L7 -100Z" class="mark"/>
      </svg>
      <div class="detail small hintbox">箱盖上似乎刻着什么……</div>
      <div class="row"><button class="btn ghost hint">查看箱盖上的刻痕</button></div>`);
    const draw = () => $$('g[data-r]', p).forEach(g => { g.style.transform = `rotate(${st[+g.dataset.r] * 60}deg)`; });
    draw();
    const rings = [[0, 1], [1, 2], [2]];
    $$('g[data-r]', p).forEach(g => g.onclick = e => {
      e.stopPropagation(); const r = +g.dataset.r; rings[r].forEach(i => st[i] = (st[i] + 1) % 6); moves++; sfx('gear'); draw();
      if (st.every(x => x === 0)) win();
    });
    $('.hint', p).onclick = () => {
      if (hintAt < 0) hintAt = moves;
      const a = (6 - st[0]) % 6, b = (6 - (st[1] + a) % 6) % 6, c = (6 - (st[2] + b) % 6) % 6;
      $('.hintbox', p).innerHTML = `刻痕写着：<b>外圈转 ${a} 下 → 中圈转 ${b} 下 → 内圈转 ${c} 下</b>`; sfx('page');
    };
    async function win() {
      sfx('quest'); $('.gears', p).classList.add('solved'); await wait(900);
      if (hintAt === 0) add('SN', 1, 1, 'd2.gear', '打开机关前，你先仔细看了箱盖上的刻痕');
      else if (hintAt < 0) add('SN', -1, 1, 'd2.gear', `你没看任何提示，凭直觉转了 ${moves} 下就打开了机关`);
      else add('SN', -0.3, 0.6, 'd2.gear');
      closePanel(); res({ moves, hint: hintAt });
    }
  });
}

/* ================== 看云 ================== */
function cloudSVG(seed) {
  let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  let c = ''; for (let i = 0; i < 9; i++) c += `<circle cx="${60 + rnd() * 140}" cy="${55 + rnd() * 50}" r="${18 + rnd() * 26}" fill="#fff"/>`;
  return `<svg viewBox="0 0 260 160" class="cloud">${c}</svg>`;
}
export async function clouds(chooseFn, O) {
  const rounds = [['像一只趴着打盹的猫', '像一句还没说完的话', '小鹿指着的那朵云，你说它'], ['像一团刚出锅的棉花糖', '像有人在天上挥手告别', '又飘来一朵，你说它']];
  for (let i = 0; i < 2; i++) {
    panel(`<div class="ptitle">☁️ 看云</div><div class="phint">躺在山坡上，小鹿指着天空：「你看那朵云像什么？」</div><div class="cloudbox">${cloudSVG(i + 3)}</div>`, 'top');
    const [s, n, q] = rounds[i];
    await chooseFn(q + '……', [O(s, 'SN', 1, 0.8, 'd2.cloud' + i), O(n, 'SN', -1, 0.8, 'd2.cloud' + i, i === 0 ? '躺在山坡上看云，你说它「像一句还没说完的话」' : null)]);
  }
  closePanel();
}

/* ================== 分配淡水（T/F） ================== */
export function water() {
  return new Promise(res => {
    const ppl = [
      { k: 'me', c: '今天：捡了一下午的柴火', m: '状态：有点累，但还好' },
      { k: 'chen', c: '今天：搬了一整天石头 ⭐⭐⭐⭐⭐', m: '状态：很累，嘴上说没事' },
      { k: 'mu', c: '今天：发烧，几乎没干活 ⭐', m: '状态：嘴唇干裂，一直在说「对不起」' },
      { k: 'lu', c: '今天：做了三顿饭 ⭐⭐⭐', m: '状态：刚被老陈说了几句，有点委屈' },
    ];
    const cnt = { me: 0, chen: 0, mu: 0, lu: 0 }, TOTAL = 10; let firstInfo = null;
    const p = panel(`<div class="ptitle">💧 分配淡水</div><div class="phint">只剩 10 瓶水，要撑到明天。由你来分。</div>
      <div class="tabs"><button data-t="c">📊 查看今日贡献</button><button data-t="m">💭 查看身体和心情</button></div>
      <div class="rows"></div><div class="pool">剩余：<span>10</span> 瓶 <i class="bottles"></i></div><button class="btn" disabled>就这么分</button>`);
    const rows = $('.rows', p), sum = () => Object.values(cnt).reduce((a, b) => a + b, 0);
    const upd = () => { const left = TOTAL - sum(); $('.pool span', p).textContent = left; $('.bottles', p).textContent = '🧴'.repeat(left); $('.btn', p).disabled = left !== 0; };
    ppl.forEach(x => {
      const n = NPC[x.k];
      const r = el('div', 'prow', `<div class="av" style="background:${n.c}">${x.k === 'me' ? '我' : n.n.slice(-1)}</div><div class="pinfo"><div class="nm">${x.k === 'me' ? esc(G.name) + '（你）' : n.n}</div><div class="inf"><div class="c">${x.c}</div><div class="m">${x.m}</div></div></div><div class="stp"><button>−</button><b>0</b><button>＋</button></div>`);
      const [mi, pl] = $$('.stp button', r), b = $('.stp b', r);
      mi.onclick = () => { if (cnt[x.k] > 0) { cnt[x.k]--; b.textContent = cnt[x.k]; sfx('click'); upd(); } };
      pl.onclick = () => { if (sum() < TOTAL) { cnt[x.k]++; b.textContent = cnt[x.k]; sfx('pour'); upd(); } };
      rows.append(r);
    });
    $$('.tabs button', p).forEach(t => t.onclick = () => { if (!firstInfo) firstInfo = t.dataset.t; t.classList.toggle('on'); $$('.inf .' + t.dataset.t, p).forEach(d => d.classList.toggle('on')); sfx('click'); });
    upd();
    $('.btn', p).onclick = () => {
      const diff = cnt.mu - cnt.chen;
      add('TF', diff === 0 ? 0.3 : -Math.max(-1, Math.min(1, diff / 3)), 1.2, 'd3.water', `分水时，你给了生病的阿木 ${cnt.mu} 瓶、干活最多的老陈 ${cnt.chen} 瓶`);
      if (firstInfo) add('TF', firstInfo === 'c' ? 1 : -1, 0.35, 'd3.waterInfo');
      closePanel(); res(cnt);
    };
  });
}

/* ================== 风暴前排程（J/P） ================== */
export const PREP_TASKS = [
  { id: 'roof', e: '🏠', n: '加固帐篷' }, { id: 'water', e: '💧', n: '灌满水桶' }, { id: 'wood', e: '🪵', n: '收好柴火' },
  { id: 'net', e: '🎣', n: '收回渔网' }, { id: 'food', e: '🥫', n: '搬走物资箱' }, { id: 'flag', e: '🚩', n: '加固信号旗' },
];
export function planBoard() {
  return new Promise(res => {
    const order = [], t0 = performance.now(); let left = 40, iv, started = false;
    const p = panel(`<div class="ptitle">⛈️ 风暴前的准备</div><div class="phint">风暴 <b class="cd">40</b> 秒后开始变大。你可以先依次点击任务排好顺序，也可以直接去干。</div><div class="list"></div><div class="row"><button class="btn ghost go">别想了，直接开干！</button><button class="btn plan" disabled>按这个顺序执行</button></div>`);
    const list = $('.list', p), planBtn = $('.plan', p);
    const draw = () => {
      list.innerHTML = '';
      PREP_TASKS.forEach(t => {
        const i = order.indexOf(t.id);
        const d = el('div', 'task' + (i >= 0 ? ' on' : ''), `<div class="no">${i >= 0 ? i + 1 : ''}</div>${t.e} ${t.n}`);
        d.onclick = () => { i >= 0 ? order.splice(i, 1) : order.push(t.id); sfx('click'); draw(); };
        list.append(d);
      });
      planBtn.disabled = order.length !== PREP_TASKS.length;
    };
    draw();
    iv = setInterval(() => { left--; $('.cd', p).textContent = left; if (left <= 10) sfx('click'); if (left <= 0) start(order.length === PREP_TASKS.length); }, 1000);
    $('.go', p).onclick = () => start(false); planBtn.onclick = () => start(true);
    function start(planned) {
      if (started) return; started = true; clearInterval(iv);
      const pt = Math.round((performance.now() - t0) / 1000);
      if (planned) add('JP', 1, 1, 'd4.plan', `风暴来临前，你花了 ${pt} 秒把 6 项任务全部排好了顺序`);
      else if (order.length >= 3) add('JP', 0.2, 1, 'd4.plan');
      else add('JP', -1, 1, 'd4.plan', '风暴来临前，你没排计划，直接撸起袖子开干');
      sfx('confirm'); closePanel(); res({ planned, order: planned ? order : [] });
    }
  });
}

/* ================== 收拾背包（J/P） ================== */
export function pack() {
  return new Promise(res => {
    const items = [{ e: '🥫', c: 'food' }, { e: '🍞', c: 'food' }, { e: '🍫', c: 'food' }, { e: '🔦', c: 'tool' }, { e: '🪢', c: 'tool' }, { e: '🔪', c: 'tool' }, { e: '🩹', c: 'med' }, { e: '💊', c: 'med' }];
    const comps = [{ k: 'food', n: '🍱 食物袋' }, { k: 'tool', n: '🧰 工具袋' }, { k: 'med', n: '⛑️ 医药袋' }, { k: 'main', n: '🎒 大主仓' }];
    const placed = new Map(); let sel = null, dumped = false;
    const p = panel(`<div class="ptitle">🎒 收拾应急背包</div><div class="phint">风暴来了要撤到山洞。点一样东西，再点放进哪个袋子。</div><div class="grid4"></div><div class="bag"></div><button class="btn ghost dump">全部塞进大主仓！</button>`);
    const grid = $('.grid4', p), bag = $('.bag', p);
    shuffle(items).forEach(it => {
      const b = el('button', 'item', `<div class="e">${it.e}</div>`); it.b = b;
      b.onclick = () => { $$('.item', p).forEach(x => x.classList.remove('sel')); sel = it; b.classList.add('sel'); $$('.comp', p).forEach(c => c.classList.add('ready')); sfx('click'); };
      grid.append(b);
    });
    comps.forEach(c => {
      const d = el('div', 'comp', `<div class="ct">${c.n}</div><div class="cc"></div>`); c.d = d;
      d.onclick = () => { if (!sel) return; put(sel, c); sel = null; $$('.comp', p).forEach(x => x.classList.remove('ready')); check(); };
      bag.append(d);
    });
    function put(it, c) { placed.set(it, c.k); it.b.classList.remove('sel'); it.b.classList.add('gone'); $('.cc', c.d).textContent += it.e; sfx('pick'); }
    $('.dump', p).onclick = () => { dumped = true; items.filter(i => !placed.has(i)).forEach(i => put(i, comps[3])); check(); };
    function check() {
      if (placed.size < items.length) return;
      const right = items.filter(i => placed.get(i) === i.c).length;
      if (dumped && right < 4) add('JP', -1, 0.9, 'd4.pack', '收拾背包时，你一键把所有东西塞进了大主仓');
      else add('JP', right / items.length * 2 - 1, 0.9, 'd4.pack', right >= 7 ? '收拾背包时，你把每样东西都分门别类放好了' : null);
      if (right === items.length) unlock('packer');
      setTimeout(() => { closePanel(); res(right); }, 500);
    }
  });
}

/* ================== 打鼓（节奏小游戏） ================== */
export function drum() {
  return new Promise(res => {
    const p = panel(`<div class="ptitle">🥁 潮灯节 · 打鼓</div><div class="phint">音符落到线上时点击对应的鼓（电脑可按 F / J）。全村人都在看你！</div><canvas class="drumcv" width="320" height="300"></canvas><div class="row drumbtns"><button class="btn dl">咚</button><button class="btn dh">嗒</button></div><div class="pool score">连击 0 · 得分 0</div>`);
    const cv = $('canvas', p), x = cv.getContext('2d'), bpm = 118, beat = 60 / bpm;
    const notes = []; let tt = 2;
    for (let i = 0; i < 32; i++) { notes.push({ t: tt, lane: [0, 1, 0, 0, 1, 0, 1, 1].at(i % 8), hit: false, miss: false }); tt += beat * ([1, 0.5, 0.5, 1][i % 4]); }
    const end = tt + 1.5; let t0 = performance.now(), combo = 0, best = 0, score = 0, fx = [];
    const hit = lane => {
      const now = (performance.now() - t0) / 1000; sfx(lane ? 'drumH' : 'drumL');
      const n = notes.find(n => !n.hit && !n.miss && n.lane === lane && Math.abs(n.t - now) < 0.18);
      if (n) { n.hit = true; combo++; best = Math.max(best, combo); score += Math.abs(n.t - now) < 0.08 ? 100 : 60; fx.push({ lane, t: now, ok: Math.abs(n.t - now) < 0.08 ? '完美' : '不错' }); }
      else { combo = 0; }
    };
    $('.dl', p).onpointerdown = e => { e.preventDefault(); hit(0); }; $('.dh', p).onpointerdown = e => { e.preventDefault(); hit(1); };
    const key = e => { if (e.key === 'f') hit(0); if (e.key === 'j') hit(1); };
    addEventListener('keydown', key);
    const frame = () => {
      const now = (performance.now() - t0) / 1000, W = cv.width, H = cv.height, hitY = H - 50;
      x.clearRect(0, 0, W, H);
      x.fillStyle = '#2a2140'; x.fillRect(0, 0, W, H);
      [0, 1].forEach(l => { x.fillStyle = l ? 'rgba(255,200,90,.08)' : 'rgba(255,120,90,.08)'; x.fillRect(l * W / 2 + 10, 0, W / 2 - 20, H); });
      x.strokeStyle = '#ffd34a'; x.lineWidth = 3; x.beginPath(); x.moveTo(10, hitY); x.lineTo(W - 10, hitY); x.stroke();
      for (const n of notes) {
        if (n.hit) continue;
        if (!n.miss && now - n.t > 0.18) { n.miss = true; combo = 0; }
        const y = hitY - (n.t - now) * 180; if (y < -20 || y > H + 20) continue;
        x.globalAlpha = n.miss ? 0.25 : 1; x.fillStyle = n.lane ? '#ffc04d' : '#ff6b5b';
        x.beginPath(); x.arc(n.lane * W / 2 + W / 4, y, 18, 0, 7); x.fill(); x.globalAlpha = 1;
      }
      fx = fx.filter(f => now - f.t < 0.5);
      fx.forEach(f => { x.fillStyle = `rgba(255,255,255,${1 - (now - f.t) * 2})`; x.font = 'bold 18px sans-serif'; x.textAlign = 'center'; x.fillText(f.ok, f.lane * W / 2 + W / 4, hitY - 30 - (now - f.t) * 60); });
      $('.score', p).textContent = `连击 ${combo} · 最高 ${best} · 得分 ${score}`;
      if (now < end) requestAnimationFrame(frame);
      else { removeEventListener('keydown', key); if (best >= 20) unlock('drummer'); setTimeout(() => { closePanel(); res({ score, best }); }, 600); }
    };
    requestAnimationFrame(frame);
  });
}

/* ================== 做鱼汤（S/N + J/P） ================== */
export function cooking() {
  return new Promise(res => {
    const ings = [['🐟', '鱼'], ['🫚', '姜片'], ['🌿', '香草'], ['🧂', '盐'], ['🍋', '柠檬'], ['🥥', '椰奶'], ['🌶️', '辣椒'], ['🍯', '蜂蜜']];
    const recipe = ['鱼', '姜片', '香草', '盐'];
    const picked = []; let recipeAt = -1;
    const p = panel(`<div class="ptitle">🍲 帮小鹿做鱼汤</div><div class="phint">选 4 样材料下锅。旁边挂着阿嬷手写的食谱。</div>
      <div class="grid4 ing">${ings.map(([e, n]) => `<button class="item" data-n="${n}"><div class="e">${e}</div><div class="l">${n}</div></button>`).join('')}</div>
      <div class="detail small recipe">📜 食谱折着，看不清。</div>
      <div class="pool pot">锅里：<span>还空着</span></div>
      <div class="row"><button class="btn ghost rb">展开食谱</button><button class="btn go" disabled>下锅！</button></div>`);
    $('.rb', p).onclick = () => { if (recipeAt < 0) recipeAt = picked.length; $('.recipe', p).innerHTML = '📜 <b>阿嬷鱼汤</b>：鱼、姜片、香草，最后放一小撮盐。'; sfx('page'); };
    $$('.ing .item', p).forEach(b => b.onclick = () => {
      const n = b.dataset.n; if (picked.includes(n) || picked.length >= 4) return;
      picked.push(n); b.classList.add('seen'); sfx('pick'); $('.pot span', p).textContent = picked.join('、'); $('.go', p).disabled = picked.length < 4;
    });
    $('.go', p).onclick = () => {
      const match = picked.filter(n => recipe.includes(n)).length;
      if (recipeAt === 0) { add('SN', 0.8, 0.7, 'd5.cook'); add('JP', 0.8, 0.6, 'd5.cookJ', '帮小鹿做鱼汤时，你先展开食谱，一步步照着做'); }
      else if (recipeAt < 0) { add('SN', -0.8, 0.7, 'd5.cook'); add('JP', -0.8, 0.6, 'd5.cookJ', `帮小鹿做鱼汤时，你没看食谱，即兴放了${picked.filter(n => !recipe.includes(n)).join('、') || '一些材料'}`); }
      else { add('SN', 0.2, 0.5, 'd5.cook'); }
      sfx('splash'); closePanel(); res({ match, picked });
    };
  });
}

/* ================== 风暴跑酷（压力关，中途弹出限时决策） ================== */
export function runner(decisionAt) {
  return new Promise(res => {
    const p = panel(`<div class="ptitle">🌪️ 冲向礁湾！</div><div class="phint">点击画面（或按空格）跳过飞来的木板。</div><canvas class="runcv" width="340" height="220"></canvas><div class="pool rstat">摔倒 0 次</div>`, 'wide');
    const cv = $('canvas', p), x = cv.getContext('2d'), W = cv.width, H = cv.height, ground = H - 40;
    let y = 0, vy = 0, falls = 0, dist = 0, paused = false, stun = 0, last = performance.now(), flash = 0;
    const obs = [], total = 2400, stops = [500, 1050, 1600, 2150];
    let nextObs = 260, stopIdx = 0;
    const jump = () => { if (y === 0 && !paused && stun <= 0) { vy = 470; sfx('whoosh'); } };
    cv.onpointerdown = e => { e.preventDefault(); jump(); };
    const key = e => { if (e.key === ' ' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); jump(); } };
    addEventListener('keydown', key);
    const frame = async now => {
      const dt = Math.min(0.04, (now - last) / 1000); last = now;
      if (!paused) {
        const sp = stun > 0 ? 90 : 230; dist += sp * dt; stun -= dt;
        vy -= 1300 * dt; y = Math.max(0, y + vy * dt); if (y === 0) vy = 0;
        if (dist > nextObs) { obs.push({ x: W + 20, h: 18 + Math.random() * 16, fly: Math.random() < 0.35 }); nextObs += 170 + Math.random() * 150; }
        obs.forEach(o => o.x -= sp * dt * 1.05);
        for (const o of obs) if (!o.hitDone && o.x < 70 && o.x > 30 && (o.fly ? y < 40 && y > 2 : y < o.h)) { o.hitDone = true; falls++; stun = 0.8; sfx('wrong'); $('.rstat', p).textContent = `摔倒 ${falls} 次`; }
        if (Math.random() < 0.004) { flash = 0.15; }
        if (stopIdx < stops.length && dist > stops[stopIdx]) { paused = true; await decisionAt(stopIdx++); paused = false; last = performance.now(); }
      }
      flash -= dt;
      // 绘制
      x.fillStyle = flash > 0 ? '#c8d0dc' : '#2b3442'; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(200,212,230,.35)'; x.lineWidth = 1; for (let i = 0; i < 40; i++) { const rx = (i * 53 + dist * 2) % W, ry = (i * 37 + dist * 5) % H; x.beginPath(); x.moveTo(W - rx, ry); x.lineTo(W - rx - 4, ry + 12); x.stroke(); }
      x.fillStyle = '#3d4c5e'; for (let i = 0; i < 6; i++) { const wx = (i * 90 - dist * 0.4) % (W + 90); x.beginPath(); x.arc(W - wx, ground + 30, 60, Math.PI, 0); x.fill(); }
      x.fillStyle = '#7c7466'; x.fillRect(0, ground, W, H - ground);
      for (const o of obs) { x.fillStyle = '#8a6038'; o.fly ? x.fillRect(o.x - 18, ground - 52, 36, 10) : x.fillRect(o.x - 6, ground - o.h, 14, o.h); }
      // 主角
      const px = 50, py = ground - y;
      x.fillStyle = G.look ? '#' + G.look.shirt.toString(16).padStart(6, '0') : '#ff8a5b';
      x.fillRect(px - 8, py - 30, 16, 18); x.fillStyle = '#f2c9a0'; x.beginPath(); x.arc(px, py - 38, 8, 0, 7); x.fill();
      x.fillStyle = '#3d4a6b'; const lg = y > 0 ? 0 : Math.sin(dist / 12) * 6; x.fillRect(px - 7 + lg, py - 12, 5, 12); x.fillRect(px + 2 - lg, py - 12, 5, 12);
      if (stun > 0) { x.fillStyle = '#ffd34a'; x.font = '14px sans-serif'; x.fillText('💫', px - 8, py - 52); }
      x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(10, 10, (W - 20) * Math.min(1, dist / total), 4);
      if (paused) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, W, H); }
      if (dist < total) requestAnimationFrame(frame);
      else { removeEventListener('keydown', key); if (!falls) unlock('runner'); setTimeout(() => { closePanel(); res({ falls }); }, 400); }
    };
    requestAnimationFrame(frame);
  });
}

/* ================== 灯塔组装（每装一个零件回放一段记忆） ================== */
export function assembly() {
  return new Promise(res => {
    const parts = [['🛢️', '灯油', 1, '油箱'], ['⚙️', '齿轮', 2, '旋转机构'], ['🔍', '镜片', 3, '反光镜'], ['🪢', '绳索', 4, '吊篮'], ['🔥', '火种', 5, '灯芯'], ['💎', '透镜', 6, '透镜罩']];
    const slotsY = { 油箱: 250, 吊篮: 210, 旋转机构: 160, 反光镜: 118, 灯芯: 88, 透镜罩: 56 };
    let sel = null, done = 0;
    const p = panel(`<div class="ptitle">🗼 组装灯塔</div><div class="phint">选一个零件，再点灯塔剖面图上对应的位置。</div>
      <div class="asm"><svg viewBox="0 0 200 290" class="lhsec">
        <polygon points="60,280 140,280 125,70 75,70" fill="#f5f1e8" stroke="#c9bfae"/><polygon points="72,70 128,70 120,40 80,40" fill="#cfe9ff" stroke="#8fb6d6"/><polygon points="76,40 124,40 100,18" fill="#e06c5a"/>
        ${Object.entries(slotsY).map(([n, y]) => `<g class="slot" data-n="${n}"><rect x="62" y="${y - 13}" width="76" height="26" rx="8"/><text x="100" y="${y + 4}">${n}</text></g>`).join('')}
      </svg><div class="tray">${parts.map(([e, n, d, slot]) => `<button class="item" data-n="${n}" data-slot="${slot}" data-d="${d}"><div class="e">${e}</div><div class="l">${n}</div></button>`).join('')}</div></div>
      <div class="detail small memo">……</div>`);
    $$('.tray .item', p).forEach(b => b.onclick = () => { $$('.tray .item', p).forEach(x => x.classList.remove('sel')); sel = b; b.classList.add('sel'); sfx('click'); });
    $$('.slot', p).forEach(g => g.onclick = async () => {
      if (!sel) return;
      if (g.dataset.n !== sel.dataset.slot) { sfx('wrong'); g.classList.add('shake'); setTimeout(() => g.classList.remove('shake'), 400); return; }
      g.classList.add('filled'); g.querySelector('text').textContent = sel.querySelector('.e').textContent + ' ' + sel.dataset.n;
      sel.classList.add('gone'); sfx('gear');
      const d = +sel.dataset.d, m = G.moments.filter(x => x.day === d).sort((a, b) => b.w - a.w)[0];
      $('.memo', p).innerHTML = `<b>DAY ${d} 的回忆</b>　${m ? esc(m.text) : '那一天，你也在努力地生活着。'}`;
      sel = null; done++;
      if (done === parts.length) { await wait(1500); sfx('part'); closePanel(); res(); }
    });
  });
}

/* ================== 写给未来的自己 ================== */
export function note() {
  return new Promise(res => {
    const p = panel(`<div class="ptitle">✉️ 写给未来的自己</div><div class="phint">阿嬷说：「点灯之前，对着灯许个愿吧。写一句话，给未来的自己。」</div><textarea class="field" maxlength="40" placeholder="比如：别怕，往有光的地方走。"></textarea><div class="row"><button class="btn ghost skip">不写了</button><button class="btn ok">写好了</button></div>`);
    $('.skip', p).onclick = () => { G.note = ''; closePanel(); res(); };
    $('.ok', p).onclick = () => { G.note = $('textarea', p).value.trim(); sfx('confirm'); closePanel(); res(); };
  });
}
export { toast };
