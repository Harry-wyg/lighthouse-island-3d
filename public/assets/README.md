# 美术资源清单

## 制作状态（2026-10-29）

- 图片：54/54 已生成并放入下表规定的路径。使用内置 image_gen，统一 low-poly 3D 风格；NPC 表情以各角色基础头像为参考生成。
- 校验：54 张图片全部通过尺寸、编码和解码检查；12 个收藏物全部包含真实透明像素。最终图片约 3.10 MiB。
- 视频：1/2 已接入。24 秒 1080p H.264 开场已保存为 `video/opening.mp4` 并通过尺寸、时长、编码、解码和 faststart 校验。15 秒 1080p 隐藏结局正在生成（任务 `883717eb9d`），待放入时间线、导出及接入。生成记录保存于 `scripts/video-production.json`。
- 预览：启动项目后打开 `/assets-preview.html`，可查看全部图片与视频状态。
- 完整生成提示词、参考图与源图路径：`scripts/image-production.json`（项目根目录下）。原始 PNG 保留在内置生成工具的输出目录，游戏交付文件均已复制并转换到本目录。
- 图片校验命令：`npm run assets:check -- --images`。视频补齐后运行 `npm run assets:check`。需要系统安装 `ffmpeg` 和 `ffprobe`；报告保存至 `scripts/asset-validation.json`。

以下保留项目内原有的第 12 项规格与提示词。外部 Claude PRD 链接在本次制作时无法访问，因此以此项目内清单为依据。

把生成好的文件放到下表路径，刷新页面即自动生效，不需要改代码。文件缺失时，游戏自动使用程序生成画面、emoji 或 Three.js 实时过场代替。

**统一风格后缀**（每条图片 Prompt 末尾都加上）：
`stylized low-poly 3D illustration, soft global illumination, warm pastel palette, gentle rim light, clean shapes, cozy and slightly melancholic mood, high detail, no text, no watermark`

**角色设定**（多张图里保持形象一致）：

| 角色 | 英文描述（直接拼进 Prompt） |
|---|---|
| 老陈 | a 55-year-old ship first mate, sturdy with a small belly, short grey hair, grey beard, tanned skin, navy captain cap with a gold badge, dark-blue work shirt |
| 小鹿 | a 20-year-old girl cook assistant, brown ponytail with a pink hair tie, pink shirt, pink skirt over blue trousers, bright eyes, lively |
| 阿木 | a 21-year-old quiet college boy, black bob haircut, round glasses, sage-green shirt, pale and slightly sickly |
| 阿嬷 | a 75-year-old island grandmother, white hair in a bun, purple top, mustard-yellow scarf, deeply tanned wrinkled skin, kind eyes |
| 主角 | 玩家可以自定义外观，所以不画正脸：只画背影、剪影，或者不出现 |

---

## 图片

| 编号 | 路径 | 尺寸 / 格式 | 用途 |
|---|---|---|---|
| IMG-01 | `images/title_keyart.webp` | 1920×1080 webp，主体放在中间 1080px 内 | 标题页背景 |
| IMG-02 | `images/share_thumb.jpg` | 1200×630 jpg | 分享预览图（og:image） |
| IMG-10 | `images/roles/{TYPE}.webp`（16 张） | 768×768 webp | 结果页角色卡、分享海报 |
| IMG-20 | `images/portraits/{chen\|lu\|mu\|ma}_{calm\|happy\|sad\|angry\|surprised}.webp`（20 张） | 512×512 webp | 对话头像、日志里的伙伴头像 |
| IMG-30 | `images/temper/{NT\|NF\|SJ\|SP}.webp`（4 张） | 1080×1920 webp | 结果页头图背景、海报背景 |
| IMG-40 | `images/collection/shell_01..12.webp`（12 张） | 256×256 webp，透明背景 | 贝壳图鉴 |

### IMG-01 标题主视觉
黄昏时俯瞰小岛。北边悬崖上的灯塔没有亮，南边沙滩有篝火和四个小人，东边是挂着灯笼的渔村，西边是森林和雾中的小屋，远处礁石上搁着一艘沉船。顶部留出天空放 Logo。

`a tiny tropical island at dusk seen from a high three-quarter angle, an unlit white-and-red lighthouse on a cliff at the north end, a small campfire glowing on the southern beach with four tiny figures around it, a fishing village with paper lanterns on the east shore, dense jungle with a misty hut on the west, calm turquoise sea, purple-to-peach gradient sky with the first stars, a broken shipwreck on a distant reef, empty sky at the top for a logo`

### IMG-02 分享缩略图
灯塔顶部射出紫、绿、蓝、金四色光束，扫过夜海，下方是小岛剪影，左侧留白放标题。

`close-up of a lighthouse lamp room bursting with light, four beams in purple, green, blue and gold fanning out over a night sea, small island silhouette below, generous empty space on the left for a title`

