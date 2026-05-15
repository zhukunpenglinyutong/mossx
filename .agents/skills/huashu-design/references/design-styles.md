# 设计哲学风格库：20种体系

> 用于视觉设计（网页/PPT/PDF/信息图/配图/App等）的设计风格库。
> 每种风格提供：哲学内核 + 核心特征 + 提示词DNA（与场景模板组合使用）。

## 风格×场景×执行路径 速查表

| 风格 | 网页 | PPT | PDF | 信息图 | 封面 | AI生成 | 最佳路径 |
|------|:---:|:---:|:---:|:-----:|:---:|:-----:|---------|
| 01 Pentagram | ★★★ | ★★★ | ★★☆ | ★★☆ | ★★★ | ★☆☆ | HTML |
| 02 Stamen Design | ★★☆ | ★★☆ | ★★☆ | ★★★ | ★★☆ | ★★☆ | 混合 |
| 03 Information Architects | ★★★ | ★☆☆ | ★★★ | ★☆☆ | ★☆☆ | ★☆☆ | HTML |
| 04 Fathom | ★★☆ | ★★★ | ★★★ | ★★★ | ★★☆ | ★☆☆ | HTML |
| 05 Locomotive | ★★★ | ★★☆ | ★☆☆ | ★☆☆ | ★★☆ | ★★☆ | 混合 |
| 06 Active Theory | ★★★ | ★☆☆ | ★☆☆ | ★☆☆ | ★★☆ | ★★★ | AI生成 |
| 07 Field.io | ★★☆ | ★★☆ | ★☆☆ | ★★☆ | ★★★ | ★★★ | AI生成 |
| 08 Resn | ★★★ | ★☆☆ | ★☆☆ | ★☆☆ | ★★☆ | ★★☆ | AI生成 |
| 09 Experimental Jetset | ★★☆ | ★★☆ | ★★☆ | ★★☆ | ★★★ | ★★☆ | 混合 |
| 10 Müller-Brockmann | ★★☆ | ★★★ | ★★★ | ★★★ | ★★☆ | ★☆☆ | HTML |
| 11 Build | ★★★ | ★★★ | ★★☆ | ★☆☆ | ★★★ | ★☆☆ | HTML |
| 12 Sagmeister & Walsh | ★★☆ | ★★★ | ★☆☆ | ★★☆ | ★★★ | ★★★ | AI生成 |
| 13 Zach Lieberman | ★☆☆ | ★☆☆ | ★☆☆ | ★★☆ | ★★★ | ★★★ | AI生成 |
| 14 Raven Kwok | ★☆☆ | ★★☆ | ★☆☆ | ★★☆ | ★★★ | ★★★ | AI生成 |
| 15 Ash Thorp | ★★☆ | ★★☆ | ★☆☆ | ★☆☆ | ★★★ | ★★★ | AI生成 |
| 16 Territory Studio | ★★☆ | ★★☆ | ★☆☆ | ★★☆ | ★★★ | ★★★ | AI生成 |
| 17 Takram | ★★★ | ★★★ | ★★★ | ★★☆ | ★★☆ | ★☆☆ | HTML |
| 18 Kenya Hara | ★★☆ | ★★★ | ★★★ | ★☆☆ | ★★★ | ★☆☆ | HTML |
| 19 Irma Boom | ★☆☆ | ★★☆ | ★★★ | ★★☆ | ★★★ | ★★☆ | 混合 |
| 20 Neo Shen | ★★☆ | ★★☆ | ★★☆ | ★★☆ | ★★★ | ★★★ | AI生成 |

> 场景适配：★★★ = 强烈推荐 / ★★☆ = 适合 / ★☆☆ = 需改造
> AI生成：★★★ = 直出效果好 / ★★☆ = 需调整 / ★☆☆ = 建议HTML执行
> 最佳路径：AI生成（图片直出）/ HTML（代码渲染，数据精确）/ 混合（HTML布局+AI配图）

**核心规律**：有明确视觉元素的风格（插画/粒子/生成艺术）AI直出效果好；依赖精确排版和数据的风格（网格/信息架构/留白）HTML渲染更可控。

