## 1. Backend Contract And Command Surface

- [x] 1.1 定义 host-contract diagnostics result types，输入为当前 Computer Use discovery/activation context，输出包含 `kind`、evidence、bounded snippets 与 diagnostic message；验证方式：Rust unit tests 覆盖所有 result kinds。
- [x] 1.2 新增 Tauri command 并通过 `src-tauri/src/command_registry.rs` 注册，命令必须走现有 Computer Use state / Mutex / single-flight guard；验证方式：command registry symbol check 与 targeted Rust tests。
- [x] 1.3 在 `src/services/tauri.ts` 与 `src/services/tauri/computerUse.ts` 增加 typed frontend wrapper，保持字段名与 Rust payload 一致；验证方式：TypeScript typecheck 与 tauri service tests。

## 2. macOS Host Contract Diagnostics Provider

- [x] 2.1 实现 macOS-only diagnostics provider，采集 helper path、descriptor path、current host path、handoff method、codesign summary、spctl summary 与 duration；验证方式：mocked provider unit tests 覆盖 evidence present / unavailable。
- [x] 2.2 禁止 diagnostics direct exec 官方 nested app-bundle helper，遇到 `SkyComputerUseClient.app/Contents/MacOS/*` 或等价路径时返回 `requires_official_parent` / `handoff_unavailable`；验证方式：Rust regression test 断言不会调用 process spawn。
- [x] 2.3 保持 Windows adapter explicit unsupported，不暴露 diagnostics execution path；验证方式：platform adapter tests 覆盖 Windows rejected result。

## 3. Frontend Surface And Copy

- [x] 3.1 在 Computer Use settings surface 仅当 activation 返回 `host_incompatible` 或等价 parent-contract failure 时展示 host-contract diagnostics CTA；验证方式：Vitest 覆盖 eligible / ineligible rendering。
- [x] 3.2 增加 diagnostics loading、success/failure/evidence rendering，文案必须说明这是 investigation，不是 runtime enablement；验证方式：component tests 覆盖 `requires_official_parent`、`handoff_unavailable`、`handoff_verified`、`manual_permission_required`、`unknown`。
- [x] 3.3 补齐 i18n copy，不在 component 内硬编码 user-visible text；验证方式：lint/typecheck 与 i18n key existence check。

## 4. Guards, Tests, And Manual Matrix

- [x] 4.1 增加普通流程不触发 diagnostics 的 automated guard，覆盖 status refresh、settings save、chat send、MCP 管理；验证方式：targeted Vitest / service tests。
- [x] 4.2 增加 kill-switch tests，确认关闭后回退到 Phase 2 diagnostics-only surface；验证方式：backend + frontend targeted tests。
- [x] 4.3 更新 macOS manual test matrix，覆盖当前第三方宿主 `host_incompatible`、host-contract diagnostics、不出现系统 crash report、结果 evidence 可读；验证方式：记录手测步骤与预期截图/日志字段。

## 5. Documentation, Spec Sync, And Rollback

- [x] 5.1 同步 `.trellis/spec/**/computer-use-bridge.md` 或等价 implementation guideline，记录 direct exec 禁止项、host-contract evidence schema 与 Windows unsupported 边界；验证方式：spec diff review。
- [x] 5.2 运行 OpenSpec strict validate、Rust targeted tests、frontend targeted tests、`npm run typecheck`、`npm run lint`、`npm run check:runtime-contracts`；验证方式：命令输出全部通过或明确记录已知阻塞。
- [x] 5.3 准备回滚说明：关闭 host-contract flag 后仅保留 Phase 2 diagnostics-only，不影响 discovery/status、Codex、MCP、chat；验证方式：final report 明确 rollback path。
