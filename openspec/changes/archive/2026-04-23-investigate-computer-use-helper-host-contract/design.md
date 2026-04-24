## Context

Phase 2 已经完成 Computer Use bridge 的可见性与显式 activation/probe：mossx 能读取官方 Codex App、`computer-use@openai-bundled` plugin、helper manifest，并在 settings surface 内执行用户触发的验证。

实机 macOS 结果表明：直接执行官方 nested app-bundle helper `SkyComputerUseClient` 会出现非零退出，甚至触发系统 crash report。当前代码已把该路径收敛成 `host_incompatible` / diagnostics-only failure。本变更继续下一阶段，但不进入 conversation runtime integration；目标是查明官方 helper 是否存在可支持的 parent / handoff contract。

主要约束：

- macOS only；Windows 继续 explicit unsupported。
- 不复制、不重签名、不重打包、不修改官方 App / plugin / helper。
- diagnostics 必须用户显式触发、bounded、single-flight、kill-switchable。
- ordinary status refresh、chat、MCP、settings save 不得触发 helper investigation。

## Goals / Non-Goals

**Goals:**

- 建立 `computer-use-helper-host-contract` capability，定义 host-contract diagnostics 的输入、输出、证据字段与分类。
- 在 `host_incompatible` 后提供更窄的 investigation lane，用证据判断是否存在 official parent / handoff 路径。
- 将 nested app-bundle helper 的 parent-contract limitation 从普通 launch failure 升级为一等平台分类。
- 提供自动化 guard 与 macOS 手测矩阵，确认不会再触发 crash report 或污染普通流程。

**Non-Goals:**

- 不实现 Computer Use conversation runtime integration。
- 不把 Computer Use 暴露为通用 tool relay、MCP relay 或后台 automation。
- 不绕过 macOS code signing、TCC、entitlement、sandbox 或 approval 约束。
- 不承诺第三方宿主一定能桥接官方 helper。
- 不处理 Windows 实现。

## Decisions

### Decision 1: Phase 2.5 先做证据门，不直接做 runtime integration

采用独立 host-contract investigation lane，作为 Phase 3 之前的 evidence gate。

原因：

- 当前已知 direct exec nested helper 会被 macOS 拒绝甚至 crash，不能扩散到聊天主链路。
- runtime integration 的正确性取决于 official parent / handoff contract 是否存在。
- 先收集可复现证据，能把“能不能做”与“怎么做”分离，避免在实现阶段偷扩大 scope。

替代方案：

- 继续 direct exec helper：实现简单，但已知会触发 crash report，拒绝。
- 停在 Phase 2 diagnostics-only：安全，但不能回答后续 integration 的关键问题，作为 fallback 保留。

### Decision 2: diagnostics 以结构化 evidence schema 为一等 contract

后端新增 host-contract diagnostics result，至少包含：

- `kind`: `requires_official_parent`、`handoff_unavailable`、`handoff_verified`、`manual_permission_required`、`unknown`
- `helperPath`
- `descriptorPath`
- `currentHostPath`
- `handoffMethod`
- `codesignSummary`
- `spctlSummary`
- `durationMs`
- `diagnosticMessage`
- bounded `stdoutSnippet` / `stderrSnippet`

原因：

- UI、日志、测试与手测矩阵需要消费同一份证据。
- 避免把“未知”“权限缺失”“官方 parent required”混成普通失败。
- 证据字段可被后续 OpenSpec / Trellis spec 直接固化为 executable contract。

替代方案：

- 只返回字符串错误：实现快，但无法做稳定测试，也无法为后续阶段提供决策依据。

### Decision 3: macOS adapter 禁止在 host diagnostics 中 direct exec nested helper

当 helper identity 指向官方 nested app-bundle CLI 时，host-contract diagnostics 不再执行该二进制，而是采用只读 evidence collection 与安全 handoff 检查。

允许的操作：

