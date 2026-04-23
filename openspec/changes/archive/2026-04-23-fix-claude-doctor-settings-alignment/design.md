## Context

当前分支已经具备一部分 Claude CLI 相关底座，但能力停在“backend 局部可用”阶段，尚未形成完整的 cross-layer contract：

- Rust `AppSettings` 已包含 `claude_bin`，并已被引擎选择与 Claude 安装探测消费。
- frontend `AppSettings` 仍未暴露 `claudeBin`，settings 无法稳定读写该字段。
- settings hook / controller / app shell 当前只对外暴露 `codex_doctor` 链路，没有 `claude_doctor` wiring。
- daemon 入口尚未执行 `fix_path_env::fix()`，因此 GUI app 与 daemon 可能基于不同的 `PATH` 视图诊断 Claude CLI。
- `detect_claude_status()` 仍只依赖 `--version`，没有沿用当前项目已经用于 Codex 的 `--help` fallback 兼容语义。

这意味着当前问题不是单一 UI 缺按钮，而是：

```text
Settings UI
  -> useAppSettings / controller
  -> src/services/tauri.ts
  -> Tauri command registry
  -> Rust doctor / detection helpers
  -> daemon/app PATH bootstrap
```

这条链路中有多处断点。  
因此本 change 需要先把“同一份 Claude CLI settings / doctor 事实”在 frontend、Tauri command、backend detection 与 daemon env bootstrap 间收口，再进入实现阶段。

同时，本 change 明确不直接采纳上游 PR #402 的代码组织。当前分支的 settings/runtime 结构已经演进到不同形态，最稳的方案是保留当前分支结构，只迁移上游已经验证过的修复意图。

## Goals / Non-Goals

**Goals:**

- 在当前分支的 settings surface 内将独立 `Codex` 页面升级为统一的 `CLI 验证` 面板，并以 `Codex / Claude Code` tabs 承载不同 CLI 的设置与 doctor。
- 将 execution transport 相关配置从 `Codex` tab 中抬升为 shared execution backend 区块，明确它同时服务 Codex 与 Claude runtime。
- 在 `Claude Code` tab 内补齐默认 `Claude CLI` 路径编辑与 `Run Claude Doctor` 入口。
- 通过独立的 `claude_doctor` command 暴露结构化诊断结果，并走现有 `service -> hook -> controller -> settings` 链路。
- 让 app 与 daemon 在 Claude CLI 的 `PATH` 恢复、binary resolution 与 reachability 判断上保持一致语义。
- 让 remote backend 下的 engine / doctor / Claude history 关键命令具备 forwarding parity，而不是继续停在 Codex-only remote mode。
- 为 `detect_claude_status()` 增加与现有 Codex 同级的 fallback 兼容策略，降低 wrapper / shell 环境导致的误判。
- 让显式传入的 `codexBin` / `claudeBin` 只影响对应 CLI 的探测与 debug 信息，避免 doctor 结果出现跨 CLI 污染。
- 保持现有 Codex doctor、会话模型、settings 架构与 storage contract 稳定。

**Non-Goals:**

- 不重构整个 settings 页面，也不把所有引擎统一抽象成无限扩展的通用 doctor center。
- 不把 Claude 配置迁移到 vendor settings / provider settings 新入口。
- 不引入新的持久化 schema、数据库迁移或 session/runtime payload schema 变更。
- 不修改 Claude 会话执行链路、shared session dispatch、历史会话模型或 provider/auth 体系。
- 不以本次修复为契机直接 merge / cherry-pick 上游 PR #402。
- 不在本次 change 中把 desktop app 的整个 `AppSettings` 改成 remote-daemon-synced settings model。
- 不在本次 change 中修复 `defaultAccessMode` 的历史行为债务；它不是 shared execution backend parity 的 blocker。

## Decisions

### Decision 1: 将 `Codex` 入口升级为统一 `CLI 验证` 面板，并在面板内使用 `Codex / Claude Code` tabs

**Decision**