### IMG-10 角色卡（16 张）
Prompt 前缀：`square character card, a single young adventurer (gender-neutral, face partially visible) on a small island, centered composition, soft circular vignette background in {颜色}, ` + 下表场景 + 统一风格后缀。

| 文件 | 角色 | 颜色 | 场景 |
|---|---|---|---|
| INTJ.webp | 灯塔设计师 | purple | standing on a cliff unrolling a glowing blueprint of the lighthouse, compass and ruler at the belt, wind in the coat |
| INTP.webp | 星图解谜者 | purple | sitting on rocks at night tracing constellations with a finger, notebook of spirals and equations floating around |
| ENTJ.webp | 远航船长 | purple | at the bow of a small boat pointing forward into the storm, captain's coat, confident stance |
| ENTP.webp | 奇想发明家 | purple | building a quirky contraption from coconut shells, fishing net and gears, sparks and lightbulb doodles |
| INFJ.webp | 潮汐预言者 | green | standing ankle-deep in a calm moonlit tide, eyes closed, glowing ripples spreading outward |
| INFP.webp | 拾贝诗人 | green | sitting on the beach at sunset holding a seashell to the ear, small notebook with a handwritten poem, floating petals |
| ENFJ.webp | 篝火引路人 | green | by a big campfire with arms open, welcoming silhouettes of friends, warm glow |
| ENFP.webp | 追风探险家 | green | running along a hilltop flying a colorful kite, backpack full of trinkets, joyful |
| ISTJ.webp | 补给管理员 | blue | checking a neat clipboard in front of perfectly stacked crates and water barrels |
| ISFJ.webp | 守夜医者 | blue | sitting beside a sleeping friend in a tent at night, holding a lantern and a warm cup, bandages ready |
| ESTJ.webp | 营地总指挥 | blue | standing on a crate with a whistle, directing teammates carrying supplies, organized camp behind |
| ESFJ.webp | 炊烟守护者 | blue | stirring a big pot of fish soup over a fire, steam rising, serving bowls lined up |
| ISTP.webp | 修船匠 | golden amber | crouched fixing a gear mechanism with a wrench, tools spread on a cloth, focused |
| ISFP.webp | 珊瑚画师 | golden amber | painting the sunset on a canvas propped on driftwood, coral and shells as a paint palette |
| ESTP.webp | 冲浪先锋 | golden amber | riding a big wave on a wooden plank surfboard during a storm, grinning |
| ESFP.webp | 篝火主持人 | golden amber | dancing with a drum at a festival full of paper lanterns, confetti, villagers cheering |

颜色对应四种气质：NT 紫 #8b7bff、NF 绿 #3ecf8e、SJ 蓝 #4a90ff、SP 金 #f5a623。

### IMG-20 NPC 头像（20 张）
Prompt 前缀：`bust portrait, head and shoulders, facing slightly left, plain soft gradient background in {背景色}, ` + 角色设定 + 表情 + 统一风格后缀。
背景色：老陈 warm orange-brown（#c9774a），小鹿 pink（#e07aa3），阿木 teal（#3f9e93），阿嬷 purple（#8b6fcf）。

| 表情 | 表情 Prompt |
|---|---|
| calm 平静 | relaxed neutral expression, slight smile |
| happy 开心 | big warm smile, eyes curved, cheeks blushing |
| sad 难过 | eyebrows tilted up, eyes glistening, mouth turned down |
| angry 生气 | frowning, furrowed brows, tight lips, slight flush |
| surprised 惊讶 | eyes wide, eyebrows raised, mouth open in an O |

示例 `lu_happy.webp`：`bust portrait, head and shoulders, facing slightly left, plain soft gradient background in pink, a 20-year-old girl cook assistant, brown ponytail with a pink hair tie, pink shirt, bright eyes, big warm smile, eyes curved, cheeks blushing,` + 统一风格后缀

### IMG-30 气质灯光底图（4 张）
Prompt 前缀：`vertical 9:16, night seascape, a lighthouse on a cliff in the left third, its lamp blazing with {颜色} light, a wide beam sweeping across the sky and sea, sparkling reflections, stars, lower half darker for text overlay,` + 统一风格后缀。

| 文件 | 灯光颜色 | 含义 |
|---|---|---|
| NT.webp | violet purple | 理性者之光 |
| NF.webp | emerald green | 理想者之光 |
| SJ.webp | sapphire blue | 守护者之光 |
| SP.webp | golden amber | 探索者之光 |

### IMG-40 贝壳图鉴（12 张）
Prompt 前缀：`single object icon, centered, isolated on transparent background, soft shadow, 3/4 view, {物品}, stylized low-poly 3D, pastel colors, no text`

