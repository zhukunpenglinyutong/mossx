# 设置页面 UI 组件库迁移 + 全局主题系统改造计划

## 一、改造目标

1. **设置页面布局**：从弹窗 (modal) 改为替换主内容区域，保留顶部导航和左侧项目侧边栏
2. **组件库迁移**：设置页面使用 @coss/ui + Tailwind CSS 4 重写
3. **全局主题系统**：将现有 CSS 变量统一替换为 @coss/ui 标准命名 (oklch)

---

## 二、分阶段实施

### 阶段 1：基础设施搭建

**1.1 安装 Tailwind CSS 4 + Vite 插件**
```bash
npm install tailwindcss @tailwindcss/vite
```

**1.2 配置 vite.config.ts**
- 添加 `@tailwindcss/vite` 插件

**1.3 安装 @coss/ui 依赖**
```bash
npm install @base-ui/react class-variance-authority clsx tailwind-merge
npm install framer-motion
```

**1.4 初始化 shadcn 配置**
- 运行 `npx shadcn@latest init` 创建 `components.json`
- 配置 @coss registry
- 由于项目没有 `@` 路径别名，需要在 `tsconfig.json` 和 `vite.config.ts` 中配置 paths alias:
  - `@/components` → `src/components`
  - `@/lib` → `src/lib`
  - `@/hooks` → `src/hooks`

**1.5 创建工具函数**
- 创建 `src/lib/utils.ts`（cn 函数）

**1.6 创建全局样式文件**
- 创建 `src/styles/globals.css`，包含：
  - `@import "tailwindcss";`
  - `@theme { ... }` 变量映射
  - `@layer base { ... }` 主题颜色定义
- 在 `App.tsx` 中导入

**影响的文件**:
- `vite.config.ts` - 添加 Tailwind 插件 + path alias
- `tsconfig.json` - 添加 paths alias
- `components.json` - 新建
- `src/lib/utils.ts` - 新建
- `src/styles/globals.css` - 新建
- `src/App.tsx` - 导入 globals.css

---

### 阶段 2：全局主题变量迁移

**目标**: 将 36 个 CSS 文件中 1058 处旧变量引用迁移到 @coss/ui 标准命名。

**2.1 变量映射方案**

在 `src/styles/globals.css` 的 `@layer base` 中定义新变量，同时在旧主题文件中添加别名映射：

| 旧变量 | 新变量 (@coss/ui 标准) | 说明 |
|--------|----------------------|------|
| `--surface-messages` | `--background` | 页面背景 |
| `--surface-card` | `--card` | 卡片背景 |
| `--surface-card-strong` | 保留 + 映射到 `--card` | 强调卡片 |
| `--surface-sidebar` | `--sidebar-background` (自定义) | 侧边栏 |
| `--surface-topbar` | 自定义保留 | 顶栏 |
| `--surface-control` | `--secondary` | 控件背景 |
| `--surface-control-hover` | `--accent` | 控件悬停 |
| `--surface-hover` | `--accent` | 悬停状态 |
| `--surface-popover` | `--popover` | 弹出层 |
| `--text-primary` | `--foreground` | 主文字 |
| `--text-strong` | `--foreground` | 强调文字 |
| `--text-muted` | `--muted-foreground` | 次要文字 |
| `--text-subtle` | `--muted-foreground` | 辅助文字 |
| `--text-faint` | 自定义保留 | 极淡文字 |
| `--text-accent` | `--primary` | 强调色 |
| `--border-muted` | `--border` | 默认边框 |
| `--border-strong` | `--border` (darker) | 强调边框 |
| `--border-stronger` | 自定义保留 | 最强边框 |
| `--border-accent` | `--ring` | 焦点边框 |
| `--status-success` | `--success` | 成功状态 |
| `--status-warning` | `--warning` | 警告状态 |
| `--status-error` | `--destructive` | 错误状态 |

**2.2 迁移策略 - 渐进式桥接**

由于涉及 36 个文件 1058 处引用，采用**桥接兼容**策略：
1. 在 `globals.css` 中定义 @coss/ui 标准变量（oklch 值）
2. 在现有主题文件（themes.dark.css / themes.light.css）中添加旧变量 → 新变量的映射别名
3. 新代码（设置页面）使用 Tailwind CSS 类（如 `bg-background`、`text-foreground`）
4. 旧代码继续使用 `var(--text-strong)` 等旧变量，通过别名指向新值
5. 后续逐步迁移其他页面

**影响的文件**:
- `src/styles/themes.dark.css` - 添加旧变量别名映射
- `src/styles/themes.light.css` - 添加旧变量别名映射
- `src/styles/themes.dim.css` - 添加旧变量别名映射（如果存在）
- `src/styles/globals.css` - 定义 @coss/ui 标准变量

---

### 阶段 3：安装 @coss/ui 组件

