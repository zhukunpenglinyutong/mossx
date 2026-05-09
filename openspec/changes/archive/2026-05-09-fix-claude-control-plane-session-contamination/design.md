## Context

当前 Codex app-server 启动链路存在跨引擎边界漏洞：`resolve_codex_binary()` 在找不到 Codex 时会 fallback 到 Claude CLI，而后续仍按 Codex app-server 协议追加 `developer_instructions` / `app-server` 并发送 JSON-RPC `initialize`。当用户环境缺真实 Codex、custom Codex binary 指向 Claude、PATH 被代理包装，或 Windows wrapper / 代理组合改变命令解析时，Codex 控制面 payload 可能进入 Claude transcript。

这个问题的用户表现是自动生成 `app-server`、`developer` 会话，或者历史打开后空白。空白不是根因，而是 Claude history 中混入非对话 payload 后，后端 scanner 与前端 loader 继续把污染数据投射为会话和消息。

触发面不是单一平台问题。macOS/Linux 在 direct binary 路径下也可能因配置或 PATH 劫持触发；Windows 因 `.cmd/.bat` wrapper、用户本地安装目录和代理工具更容易暴露。设计必须把平台差异限制在 binary resolution / wrapper launch 层，核心身份校验和历史消毒跨平台一致。

## Goals / Non-Goals

**Goals:**

- Codex app-server launch path 只能接受真实 Codex app-server capable CLI。
- 移除 Codex 到 Claude 的 fallback，避免新增污染。
- 保留既有 Windows Codex wrapper compatibility，但将其限定在真实 Codex wrapper 上。
- Claude history 后端和前端都能识别并过滤 Codex / GUI control-plane payload。
- 为 Win/mac 边界、环境触发条件和 CI 门禁建立可测试 contract。

**Non-Goals:**

- 不删除用户本地 Claude JSONL 文件。
- 不重构所有 engine manager 或 workspace session 架构。
- 不改变 Claude Code 正常发送路径和权限模式。
- 不把 Windows wrapper 兼容逻辑扩展成通用静默 fallback。
- 不新增用户配置开关来掩盖污染，修复应默认生效。

## Decisions

### Decision 1: Codex launch resolution must fail closed

Codex binary resolution 不再 fallback 到 `claude`。无 custom bin 时只解析 `codex`；找不到时返回 Codex-specific missing error。custom bin 存在时必须进一步验证 app-server capability，不能只看该程序能否启动或返回版本。

替代方案是保留 fallback 但在之后检测进程名。这个方案脆弱，因为代理和 wrapper 可能隐藏真实目标，且污染已经发生在启动参数/JSON-RPC 发送阶段。fail closed 更符合跨引擎隔离原则。

### Decision 2: Capability gate uses Codex app-server behavior, not version text

Codex session spawn 前必须验证 `app-server` capability。最低要求是 probe `codex app-server --help` 成功；若使用 custom bin，必须对 custom bin 执行同等 probe。`--version` 只能作为诊断信息，不是身份门禁。

替代方案是解析 `--version` 是否包含 `codex-cli`。这对未来版本、wrapper 输出、本地代理并不稳定，容易误判。app-server capability 是真实 runtime 所需能力，因此作为主 gate。

### Decision 3: Platform-specific launch compatibility stays below a platform-neutral identity gate

平台矩阵如下：

| Platform / Binary | 允许行为 | 禁止行为 |
|---|---|---|
| macOS/Linux direct `codex` | 通过 app-server probe 后启动 | 因找到 `claude` 而代替 Codex |
| Windows direct `codex.exe` | 通过 app-server probe 后启动 | 绕过 capability gate |
| Windows `.cmd/.bat` Codex wrapper | 通过 app-server probe 后使用既有 wrapper fallback | 把 Claude wrapper 或代理当 Codex wrapper |
| custom binary | 必须通过 app-server probe | 只因 `--version` 成功而接受 |

Windows wrapper retry 继续只处理真实 Codex wrapper 的参数/console 兼容问题。它不是 engine fallback，不能把错误 CLI 转成可用状态。

