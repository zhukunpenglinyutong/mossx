## 1. Backend Continuity Model

- [x] 1.1 为 Computer Use broker 增加 authorization host snapshot；输入：当前 launcher / executable / signing metadata，输出：结构化 current host evidence，验证：Rust 单元测试覆盖 packaged app / daemon / debug host 分类。
- [x] 1.2 将 authorization continuity 建模接入现有 host-contract diagnostics；输入：current host evidence + existing host-contract evidence，输出：统一的 diagnostics / broker verdict，验证：Rust targeted tests 覆盖 manual permission 与 continuity blocked 不冲突。
- [x] 1.3 持久化 last successful authorization host，并在 team id / bundle(or executable) identity / backend mode / host role / signing summary 漂移时判定 continuity invalidated；验证：Rust 单元测试覆盖首跑、成功后复跑、签名漂移三类场景。
- [x] 1.4 将 `Apple event error -10000` / `Sender process is not authenticated` 结合 host drift 分类为 continuity blocked；输入：broker/tool failure text + host snapshots，输出：结构化 failure kind / diagnostics，验证：Rust targeted tests。

## 2. Broker Launch Pinning

- [x] 2.1 让 broker 解析“当前 backend mode 下实际执行 `codex exec` 的 host”，不要只把前台 GUI 名称当作 current host；验证：broker preflight tests 覆盖 embedded local / local daemon / remote daemon。
- [x] 2.2 收敛 local broker 的 stable authorization host，避免在主 App、daemon、debug binary、旧签名 host 间漂移；验证：broker preflight tests + macOS manual matrix。
- [x] 2.3 当 current context 无法保证 stable authorization host 时，broker 显式 blocked；输入：ambiguous / unsupported launcher context，输出：blocked result 与 continuity diagnostics，验证：Rust tests。

## 3. Surface And Copy

- [x] 3.1 在 Computer Use status card 中展示 current authorization host、backend mode、host role 与 last successful host；输入：backend continuity snapshot，输出：identity panel / drift badge，验证：Vitest component tests。
- [x] 3.2 为 continuity blocked 增加 distinct verdict 与 exact-host remediation 文案，并复用现有 host-contract diagnostics 区块；输入：continuity blocked broker result，输出：UI verdict + i18n copy，验证：Vitest component tests 与 i18n key coverage。
- [x] 3.3 保留 same-host denied 的 generic permission / approval 文案分支，避免误把所有 `-10000` 都渲染成 continuity drift；验证：Vitest component tests。

## 4. Validation

- [x] 4.1 补齐 macOS 手测矩阵：`Terminal success + client fail`、`same host + still denied stays generic permission`、`embedded local app vs local daemon / remote daemon`、`main app vs daemon`、`debug binary drift`、`relaunch after re-authorization`；输出：OpenSpec docs evidence，验证：人工记录可复核。
- [x] 4.2 运行 `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture`、相关 Vitest、`openspec validate fix-codex-computer-use-authorization-continuity --type change --strict --no-interactive`；输出：全部通过或明确记录剩余阻塞。
