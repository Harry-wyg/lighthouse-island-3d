// 计分模型：前端与服务端共用（纯函数，无 DOM 依赖）
// 信号格式：{ dim:'EI'|'SN'|'TF'|'JP', v:-1..1, w:权重, key:信号标识, day, stress:bool }
// v 为正 = 第一个字母（E / S / T / J），为负 = 第二个字母（I / N / F / P）

export const DIMS = { EI: ['E', 'I'], SN: ['S', 'N'], TF: ['T', 'F'], JP: ['J', 'P'] };
export const LETTER_NAME = { E: '外向', I: '内向', S: '实感', N: '直觉', T: '思考', F: '情感', J: '计划', P: '随性' };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// weightMap：服务端下发的权重倍率，按信号 key 覆盖（如 { "d1.seat": 1.2 }）
export function dimScore(signals, dim, weightMap = {}, filter = () => true) {
  let a = 0, b = 0;
  for (const s of signals) {
    if (s.dim !== dim || !filter(s)) continue;
    const w = s.w * (weightMap[s.key] ?? 1);
    a += clamp(s.v, -1, 1) * w; b += w;
  }
  return b ? a / b : 0;
}

export const pctOf = score => Math.round(50 + score * 50);

export function computeResult(signals, weightMap = {}) {
  const letters = {}, pct = {}, balanced = [], shifts = [];
  for (const d in DIMS) {
    const s = dimScore(signals, d, weightMap);
    letters[d] = s >= 0 ? DIMS[d][0] : DIMS[d][1];
    pct[d] = pctOf(s);
    if (Math.abs(pct[d] - 50) <= 5) balanced.push(d);
    // 压力模式：平时与风暴中的倾向相反
    const calm = dimScore(signals, d, weightMap, x => !x.stress);
    const stress = dimScore(signals, d, weightMap, x => x.stress);
    if (signals.some(x => x.dim === d && x.stress) && Math.sign(calm) !== Math.sign(stress) && Math.abs(calm) >= 0.2 && Math.abs(stress) >= 0.5) {
      shifts.push({ dim: d, from: calm > 0 ? DIMS[d][0] : DIMS[d][1], to: stress > 0 ? DIMS[d][0] : DIMS[d][1] });
    }
  }
  const type = letters.EI + letters.SN + letters.TF + letters.JP;
  return { type, letters, pct, balanced, shifts };
}

export const temperOf = t => (t[1] === 'N' ? 'N' + t[2] : 'S' + t[3]);
export const opposite = t => t.split('').map(c => ({ E: 'I', I: 'E', S: 'N', N: 'S', T: 'F', F: 'T', J: 'P', P: 'J' })[c]).join('');
