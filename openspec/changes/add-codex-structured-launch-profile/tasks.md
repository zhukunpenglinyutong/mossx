## 1. Launch Configuration Preview Contract

- [ ] 1.1 [P0][depends:none][I: 现有 `codexBin/codexArgs`、workspace legacy overrides、当前 runtime 解析链][O: backend effective launch preview contract][V: Rust 单测覆盖 executable/args precedence、worktree inherit、wrapper kind 与 injected args] 复用现有字段实现 `codex_preview_launch_profile`。
- [ ] 1.2 [P0][depends:1.1][I: preview contract + 既有 `codex_doctor`][O: preview / doctor 共享的 launch resolution 语义][V: Rust 单测断言同一配置下 preview 与 doctor 的 resolved executable / wrapper 一致] 对齐 preview 与 doctor 的解释链路。

## 2. Settings UX

- [ ] 2.1 [P0][depends:1.1][I: 现有 Codex settings section][O: 保守版 Launch Configuration editor（仅 executable + arguments）][V: Vitest 覆盖 draft 编辑、preview 成功/失败与保存前提示] 在设置页实现最小 Launch Configuration UI。
- [ ] 2.2 [P0][depends:2.1][I: workspace settings rows + 既有 overrides][O: workspace inherit / override 可见性][V: Vitest 覆盖 workspace override、worktree parent inherit、global fallback 展示] 在 workspace 配置区明确优先级和继承结果。
- [ ] 2.3 [P1][depends:2.1,2.2][I: Save flow 文案与状态反馈][O: “下次启动生效，不影响当前连接” UX][V: Vitest 覆盖保存成功后状态提示与无 runtime side effect] 补齐不影响当前正常功能的用户提示。

## 3. Verification

- [ ] 3.1 [P0][depends:2.3][I: 受影响 TS/Rust 模块][O: 回归测试结果][V: `npm run lint`、`npm run typecheck`、`npm run test`、`cargo test --manifest-path src-tauri/Cargo.toml` 全通过] 运行基础质量门禁并修复回归。
- [ ] 3.2 [P1][depends:3.1][I: desktop app manual matrix][O: 手测结果][V: 未修改设置时行为不变、保存不打断当前连接、workspace inherit 正常、preview/doctor 一致] 执行最小人工验证矩阵，确认不影响正常功能。
