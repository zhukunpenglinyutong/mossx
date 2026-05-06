# Frontend 开发规范（mossx）

本目录是 `mossx` 前端执行规范，适用于 `React + TypeScript + Vite + Tauri`。

## 适用范围

- 代码范围：`src/**`（重点 `src/features/**`、`src/services/**`、`src/styles/**`）
- 运行边界：`src/services/tauri.ts`（frontend 与 Rust command 的 bridge）
- 质量门禁：`npm run lint && npm run typecheck && npm run test`

## 规范目录

| 文档 | 用途 | 状态 |
|---|---|---|
| [Directory Structure](./directory-structure.md) | 模块目录与文件落位规则 | Active |
| [Component Guidelines](./component-guidelines.md) | 组件设计、props、样式与 i18n 规范 | Active |
| [Messages Streaming Render Contract](./messages-streaming-render-contract.md) | 固化 live conversation streaming 的 stable snapshot + live row override render contract | Active |
| [Computer Use Bridge](./computer-use-bridge.md) | Computer Use 状态面板、hook 与 bridge service contract | Active |
| [Hook Guidelines](./hook-guidelines.md) | hook 编排、async safety、bridge 调用约束 | Active |
| [State Management](./state-management.md) | local/global/persistent/runtime state 边界 | Active |
| [Quality Guidelines](./quality-guidelines.md) | 禁止项、必做项、review checklist | Active |
| [Type Safety](./type-safety.md) | strict TypeScript 与 boundary mapping 规则 | Active |

## Pre-Development Checklist（开始开发前必读）

- 若任务同时涉及项目规则入口或文档治理边界，先读 `../guides/project-instruction-layering-guide.md`。
- 先读 [Directory Structure](./directory-structure.md)，确认文件放在哪个 feature slice。
- 涉及 `useEffect`、polling、listener 时先读 [Hook Guidelines](./hook-guidelines.md)。
- 涉及 refactor 或大文件修改时先读 [Quality Guidelines](./quality-guidelines.md)。
- 涉及 live conversation message / Markdown / timeline render path 时，额外读 [Messages Streaming Render Contract](./messages-streaming-render-contract.md)。
- 涉及 UI -> service -> tauri/rust 的跨层变更，额外读：
  - `../guides/cross-layer-thinking-guide.md`
  - `../guides/code-reuse-thinking-guide.md`

## 项目事实基线（Project Facts）

- TS 使用 `strict: true`，且启用 `noUnusedLocals/noUnusedParameters`。
- alias：`@/* -> src/*`。
- 测试框架：Vitest，setup 文件为 `src/test/vitest.setup.ts`。
- 大文件守卫：`npm run check:large-files`（threshold 3000 lines）。
