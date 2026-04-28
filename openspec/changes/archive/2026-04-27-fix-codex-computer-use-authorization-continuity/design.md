## Context

当前 `Computer Use` broker 已经不再 direct exec 官方 helper，而是走 `codex exec --json`。这条链路在能力层面已经成立，但授权链路没有被稳定建模：

- `2026-04-24` 同机实测里，终端直接执行 `codex exec` 成功跑通 `computer-use.list_apps`。
- 同日，当前 host 触发的 `computer-use.list_apps` 返回 `Apple event error -10000: Sender process is not authenticated`。
- 同日已有本地 session 也出现相同错误，说明这不是一次偶发 UI 问题。

静态证据显示当前客户端存在多个可能的 launcher identity：

- `/Applications/ccgui.app/Contents/MacOS/cc-gui`
  - identifier=`com.zhukunpenglinyutong.ccgui`
  - TeamIdentifier=`RLHBM56QRH`
- `/Applications/ccgui.app/Contents/MacOS/cc_gui_daemon`
  - identifier=`cc_gui_daemon`
  - `Info.plist=not bound`
  - TeamIdentifier=`RLHBM56QRH`
- `target/debug/cc-gui`
  - 开发态调试二进制

这意味着用户在 System Settings 里“看起来授权了 ccgui”，并不等于实际发起 Codex CLI / Computer Use 的 sender 一定还是同一个 host。只要 launcher identity 在主 App、daemon、debug binary、旧签名构建之间漂移，用户就会看到“权限明明开了，客户端还是没权限”。

同时，当前代码库里已经存在 `host contract diagnostics` 与 `ManualPermissionRequired` 诊断路径；continuity 修复不能另起一套平行 verdict，而必须建立在现有 diagnostics contract 之上，避免 backend / frontend / copy 三层各说各话。

## Goals / Non-Goals

**Goals:**

- 明确建模并暴露当前 broker launcher identity。
- 记录并对比 last successful authorization host，识别 continuity drift。
- 让 broker 在 `Sender process is not authenticated` 场景下返回结构化 continuity verdict，而不是只落到 generic permission failure。
- 让 local packaged app 成为单一可信 launcher；无法保证 continuity 的 launcher 必须被显式阻塞。

**Non-Goals:**

- 不绕过 macOS TCC / Automation / Accessibility / Screen Recording。
- 不修改官方 Codex runtime / plugin / helper。
- 不在本期解决 remote backend 的完整 Computer Use 支持。
- 不把问题退化成“请用户手动去 Terminal 执行”。

## Decisions

### 0. Continuity layer 扩展现有 host-contract diagnostics，而不是平行重建

本期不新造一套完全独立的诊断域模型。continuity 必须直接扩展现有：

- `ComputerUseHostContractDiagnosticsKind`
- `ComputerUseHostContractEvidence`
- broker failure classification / status card verdict

原因：

- 当前 UI 已经消费 host-contract diagnostics；
- 当前 backend 已有 helper / current host / official parent handoff 证据结构；
- 若 continuity 另起炉灶，用户会同时看到两套“permission / handoff / host”解释，形成新的熵增。

### 1. 引入 `authorization continuity snapshot`

新增一层 machine-local snapshot，至少包含：

- launcher display name
- executable path
- bundle id 或 executable identifier
- team id
- backend mode（embedded local / local daemon / remote daemon）
- host role（foreground app / backend process / daemon / debug binary / unknown）
- launch mode（packaged app / daemon / debug / unknown）
- codesign / spctl summary（至少保留能识别 signing drift 的摘要）
- capturedAt

这个 snapshot 在两个时机被使用：

- broker preflight：解析“这次真正要从哪个 host 拉起 Codex CLI”
- broker success：记录 last successful host，作为后续 continuity 对比基线

选择这个方案而不是继续只看 `permission_required`，原因很简单：今天的实测已经证明问题不是“有没有权限提示”，而是“**到底是谁在发 Apple Events**”。

### 2. current authorization host 必须是“实际执行 broker 的宿主”，不能只看前台 app

设计上要求 current authorization host 指向 **当前 backend mode 下真正执行 `codex exec` 的进程上下文**。这意味着：

- embedded local app mode：若 broker 确认由 packaged app 进程发起，则以该进程作为稳定 host；
- local daemon mode：若 broker 实际跑在 daemon 中，则 host snapshot 必须显式标记 daemon role，而不是继续展示 GUI app 名称；
- remote daemon mode：必须显式暴露 remote / daemon host 语义；若 continuity contract 不成立，直接 blocked。

这样做是为了避免一个伪修复：前端展示“ccgui 已授权”，但真正发 Apple Events 的仍然是另一个 backend process。

