// 外部美术资源：全部托管在 Cloudinary（清单见 scripts/cloudinary-urls.csv）。
// 每个槽位的尺寸与生成 Prompt 见 public/assets/README.md 与 PRD 第 12 节。

export const ROLE_TYPES = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
export const NPC_KEYS = ['chen', 'lu', 'mu', 'ma'];
export const MOODS = ['calm', 'happy', 'sad', 'angry', 'surprised'];

const IMG_CDN = 'https://res.cloudinary.com/eumlccug/image/upload/';
const VIDEO_CDN = 'https://res.cloudinary.com/eumlccug/video/upload/';

export const IMG = {
  title: IMG_CDN + 'title_keyart.webp',               // IMG-01 标题页主视觉
  share: IMG_CDN + 'share_thumb.jpg',                 // IMG-02 分享缩略图
  role: t => `${IMG_CDN}${t}.webp`,                   // IMG-10 16 型角色卡
  portrait: (k, m) => `${IMG_CDN}${k}_${m}.webp`,     // IMG-20 NPC 对话头像
  temper: k => `${IMG_CDN}${k}.webp`,                 // IMG-30 四种气质灯光底图
  shell: i => `${IMG_CDN}shell_${String(i).padStart(2, '0')}.webp`, // IMG-40 贝壳图鉴
};
export const VIDEO = {
  opening: VIDEO_CDN + 'opening.mp4',           // VID-01 开场：风暴沉船（横版）
  openingV: VIDEO_CDN + 'opening_v.mp4',        // VID-01V 开场竖版，竖屏设备使用
  hiddenV: VIDEO_CDN + 'hidden_ending_v.mp4',   // VID-02V 隐藏结局：归船（只有竖版，所有设备都播）
};

// 竖屏设备用竖版开场；隐藏结局只有竖版
export function videoFor(key) {
  if (key === 'hidden') return VIDEO.hiddenV;
  return innerHeight > innerWidth ? VIDEO.openingV : VIDEO.opening;
}

// 资源都已上传 CDN，直接返回链接（保留接口，方便以后接入缺失检测）
export const ready = url => url;
// 预热首屏要用的标题图
export function preload() {
  return new Promise(res => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = IMG.title; });
}