```bash
npx shadcn@latest add @coss/button
npx shadcn@latest add @coss/input
npx shadcn@latest add @coss/select
npx shadcn@latest add @coss/checkbox
npx shadcn@latest add @coss/switch
npx shadcn@latest add @coss/card
npx shadcn@latest add @coss/separator
npx shadcn@latest add @coss/scroll-area
npx shadcn@latest add @coss/accordion
npx shadcn@latest add @coss/alert-dialog
npx shadcn@latest add @coss/tooltip
npx shadcn@latest add @coss/badge
npx shadcn@latest add @coss/tabs
npx shadcn@latest add @coss/kbd
npx shadcn@latest add @coss/progress
npx shadcn@latest add @coss/radio-group
npx shadcn@latest add @coss/textarea
npx shadcn@latest add @coss/label
npx shadcn@latest add @coss/field
```

组件自动安装到 `src/components/ui/` 目录。

---

### 阶段 4：设置页面布局改造（弹窗 → 内嵌内容区域）

**4.1 修改状态管理**

修改 `src/features/app/hooks/useSettingsModalState.ts`，保持接口不变但语义变为"显示设置页面"。

**4.2 修改 DesktopLayout**

在 `src/features/layout/components/DesktopLayout.tsx` 中：
- 添加 `settingsOpen` 和 `settingsNode` 两个新 props
- 当 `settingsOpen === true` 时，在 `<section className="main">` 内部渲染 settingsNode 替代 showHome/showWorkspace 的内容

```tsx
// DesktopLayout 新增条件渲染
{settingsOpen && settingsNode}
{!settingsOpen && (
  <>
    {showHome && homeNode}
    {showWorkspace && ( ... )}
  </>
)}
```

**4.3 修改 AppLayout**

在 `src/features/app/components/AppLayout.tsx` 中：
- 添加 `settingsOpen` 和 `settingsNode` props
- 传递到 DesktopLayout / TabletLayout / PhoneLayout

**4.4 修改 App.tsx**

在 `src/App.tsx` 中：
- 将设置相关的 props 从 `AppModals` 移到 `AppLayout`
- 创建 settingsNode，用 Suspense 包裹 lazy-loaded SettingsView
- 将 `settingsOpen` 和 `settingsNode` 传递给 AppLayout

**4.5 修改 AppModals**

在 `src/features/app/components/AppModals.tsx` 中：
- 移除 settings 相关的 props 和渲染逻辑

**影响的文件**:
- `src/features/layout/components/DesktopLayout.tsx`
- `src/features/layout/components/TabletLayout.tsx`（类似改法）
- `src/features/layout/components/PhoneLayout.tsx`（类似改法）
- `src/features/app/components/AppLayout.tsx`
- `src/features/app/components/AppModals.tsx`
- `src/App.tsx`

---

### 阶段 5：重写 SettingsView 组件

**5.1 移除弹窗外壳**

删除 SettingsView 中的：
- `settings-overlay` div
- `settings-backdrop` div
- `settings-window` div
- `settings-titlebar` div（标题和关闭按钮移到顶部区域）

改为直接渲染侧边栏 + 内容区域的网格布局。

**5.2 新布局结构**

```tsx
<div className="flex h-full">
  {/* 左侧设置导航 */}
  <aside className="w-[200px] border-r border-border bg-muted/30 p-4 flex flex-col gap-1.5 overflow-y-auto">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[15px] font-semibold text-foreground">{t("settings.title")}</h2>
      <Button variant="ghost" size="icon" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
    {/* 导航项 */}
    <button className={cn("flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold", ...)}>
      ...
    </button>
  </aside>

  {/* 右侧内容区域 */}
  <ScrollArea className="flex-1">
    <div className="p-6 max-w-2xl">
      {/* 各 section 的内容 */}
    </div>
  </ScrollArea>
</div>
```

**5.3 各 Section 组件替换映射**

#### Vendors 厂商配置
- 保持 `VendorSettingsPanel` 子组件不变（内部有大量独立逻辑）
- 外包装用 Card 组件

#### Projects 项目管理
- `<input>` → `<Input />` (@coss/ui)
- `<button>` → `<Button />` (@coss/ui)
- 分组列表用 `<Card>` 包裹
- 删除确认使用 `<AlertDialog />` (@coss/ui)

#### Display 显示设置
- 语言选择：`<select>` → `<Select />` (@coss/ui)
- 缩放输入：`<input type="range">` → 保留或用 Slider
- 字体输入：`<input>` → `<Input />` (@coss/ui)
- 字体大小：`<input type="number">` → `<Input type="number" />` 或 NumberField
- 开关切换：`.settings-toggle` → `<Switch />` (@coss/ui)
- 透明度控制：`.settings-toggle` → `<Switch />` (@coss/ui)

#### Composer 编辑器设置
- 预设选择：`<select>` → `<RadioGroup />` (@coss/ui) 单选卡片
- 所有 toggle → `<Switch />` (@coss/ui)
- 分隔线 → `<Separator />` (@coss/ui)