---

## 一、信息建筑派（01-04）
> 哲学：「数据不是装饰，是建筑材料」

### 01. Pentagram - Michael Bierut风格
**哲学**：字体即语言，网格即思想
**核心特征**：
- 极度克制的颜色（黑白+1个品牌色）
- 瑞士网格系统的现代演绎
- 字体排印作为主要视觉语言
- 负空间的战略性使用（60%+留白）

**提示词DNA**：
```
Pentagram/Michael Bierut style:
- Extreme typographic hierarchy, Helvetica/Univers family
- Swiss grid with precise mathematical spacing
- Black/white + one accent color (#HEX)
- Information architecture as visual structure
- 60%+ whitespace ratio
- Data visualization as primary decoration
```

**代表作**：Hillary Clinton 2016 campaign identity
**搜索关键词**：pentagram hillary logo system

---

### 02. Stamen Design - 数据诗学
**哲学**：让数据成为可触摸的风景
**核心特征**：
- 地图学思维应用于信息设计
- 算法生成的有机图形
- 温暖的数据可视化色调（赭石、鼠尾草绿、深蓝）
- 可交互的层级系统

**提示词DNA**：
```
Stamen Design aesthetic:
- Cartographic approach to data visualization
- Organic, algorithm-generated patterns
- Warm palette (terracotta, sage green, deep blues)
- Layered information like topographic maps
- Hand-crafted feel despite digital precision
- Soft shadows and depth
```

**代表作**：COVID-19 surge map
**搜索关键词**：stamen covid map visualization

---

### 03. Information Architects - 内容优先原则
**哲学**：设计不是装饰，是内容的建筑
**核心特征**：
- 极端的内容层级清晰度
- 只使用系统字体（优化阅读）
- 蓝色超链接传统的坚守
- 性能即美学

**提示词DNA**：
```
Information Architects philosophy:
- Content-first hierarchy, zero decorative elements
- System fonts only (SF Pro/Roboto/Inter)
- Classic blue hyperlinks (#0000EE)
- Reading-optimized line length (66 characters)
- Progressive disclosure of depth
- Text-heavy, fast-loading design
```

**代表作**：iA Writer app
**搜索关键词**：information architects ia writer

---

### 04. Fathom Information Design - 科学叙事
**哲学**：每一个像素都必须承载信息
**核心特征**：
- 科学期刊的严谨+设计的优雅
- 定量数据的精确可视化
- 冷静的专业色调（灰、海军蓝）
- 注释与引用系统的设计化

**提示词DNA**：
```
Fathom Information Design style:
- Scientific journal aesthetic meets modern design
- Precise data visualization (charts, timelines, scatter plots)
- Neutral scheme (grays, navy, one highlight color)
- Footnote/citation design integrated into layout
- Clean sans-serif (GT America/Graphik)
- Information density without clutter
```

**代表作**：Bill & Melinda Gates Foundation年度报告
**搜索关键词**：fathom information design gates foundation

---

## 二、运动诗学派（05-08）
> 哲学：「技术本身就是一种流动的诗」

### 05. Locomotive - 滚动叙事大师
**哲学**：滚动不是浏览，是旅程
**核心特征**：
- 丝滑的视差滚动
- 电影化的分镜叙事
- 大胆的空间留白
- 动态元素的精确编排

**提示词DNA**：
```
Locomotive scroll narrative style:
- Film-like scene composition with parallax depth
- Generous vertical spacing between sections
- Bold typography emerging from darkness
- Smooth motion blur effects
- Dark mode (near-black backgrounds)
- Strategic glowing accents
- Hero sections 100vh tall
```

**代表作**：Lusion.co website
**搜索关键词**：locomotive scroll lusion

---

### 06. Active Theory - WebGL诗人
**哲学**：让技术可见化即让技术可理解
**核心特征**：
- 3D粒子系统作为核心元素
- 实时渲染的数据可视化
- 鼠标交互驱动的世界构建
- 霓虹与深空的配色

