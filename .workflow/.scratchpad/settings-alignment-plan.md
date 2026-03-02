# 设置页面对齐实施计划

## 目标
将 codemoss 设置页面与参考项目 idea-claude-code-gui 100% 功能对齐。

## 当前状态对比

### 参考项目侧边栏 (12项)
1. basic (基础设置 - 含外观/行为/环境三子标签)
2. providers (供应商管理)
3. dependencies (SDK依赖管理)
4. usage (使用情况)
5. mcp (MCP服务器)
6. permissions (权限设置)
7. commit (提交AI)
8. agents (智能体)
9. prompts (提示词库)
10. skills (技能管理)
11. other (其他设置)
12. community (社区与反馈)

### 当前项目侧边栏 (已可见项)
1. vendors (供应商管理) → 对应 providers ✅
2. projects (项目管理) → 当前项目独有，保留
3. display (显示与声音) → 部分对应 basic
4. composer (编辑器设置) → 当前项目独有，保留
5. agents (智能体) → 对应 agents ✅
6. shortcuts (快捷键) → 当前项目独有，保留
7. open-apps (打开方式) → 当前项目独有，保留
8. about (关于) → 部分对应 community

### 策略：保留当前项目独有功能，新增参考项目缺失功能

## 实施步骤

### Phase 1: 重构侧边栏导航结构
**目标**: 将当前分散的导航重构为与参考项目对齐的 12+N 项结构

**新侧边栏结构** (合并两边功能):
1. `basic` - 基础设置 (合并当前 display + 新增外观/行为/环境子标签)
2. `providers` - 供应商管理 (原 vendors)
3. `projects` - 项目管理 (保留当前)
4. `usage` - 使用情况 (新增)
5. `mcp` - MCP服务器 (新增)
6. `permissions` - 权限设置 (新增, Coming Soon)
7. `commit` - 提交AI (新增)
8. `agents` - 智能体 (保留当前)
9. `prompts` - 提示词库 (新增)
10. `skills` - 技能管理 (新增, Coming Soon)
11. `composer` - 编辑器设置 (保留当前)
12. `shortcuts` - 快捷键 (保留当前)
13. `open-apps` - 打开方式 (保留当前)
14. `other` - 其他设置 (新增 - 历史补全管理)
15. `community` - 社区与反馈 (替代 about)

**文件变更**:
- `SettingsView.tsx`: 更新侧边栏导航、CodexSection 类型定义

### Phase 2: 重构基础设置为三子标签结构
**目标**: 将当前 display 分区拆分为 AppearanceTab / BehaviorTab / EnvironmentTab

**新建文件**:
- `src/features/settings/components/BasicConfigSection/index.tsx` - 三子标签容器
- `src/features/settings/components/BasicConfigSection/AppearanceTab.tsx` - 外观标签
- `src/features/settings/components/BasicConfigSection/BehaviorTab.tsx` - 行为标签

**AppearanceTab 包含** (从 display 迁移 + 新增):
- 主题切换 (system/light/dark) - 已有
- 语言选择 - 已有
- UI 缩放 - 已有
- UI 字体 - 已有
- Code 字体 + 大小 - 已有
- 降低透明度 - 已有
- 显示剩余限额 - 已有
- 显示消息锚点 - 已有
- 聊天背景色 (新增 - 预设色板+自定义颜色选择器+Hex输入)
- 用户消息气泡色 (新增 - 同上)

**BehaviorTab 包含** (从 composer/display 迁移 + 新增):
- 发送快捷键 (从 composer 迁移)
- 流式输出开关 (新增)
- 自动打开文件开关 (新增)
- Diff 默认展开开关 (新增)
- 提示音通知 (从 display 迁移 + 增强音效选择)
- 系统通知 (从 display 迁移)

### Phase 3: 新增提示词库管理 (Prompts)
**目标**: 实现自定义 Prompt 的 CRUD + 导入/导出