- 将当前左侧导航中的 `Codex` 入口文案调整为 `CLI 验证`。
- 保持单一导航入口，不新增独立的 Claude 页面。
- 在现有 `SettingsView -> CodexSection` 这条 UI 链路内收口为 tabbed surface：
  - shared execution backend 区块：承载 `backendMode / remoteBackendHost / remoteBackendToken`
  - `Codex` tab：承载现有 Codex path / args / doctor
  - `Claude Code` tab：承载 `claudeBin` path editor、`Run Claude Doctor` 与结果展示

**Why**

- 当前分支现有 doctor、path、debug metadata 都已经集中在 settings 的 CLI 配置区块。
- 既然本次要从单一 Codex surface 扩展到至少两个 CLI，就不应该继续保留误导性的 `Codex` 入口文案。
- 单一 `CLI 验证` 导航 + shared execution backend + 面板内 tabs，既能避免左侧导航继续膨胀，也能把 transport/runtime 与 CLI path/doctor 的边界讲清楚。

**Alternatives considered**

- 左侧导航继续保留单独 `Codex` 页面，只在内部追加 Claude 区块：会导致文案与实际职责不一致。
- 左侧导航拆成 `Codex` / `Claude Code` 两个入口：对当前阶段过重，也会稀释“CLI 验证”这一功能归类。
- 新建 Claude vendor settings panel：结构更“纯”，但超出本 change 的需求边界。

### Decision 2: Frontend 以 additive 方式补齐 `claudeBin` 与 `runClaudeDoctor`，不重写 settings state model

**Decision**

- 在 frontend `AppSettings` 中新增 `claudeBin: string | null`。
- 在 `defaultSettings`、`normalizeAppSettings()`、`getAppSettings()/updateAppSettings()` 消费链路中补齐 `claudeBin`。
- 在 `src/services/tauri.ts` 新增 `runClaudeDoctor()`。
- 在 `useAppSettings`、`useAppSettingsController`、`AppShell` / `renderAppShell` 中按现有模式透传 `claudeDoctor`。

**Why**

- 当前分支的 settings 保存逻辑已经以 `AppSettings` 整体对象为主，且页面大多通过 `...appSettings` 方式保留未知字段。
- additive 扩展能最大程度复用现有保存与回读行为，不需要引入新的 reducer、form model 或 settings 子 store。
- `claudeBin` 在 Rust 侧已存在，frontend 补齐后能够立即与现有持久化 schema 对齐。

**Alternatives considered**

- 单独引入 `ClaudeSettingsDraft`：局部更清晰，但会制造第二套真值来源。
- 重做 settings 状态管理：收益远低于代价。

### Decision 3: `claude_doctor` 使用独立 backend command，但复用现有 debug / resolution building blocks

**Decision**

- 在 backend 暴露独立的 `claude_doctor` command，并注册到 Tauri command registry。
- `claude_doctor` 的解析优先级为：
  - 显式传入 `claude_bin`
  - app settings 中的 `claude_bin`
  - `PATH` 查找
- 该 command 复用现有 helper 能力：
  - `build_codex_path_env`
  - `get_cli_debug_info`
  - binary resolution helper
  - wrapper classification helper

**Why**

- spec 已明确要求 `claude_doctor` 不能伪装成 `codex_doctor` 的变体。
- 但完全从零实现 Claude doctor 会造成重复逻辑，尤其是 debug metadata、PATH snapshot、wrapper 分类与 command resolution 这些已有成熟实现的部分。
- 独立 command + 共享 helper 是最合理的边界：行为对外独立，底层机制对内复用。

**Alternatives considered**

- 在 `codex_doctor` 中加 `engine` 参数：会让现有 Codex contract 变模糊，不利于现有调用方稳定。
- 让 frontend 直接组合多个 command 结果：会把 cross-layer contract 拆散，调试成本更高。

补充约束：

- `get_cli_debug_info()` 与 binary lookup 在接收显式 custom bin 时，必须只把同名 CLI 的配置用于对应检查。
- `codexBin=/custom/codex` 不得导致 Claude debug 输出也错误地宣称找到了同一路径，反之亦然。

### Decision 4: execution backend parity 通过 shared transport surface + remote forwarding + app/daemon 一致 env bootstrap 一起解决

**Decision**

