# EnsoAI UI 框架分析报告

> 本报告详细分析了 EnsoAI 项目所使用的 UI 技术栈，帮助你在其他项目中复用同样的方案。

---

## 一、技术栈全景

| 层级 | 技术 | 版本 | 作用 |
|------|------|------|------|
| **框架** | React | 19 | 界面渲染引擎 |
| **样式系统** | Tailwind CSS | 4 | 原子化 CSS，控制颜色、间距、布局等 |
| **组件库** | @coss/ui | - | 预制 UI 组件（按钮、弹窗、菜单等） |
| **底层组件** | @base-ui/react | 1.0+ | React 官方无样式组件库，提供交互逻辑 |
| **动画** | Framer Motion | 12 | 弹性动画、布局动画、手势交互 |
| **图标** | Lucide React | 0.562+ | 轻量 SVG 图标库 |
| **工具函数** | class-variance-authority (cva) | 0.7 | 管理组件的不同变体样式 |
| **工具函数** | clsx + tailwind-merge | - | 合并和去重 CSS 类名 |
| **状态管理** | Zustand | 5 | 轻量全局状态管理 |
| **颜色系统** | CSS 变量 (oklch) | - | 支持亮色/暗色主题切换 |

---

## 二、核心概念通俗解释

### 2.1 什么是 Tailwind CSS？

传统写 CSS 需要定义类名再写样式，Tailwind 直接在 HTML 上用"短标签"写样式：

```
传统方式：先定义 .my-button { background: blue; padding: 8px 16px; border-radius: 8px; }
Tailwind：直接写 class="bg-blue-500 px-4 py-2 rounded-lg"
```

**好处**：不用起名字、不用切换文件、样式跟着组件走，开发速度快。

### 2.2 什么是 @coss/ui？

一个**预制组件库**，已经帮你做好了按钮、弹窗、下拉菜单、表格等 55+ 种常用界面元素。你不需要从零开始写这些组件。

**使用方式**：通过命令把组件代码复制到你的项目里，然后可以自由修改。

```bash
# 例如添加一个按钮组件
npx shadcn@latest add @coss/button

# 添加一个弹窗组件
npx shadcn@latest add @coss/dialog
```

### 2.3 @coss/ui 和 shadcn/ui 是什么关系？

| 特征 | shadcn/ui | @coss/ui |
|------|-----------|----------|
| **使用方式** | 复制源码到项目里 | 同样复制源码到项目里 |
| **工具命令** | `npx shadcn` | 同一个 `npx shadcn` |
| **底层引擎** | Radix UI（社区维护） | Base UI（React 官方团队维护） |
| **样式系统** | Tailwind CSS | 同样用 Tailwind CSS |
| **社区规模** | 非常大，教程多 | 较新，社区较小 |
| **兼容性** | 互相兼容，可以混用 | 互相兼容，可以混用 |

**简单说**：@coss/ui 是 shadcn/ui 的"升级版"——用法完全一样，但换了更官方的底层组件。

### 2.4 什么是 Framer Motion？

让界面元素"动起来"的动画库。比如：
- 弹窗弹出时的缩放效果
- 列表展开时的滑动效果
- 按钮点击时的按压反馈
- Tab 切换时指示器的平滑滑动

### 2.5 什么是 Lucide React？

一套免费的图标库，提供 1000+ 种简洁线条风格的小图标（文件夹、关闭按钮、设置齿轮等）。

---

## 三、在新项目中使用（完整步骤）

### 3.1 前置要求

- **Node.js** >= 20
- **包管理器**：推荐 pnpm（也可以用 npm 或 yarn）
- **已有 React 项目**（Next.js / Vite / Remix 均可）

### 3.2 第一步：安装 Tailwind CSS 4

```bash
# 安装 Tailwind CSS 4
pnpm add tailwindcss @tailwindcss/vite

# 如果是 Next.js 项目
pnpm add tailwindcss @tailwindcss/postcss
```

在你的全局 CSS 文件（如 `globals.css`）顶部添加：

```css
@import "tailwindcss";
```

### 3.3 第二步：初始化 shadcn 并配置 @coss/ui

```bash
# 初始化 shadcn（会创建 components.json 配置文件）
npx shadcn@latest init
```

初始化时的推荐选项：
- Style: **New York**（EnsoAI 使用的风格）
- Base Color: **Zinc**（灰色系，高级感强）
- CSS Variables: **Yes**

然后编辑项目根目录的 `components.json`，添加 @coss/ui 的 registry：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {
    "@coss": "https://coss.com/ui/r/{name}.json"
  }
}
```

### 3.4 第三步：安装辅助依赖

```bash
# 组件底层引擎
pnpm add @base-ui/react

# 样式工具
pnpm add class-variance-authority clsx tailwind-merge