**提示词DNA**：
```
Active Theory WebGL aesthetic:
- Particle systems representing data flow
- 3D visualization in depth space
- Neon gradients (cyan/magenta/electric blue) on dark
- Mouse-reactive environment
- Depth of field and bokeh effects
- Floating UI with glassmorphism
```

**代表作**：NASA Prospect
**搜索关键词**：active theory nasa webgl

---

### 07. Field.io - 算法美学
**哲学**：代码即设计师
**核心特征**：
- 生成艺术系统
- 每次访问都不同的动态图形
- 抽象几何的智能编排
- 技术感与艺术性的平衡

**提示词DNA**：
```
Field.io generative design style:
- Abstract geometric patterns, algorithmically generated
- Dynamic composition that feels computational
- Monochromatic base with vibrant accent
- Mathematical precision in spacing
- Voronoi diagrams or Delaunay triangulation
- Clean code aesthetic
```

**代表作**：British Council digital installations
**搜索关键词**：field.io generative design

---

### 08. Resn - 叙事驱动的交互
**哲学**：每个点击都推进故事
**核心特征**：
- 游戏化的用户旅程
- 强烈的情感化设计
- 插画与代码的深度结合
- 非线性的探索体验

**提示词DNA**：
```
Resn interactive storytelling approach:
- Illustrative style mixed with UI elements
- Gamified exploration (progress indicators)
- Warm color palette despite tech subject
- Character-driven design
- Scroll-triggered animations
- Editorial illustration meets product design
```

**代表作**：Resn.co.nz portfolio
**搜索关键词**：resn interactive storytelling

---

## 三、极简主义派（09-12）
> 哲学：「删减到无法再删」

### 09. Experimental Jetset - 概念极简
**哲学**：一个想法=一个形式
**核心特征**：
- 单一视觉隐喻贯穿整个设计
- 蓝/红/黄+黑白的蒙德里安色系
- 字体即图形
- 反商业的诚实设计

**提示词DNA**：
```
Experimental Jetset conceptual minimalism:
- Single visual metaphor for entire design
- Primary colors only (red/blue/yellow) + black/white
- Typography as main graphic element
- Grid-based with deliberate rule-breaking
- No photography, only type and geometry
- Anti-commercial, honest aesthetic
```

**代表作**：Whitney Museum identity
**搜索关键词**：experimental jetset whitney responsive w

---

### 10. Müller-Brockmann传承 - 瑞士网格纯粹主义
**哲学**：客观性即美
**核心特征**：
- 数学精确的网格系统（8pt基线）
- 绝对的左对齐或居中
- 单色或双色方案
- 功能主义至上

**提示词DNA**：
```
Josef Müller-Brockmann Swiss modernism:
- Mathematical grid system (8pt baseline)
- Strict alignment (flush left or centered)
- Two-color maximum (black + one accent)
- Akzidenz-Grotesk or similar rationalist typeface
- No decorative elements
- Timeless, objective aesthetic
```

**代表作**：《Grid Systems in Graphic Design》
**搜索关键词**：muller brockmann grid systems poster

---

### 11. Build - 当代极简品牌
**哲学**：精致的简单比复杂更难
**核心特征**：
- 奢侈品级的留白（70%+）
- 微妙的字重对比（200-600）
- 单一强调色的战略使用
- 呼吸感的节奏

**提示词DNA**：
```
Build studio luxury minimalism:
- Generous whitespace (70%+ of area)
- Subtle typography weight shifts (200 to 600)
- Single accent color used sparingly
- High-end product photography aesthetic
- Soft shadows and subtle gradients
- Golden ratio proportions
```

**代表作**：Build studio portfolio
**搜索关键词**：build studio london branding

---

### 12. Sagmeister & Walsh - 快乐极简
**哲学**：美即功能的情感维度
**核心特征**：
- 意外的色彩爆发
- 手工感与数字的融合
- 正能量的视觉语言
- 实验性但可读

**提示词DNA**：
```
Sagmeister & Walsh joyful philosophy:
- Unexpected color bursts on minimal base
- Handmade elements (physical objects in digital)
- Optimistic visual language
- Experimental typography that remains legible
- Human warmth through imperfection
- Mix of analog and digital aesthetics
```

