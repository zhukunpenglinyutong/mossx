## Why

`src/services/tauri.ts` 当前约 `2991` 行，已经进入 `bridge-runtime-critical` policy 的 hard-debt 区间。  
如果继续把低耦合 domain 堆在同一个 façade 里，后续任何 bridge 改动都会持续增加 merge hotspot 和 review 失真，因此需要先做一轮兼容性拆分。

## 目标与边界

- 目标：
  - 将 `dictation`、`terminal/runtime-log`、`project-memory`、`vendor/agent` 领域抽成独立 submodule。
  - 保持 `src/services/tauri.ts` 外部导出面稳定，只做 façade re-export。
  - 让 `src/services/tauri.ts` 重新低于当前 large-file hard gate。
- 边界：
  - 不修改 `engine/codex/git` 主链路。
  - 不改变 frontend 调用方 import 路径。
  - 不修改 Rust command contract。

## Non-Goals

- 不做 `src/services/tauri.ts` 的全量重写。
- 不顺手调整 runtime fallback、payload mapping 或业务行为。
- 不在本轮处理 `src/app-shell.tsx` 与 `useThreadMessaging.ts`。

## What Changes

- 新增多个 `src/services/tauri/*` domain submodule。
- 把 `src/services/tauri.ts` 对应 domain 的实现移动到子模块，并改为顶层 re-export。
- 保留所有现有函数名、类型名和返回语义。
- 通过 typecheck 与 large-file gate 验证 façade 拆分没有破坏 contract。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `bridge-cleanup-hardening`: 增补 frontend tauri service façade modularization 的兼容性要求，确保 façade 抽分后导出面与 command contract 保持稳定。

## Acceptance Criteria

- 调用方无需改 import 即可继续编译通过。
- `src/services/tauri.ts` 低于当前 P0 hard gate。
- large-file gate 与 typecheck 均通过。

## Impact

- Affected code:
  - `src/services/tauri.ts`
  - `src/services/tauri/*.ts`
- Verification:
  - `npm run typecheck`
  - `npm run check:large-files:gate`