#### Dictation 语音听写
- 模型选择列表 → `<RadioGroup />` (@coss/ui)
- 下载进度条 → `<Progress />` (@coss/ui)
- 操作按钮 → `<Button />` (@coss/ui)

#### Shortcuts 快捷键
- 快捷键输入框 → `<Input />` + `<Kbd />` (@coss/ui)
- 分区标题 → 使用 `<Separator />` (@coss/ui)

#### Open Apps 打开应用
- 应用列表 → `<Card>` 包裹的列表
- 应用编辑 → `<Input />` + `<Select />` (@coss/ui)
- 默认标记 → `<Badge />` (@coss/ui)

#### Git 设置
- FileEditorCard 保持不变（独立组件）
- 外包装用 Card

#### Codex / Experimental
- feature-flagged，暂不改动

#### About 关于
- 用 Card + 居中布局重写

**影响的文件**:
- `src/features/settings/components/SettingsView.tsx` - 全面重写
- `src/features/settings/components/LanguageSelector.tsx` - 改用 Select
- `src/styles/settings.css` - 大幅删减，设置页面样式全部改用 Tailwind

---

### 阶段 6：样式清理

**6.1 删除 settings.css 中的旧样式**
- 设置页面布局相关（overlay, backdrop, window, titlebar, sidebar, nav 等）
- 设置页面控件相关（toggle, input, select, button 等）
- 保留 vendor 相关样式（VendorSettingsPanel 暂不改）
- 保留 history 相关样式（HistoryCompletionSettings 暂不改）

**6.2 验证全局样式无冲突**
- Tailwind CSS 的 preflight 与现有 base.css 不冲突
- 确保 @coss/ui 组件样式与现有组件互不干扰

---

## 三、文件变更清单

### 新建文件
| 文件 | 用途 |
|------|------|
| `components.json` | shadcn/@coss 配置 |
| `src/lib/utils.ts` | cn() 工具函数 |
| `src/styles/globals.css` | Tailwind + @coss/ui 主题变量 |
| `src/components/ui/*.tsx` | @coss/ui 组件（约 20 个） |

### 修改文件
| 文件 | 改动说明 |
|------|---------|
| `vite.config.ts` | 添加 @tailwindcss/vite 插件 + path alias |
| `tsconfig.json` | 添加 paths alias |
| `package.json` | 新增依赖 |
| `src/App.tsx` | 导入 globals.css，设置渲染从 AppModals 移到 AppLayout |
| `src/styles/themes.dark.css` | 添加旧→新变量桥接映射 |
| `src/styles/themes.light.css` | 添加旧→新变量桥接映射 |
| `src/features/layout/components/DesktopLayout.tsx` | 添加 settingsOpen 条件渲染 |
| `src/features/layout/components/TabletLayout.tsx` | 添加 settingsOpen 条件渲染 |
| `src/features/layout/components/PhoneLayout.tsx` | 添加 settingsOpen 条件渲染 |
| `src/features/app/components/AppLayout.tsx` | 添加 settingsOpen + settingsNode props |
| `src/features/app/components/AppModals.tsx` | 移除 settings 相关逻辑 |
| `src/features/settings/components/SettingsView.tsx` | 全面重写使用 @coss/ui |
| `src/features/settings/components/LanguageSelector.tsx` | 改用 @coss/ui Select |
| `src/styles/settings.css` | 大幅删减旧样式 |

### 不变文件（暂不改动）
- `src/features/vendors/components/VendorSettingsPanel.tsx` - 内部复杂度高，独立迭代
- `src/features/shared/components/FileEditorCard.tsx` - 通用组件，后续统一迁移
- `src/features/settings/components/HistoryCompletionSettings.tsx` - 后续迁移
- `src/features/models/components/ModelMappingSettings.tsx` - 后续迁移

---

## 四、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Tailwind preflight 重置全局样式 | 影响现有元素默认样式 | 使用 `@layer base` 隔离，必要时禁用部分 preflight |
| 新旧 CSS 变量冲突 | 颜色不一致 | 桥接映射确保旧变量指向正确值 |
| @coss/ui 组件依赖路径别名 | 编译报错 | 先配好 tsconfig paths + vite alias |
| SettingsView 代码量大（1000+ 行） | 重写复杂 | 保持业务逻辑不变，只替换视图层 |
| VendorSettingsPanel 等子组件样式 | 新旧混用不协调 | 子组件暂不改，保持独立 CSS |

---

## 五、实施顺序

1. 阶段 1 - 基础设施搭建（Tailwind + alias + shadcn init + utils）
2. 阶段 2 - 全局主题变量桥接映射
3. 阶段 3 - 安装 @coss/ui 组件
4. 阶段 4 - 设置页面布局改造（弹窗 → 内嵌）
5. 阶段 5 - 重写 SettingsView 使用 @coss/ui
6. 阶段 6 - 样式清理和验证
