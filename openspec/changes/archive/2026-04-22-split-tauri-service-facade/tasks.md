## 1. Spec And Task Setup

- [x] 1.1 创建本次 façade modularization 的 PRD 与 OpenSpec artifacts `[P0][依赖: 无][输入: 当前 tauri service 结构与 large-file policy][输出: 可执行的 task/change artifacts][验证: openspec status --change split-tauri-service-facade 显示 tasks ready/done]`

## 2. Tauri Facade Modularization

- [x] 2.1 抽离 `dictation` domain 到独立 submodule，并保持顶层 re-export `[P1][依赖: 1.1][输入: 现有 dictation service 实现][输出: src/services/tauri/dictation.ts + tauri.ts façade re-export][验证: 调用签名保持不变]`
- [x] 2.2 抽离 `terminal/runtime-log` domain 到独立 submodule，并保持顶层 re-export `[P1][依赖: 1.1][输入: 现有 terminal/runtime-log service 实现][输出: src/services/tauri/terminalRuntime.ts + tauri.ts façade re-export][验证: 调用签名保持不变]`
- [x] 2.3 抽离 `project-memory` domain 到独立 submodule，并保持顶层 re-export `[P1][依赖: 1.1][输入: 现有 project-memory service 实现][输出: src/services/tauri/projectMemory.ts + tauri.ts façade re-export][验证: 调用签名保持不变]`
- [x] 2.4 抽离 `vendors` 与 `agents` domain 到独立 submodule，并保持顶层 re-export `[P1][依赖: 1.1][输入: 现有 vendor/agent service 实现][输出: src/services/tauri/vendors.ts + agents.ts + tauri.ts façade re-export][验证: 调用签名保持不变]`
- [x] 2.5 确保 `src/services/tauri.ts` 行数降到当前 P0 hard gate 以下 `[P0][依赖: 2.1,2.2,2.3,2.4][输入: 拆分后的 façade][输出: 低于 policy fail threshold 的 tauri.ts][验证: check-large-files:gate 不再将 tauri.ts 标记为 retained hard debt]`

## 3. Validation

- [x] 3.1 执行 `npm run typecheck` 验证 façade re-export 没有破坏调用方 `[P0][依赖: 2.5][输入: 拆分后的 service 层][输出: 通过的 TS 编译结果][验证: 无新增 type error]`
- [x] 3.2 执行 `npm run check:large-files:gate` 验证 `tauri.ts` 降线成功 `[P0][依赖: 2.5][输入: 拆分后的 tauri façade][输出: gate 结果中不再包含 src/services/tauri.ts][验证: gate 通过且 tauri.ts 不在 retained hard debt 列表]`