# 动画库
pnpm add framer-motion

# 图标库
pnpm add lucide-react
```

### 3.5 第四步：创建工具函数

创建文件 `src/lib/utils.ts`：

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

这个 `cn()` 函数用于合并 CSS 类名，是所有组件都会用到的工具。

### 3.6 第五步：按需添加组件

```bash
# 添加常用组件
npx shadcn@latest add @coss/button
npx shadcn@latest add @coss/dialog
npx shadcn@latest add @coss/menu
npx shadcn@latest add @coss/select
npx shadcn@latest add @coss/tabs
npx shadcn@latest add @coss/toast
npx shadcn@latest add @coss/tooltip
npx shadcn@latest add @coss/input
npx shadcn@latest add @coss/checkbox
npx shadcn@latest add @coss/switch
npx shadcn@latest add @coss/card
npx shadcn@latest add @coss/badge
npx shadcn@latest add @coss/avatar
npx shadcn@latest add @coss/separator
npx shadcn@latest add @coss/scroll-area
npx shadcn@latest add @coss/skeleton
npx shadcn@latest add @coss/accordion
npx shadcn@latest add @coss/alert-dialog
npx shadcn@latest add @coss/popover
npx shadcn@latest add @coss/sheet
npx shadcn@latest add @coss/sidebar
npx shadcn@latest add @coss/table
npx shadcn@latest add @coss/form
npx shadcn@latest add @coss/textarea
```

组件会自动下载到 `src/components/ui/` 目录。

---

## 四、颜色系统（主题配置）

EnsoAI 使用 CSS 变量实现主题切换，以下是完整的颜色变量表：

### 4.1 语义化颜色变量

| 变量名 | 用途 | 使用方式 |
|--------|------|----------|
| `background` | 页面/区域背景色 | `bg-background` |
| `foreground` | 主要文字颜色 | `text-foreground` |
| `primary` | 品牌色/强调色 | `bg-primary` `text-primary` |
| `primary-foreground` | 品牌色上的文字 | `text-primary-foreground` |
| `secondary` | 次要按钮背景 | `bg-secondary` |
| `secondary-foreground` | 次要按钮文字 | `text-secondary-foreground` |
| `muted` | 次要区域背景 | `bg-muted` |
| `muted-foreground` | 次要文字/占位符 | `text-muted-foreground` |
| `accent` | 悬停/交互高亮 | `bg-accent` |
| `accent-foreground` | 交互高亮文字 | `text-accent-foreground` |
| `destructive` | 危险操作（删除） | `bg-destructive` |
| `border` | 边框颜色 | `border-border` |
| `input` | 输入框边框 | `border-input` |
| `ring` | 焦点环颜色 | `ring-ring` |
| `success` | 成功状态 | `text-success` |
| `warning` | 警告状态 | `text-warning` |
| `info` | 信息提示 | `text-info` |

### 4.2 全局 CSS 模板

将以下内容添加到你的 `globals.css`：

```css
@import "tailwindcss";

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  --font-sans: var(--font-family-sans, "Inter", system-ui, sans-serif);
  --font-mono: var(--font-family-mono, "JetBrains Mono", "Menlo", monospace);
}

@layer base {
  /* 亮色主题 */
  :root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0.014 285.82);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0.014 285.82);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0.014 285.82);
    --primary: oklch(0.205 0.014 285.82);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.965 0.003 285.82);
    --secondary-foreground: oklch(0.205 0.014 285.82);
    --muted: oklch(0.965 0.003 285.82);
    --muted-foreground: oklch(0.556 0.014 285.82);
    --accent: oklch(0.965 0.003 285.82);
    --accent-foreground: oklch(0.205 0.014 285.82);
    --destructive: oklch(0.577 0.245 27.33);
    --destructive-foreground: oklch(0.985 0 0);
    --success: oklch(0.527 0.154 150.07);
    --success-foreground: oklch(0.985 0 0);
    --warning: oklch(0.769 0.189 70.08);
    --warning-foreground: oklch(0.205 0.014 285.82);
    --info: oklch(0.623 0.214 259.81);
    --info-foreground: oklch(0.985 0 0);
    --border: oklch(0.922 0.003 285.82);
    --input: oklch(0.922 0.003 285.82);
    --ring: oklch(0.708 0.014 285.82);
    --radius: 0.5rem;
  }

  /* 暗色主题 */
  .dark {
    --background: oklch(0.145 0.014 285.82);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.145 0.014 285.82);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.145 0.014 285.82);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.985 0 0);
    --primary-foreground: oklch(0.205 0.014 285.82);
    --secondary: oklch(0.269 0.014 285.82);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0.014 285.82);
    --muted-foreground: oklch(0.708 0.014 285.82);
    --accent: oklch(0.269 0.014 285.82);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.396 0.141 25.72);
    --destructive-foreground: oklch(0.985 0 0);
    --success: oklch(0.527 0.154 150.07);
    --success-foreground: oklch(0.985 0 0);
    --warning: oklch(0.769 0.189 70.08);
    --warning-foreground: oklch(0.205 0.014 285.82);
    --info: oklch(0.623 0.214 259.81);
    --info-foreground: oklch(0.985 0 0);
    --border: oklch(0.269 0.014 285.82);
    --input: oklch(0.269 0.014 285.82);
    --ring: oklch(0.439 0.014 285.82);
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

