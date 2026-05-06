# Project Instruction Layering Guide

本指南定义 `mossx` 仓库中“规则写在哪、从哪读、不要在哪重复写”的固定边界。

## 五层模型

| Layer | Canonical Path | 用来做什么 | 不应该做什么 |
|---|---|---|---|
| Project entry | `AGENTS.md` | 仓库级入口、优先级、最小读取路径、全局 gate | 不要重复 frontend/backend/OpenSpec 细则正文 |
| Implementation rules | `.trellis/spec/**` | frontend/backend/guides 的实现规范与执行约束 | 不要承担 active change 审计历史 |
| Behavior specs | `openspec/**` | proposal/design/tasks/main specs/workspace governance | 不要写 host-specific hooks/config 细节 |
| Host adapter config | `.claude/**`、`.codex/**` | hooks、commands、skills、host glue | 不要复制项目治理正文 |
| Runtime artifacts | `.omx/**`、本地 state | 运行态副产物 | 不要当成长期仓库资产或规范事实源 |

## 读取顺序

### 开始一个新任务

1. 先读 `AGENTS.md`
2. 根据任务类型按需读：
   - 实现规则：`.trellis/spec/frontend/index.md` / `.trellis/spec/backend/index.md`
   - 思考指南：`.trellis/spec/guides/index.md`
   - 行为与变更：`openspec/README.md`、`openspec/project.md`、对应 `openspec/changes/<change-id>/**`
3. 只有调试 host 行为时，再深入 `.claude/**` 或 `.codex/**`

### 修改规则时

- 改 frontend/backend/cross-layer 约束：去 `.trellis/spec/**`
- 改 behavior requirement / proposal / design / task：去 `openspec/**`
- 改 session-start / global gate / rule priority：去 `AGENTS.md`
- 改 hooks / commands / skills registration：去 `.claude/**` 或 `.codex/**`

## 更新矩阵

| 你想改什么 | 应该改哪里 | 一般不该顺手改哪里 |
|---|---|---|
| session-start 的最小入口 | `AGENTS.md` | `openspec/project.md` |
| frontend hook / state / i18n 规则 | `.trellis/spec/frontend/**` | `AGENTS.md` |
| backend command / storage / logging 规则 | `.trellis/spec/backend/**` | `AGENTS.md` |
| OpenSpec 工作区治理总览 | `openspec/project.md` | `openspec/README.md` |
| OpenSpec 导航入口 | `openspec/README.md` | `AGENTS.md` |
| host-specific hook 行为 | `.claude/**` / `.codex/**` | `openspec/**` |
| runtime artifact ignore policy | `.gitignore` + `AGENTS.md` / 本 guide | `openspec/specs/**` 的实现细则 |

## Anti-Patterns

- 在 `AGENTS.md` 重新复制 `.trellis/spec/frontend/**` 或 `.trellis/spec/backend/**` 的细节
- 在 `openspec/README.md` 重复 `openspec/project.md` 的 snapshot / metrics / backlog 正文
- 在 session-start hook 中内联多份 spec index 正文或完整 active task 大列表
- 把 `.omx/**`、本地 session state、临时研究快照提交为长期仓库资产
- 在 `.claude/**` 与 `.codex/**` 各写一套平行治理正文

## 维护原则

- 入口文档越短越好，但必须把“去哪看细节”指清楚
- 细则文档可以细，但只在它负责的那一层细
- session-start 默认注入以项目入口、状态摘要和按需读取指针为主，不以内联全文代替导航
- runtime artifact 默认是 local-only；若要保留为长期知识，必须做有意识的二次整理