- daemon 入口与主 app 一样执行 `fix_path_env::fix()`。
- Claude detection / doctor 所依赖的 `PATH` 语义以 shared helper 输出为准，而不是在 daemon 内手写特判。
- `backendMode = remote` 时，frontend 触发的 engine / doctor / Claude history 关键命令统一 forward 到 daemon。
- daemon 补齐缺失的 Claude / Gemini history action 与 doctor handler，而不是继续只实现部分 engine RPC。

**Why**

- 当前问题的根因之一是 app 与 daemon 进程入口不一致，导致 shell PATH 解析面不同。
- 用同一套 env bootstrap 统一语义，比在 doctor 结果上“解释差异”更可靠。
- 主 app 已经证明 `fix_path_env::fix()` 是当前桌面环境下的可接受做法，daemon 沿用同一策略风险最低。
- 仅仅把 UI 文案改成 shared，并不能解决 remote mode 下 “Codex 走 daemon、Claude 仍本地” 的执行割裂；必须把 engine/doctor/history 命令补齐 remote forwarding。
- 这里的 history parity 不只包括 list/load，还包括 `fork_claude_session`、`delete_claude_session`、`delete_gemini_session` 这类会直接影响远端状态的写操作。

**Alternatives considered**

- 仅在 UI 中提醒 daemon 可能缺 PATH：这只是解释问题，不是修复问题。
- 为 daemon 单独加平台特判 PATH 拼接：维护成本高，且容易继续漂移。
- 在 settings 层直接 remote-forward 全量 `AppSettings` 读写：会把 transport settings 与 daemon settings 混成一份，不适合作为本次最小闭环。

### Decision 5: Claude detection 直接沿用 Codex 的 `version -> help` fallback 语义

**Decision**

- `detect_claude_status()` 在 `--version` 失败时，继续尝试 `--help`。
- 若 `--help` 成功，则：
  - 视为 Claude CLI 已安装
  - version 可回退为 `unknown`
  - 清除“未安装”语义的错误分支

**Why**

- 当前项目已经在 Codex 路径上认可了这套兼容语义，说明这不是临时 hack，而是项目接受的 detection contract。
- 本次修复目标之一就是让 Claude 与 Codex 的 CLI reachability 语义保持同等级别的鲁棒性。

**Alternatives considered**

- 保持 Claude 只认 `--version`：实现简单，但会继续保留 wrapper / shell 环境下的误判。
- 用更复杂的多阶段 probe：本期没必要，收益不明显。

### Decision 6: 结果类型 Phase 1 继续复用现有 doctor payload 结构，不在本次 rename

**Decision**

- frontend 侧 Phase 1 继续复用当前的 doctor result shape。
- 即使类型名当前仍叫 `CodexDoctorResult`，也先通过 additive 字段与 shared shape 支撑 Claude doctor，而不在本次 change 中做全量命名重构。

**Why**

- 这次 change 的核心是 contract 缺口，不是类型命名债务清理。
- 若同时重命名为 `CliDoctorResult` 或更通用的类型，会把 blast radius 扩展到更多无关调用点与测试文件。

**Alternatives considered**

- 立即重命名成通用 doctor result type：语义更准，但不属于本 change 的必要动作。

## Interaction Contract

### UI Surface Contract

```text
Settings Sidebar
  -> CLI 验证
     -> Shared execution backend
     -> Tab: Codex
     -> Tab: Claude Code
```

其中：

- shared execution backend 区块承载 `backendMode / remoteBackendHost / remoteBackendToken`。
- `Codex` tab 继续承载当前 Codex CLI 的 path / args / doctor 能力。
- `Claude Code` tab 新增 Claude CLI 的 path / doctor 能力。
- tab 切换不得导致已保存 settings 丢失或 doctor state 错绑到另一个 CLI。
- `defaultAccessMode` 不在本次变成 shared execution backend 设置项；CLI 验证面板不再把它当成 Codex-only runtime 配置展示。

### Frontend Mapping

```text
SettingsView
  -> shared execution backend controls
  -> CLI Validation panel / active tab
  -> onRunClaudeDoctor(claudeBin)
  -> useAppSettingsController.claudeDoctor
  -> useAppSettings.claudeDoctor
  -> services/tauri.runClaudeDoctor
  -> invoke("claude_doctor", { claudeBin })
```

remote mode 下新增约束：