### 3. stable authorization host 必须是 backend-mode aware 的
本期设计优先把 `embedded local app mode` 的 packaged host 视为稳定目标；但不会未经验证地把所有 daemon path 都归为非法。local broker 不能在这些身份间来回切换：

- `cc-gui` 主 App
- `cc_gui_daemon`
- `target/debug/cc-gui`
- 旧签名 / ad-hoc build

如果当前上下文无法保证 broker 从 stable host 发起，就直接 blocked，而不是继续试运行。

为什么不继续允许“谁能跑就谁跑”：

- 这会让 TCC 授权主体变成 moving target；
- 用户即使打开了权限，也不知道该重启 / 重置哪个 host；
- 每次构建、签名变化或进程切换都可能重新引入假阳性“权限已开”。

### 4. `Sender process is not authenticated` 不再等同于 generic permission missing

设计上新增 continuity-aware classification：

- 当错误为 `Apple event error -10000` / `Sender process is not authenticated`
- 且 current host 与 last successful host / expected stable host 不一致
- 则判为 `authorization continuity blocked`

只有在 current host 与 expected host 一致时，才继续归为 generic `permission_required` / `approval_required`。

这能避免当前 UI 的误导：用户反复勾 Accessibility，但实际需要的是重新授权 exact host，或者重启到正确 launcher。

### 5. surface 必须展示 exact host remediation

Computer Use surface 增加专门的 authorization panel，向用户明确展示：

- 当前实际 launcher 是谁
- 上一次成功的是谁
- 它们是否发生漂移
- 需要重新授权 / 重启 / 清理的是哪个 host
- 当前 backend mode / host role 是什么
- 当前签名摘要是否与上次成功值一致

为什么不只给一句“请打开 Accessibility”：

- 因为终端链路已经证明同机不是所有 host 都失败；
- generic guidance 会掩盖真正的 sender mismatch；
- 修复这类问题最重要的是 **naming the exact host**。

### 6. 先不采用 external host handoff

备选方案是把 broker 交给 Terminal / 官方 Codex App 再拉起。但本期不采用，原因：

- 会引入额外窗口、副作用与调度复杂度；
- 把客户端能力退化成外部 handoff；
- 不能替代客户端自身需要建立的 continuity contract。

如果后续证明 macOS 只允许某类宿主稳定承载 Computer Use，再另开 proposal 讨论 external host handoff。

## Risks / Trade-offs

- [Risk] 无法直接读取 TCC 数据库，导致 continuity 判断不能依赖系统真值。
  → Mitigation: 以 launcher snapshot + runtime error + last successful host 三者联合建模，不依赖读写 TCC.db。

- [Risk] `cc_gui_daemon` 与 `cc-gui` 在不同 backend mode 下可能都被使用，短期会扩大边界判定复杂度。
  → Mitigation: 本期先把 broker host 解析变成 backend-mode-aware；仅对 continuity 无法证明的 daemon path 明确 blocked。

- [Risk] 如果 snapshot 只记录 GUI launcher，而没有记录真实 broker execution host，会把 continuity drift 误判成 generic permission issue，或者反过来。
  → Mitigation: snapshot contract 强制包含 backend mode、host role、codesign / spctl summary，并要求 exact broker execution host 优先。

- [Risk] 首次上线 continuity contract 后，部分已授权用户会被要求重新授权 exact host。
  → Mitigation: 在 migration 中显式提示“签名/host 已变化，需要对当前 launcher 完成一次性重授权或重启”。

- [Risk] `Apple event error -10000` 在不同 macOS 版本上可能既包含 sender mismatch，也包含更一般的 Automation 拒绝。
  → Mitigation: 保留 fallback，把“host matched but still denied”继续分类为 generic permission issue。

## Migration Plan

1. 后端在现有 host-contract diagnostics 上扩展 authorization host snapshot 与 last successful host persistence。
2. broker 在 preflight 中统一解析 current authorization host，并以实际 broker execution host 为准。
3. 若当前 host 不满足 stable contract，则直接 blocked，不再盲跑 `codex exec`。
4. UI 升级为 continuity-aware surface，展示 exact host、backend mode、host role 与 remediation。
5. 首次发布该修复时，若检测到旧的成功记录来自 ad-hoc / debug / drifted host，则清空 continuity cache，并提示用户对当前 exact host 重新授权。

**Rollback:**

- 若 continuity layer 误伤过多，可以回退到当前 broker gate，但保留新的 diagnostics 输出；
- 不回退到 direct helper / unsupported workaround。

## Open Questions

- local installed app 的 broker 当前是否始终从 `cc-gui` 主进程发起，还是某些模式会切到 `cc_gui_daemon` / sidecar path？
- `last successful host` 是否需要按 app install / signing requirement version 分桶，而不是单一全局值？
- remote backend / web service 模式是否应该在本期直接 hard-disable Computer Use broker，直到 continuity contract 单独补齐？
