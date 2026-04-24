## 1. Local Evidence Survey

- [x] 1.1 只读扫描 `/Applications/Codex.app`、Computer Use plugin manifest、helper descriptor 与 nested helper `Info.plist`，记录 URL scheme、bundle id、XPC/service、MCP descriptor、plugin descriptor 候选入口；输入：本机官方 Codex 安装态；输出：evidence notes；验证：不执行 helper、不写官方 bundle。
- [x] 1.2 分析当前代码中的 `ComputerUseActivationContext` 与 host-contract diagnostics result，确认新增 handoff discovery 应复用还是扩展现有 command；输入：`src-tauri/src/computer_use/mod.rs`；输出：实现切入点；验证：无重复 command/类型。

## 2. Backend Contract And Scanner

- [x] 2.1 定义 official parent handoff discovery result types，包含 `kind`、`methods`、`evidence`、`diagnosticMessage`、`durationMs` 与 bounded snippets；验证：Rust serialization/unit tests。
- [x] 2.2 实现 macOS-only read-only scanner，读取 `Info.plist`、plugin/marketplace manifest、MCP descriptor、XPC/service declarations，不 direct exec helper；验证：unit tests 覆盖 candidate found / unavailable / unknown。
- [x] 2.3 将 scanner 接入 host-contract diagnostics 或新增显式 Tauri command，并复用 Computer Use single-flight guard / kill switch；验证：targeted Rust tests 覆盖 already-running、kill switch、non-macOS unsupported。
- [x] 2.4 保持 Windows 和非 macOS explicit unsupported，不暴露可执行 handoff discovery path；验证：platform classification tests。

## 3. Frontend Surface And Typed Contract

- [x] 3.1 在 `src/types.ts`、`src/services/tauri.ts`、`src/services/tauri/computerUse.ts` 增加 typed wrapper，字段名与 Rust payload 一致；验证：service tests 与 typecheck。
- [x] 3.2 增加或扩展 Computer Use hook，支持显式 handoff discovery loading/result/error，并避免重复触发；验证：Vitest hook tests。
- [x] 3.3 更新 Computer Use status card，在 `host_incompatible` / host-contract diagnostics 后展示 handoff discovery evidence 和 diagnostics-only 结论；验证：component tests 覆盖 candidate found / unavailable / unknown / unsupported。
- [x] 3.4 补齐 i18n 文案，说明 candidate evidence 不等于 runtime enabled，未发现入口时只能保持 diagnostics-only；验证：lint/typecheck。

## 4. Guards, Docs, And Manual Matrix

- [x] 4.1 增加 ordinary workflow guard，确认 status refresh、settings save、chat send、MCP 管理不会触发 handoff discovery；验证：targeted tests / existing service tests。
- [x] 4.2 更新 macOS manual test matrix，覆盖当前第三方宿主下的 no-crash、candidate evidence、unavailable conclusion；验证：文档包含步骤、期望字段、停止条件。
- [x] 4.3 同步 `.trellis/spec/**/computer-use-bridge.md`，记录 handoff discovery schema、asset boundary、Windows unsupported 与 rollback path；验证：spec diff review。

## 5. Validation And Archive Readiness

- [x] 5.1 运行 targeted Rust tests、targeted Vitest、`npm run typecheck`、`npm run lint`、`npm run check:runtime-contracts`、`npm run doctor:strict`、`npm run check:large-files:gate`；验证：全部通过或记录已知阻塞。
- [x] 5.2 运行 `openspec validate discover-computer-use-official-parent-handoff --type change --strict --no-interactive` 与 `git diff --check`；验证：全部通过。
- [x] 5.3 准备归档/提交说明，明确若无 official handoff 则停止在 diagnostics-only，不推进 runtime integration；验证：final report/commit body 包含 rollback path。