```text
services/tauri engine/histories/doctors
  -> invoke(...)
  -> Tauri command
  -> remote_backend::call_remote(...)
  -> daemon handler
  -> daemon state / engine runtime
```

### Backend Resolution Rules

```text
explicit claudeBin
  -> app settings claude_bin
  -> PATH lookup
```

shared execution backend 规则：

```text
desktop transport settings (backendMode / remoteBackendHost / remoteBackendToken)
  -> decide local vs remote execution path
  -> DO NOT automatically rewrite daemon app settings
```

返回结果应保持与现有 doctor 调试体验对齐，至少包含：

- installed / ok
- version
- resolved binary path
- wrapper kind
- path/pathEnvUsed
- details / error text
- debug metadata

## Risks / Trade-offs

- [Risk] `CodexSection` 命名在引入 `CLI 验证` 与多 tab 后会显得过窄  
  → Mitigation: 本期允许“组件名暂未重命名、交互语义先对齐”；若实现中需要，可以顺手重命名为更中性的 CLI validation section，但不作为 blocker。

- [Risk] 复用现有 doctor result type 会留下类型命名债务  
  → Mitigation: 限制本次 change 只做 additive 扩展，不把重命名和功能修复绑在一起。

- [Risk] daemon 加入 `fix_path_env::fix()` 后，其他 CLI 的诊断结果也可能变化  
  → Mitigation: 这是期望内的对齐效果；验证时需把 Codex doctor 作为回归对照，确保不是负向回退。

- [Risk] remote mode 下 desktop app settings 与 daemon settings 不是同一份 source-of-truth，容易被误解为“保存路径就会改远端 daemon”  
  → Mitigation: 在 spec/design 中明确这是非目标；shared execution backend 只代表 transport 连接本身。

- [Risk] frontend 新增 `claudeBin` 后，若默认值与 normalize 处理不一致，可能覆盖旧设置  
  → Mitigation: 统一在 `defaultSettings` 与 `normalizeAppSettings()` 中定义 `null/trimmed` 语义，并以 focused tests 覆盖 round-trip。

## Migration Plan

1. 在 backend 侧补齐 detection parity：
   - daemon env bootstrap
   - `detect_claude_status()` fallback
   - `claude_doctor` command + registry
2. 在 frontend service / hook / controller 链路中补齐 `claudeBin` 与 `runClaudeDoctor`。
3. 在 settings UI 中将导航文案调整为 `CLI 验证`，并改造成 `Codex / Claude Code` tabs；随后把 `backendMode / remoteBackend*` 提升为 shared execution backend 区块，再在 `Claude Code` tab 中补充 Claude path editor、doctor action 与结果展示。
4. 在 Rust `engine/*` 与 daemon 中补齐 remote backend forwarding parity：
   - engine status/send/interrupt commands
   - Claude / Gemini history actions
   - `codex_doctor` / `claude_doctor`
5. 补齐 targeted regression tests：
   - settings wiring
   - doctor rendering
   - app/daemon parity 相关后端/探测测试
   - remote backend forwarding parity
   - `claudeBin` backward-compatible round-trip
6. 通过后再进入 `tasks.md`，保持实现拆分与验证顺序一致。

**Rollback**

- 若 `claude_doctor` command 或 detection fallback 不稳定，可先回退 UI 入口 wiring，保留底层 additive 字段与 helper 调整。
- 若 daemon env bootstrap 带来意外副作用，可单独回退 daemon `fix_path_env::fix()`，不影响 `claudeBin` 的持久化兼容。
- 若 remote parity 改动带来不稳定，可先回退 engine/doctor 的 remote forwarding，仅保留本地 CLI validation surface。
- 本 change 不引入新 persisted schema，因此不需要数据回滚。

## Open Questions

- `CodexSection` / `CodexDoctorResult` 的命名债务是否在未来统一为 engine-agnostic 命名：
  - 这不是当前实现 blocker。
  - 本次 change 完成后，若多引擎 doctor surface 继续扩展，再单独提案处理更合适。

- remote / web-service mode 是否需要完全等价暴露 Claude doctor：
  - 当前不作为 blocker。
  - 本次 design 默认优先保证本地桌面链路正确，再视现有 remote 体验决定是否做只读或隐藏降级。
