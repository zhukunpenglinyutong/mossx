## 1. Backend Detection Parity

- [x] 1.1 [P0][depends:none][I:`src-tauri/src/engine/status.rs`, `src-tauri/src/bin/cc_gui_daemon.rs`, 现有 Codex detection contract][O: Claude detection fallback + daemon PATH bootstrap parity][V: Rust targeted tests 覆盖 `--version` 失败 / `--help` 成功回退，且 daemon 入口补齐 `fix_path_env::fix()`] 对齐 Claude CLI 探测韧性与 app/daemon `PATH` 恢复语义。
- [x] 1.2 [P0][depends:1.1][I:`src-tauri/src/codex/mod.rs`, `src-tauri/src/command_registry.rs`, 现有 debug / resolution helpers][O: 独立 `claude_doctor` command 与 registry wiring][V: Rust 测试或编译断言 `claude_doctor` 返回 structured diagnostics，且不回退 `codex_doctor` 现有字段语义] 实现独立 Claude doctor backend contract。
- [x] 1.3 [P0][depends:1.2][I:`src-tauri/src/engine/commands.rs`, `src-tauri/src/remote_backend.rs`, engine command contract][O: engine remote backend forwarding parity][V: targeted Rust/TS coverage 断言 Claude/engine send/status/interrupt commands 在 remote mode 走 daemon，而不是留在本地] 补齐 Claude / engine 关键命令在 remote backend 下的 forwarding parity。
- [x] 1.4 [P0][depends:1.3][I:`src-tauri/src/bin/cc_gui_daemon.rs`, `src-tauri/src/bin/cc_gui_daemon/daemon_state.rs`, `src-tauri/src/codex/mod.rs`][O: daemon doctor + Claude/Gemini history RPC completeness][V: remote mode 下 `codex_doctor`、`claude_doctor`、`fork/delete_claude_session`、`delete_gemini_session` 可通过 daemon 完整执行] 补齐 daemon 缺失的 doctor / history handlers，消除半可用状态。
- [x] 1.5 [P1][depends:1.2][I:`src-tauri/src/backend/app_server_cli.rs`, `src-tauri/src/codex/doctor.rs`][O: CLI-specific debug / resolution hygiene][V: targeted tests 断言显式 `codexBin` / `claudeBin` 只影响对应 CLI 的 debug lookup，且 Claude doctor 失败时仍返回完整 structured diagnostics] 收紧 shared doctor helper，避免跨 CLI 显式路径污染诊断结果。

## 2. Frontend Contract And Settings Wiring

- [x] 2.1 [P0][depends:1.2][I:`src/types.ts`, `src/features/settings/hooks/useAppSettings.ts`, `src/services/tauri.ts`][O: frontend `claudeBin` contract + `runClaudeDoctor()` service mapping][V: Vitest 覆盖 `claudeBin` 默认值、normalize/trim round-trip 与 invoke payload mapping] 以 additive 方式补齐 frontend settings/schema/service 映射。
- [x] 2.2 [P0][depends:2.1][I:`src/features/app/hooks/useAppSettingsController.ts`, `src/app-shell.tsx`, `src/app-shell-parts/renderAppShell.tsx`][O: `claudeDoctor` 沿现有 controller/app shell 链路透传到 settings][V: 受影响组件测试或集成渲染断言 `onRunClaudeDoctor` 能从 AppShell 到 SettingsView 正确传递] 打通 Claude doctor 的 cross-layer UI wiring。
- [x] 2.3 [P0][depends:2.2][I:`src/features/settings/components/SettingsView.tsx`, `src/features/settings/components/settings-view/sections/CodexSection.tsx`, `src/features/settings/components/settings-view/settingsViewConstants.ts`, `src/i18n/locales/*.ts`][O: 左侧导航文案改为 `CLI 验证`，面板改造为 `Codex / Claude Code` tabs][V: Vitest 覆盖导航文案、tab 切换与现有 Codex 交互保持可用] 先把设置 surface 从单一 `Codex` 页面收口为统一的 CLI validation panel。
- [x] 2.4 [P0][depends:2.3][I:`src/features/settings/components/SettingsView.tsx`, `src/features/settings/components/settings-view/sections/CodexSection.tsx`, `src/i18n/locales/*.ts`][O: Claude path editor、doctor action、结果展示与 i18n 文案][V: Vitest 覆盖 Claude path 保存/回显、doctor 成功/失败渲染、Codex/Claude 两个 tab 并存场景] 在 `Claude Code` tab 中落地 Claude UI 与文案。
- [x] 2.5 [P0][depends:2.4][I:`src/features/settings/components/SettingsView.tsx`, `src/features/settings/components/settings-view/sections/CodexSection.tsx`, `src/i18n/locales/*.ts`][O: shared execution backend 区块，移出 Codex-only 语义][V: Vitest 覆盖 `backendMode / remoteBackend*` 在 `CLI 验证` 中独立可见，且切换 tab 不影响 shared controls] 将 `backendMode / remoteBackend*` 提升为 shared execution backend surface，避免继续看起来像 Codex-only runtime。

## 3. Regression Coverage

- [x] 3.1 [P0][depends:2.4][I:`src/features/settings/components/SettingsView.test.tsx`, `src/features/settings/hooks/useAppSettings.test.ts`][O: focused frontend regression matrix][V: 测试覆盖 `Run Claude Doctor`、`claudeBin` 读写、doctor error path、导航文案与 Codex/Claude tab 并存场景] 补齐 settings 与 hook 层前端回归测试。
- [x] 3.2 [P1][depends:1.4,1.5,2.5,3.1][I:`src/services/tauri.test.ts`, `src-tauri/src/backend/app_server_cli.rs`, `src-tauri/src/codex/doctor.rs`, `src-tauri/src/engine/commands_tests.rs` + 必要的 settings view assertions][O: remote backend parity regression coverage][V: Rust/TS targeted tests 断言 engine/doctors/history commands 的 remote forwarding、app/daemon parity、structured diagnostics 字段稳定、显式 CLI bin 隔离，以及 shared execution backend surface 不破坏既有 Codex contract] 补齐 Claude execution/backend parity 的关键跨层回归，防止后续再次漂移。

## 4. Verification And Change Readiness

- [x] 4.1 [P0][depends:3.2][I: 受影响 TS/Rust 模块][O: 通过的质量门禁结果][V: `npm run lint`、`npm run typecheck`、`npm run test`、`cargo test --manifest-path src-tauri/Cargo.toml` 全通过] 运行基础质量门禁并修复实现回归。
- [x] 4.2 [P1][depends:4.1][I: cross-layer command/service mapping 与本地桌面设置页链路][O: 手动验证结论][V: 手测确认 Claude path 保存后可回读、`Run Claude Doctor` 可执行、Codex doctor 未回退、daemon/app 对同一环境不给出冲突结论] 执行最小人工验证矩阵，确认本地桌面链路闭环。
- [x] 4.3 [P1][depends:4.2][I: OpenSpec change artifacts][O: apply-ready change 状态][V: `openspec validate fix-claude-doctor-settings-alignment --type change --strict --no-interactive` 通过] 完成 OpenSpec 严格校验并确认该 change 可进入 apply 阶段。