**新建文件**:
- `src/features/settings/components/PromptSection/index.tsx`
- `src/features/settings/components/PromptSection/PromptDialog.tsx`
- `src/features/settings/components/PromptSection/PromptExportDialog.tsx`
- `src/features/settings/components/PromptSection/PromptImportDialog.tsx`
- `src/features/settings/hooks/usePromptManagement.ts`
- `src/types/prompt.ts` (如不存在)

**功能**:
- Prompt 列表展示(卡片式)
- 添加/编辑/删除 Prompt
- 导出/导入 Prompt
- 数据持久化 (Tauri store)

### Phase 4: 新增提交AI设置 (Commit)
**目标**: 提供 Commit AI Prompt 配置

**新建文件**:
- `src/features/settings/components/CommitSection/index.tsx`

**功能**:
- Commit AI Prompt textarea + 保存
- Code Review AI (Coming Soon 占位)
- 数据持久化

### Phase 5: 新增占位页面 (Usage / MCP / Permissions / Skills)
**目标**: 添加带"Coming Soon"的占位页面

**新建文件**:
- `src/features/settings/components/PlaceholderSection.tsx` - 通用占位组件

**各占位页面内容**:
- Usage: 标题 + 描述 + Coming Soon
- MCP: 标题 + 描述 + Coming Soon (后续单独实现)
- Permissions: 标题 + 描述 + Coming Soon
- Skills: 标题 + 描述 + Coming Soon

### Phase 6: 新增其他设置 (Other)
**目标**: 将历史补全管理从 display 迁移到独立的 Other 分区

**功能**:
- 历史记录补全开关
- 历史项管理(展开/收起列表、编辑、删除、清除)
- 模型映射设置 (从 display 迁移)

### Phase 7: 社区与反馈 (Community) 替代 About
**目标**: 增强 about 为 community，添加版本历史

**变更**:
- 保留现有微信群二维码
- 添加版本号显示
- 添加 GitHub 链接
- 添加版本历史按钮 + ChangelogDialog

### Phase 8: 国际化补全
**目标**: 补全所有新增功能的 i18n key

**变更文件**:
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`

### Phase 9: 侧边栏响应式折叠
**目标**: 添加侧边栏自动折叠功能

**功能**:
- 窗口宽度 < 900px 自动折叠
- 折叠按钮手动切换
- 折叠状态下只显示图标

## 文件影响范围

### 主要修改文件
1. `src/features/settings/components/SettingsView.tsx` - 侧边栏重构、分区调整

### 新建文件 (~12-15个)
1. `src/features/settings/components/BasicConfigSection/index.tsx`
2. `src/features/settings/components/BasicConfigSection/AppearanceTab.tsx`
3. `src/features/settings/components/BasicConfigSection/BehaviorTab.tsx`
4. `src/features/settings/components/PromptSection/index.tsx`
5. `src/features/settings/components/PromptSection/PromptDialog.tsx`
6. `src/features/settings/components/PromptSection/PromptExportDialog.tsx`
7. `src/features/settings/components/PromptSection/PromptImportDialog.tsx`
8. `src/features/settings/components/CommitSection/index.tsx`
9. `src/features/settings/components/PlaceholderSection.tsx`
10. `src/features/settings/hooks/usePromptManagement.ts`

### 修改文件
1. `src/i18n/locales/zh.json` - 新增翻译 key
2. `src/i18n/locales/en.json` - 新增翻译 key
3. `src/types/index.ts` 或 `src/types.ts` - 可能新增类型

## 实施优先级

P0 (核心结构):
- Phase 1: 侧边栏导航重构
- Phase 2: 基础设置三子标签

P1 (新功能):
- Phase 3: 提示词库
- Phase 4: 提交AI
- Phase 6: 其他设置

P2 (占位/增强):
- Phase 5: 占位页面
- Phase 7: 社区与反馈增强
- Phase 8: 国际化
- Phase 9: 响应式折叠