---

## 五、EnsoAI 已使用的完整组件清单（55 个）

以下是 EnsoAI 项目中已安装的全部 UI 组件：

| 组件 | 文件名 | 用途 |
|------|--------|------|
| Accordion | accordion.tsx | 手风琴/折叠面板 |
| Activity Indicator | activity-indicator.tsx | 活动指示器 |
| Alert | alert.tsx | 提示信息 |
| Alert Dialog | alert-dialog.tsx | 确认弹窗（删除确认等） |
| Autocomplete | autocomplete.tsx | 自动完成输入 |
| Avatar | avatar.tsx | 用户头像 |
| Badge | badge.tsx | 标签/徽章 |
| Breadcrumb | breadcrumb.tsx | 面包屑导航 |
| Button | button.tsx | 按钮（多种变体） |
| Card | card.tsx | 卡片容器 |
| Checkbox | checkbox.tsx | 复选框 |
| Checkbox Group | checkbox-group.tsx | 复选框组 |
| Code Block | code-block.tsx | 代码展示块 |
| Collapsible | collapsible.tsx | 折叠/展开区域 |
| Combobox | combobox.tsx | 下拉搜索选择 |
| Command | command.tsx | 命令面板 |
| Dialog | dialog.tsx | 弹窗/对话框 |
| Empty | empty.tsx | 空状态占位 |
| Field | field.tsx | 表单字段 |
| Fieldset | fieldset.tsx | 表单字段集 |
| Form | form.tsx | 表单 |
| Frame | frame.tsx | 框架容器 |
| Glow Card | glow-card.tsx | 发光效果卡片 |
| Glow Wrappers | glow-wrappers.tsx | 发光效果包装器 |
| Group | group.tsx | 分组容器 |
| Input | input.tsx | 文本输入框 |
| Input Group | input-group.tsx | 输入框组合 |
| KBD | kbd.tsx | 键盘快捷键展示 |
| Label | label.tsx | 标签文字 |
| Menu | menu.tsx | 菜单/右键菜单 |
| Mermaid Renderer | mermaid-renderer.tsx | Mermaid 图表渲染 |
| Meter | meter.tsx | 度量指示器 |
| Number Field | number-field.tsx | 数字输入框 |
| Pagination | pagination.tsx | 分页 |
| Popover | popover.tsx | 气泡弹出框 |
| Preview Card | preview-card.tsx | 预览卡片 |
| Progress | progress.tsx | 进度条 |
| Radio Group | radio-group.tsx | 单选按钮组 |
| Scroll Area | scroll-area.tsx | 自定义滚动区域 |
| Select | select.tsx | 下拉选择器 |
| Separator | separator.tsx | 分隔线 |
| Sheet | sheet.tsx | 侧边抽屉 |
| Sidebar | sidebar.tsx | 侧边栏 |
| Skeleton | skeleton.tsx | 加载骨架屏 |
| Slider | slider.tsx | 滑动条 |
| Spinner | spinner.tsx | 加载旋转器 |
| Switch | switch.tsx | 开关切换 |
| Table | table.tsx | 表格 |
| Tabs | tabs.tsx | 选项卡 |
| Textarea | textarea.tsx | 多行文本输入 |
| Toast | toast.tsx | 消息通知 |
| Toggle | toggle.tsx | 切换按钮 |
| Toggle Group | toggle-group.tsx | 切换按钮组 |
| Toolbar | toolbar.tsx | 工具栏 |
| Tooltip | tooltip.tsx | 悬浮提示 |

---

## 六、尺寸与间距规范

### 6.1 高度标准

| 元素类型 | 高度 | Tailwind 类 |
|----------|------|-------------|
| 大按钮 | 44px | `h-11` |
| 标准按钮/输入框 | 36px | `h-9` |
| 小按钮 | 32px | `h-8` |
| Tab 标签 | 36px | `h-9` |
| 树节点/列表项 | 28px | `h-7` |
| 迷你按钮/图标按钮 | 24px | `h-6` |

### 6.2 间距标准