**代表作**：The Happy Show
**搜索关键词**：sagmeister walsh happy show

---

## 四、实验先锋派（13-16）
> 哲学：「打破规则即创造规则」

### 13. Zach Lieberman - 代码诗学
**哲学**：编程即绘画
**核心特征**：
- 手绘感的算法图形
- 实时生成艺术
- 黑白的纯粹表达
- 工具本身的可见性

**提示词DNA**：
```
Zach Lieberman code-as-art style:
- Hand-drawn aesthetic generated by code
- Black and white only, no color
- Real-time generative patterns
- Sketch-like line quality
- Visible process/grid/construction lines
- Poetic interpretation of algorithms
```

**代表作**：openFrameworks creative coding
**搜索关键词**：zach lieberman openframeworks generative

---

### 14. Raven Kwok - 参数化美学
**哲学**：系统的美胜过个体的美
**核心特征**：
- 分形与递归图形
- 黑白高对比
- 建筑化的信息结构
- 东方园林的算法演绎

**提示词DNA**：
```
Raven Kwok parametric aesthetic:
- Fractal patterns and recursive structures
- High-contrast black and white
- Architectural visualization of data
- Chinese garden principles in algorithm form
- Intricate detail that rewards zooming
- Processing/Creative coding aesthetic
```

**代表作**：Raven Kwok generative art exhibitions
**搜索关键词**：raven kwok processing generative art

---

### 15. Ash Thorp - 赛博诗意
**哲学**：未来不是冰冷的，是孤独的诗
**核心特征**：
- 电影级的光影
- 赛博朋克的温暖版本（橙/青，非冷蓝）
- 故事性的概念设计
- 工业美学的精致化

**提示词DNA**：
```
Ash Thorp cinematic concept art:
- Film-grade lighting and atmospheric effects
- Warm cyberpunk (orange/teal, NOT cold blue)
- Industrial design meets luxury
- Narrative concept art feel
- Volumetric lighting and god rays
- Blade Runner warmth over Tron coldness
```

**代表作**：Ghost in the Shell concept art
**搜索关键词**：ash thorp ghost shell concept art

---

### 16. Territory Studio - 屏幕界面虚构
**哲学**：未来UI的今日想象
**核心特征**：
- 科幻电影中的屏幕设计（FUI）
- 全息投影感
- 多层叠加的数据可视化
- 可信的未来感

**提示词DNA**：
```
Territory Studio FUI (Fantasy User Interface):
- Fantasy User Interface design
- Holographic projection aesthetics
- Orange/amber monochrome or cyan accents
- Multiple overlapping data layers
- Believable future technology
- Technical readouts and data streams
```

**代表作**：Blade Runner 2049 screen graphics
**搜索关键词**：territory studio blade runner interface

---

## 五、东方哲学派（17-20）
> 哲学：「留白即内容」

### 17. Takram - 日式思辨设计
**哲学**：技术是思考的媒介
**核心特征**：
- 概念原型的优雅
- 柔和的科技感（圆角、柔和阴影）
- 图表即艺术
- 谦逊的精致

**提示词DNA**：
```
Takram Japanese speculative design:
- Elegant concept prototypes and diagrams
- Soft tech aesthetic (rounded corners, gentle shadows)
- Charts and diagrams as art pieces
- Modest sophistication
- Neutral natural colors (beige, soft gray, muted green)
- Design as philosophical inquiry
```

**代表作**：NHK Fabricated City
**搜索关键词**：takram nhk data visualization

---

### 18. Kenya Hara - 空的设计
**哲学**：设计不是填充，是清空
**核心特征**：
- 极致的留白（80%+）
- 纸张质感的数字化
- 白色的层次（暖白、冷白、米白）
- 触觉的视觉化

**提示词DNA**：
```
Kenya Hara "emptiness" design:
- Extreme whitespace (80%+)
- Paper texture and tactility in digital form
- Layers of white (warm white, cool white, off-white)
- Minimal color (if any, very desaturated)
- Design by subtraction not addition
- Zen simplicity
```

