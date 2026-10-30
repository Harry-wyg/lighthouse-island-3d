// 灯塔岛 · 七日漂流 —— 服务端（零依赖，Node.js ≥ 18）
// 负责：静态资源、匿名账号、云存档、服务端计分、结果分享、校准反馈、埋点、运营后台
// 启动：node server.js    环境变量：PORT（默认 5173）、ADMIN_TOKEN（默认 island-admin）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { computeResult, DIMS } from './public/js/score.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 5173;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'island-admin';
const MAX_EVENTS = 50000;

/* ---------- 存储：JSON 文件，写入防抖 + 原子替换 ---------- */
function emptyDb() {
  return { users: {}, saves: {}, plays: {}, results: {}, feedback: [], events: [], weights: { version: 1, map: {}, rollout: 100, updatedAt: Date.now() } };
}
let db = emptyDb();
try { db = { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch { /* 首次启动 */ }
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  }, 300);
}
const id = (n = 10) => crypto.randomBytes(n).toString('base64url').slice(0, n);

/* ---------- HTTP 工具 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.glb': 'model/gltf-binary', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon',
};
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad json')); } });
  });
}
function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not found' });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    // 视频支持 Range 请求，保证 iOS 可以播放
    const range = req.headers.range;
    if (range && type.startsWith('video/')) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = Number(s), end = e ? Number(e) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': rel.startsWith('/vendor/') || rel.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- 业务 ---------- */
function auth(body) {
  const u = db.users[body.uid];
  return u && u.token === body.token ? u : null;
}
function listAssets(dir = path.join(PUBLIC, 'assets'), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) listAssets(f, out);
    else if (!e.name.endsWith('.md') && !e.name.startsWith('.')) out.push(path.relative(PUBLIC, f).split(path.sep).join('/'));
  }
  return out;
}
function publicResult(r) {
  return { id: r.id, name: r.name, type: r.type, pct: r.pct, letters: r.letters, balanced: r.balanced, shifts: r.shifts, moments: r.moments, stats: r.stats, createdAt: r.createdAt };
}
function stats() {
  const plays = Object.values(db.plays), results = Object.values(db.results);
  const typeDist = {}, dimAvg = { EI: 0, SN: 0, TF: 0, JP: 0 };
  for (const r of results) { typeDist[r.type] = (typeDist[r.type] || 0) + 1; for (const d in dimAvg) dimAvg[d] += r.pct[d]; }
  for (const d in dimAvg) dimAvg[d] = results.length ? Math.round(dimAvg[d] / results.length) : 0;
  // 各天到达人数（漏斗）
  const funnel = [0, 1, 2, 3, 4, 5, 6, 7].map(day => plays.filter(p => (p.maxDay ?? -1) >= day).length);
  const fb = db.feedback.filter(f => f.selfType && /^[EI][SN][TF][JP]$/.test(f.selfType));
  let exact = 0; const dimHit = { EI: 0, SN: 0, TF: 0, JP: 0 };
  for (const f of fb) {
    const r = db.results[f.resultId]; if (!r) continue;
    if (r.type === f.selfType) exact++;
    Object.keys(DIMS).forEach((d, i) => { if (r.type[i] === f.selfType[i]) dimHit[d]++; });
  }
  const acc = db.feedback.filter(f => f.accuracy).map(f => f.accuracy);
  return {
    users: Object.keys(db.users).length, plays: plays.length, finished: results.length,
    completion: plays.length ? +(results.length / plays.length * 100).toFixed(1) : 0,
    avgMinutes: results.length ? +(results.reduce((a, r) => a + (r.stats?.minutes || 0), 0) / results.length).toFixed(1) : 0,
    shares: results.filter(r => r.shared).length, funnel, typeDist, dimAvg,
    feedback: { count: fb.length, exactRate: fb.length ? +(exact / fb.length * 100).toFixed(1) : 0, dimRate: Object.fromEntries(Object.entries(dimHit).map(([d, n]) => [d, fb.length ? +(n / fb.length * 100).toFixed(1) : 0])), avgAccuracy: acc.length ? +(acc.reduce((a, b) => a + b, 0) / acc.length).toFixed(2) : 0 },
    weights: db.weights,
  };
}

