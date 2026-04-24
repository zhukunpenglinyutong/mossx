## 0. 实施批次

### Batch A [P0] Backend activation contract

- [x] A.1 [P0][depends:none][I: proposal/design/specs][O: `ComputerUseActivationResult`、`ComputerUseActivationOutcome`、`ComputerUseActivationFailureKind` 与 `run_computer_use_activation_probe` command signature][V: `src-tauri/src/computer_use/**` 类型与 `command_registry.rs` 接线可编译] 定义第二阶段 activation/probe 的后端类型与 command 边界。
- [x] A.2 [P0][depends:A.1][I: Phase 2 design decisions、现有 helper path discovery、官方 helper `--help`/handshake safe probe 形态][O: bounded activation/probe driver、single-flight guard、timeout handling][V: 并发触发不会启动多个 probe；timeout/failure 能返回结构化结果] 实现 `macOS` bounded helper probe 执行器，禁止后台隐式 invoke。
- [x] A.3 [P0][depends:A.1,A.2][I: helper identity key 设计、现有 status command][O: session-scoped verification cache 与 status merge logic][V: 同一 app session 内成功 probe 后 status 不再继续携带 `helper_bridge_unverified`；helper identity 变化后 cache 失效] 为 activation 成功结果增加 session 级验证复用。
- [x] A.4 [P0][depends:A.2][I: platform adapter contract][O: `Windows` / ineligible host non-executable branch][V: `Windows` 不执行 probe；缺少 app/plugin/helper 的 host 不暴露执行路径] 收紧平台与硬前置条件门禁，保持 `Windows` explicit unsupported。

### Batch B [P0] Frontend activation lane

- [x] B.1 [P0][depends:A.1][I: backend activation result contract、现有 `src/services/tauri/computerUse.ts`][O: frontend typed facade、shared TS types、service exports][V: frontend 不直接 `invoke()`；command mapping 与类型通过] 在前端补齐 activation/probe 的 service facade 与 type contract。
- [x] B.2 [P0][depends:B.1][I: surface eligibility rules、single-flight requirement][O: activation hook/state machine，覆盖 `idle/running/verified/blocked/failed`][V: 重复点击不会并发执行；running/success/failure 状态可独立消费] 新增 Computer Use activation lane 的 hook 与状态管理。
- [x] B.3 [P0][depends:B.2][I: `ComputerUseStatusCard.tsx`、availability surface delta spec][O: `macOS` 且存在 `helper_bridge_unverified` 时的 verify/activate affordance、running/result diagnostics UI][V: `Windows` 与 `unavailable` 场景无按钮；helper 已验证后 UI 去掉过时的 `helper_bridge_unverified` 提示] 在设置页 surface 中渲染显式 activation 入口与结果反馈。
- [x] B.4 [P1][depends:B.3][I: activation failure taxonomy、现有中英文 copy][O: i18n keys、diagnostic copy、Phase 2 boundary notice][V: 文案明确“显式 activation/probe”语义，不把成功误写成完整 runtime support] 收口第二阶段 i18n 文案与用户可见边界提示。

### Batch C [P1] Guardrails and rollback containment

- [x] C.1 [P1][depends:A.2,B.3][I: Phase 1 bridge flag、rollback requirement][O: activation lane 独立 kill switch 或等价 gate][V: 关闭后 surface 回退到 Phase 1 `status-only`，且 backend 不再执行 activation command] 为第二阶段单独补齐可回退门禁。
- [x] C.2 [P1][depends:A.3,C.1][I: 非 Computer Use 主流程调用点盘点][O: 非相关设置保存/聊天发送/MCP 管理不会触发 helper invoke 的保护][V: targeted regression 覆盖普通流程仍只读] 确保第二阶段接线不污染现有 Codex / settings / MCP 主流程。
- [x] C.3 [P1][depends:A.2][I: helper probe failure taxonomy、design fallback][O: “优先 safe no-op；无安全入口时退化为 diagnostics-only fallback” 的路径][V: nested app-bundle helper 不再从第三方宿主直接 exec；返回结构化 `host_incompatible`，而不是触发系统 crash report 或偷偷升级 scope] 固化 probe fallback 策略，防止实现阶段 scope 漂移。

### Batch D [P1] Verification and quality gates

- [x] D.1 [P1][depends:A.4][I: backend activation contract][O: Rust targeted tests 覆盖 success/timeout/helper failure/cache invalidation/windows unsupported][V: `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture` 通过] 补齐 backend activation/probe 回归测试。
- [x] D.2 [P1][depends:B.4,C.2][I: frontend surface/hook contract][O: Vitest 覆盖 affordance gating、running state、failure diagnostics、success update、Windows no-action][V: `npx vitest run src/features/computer-use/components/ComputerUseStatusCard.test.tsx src/services/tauri.test.ts` 通过] 补齐 frontend activation lane 回归测试。
- [x] D.3 [P1][depends:D.1,D.2][I: 完整第二阶段接线代码][O: 质量门禁结果][V: `npm run lint`、`npm run typecheck`、`npm run test`、`cargo test --manifest-path src-tauri/Cargo.toml` 通过] 执行基础质量门禁，确认第二阶段未引入全局回归。
- [x] D.4 [P1][depends:D.3][I: `macOS` 实机 + rollback 证据；`Windows` 证据按用户要求延期][O: 手测矩阵与 rollback 证据][V: `macOS` blocked/failure/diagnostics-only fallback 已有截图证据；关闭 kill switch 后回退到 Phase 1 surface 已有自动化覆盖；`Windows` 暂不进入本轮] 补齐第二阶段人工验证证据。

## 1. 回滚策略

- [x] R.1 若 activation lane 在 `macOS` 上出现卡死、并发失控或误报 `ready`，优先关闭第二阶段 kill switch，保留 Phase 1 `status-only` discovery/status surface。
- [x] R.2 若 helper probe 无法找到足够安全的 no-op / handshake 入口，回退到 diagnostics-only fallback，禁止把 scope 偷偷扩大到 conversation 主链路。
- [x] R.3 若第二阶段接线污染普通设置保存、Codex 会话或 MCP 管理流程，先切断 activation command 入口，再逐点回退前端 affordance 与 session cache。