| 文件 | 名称 | 物品 |
|---|---|---|
| shell_01 | 月光扇贝 | a pale silver-white scallop shell with a faint moonlight glow |
| shell_02 | 粉红宝螺 | a glossy pink cowrie shell |
| shell_03 | 虎斑凤螺 | a conch shell with brown tiger stripes |
| shell_04 | 一捧星砂 | a tiny glass vial filled with star-shaped sand grains |
| shell_05 | 鹦鹉螺 | a nautilus shell with cream and rust stripes |
| shell_06 | 珍珠母贝 | an open oyster showing iridescent mother-of-pearl and a small pearl |
| shell_07 | 紫海胆壳 | a round purple sea urchin shell with a dotted pattern |
| shell_08 | 蓝珊瑚枝 | a small branch of blue coral |
| shell_09 | 白砗磲 | a white giant clam shell with wavy edges |
| shell_10 | 夕阳榧螺 | an olive shell with an orange-to-purple sunset gradient |
| shell_11 | 五角海星 | an orange five-pointed starfish |
| shell_12 | 漂流瓶 | a corked glass bottle with a rolled paper note inside |

---

## 视频

| 编号 | 路径 | 规格 | 播放时机 |
|---|---|---|---|
| VID-01 | `video/opening.mp4` | 1920×1080，H.264，15–25 秒，可带音轨 | 序章日卡之后，替代实时渲染的「风暴沉船」过场 |
| VID-02 | `video/hidden_ending.mp4` | 1920×1080，H.264，10–15 秒，可带音轨 | 点亮灯塔后、玩家解开「守塔人之谜」时，替代实时渲染的「小船归来」过场 |

### VID-01 开场：风暴沉船
夜海里的客船 → 巨浪 → 闪电劈裂船体 → 主角抱着木板漂流 → 黎明时冲上沙滩，远处是熄灭的灯塔。主角不出现正脸。可以按分镜逐段生成再剪辑：

1. 0–4 秒：`wide shot, a small white passenger ferry sailing on a dark ocean at night, heavy storm clouds, lightning flashing on the horizon, rain streaks`
2. 4–9 秒：`medium shot, huge waves crashing over the ferry deck, the ship tilting violently, lights flickering`
3. 9–14 秒：`close-up, a lightning strike, the hull cracking in half, debris flying`
4. 14–20 秒：`a young person seen from behind clinging to a wooden plank drifting in black water, camera slowly rising, the storm fading`
5. 20–24 秒：`fade to dawn, the plank washing onto a quiet sandy beach, a distant unlit lighthouse silhouette on a cliff, fade to black`

风格后缀：`stylized low-poly 3D animation, cinematic camera, volumetric rain, dramatic blue-grey lighting with white lightning flashes, smooth motion`

### VID-02 隐藏结局：沿着光回家
灯塔亮起 → 光束尽头出现挂着小灯的旧木船，船身有螺旋刻痕 → 阿嬷在码头提灯等候 → 全景淡出。

1. 0–4 秒：`a lighthouse on a cliff at night suddenly ignites, a strong beam sweeps across the dark sea`
2. 4–9 秒：`following the beam, far on the horizon a small old wooden fishing boat appears, a tiny lantern hanging at its bow, spiral patterns carved on its side`
3. 9–13 秒：`the boat slowly approaches the island dock, an old grandmother with white hair in a bun and a mustard-yellow scarf stands on the pier holding a lantern, tears and a smile`
4. 13–15 秒：`wide shot, the lighthouse beam passing over the island, the boat and the village lanterns, fade to white`

风格后缀：`stylized low-poly 3D animation, warm and tender mood, night blue with golden lantern light, gentle camera moves`

## Optional: vertical videos (VID-01V / VID-02V)

| File | Spec | Notes |
|---|---|---|
| `video/opening_v.mp4` | 1080×1920, H.264 + AAC, yuv420p, faststart | Vertical version of the opening; used first on portrait phones |
| `video/hidden_ending_v.mp4` | Same as above | Vertical version of the hidden ending |

Without these files, portrait screens play the landscape version letterboxed (the picture is only about 1/4 of the screen tall). For the prompt, reuse the landscape version and add "vertical 9:16 composition, subject centered, keep key action within the middle 60% of the frame". While any video is playing, the game's synthesized music and ambience are muted automatically.

Recommended compression for mobile (about 1/3 the current size):

```bash
ffmpeg -i opening.mp4 -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart opening.min.mp4
```

## 9:16 竖版（2026-10-30）

两条独立 ChatCut 时间线均为 1080×1920、30 fps，保留完整源画面，上下使用同源柔焦背景；背景层静音，避免音轨叠加。已抽帧验证并完成 H.264 导出，下载落盘待确认。

- 开场 24 秒：`lighthouse-opening-vertical-d762e3e1.mp4`
- 隐藏结局 15 秒：`lighthouse-hidden-ending-vertical-fb0c910d.mp4`

保留横版和游戏当前资源不变。项目、时间线及导出 ID 见 `scripts/video-production.json`。