- 读取 official app/plugin/helper path 与 manifest/descriptor。
- 读取 code signing / notarization / spctl 摘要。
- 检查当前 host path 与 bundle relationship。
- 如存在可安全验证的 official app handoff 描述，记录 handoff method；否则返回 unavailable。

禁止的操作：

- 直接 exec `SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient`。
- 复制或重签名 helper。
- 修改 official plugin / app bundle。
- 自动写入 permissions / approval 配置。

替代方案：

- 在 timeout 与 crash guard 下继续尝试 direct exec：仍会制造用户可见 crash report，拒绝。

### Decision 4: frontend 只在失败后暴露显式 CTA

Computer Use surface 只在 `host_incompatible` 或等价 parent-contract failure 后展示 host-contract diagnostics CTA。CTA 不自动链式执行，用户必须再次点击。

原因：

- 保持用户明确授权边界。
- 避免普通刷新、保存设置、进入页面时触发 helper investigation。
- 把“验证 helper bridgeability”和“调查 official parent contract”拆成两个可解释动作。

替代方案：

- activation 失败后自动运行 diagnostics：更省点击，但破坏 explicit action contract，拒绝。

### Decision 5: kill switch 回退到 Phase 2 diagnostics-only

新增 host-contract investigation 复用 Computer Use activation feature flag 或引入更窄子开关，但关闭后必须回退为 Phase 2 diagnostics-only surface。

原因：

- 如果 official app 行为变化、evidence command 在用户机器上异常或 UI 文案造成误导，可以整块关闭新阶段。
- 回滚后仍保留已验证的 discovery/status 能力，不影响 Codex/MCP/聊天主流程。

## Risks / Trade-offs

- [Risk] official helper contract 可能完全不允许第三方 handoff → Mitigation: 结果分类允许 `requires_official_parent` / `handoff_unavailable`，并把这作为 Phase 3 是否继续的准入条件。
- [Risk] `codesign` / `spctl` 输出在不同 macOS 版本上不稳定 → Mitigation: 只依赖 bounded summary，不把完整文本作为 brittle assertion。
- [Risk] 用户误以为 diagnostics 会启用 Computer Use runtime → Mitigation: UI copy 明确这是 investigation，不是 runtime enablement。
- [Risk] evidence 采集暴露本机路径 → Mitigation: 只在本机 settings surface 展示，snippet 限长，后续日志不得默认上传。
- [Risk] feature flag 粒度不足导致回滚影响 activation lane → Mitigation: 如实现中复用 activation flag 不够精确，增加 host-contract 子开关，但不引入远程依赖。

## Migration Plan

1. 新增 OpenSpec capability 与 delta specs，先锁定 contract。
2. 后端新增 host-contract result types 与 macOS diagnostics provider。
3. Tauri command 统一通过 command registry 暴露，并保持 Mutex / single-flight。
4. Frontend 在 Computer Use settings surface 增加 CTA、loading state、result rendering 与 i18n copy。
5. 增加 Rust / TypeScript / Vitest 自动化 guard，覆盖非 macOS、kill switch、ordinary workflow 不触发 diagnostics。
6. 补齐 macOS 手测矩阵，重点确认 current third-party host 不再出现系统 crash report。

Rollback:

- 关闭 host-contract feature flag 或移除 CTA，系统回退到 Phase 2 diagnostics-only。
- 保留 discovery/status 与 `host_incompatible` 分类，不影响其他主流程。

## Open Questions

- 官方 Codex App 是否暴露稳定、可调用、非私有的 handoff endpoint。
- `SkyComputerUseClient` 的 parent contract 是 code-signing requirement、entitlement、LaunchServices parent relationship，还是运行时自检。
- `spctl` / `codesign` evidence 是否足够判断 `requires_official_parent`，或只能给出辅助证据。
- Phase 3 是否应该等待官方 public API，而不是继续本地 helper bridge。
