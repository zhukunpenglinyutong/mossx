## Context

这次问题表面上是“右侧少显示了几个文件”，本质上是 conversation file-change 在三条 UI surface 上各自演化出了不同的事实抽取逻辑：

- 消息幕布更接近原始 `item.changes[]`
- 右侧 `workspace session activity` 先做 `summarizeFileChangeItem(...)`，丢掉了完整文件集合
- 底部 `status panel` 再用 `extractFileChangeSummaries(...)` 做另一套聚合

因此当前的不一致不是单点渲染 bug，而是事实层已经分叉。用户又追加了第二层需求：右侧文件点击不应只是“打开”，而应直接进入“打开并最大化”的高操作态，同时提供独立 diff 预览按钮。

本次设计要同时解决两类问题：

1. 语义归一：文件数、文件身份、`+/-` 统计在幕布 / 右侧 / 底部统一。
2. 交互补齐：右侧文件主点击升级为“打开并最大化”，次按钮打开 diff 弹窗。

## Goals / Non-Goals

**Goals**

- 为 conversation file-change 定义 shared canonical file-entry contract。
- 让 `workspace session activity` 与 `status panel` 复用同一套 canonical entries / aggregate。
- 保持消息幕布 `File changes` 卡片的现有视觉结构，同时统一其文件数与 `+/-` 语义。
- 让右侧 activity panel 文件主点击复用既有打开链路并驱动 editor maximize。
- 为右侧文件条目提供独立 diff icon 按钮，复用现有 diff preview / modal 能力。

**Non-Goals**

- 不修改 conversation storage schema。
- 不重构 Git diff engine、底层 path-domain routing、外部 spec 文件读取实现。
- 不把“实时自动打开 AI 正在修改的文件”作为默认行为，本期仍然是显式点击驱动。
- 不把消息幕布、右侧、底部三处做成完全相同的视觉组件。

## Current Code Anchors

### Surface Data Extraction

| 关注点 | 文件 | 现状 |
|---|---|---|
| 右侧 activity 适配 | `src/features/session-activity/adapters/buildWorkspaceSessionActivity.ts` | `summarizeFileChangeItem(...)` 以 primary file + aggregate 为主，天然压缩多文件 |
| 底部 status 提取 | `src/features/status-panel/hooks/useStatusPanelData.ts` | `extractFileChangeSummaries(...)` 走独立统计逻辑 |
| 共享事实层 | `src/features/operation-facts/operationFacts.ts` | 已有事实抽取基础，但尚未提供三个 surface 共用的 canonical file-entry contract |
| 消息幕布 file card | `src/features/messages/components/toolBlocks/GenericToolBlock.tsx` / `EditToolGroupBlock.tsx` | 更接近原始 `item.changes[]`，是当前“最完整”的 surface |

### File Open / Diff / Maximize

| 关注点 | 文件 | 现状 |
|---|---|---|
| 右侧打开 diff / 文件编排 | `src/app-shell-parts/useAppShellSections.ts` | 已有 `handleSelectDiffForPanel(...)`，但不负责最大化 |
| editor maximize 状态 | `src/app-shell-parts/useAppShellLayoutNodesSection.tsx` | 已有 `isEditorFileMaximized` / `setIsEditorFileMaximized` |
| 文件面板 maximize contract | `src/features/files/components/FileViewPanel.tsx` | maximize UI 已存在，不应新增并行状态 |

## Proposed Canonical Contract

### 1. Canonical File-Change Bundle

对 conversation 中一次 file-change fact，统一归一为：

```ts
type CanonicalFileChangeBundle = {
  sourceId: string
  summary: {
    fileCount: number
    additions: number
    deletions: number
  }
  entries: CanonicalFileChangeEntry[]
}

type CanonicalFileChangeEntry = {
  filePath: string
  fileName: string
  status: "added" | "modified" | "deleted" | "renamed" | "unknown"
  additions: number
  deletions: number
  diffAvailable: boolean
}
```

这里的重点不是字段命名，而是 contract 边界：

- `filePath` 是唯一 canonical identity
- 单文件 `+/-` 与 bundle aggregate 必须来自同一 source
- 稀疏历史 payload 的 fallback 也必须通过同一个 adapter 完成

### 2. Surface Responsibility Split

- `operation-facts` / shared selector 层：负责把原始事实归一为 canonical bundle
- `session activity`：负责时间线组织、事件展开、主点击 / diff icon affordance
- `status panel`：负责按当前 thread / turn 汇总展示 canonical bundle
- `tool card`：继续负责 conversation 幕布中的原始文件列表渲染，但 aggregate 与 file identity 不再自算另一套口径

## Decisions

### Decision 1: 用 shared canonical adapter 解分叉，而不是只补右侧 UI

- 方案 A：仅修改右侧，让它显示更多文件。
- 方案 B：抽 shared canonical adapter，activity/status/tool-card 统一消费。

采用 B。

原因：

- 用户反馈的是“三个 surface 不一致”，不是“右侧样式不好看”。
- 只修右侧会把状态面板和历史 replay 的漂移继续留着。

### Decision 2: canonical adapter 放在现有事实层附近，而不是塞进某个 UI hook

- 方案 A：放进 `buildWorkspaceSessionActivity.ts`
- 方案 B：放进 `useStatusPanelData.ts`
- 方案 C：放进 `operation-facts` 或等价 shared pure helper