const routes = {
  'POST /api/auth/guest': async () => {
    const u = { uid: id(12), token: id(24), createdAt: Date.now() };
    db.users[u.uid] = u; persist(); return u;
  },
  'GET /api/config': async () => ({ weights: db.weights.map, weightVersion: db.weights.version }),
  // 已放入的美术资源清单（客户端据此决定用图片还是回退画面，避免逐个探测产生 404）
  'GET /api/assets': async () => ({ files: listAssets() }),
  'GET /api/save': async (q) => {
    const u = db.users[q.get('uid')]; if (!u || u.token !== q.get('token')) throw [401, 'unauthorized'];
    return db.saves[u.uid] || null;
  },
  'PUT /api/save': async (q, b) => {
    const u = auth(b); if (!u) throw [401, 'unauthorized'];
    const cur = db.saves[u.uid];
    // 冲突时保留进度更远的存档
    if (!cur || (b.save?.day ?? 0) >= (cur.day ?? 0) || b.force) db.saves[u.uid] = { ...b.save, updatedAt: Date.now() };
    persist(); return { ok: true };
  },
  'DELETE /api/save': async (q, b) => { const u = auth(b); if (!u) throw [401, 'unauthorized']; delete db.saves[u.uid]; persist(); return { ok: true }; },
  'POST /api/play/start': async (q, b) => {
    const u = auth(b); if (!u) throw [401, 'unauthorized'];
    const p = { id: id(12), uid: u.uid, startedAt: Date.now(), maxDay: 0, weightVersion: db.weights.version };
    db.plays[p.id] = p; persist(); return { playId: p.id };
  },
  'POST /api/play/progress': async (q, b) => {
    const p = db.plays[b.playId]; if (!p) throw [404, 'no play'];
    p.maxDay = Math.max(p.maxDay || 0, Number(b.day) || 0); persist(); return { ok: true };
  },
  'POST /api/result': async (q, b) => {
    const u = auth(b); if (!u) throw [401, 'unauthorized'];
    if (!Array.isArray(b.signals) || b.signals.length > 400) throw [400, 'bad signals'];
    const signals = b.signals.filter(s => DIMS[s.dim] && Number.isFinite(s.v) && Number.isFinite(s.w)).map(s => ({ dim: s.dim, v: s.v, w: Math.min(3, Math.max(0, s.w)), key: String(s.key || '').slice(0, 40), day: s.day, stress: !!s.stress }));
    const r = computeResult(signals, db.weights.map);
    const play = db.plays[b.playId];
    const rec = {
      id: id(8), uid: u.uid, playId: b.playId, name: String(b.name || '旅人').slice(0, 8), ...r,
      moments: (b.moments || []).slice(0, 8).map(m => ({ day: m.day, dim: m.dim, text: String(m.text).slice(0, 80), letter: m.letter })),
      note: String(b.note || '').slice(0, 40), signals, stats: b.stats || {}, weightVersion: db.weights.version, createdAt: Date.now(),
    };
    if (play) { play.finishedAt = Date.now(); play.maxDay = 7; }
    db.results[rec.id] = rec; persist();
    return publicResult(rec);
  },
  'GET /api/result/:id': async (q, b, p) => { const r = db.results[p.id]; if (!r) throw [404, 'not found']; return publicResult(r); },
  'POST /api/result/:id/share': async (q, b, p) => { const r = db.results[p.id]; if (r) { r.shared = (r.shared || 0) + 1; persist(); } return { ok: true }; },
  'POST /api/feedback': async (q, b) => {
    if (!db.results[b.resultId]) throw [404, 'no result'];
    db.feedback.push({ resultId: b.resultId, selfType: String(b.selfType || '').slice(0, 4).toUpperCase(), accuracy: Math.min(5, Math.max(0, Number(b.accuracy) || 0)), at: Date.now() });
    persist(); return { ok: true };
  },
  'POST /api/track': async (q, b) => {
    const evs = Array.isArray(b.events) ? b.events.slice(0, 100) : [];
    for (const e of evs) db.events.push({ uid: String(b.uid || '').slice(0, 16), e: String(e.e).slice(0, 40), d: e.d ?? null, t: e.t || Date.now() });
    if (db.events.length > MAX_EVENTS) db.events.splice(0, db.events.length - MAX_EVENTS);
    persist(); return { ok: true };
  },
  'GET /api/admin/stats': async (q) => { if (q.get('token') !== ADMIN_TOKEN) throw [401, 'unauthorized']; return stats(); },
  'PUT /api/admin/weights': async (q, b) => {
    if (q.get('token') !== ADMIN_TOKEN) throw [401, 'unauthorized'];
    if (typeof b.map !== 'object' || Array.isArray(b.map)) throw [400, 'map must be an object'];
    db.weights = { version: db.weights.version + 1, map: b.map, rollout: 100, updatedAt: Date.now() };
    persist(); return db.weights;
  },
};

function match(method, pathname) {
  for (const key in routes) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const a = pattern.split('/'), b = pathname.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((seg, i) => seg.startsWith(':') ? (params[seg.slice(1)] = b[i], true) : seg === b[i])) return [routes[key], params];
  }
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const m = match(req.method, url.pathname);
    if (!m) return send(res, 404, { error: 'no route' });
    try {
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      send(res, 200, await m[0](url.searchParams, body, m[1]));
    } catch (e) {
      if (Array.isArray(e)) return send(res, e[0], { error: e[1] });
      send(res, 400, { error: e.message });
    }
    return;
  }
  serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log(`灯塔岛已启动：http://localhost:${PORT}`);
  console.log(`运营后台：http://localhost:${PORT}/admin.html?token=${ADMIN_TOKEN}`);
});