### Decision 4: Control-plane contamination detection is shared by scanner and loader

后端 Claude history scanner 与前端 Claude loader 都需要同一类 predicate：识别 JSON-RPC `initialize`、`clientInfo.name/title=ccgui`、`capabilities.experimentalApi`、`developer_instructions`、纯 `app-server` 启动参数、以及明显的 Codex app-server control-plane payload。

后端负责 session list 和 loaded messages 的权威过滤；前端兜底负责 legacy payload、remote bridge、cached data 或旧后端返回的污染消息。两层实现可以在语言上分别维护，但测试用例必须覆盖同一组污染样本，减少 drift。

### Decision 5: Boundary classification is diagnostics plus tests, not a user-facing guess

本问题归类为“共性架构风险，特殊环境触发”。实现层要把触发条件固化为门禁和测试：

- 缺真实 Codex：Codex launch fail closed。
- custom bin 指向 Claude：app-server capability gate 失败。
- PATH/代理劫持：如果不能通过 app-server probe，失败；如果代理真实支持 Codex app-server，则按 Codex 处理。
- 已污染 Claude history：后端和前端过滤，不删除原文件。

用户界面不需要复杂分类标签，但错误信息必须可读，便于 issue 反馈时判断属于安装缺失、配置错配、代理劫持还是历史污染。

### Decision 6: CI gate focuses on regression hotspots

本 change 的门禁不追求全量耗时 CI 扩张，而是把 regression hotspots 纳入 focused tests：

- Rust: Codex binary resolution 不 fallback 到 Claude；custom bin 必须 app-server capable；control-plane-only Claude JSONL 不生成 session；混合 transcript 保留真实消息。
- TypeScript: Claude history loader 跳过 control-plane user message；混合消息只过滤污染；正常消息不受影响。
- OpenSpec: `openspec validate --change fix-claude-control-plane-session-contamination --strict` 必须通过。

若仓库已有脚本覆盖这些测试，优先复用；否则使用 focused test commands 作为 PR / release checklist。

## Risks / Trade-offs

- [Risk] 部分用户过去依赖“没装 Codex 但装了 Claude 也能进入 Codex UI”的宽松行为。  
  Mitigation: 这是错误 fallback，会导致数据污染；改为明确错误并提示安装真实 Codex。

- [Risk] 代理工具如果既包装 Claude 又包装 Codex，capability probe 可能揭示更多环境问题。  
  Mitigation: 只要求代理真实支持 `codex app-server --help`；不按名称猜测代理内部实现。

- [Risk] 历史污染识别过宽可能误过滤用户真实输入。  
  Mitigation: predicate 使用高置信信号组合，不因普通文本包含单词 `app-server` 就过滤；测试覆盖正常消息。

- [Risk] 前后端过滤规则 drift。  
  Mitigation: 同步维护样本矩阵，并在 Rust/Vitest 中覆盖相同语义样本。

## Migration Plan

1. 更新 Codex CLI resolution：移除 Claude fallback，错误文案改成 Codex-specific。
2. 在 Codex spawn 前启用 app-server capability gate，custom/global binary 同等处理。
3. 保留 Windows wrapper compatibility retry，但确保它只能在 Codex capability gate 之后处理真实 Codex launch。
4. 增加 Claude history contamination predicate，并接入 scan/load 两条后端路径。
5. 增加前端 loader contamination predicate，作为兜底。
6. 增加 focused Rust/Vitest tests 和 OpenSpec strict validation。

Rollback 策略：若 capability gate 误伤真实 Codex，可先放宽 probe 实现但不能恢复 Claude fallback；历史过滤可通过收窄 predicate 样本修正，不需要数据迁移。

## Open Questions

- 是否需要在设置 UI 中为 Codex custom binary 增加即时 doctor 反馈？本 change 不新增 UI，但保留后续改进空间。
- 是否要把污染 predicate 抽成跨语言 golden fixtures？本 change 用 Rust/Vitest 对齐样本，后续可再抽 fixtures。