采用 C。

原因：

- 这是 cross-surface fact normalization，不属于任何单个 panel。
- 纯函数边界更利于对多文件、历史 replay、稀疏 payload 做 focused tests。

### Decision 3: 消息幕布保持现有视觉结构，但 aggregate 口径对齐 shared contract

- 方案 A：把消息幕布也重写为 canonical entry list
- 方案 B：保留当前 file rows 展示方式，只统一 aggregate/file identity 语义

采用 B。

原因：

- 用户当前主要痛点不在幕布视觉，而在跨 surface 不一致。
- 这样能把回归面控制在统计与身份层，不强行牵动消息卡片 UI。

### Decision 4: 主点击“打开并最大化”属于 app-shell 编排，不属于 panel-local state

- 方案 A：panel 内部自己维护一个 maximize 布尔值
- 方案 B：panel 只发出 intent，由 app shell 复用现有 open + maximize contract

采用 B。

原因：

- maximize 是布局层能力，不应在 panel 自己复制一份状态。
- 已有 `isEditorFileMaximized` / `setIsEditorFileMaximized`，应直接复用。

主点击的期望编排：

```text
onOpenActivityFile(filePath)
  -> route by existing file-open pipeline
  -> if file opened successfully and maximize is supported
       setIsEditorFileMaximized(true)
  -> else fallback to existing open-only result
```

### Decision 5: diff icon 复用既有 diff preview，不新增 viewer

- 方案 A：新做一套 activity-panel 专用 diff viewer
- 方案 B：复用已有 diff modal / preview 打开链路

采用 B。

原因：

- 用户需要的是快捷入口，不是第二套 diff 产品。
- 现有 Git / tool-card diff 体验已经存在，复用能避免行为漂移。

### Decision 6: 稀疏历史 payload 的 fallback 允许存在，但必须共享

- 方案 A：历史 payload 缺字段时，activity/status 各自猜
- 方案 B：保留 fallback，但通过 shared canonical adapter 统一猜

采用 B。

原因：

- 不改 storage schema 的前提下，历史兼容必须允许 fallback。
- 但 fallback 只要分叉，就会再次回到现在的问题。

## Gate Constraints

### 行为门禁

- 同一 file-change fact 在幕布、右侧、底部的文件数量必须一致。
- 同一路径在三个 surface 的 `status / additions / deletions` 必须一致。
- 右侧主点击必须得到“打开并最大化”或“安全 fallback 到打开”的结果。
- 右侧 diff icon 必须与主点击职责分离。
- 历史 reopening / replay 不能只恢复 summary，必须恢复完整 canonical entries。

### 工程门禁

- 共享 canonical adapter 必须是纯函数或纯 selector，可单测。
- 任何 maximize 编排都不得绕开现有 `onOpenDiffPath` / file-open routing。
- 不新增 conversation storage 字段，不引入数据迁移。

## Compatibility Strategy

### 1. Path Identity

- `filePath` 继续是 canonical identity
- 任何 rename / delete / fallback path 都必须最终归并回同一 `filePath` 语义
- external spec root / workspace root / external absolute path 的域判断保持现有规则

### 2. Existing Open Pipelines

- 主点击可以在上层增加 maximize 编排
- 底层 `onOpenDiffPath` / file view / diff modal 路由不被替换
- 其他入口如消息幕布、Git History、历史面板不被强制迁移到新交互

### 3. History Compatibility

- 不修改 conversation storage schema
- 不要求历史数据回填
- 稀疏历史 payload 通过 shared fallback 维持语义一致，而不是追求新旧字段完全一致

### 4. Failure And Fallback

- maximize 失败不得影响文件打开
- diff 预览失败必须是 recoverable hint，不得破坏 activity panel 可用性
- 外部不可读路径继续遵循现有 safe-fail contract

## Risks / Trade-Offs

- [Risk] canonical adapter 触达三处 surface，回归面比“只改右侧”更大
  Mitigation：先抽纯函数，再用 focused tests 锁住多文件 / 历史 replay / fallback
- [Risk] 右侧主点击新增 maximize 后可能影响用户当前布局预期
  Mitigation：只对 activity-panel 文件主点击生效，且 maximize 不可用时严格 fallback
- [Risk] diff icon 与主点击若视觉层级不清晰，可能造成误触
  Mitigation：按钮职责显式分离，主区域和 icon hit area 分开测试

## Migration Plan

1. 先补 OpenSpec artifacts，锁定 canonical contract、门禁与兼容性。
2. 抽 shared canonical adapter，并让 `session activity` 与 `status panel` 先接入。
3. 校对消息幕布 `File changes` aggregate，使三处统计统一。
4. 给 activity panel 文件条目接入主点击 maximize 与 diff icon affordance。
5. 补 focused tests，再跑 lint / typecheck / test。

Rollback strategy:

- 若 shared adapter 接入导致历史 replay 大面积异常，可先保留 adapter 并仅在 activity/status 两处消费，消息幕布延后对齐 aggregate。
- 若 maximize 编排在特定布局下不稳定，可保留主点击的现有打开行为，并将 maximize 降级为 guarded enhancement；这不影响 canonical parity 主目标。

## Open Questions

- 当前无阻塞性开放问题；如后续用户追加“幕布也要加 diff icon / 最大化”之类需求，应作为独立增量，不并入本次最小方案。