| 用途 | 大小 | Tailwind 类 |
|------|------|-------------|
| 紧凑间距 | 4px | `gap-1` |
| 标准间距 | 8px | `gap-2` |
| 宽松间距 | 12px | `gap-3` |
| 区块间距 | 16px | `gap-4` |
| 内边距（紧凑） | 8px | `p-2` |
| 内边距（标准） | 16px | `p-4` |
| 内边距（宽松） | 24px | `p-6` |

### 6.3 圆角标准

| 元素 | 大小 | Tailwind 类 |
|------|------|-------------|
| 按钮 | 8px | `rounded-lg` |
| 卡片/弹窗 | 16px | `rounded-2xl` |
| 小型元素 | 4px | `rounded` 或 `rounded-sm` |
| 输入框 | 6px | `rounded-md` |

---

## 七、字体配置

| 用途 | 字体 | 大小 |
|------|------|------|
| UI 界面文字 | Inter, system-ui, sans-serif | 14px (`text-sm`) |
| 辅助信息 | 同上 | 12px (`text-xs`) |
| 代码/编辑器 | JetBrains Mono, Menlo, monospace | 按需配置 |

---

## 八、图标使用指南

### 8.1 安装

```bash
pnpm add lucide-react
```

### 8.2 基本用法

```tsx
import { Settings, Search, Plus, X, Check, ChevronRight } from 'lucide-react'

// 标准图标大小
<Settings className="h-4 w-4" />

// 小图标
<X className="h-3.5 w-3.5" />

// 带颜色
<FolderOpen className="h-4 w-4 text-yellow-500" />
```

### 8.3 图标颜色规范

| 类型 | 颜色类 |
|------|--------|
| 文件夹 | `text-yellow-500` |
| TypeScript | `text-blue-500` |
| JavaScript | `text-yellow-400` |
| JSON | `text-yellow-600` |
| Markdown | `text-gray-400` |
| 图片 | `text-purple-500` |
| 默认/次要 | `text-muted-foreground` |

---

## 九、动画系统

### 9.1 安装

```bash
pnpm add framer-motion
```

### 9.2 Spring 动画参数

| 名称 | 参数 | 适用场景 |
|------|------|----------|
| 快速弹出 | stiffness: 500, damping: 30 | 弹窗、菜单 |
| 标准过渡 | stiffness: 400, damping: 30 | 面板伸缩 |
| 柔和过渡 | stiffness: 300, damping: 25 | 提示、微交互 |

### 9.3 常用动画示例

```tsx
import { motion, AnimatePresence } from 'framer-motion'

// 淡入淡出
<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      内容
    </motion.div>
  )}
</AnimatePresence>

// 缩放弹出（弹窗）
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ type: "spring", stiffness: 500, damping: 30 }}
>
  弹窗内容
</motion.div>

// 按钮点击反馈
<motion.button whileTap={{ scale: 0.97 }}>
  点击我
</motion.button>
```

---

## 十、完整依赖安装命令

一键安装所有 UI 相关依赖：

```bash
pnpm add \
  @base-ui/react \
  class-variance-authority \
  clsx \
  tailwind-merge \
  framer-motion \
  lucide-react \
  tailwindcss \
  @tailwindcss/vite
```

---

## 十一、项目目录结构参考

```
src/
├── components/
│   └── ui/              # @coss/ui 组件存放目录（自动生成）
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── menu.tsx
│       ├── input.tsx
│       └── ...
├── lib/
│   └── utils.ts         # cn() 工具函数
├── hooks/               # 自定义 React Hooks
├── styles/
│   └── globals.css      # 全局样式 + 主题变量
└── ...
components.json          # shadcn / @coss/ui 配置文件（项目根目录）
```

---

## 十二、快速上手检查清单

- [ ] Node.js >= 20 已安装
- [ ] 已有 React 项目（Next.js / Vite）
- [ ] Tailwind CSS 4 已安装并配置
- [ ] 运行 `npx shadcn@latest init` 初始化
- [ ] `components.json` 已添加 @coss registry
- [ ] 辅助依赖已安装（cva、clsx、tailwind-merge）
- [ ] `src/lib/utils.ts` 已创建（cn 函数）
- [ ] `globals.css` 已配置主题变量
- [ ] 按需添加了所需的 UI 组件
- [ ] Lucide React 图标库已安装
- [ ] Framer Motion 动画库已安装（可选）

---

## 十三、相关链接

| 资源 | 地址 |
|------|------|
| @coss/ui 官网 | https://coss.com/ui |
| shadcn/ui 官网 | https://ui.shadcn.com |
| Tailwind CSS 文档 | https://tailwindcss.com |
| Base UI 文档 | https://base-ui.com |
| Lucide 图标检索 | https://lucide.dev/icons |
| Framer Motion 文档 | https://motion.dev |
| Zustand 状态管理 | https://zustand.docs.pmnd.rs |