**代表作**：Muji art direction, 《Designing Design》
**搜索关键词**：kenya hara designing design muji

---

### 19. Irma Boom - 书籍建筑师
**哲学**：信息的物理诗学
**核心特征**：
- 非线性的信息架构
- 边缘与边界的游戏
- 意外的颜色组合（粉+红、橙+棕）
- 手工艺的数字转译

**提示词DNA**：
```
Irma Boom book architecture style:
- Non-linear information structure
- Play with edges, margins, boundaries
- Unexpected color combos (pink+red, orange+brown)
- Handcraft translated to digital
- Dense information inviting exploration
- Editorial design, unconventional grid
```

**代表作**：SHV Think Book (2136 pages)
**搜索关键词**：irma boom shv think book

---

### 20. Neo Shen - 东方光影诗
**哲学**：技术需要人的温度
**核心特征**：
- 水墨晕染的数字化
- 柔和的光晕效果
- 诗意的留白
- 情感化的色彩（深蓝、暖灰、柔金）

**提示词DNA**：
```
Neo Shen poetic Chinese aesthetic:
- Digital interpretation of ink wash painting
- Soft glow and light diffusion effects
- Poetic negative space
- Emotional palette (deep blues, warm grays, soft gold)
- Calligraphic influences in typography
- Atmospheric depth
```

**代表作**：Neo Shen digital art series
**搜索关键词**：neo shen digital ink wash art

---

## 提示词使用说明

**组合公式**：`[风格提示词DNA] + [场景模板（见scene-templates.md）] + [具体内容]`

### 核心原则：描述情绪而非布局（Mood, Not Layout）

AI图像生成的关键：短提示词 > 长提示词。描述3句情绪和内容，比30行布局细节效果更好。

| 杀死多样性的写法 | 激发创造力的写法 |
|----------------|----------------|
| 指定颜色比例（60%/25%/15%） | 描述情绪（"warm like Sunday morning"） |
| 规定布局位置（"标题居中，图片右侧"） | 引用具体美学（"Pentagram editorial feel"） |
| 限制角色姿势和表情 | 让AI自然诠释风格 |
| 列出所有要包含的视觉元素 | 描述观众应该感受到什么 |

### Good / Bad 示例

**Bad — 过度约束（AI生成出来空且平）：**
```
Professional presentation slide. Dark background, light text.
Title centered at top. Two columns below. Left column: bullet points.
Right column: bar chart. Colors: navy 60%, white 30%, gold 10%.
Font size: title 36pt, body 18pt. Margins: 40px all sides.
```

**Good — 情绪驱动（生成多样且有质感）：**
```
A data visualization that feels like a Bloomberg Businessweek
editorial spread. The key number "28.5%" should dominate the
composition like a headline. Warm cream tones with sharp black
typography. The data tells a story of dramatic channel shift.
```

### 执行路径选择

根据速查表的「最佳路径」列选择：
- **AI生成**：有明确视觉元素的风格（06/07/12/13/14/15/16/20），用 Gemini/Midjourney 直出
- **HTML渲染**：依赖精确排版的风格（01/03/04/10/11/17/18），代码控制数据和布局
- **混合**：HTML做骨架布局 + AI生成配图/背景（02/05/08/09/19）

### 质量控制

1. ❌ 不要直接写 "in the style of Pentagram" → ✅ 用具体设计特征描述
2. 文字在AI生成中常出错 → 生成后替换文字
3. 比例易失真 → 明确指定 aspect ratio
4. 先生成3-5个变体，选择最佳后细化

**默认审美禁区**（用户可按自己品牌 override）：
- ❌ 赛博霓虹/深蓝色底（#0D1117）
- ❌ 封面图加个人署名/水印

---

**版本**：v2.1
**更新日期**：2026-02-13
**适用场景**：网页/PPT/PDF/信息图/封面/配图/App等所有视觉设计
**与 image-to-slides 联动**：PPT场景可直接引用本文件风格，通过 image-to-slides skill 执行生成
