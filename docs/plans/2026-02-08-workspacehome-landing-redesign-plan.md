# WorkspaceHome Landing 重设计实施计划（2026-02-08）

## 1. 背景与问题

当前 `WorkspaceHome` 首屏以输入框为中心，用户在未明确上下文时就被要求直接输入 prompt，导致：

- 首屏信息密度和导航意图不匹配（用户先要看项目状态，而不是立即输入）。
- “进入会话”的主路径不够清晰。
- 新手对“下一步该做什么”缺少引导。

## 2. 目标

将 `WorkspaceHome` 调整为 **Workspace Landing**（状态总览 + 引导入口），核心目标：

1. 首屏优先展示项目关键上下文（项目名、路径、分支、工作区类型）。
2. 提供双主按钮：`新建会话` 与 `继续最近会话`。
3. 提供多条“引导开始”卡片，一键创建会话并自动注入起始提示词。
4. 展示最近会话列表，支持一键跳转。

## 3. 范围

### In Scope

- `WorkspaceHome` 组件 UI 与交互重构。
- `App.tsx` 中 `WorkspaceHome` 的回调接线调整。
- `workspace-home.css` 样式重写。
- 中英文 i18n 文案新增与清理。

### Out of Scope

- 会话底层存储与协议结构变更。
- 线程列表数据源重构。
- Kanban 模式逻辑变更。

## 4. 实施步骤

1. **页面结构重构**
   - 移除 WorkspaceHome 输入区、run/model 控件。
   - 新增 Hero（项目概览）、Primary Actions（双主按钮）、Guided Starts、Recent Conversations。

2. **会话跳转接线**
   - `新建会话`：调用现有 `startThreadForWorkspace` + `setActiveThreadId`。
   - `继续最近会话`：跳转到最近 thread。
   - `引导开始`：先创建会话，再发送模板首条消息。

3. **样式与响应式**
   - 重写 `workspace-home.css`，统一使用现有主题变量。
   - 适配窄屏（主按钮和内容区纵向堆叠）。

4. **文案与可维护性**
   - 新增中英文文案 key（项目规范、代码库扫描、实施计划等引导项）。
   - 移除本次改造后无用的状态和文案（如重复结构与无意义加载态）。

## 5. 验收标准

1. 在 `activeWorkspace && !activeThreadId` 场景下，主区显示 Landing 结构，不显示输入框。
2. 双主按钮可用：
   - `新建会话` 成功后进入消息页。
   - `继续最近会话` 在有最近会话时可跳转，无会话时禁用。
3. 引导卡点击后可进入会话并注入引导 prompt。
4. 最近会话列表可点击并跳转，状态显示正常。
5. 类型检查通过。

## 6. 验证步骤

执行：

```bash
npm run typecheck
npx eslint src/App.tsx src/features/workspaces/components/WorkspaceHome.tsx src/i18n/locales/zh.ts src/i18n/locales/en.ts
```

手动验证：

1. 启动 `npm run tauri:dev`。
2. 选择一个 workspace 且不选具体会话，确认进入 Landing 页面。
3. 分别点击“新建会话”“继续最近会话”“引导开始”各项，确认跳转与消息注入。

## 7. 风险与回滚

### 风险

- 引导 prompt 注入在某些引擎/网络慢场景下会有轻微延迟。
- 首次 Tauri 编译时间较长，可能被误判为未启动。

### 回滚方案

- 直接回退以下文件到改造前版本：
  - `src/App.tsx`
  - `src/features/workspaces/components/WorkspaceHome.tsx`
  - `src/styles/workspace-home.css`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`

## 8. 关联改动文件（Refers to）

- `src/App.tsx`
- `src/features/workspaces/components/WorkspaceHome.tsx`
- `src/styles/workspace-home.css`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
