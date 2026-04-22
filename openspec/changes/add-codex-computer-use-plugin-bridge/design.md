# Design: Codex Computer Use Plugin Bridge

## Context

当前客户端已经能读取和编辑 `~/.codex/config.toml`，也能展示部分 MCP 相关状态，但它还不是 Codex 官方意义上的 plugin host。根据已完成的本机核对，官方 `Computer Use` 不是单纯一段 MCP 配置，而是一条完整链路：

- bundled marketplace
- `computer-use@openai-bundled` plugin manifest
- native helper / helper app
- `Screen Recording` / `Accessibility` 等系统权限
- 按 app 的 approvals 与使用约束

因此，本次设计的目标不是“在客户端里复刻一套 Computer Use runtime”，而是引入一个**独立、可插拔、最小侵入**的 bridge module，在用户本机已经安装官方 Codex App 且已启用官方 plugin 的前提下，尽可能安全地复用这项能力。

平台边界必须提前讲清楚：截至 2026-04-16 的官方公开说明，`Computer Use` 仍是 `macOS` 优先能力，`Windows` 不应被描述为“即将支持”或“只差接线”。所以设计上必须物理拆分 `macOS` / `Windows` adapter，并让 `Windows` 走显式 unsupported contract，而不是在主链路里塞平台判断。

## Goals / Non-Goals

**Goals**

- 通过独立模块桥接本机已安装的官方 `Computer Use` plugin。
- 保持最小侵入：对现有聊天、线程、MCP、设置、工作区链路只做必要接线。
- 采用可插拔、默认惰性加载的方式，未触发功能时不改变现有行为。
- 在 `macOS` 上提供可检测、可解释、可受控桥接的路径。
- 在 `Windows` 上提供独立 adapter，并明确返回 unsupported。
- 用统一状态模型表达 `ready / blocked / unavailable / unsupported` 与 blocked reason。

**Non-Goals**

- 不复制、反编译、重签名、重打包或重新分发 OpenAI 官方 helper。
- 不在当前客户端中重做 GUI automation / accessibility engine。
- 不在本期实现通用 plugin marketplace 或 plugin installer。
- 不在本期承诺 `Windows` 端存在可工作的 `Computer Use` runtime。
- 不在本期修改现有 Codex 消息协议、approval 主链或 MCP 基础模型。

## Decisions

### Decision 1: 采用“官方 plugin bridge”，不复刻 proprietary helper

**Decision**

- Phase 1 只桥接用户本机已经安装的官方 `computer-use@openai-bundled`。
- 系统只做探测、状态归一、最小桥接与显式调用门禁。

**Why**

- 这条路径最符合“完全独立模块、最小侵入、可插拔”的约束。
- 自研 helper 会把问题升级成权限、签名、系统集成、合规与跨平台工程，超出当前目标。

**Implementation shape**

- 读取 `~/.codex/config.toml` 中的 marketplace/plugin 启用状态。
- 解析本机官方 plugin cache / manifest / helper 路径。
- 对 helper 只做存在性与可桥接性判断，不做复制与重打包。

### Decision 2: 模块边界前后端双层隔离，只做 additive integration

**Decision**

- 核心逻辑收敛到新增模块，不把桥接代码散落进现有 Codex/MCP/Settings 主链。

**Why**

- 该能力天然高风险，必须让接入点少、回退点清晰、故障域可控。

**Implementation shape**

- Frontend:
  - `src/features/computer-use/**`
  - `src/services/tauri/computerUse.ts`
- Backend:
  - `src-tauri/src/computer_use/**`
  - additive command registration in `src-tauri/src/command_registry.rs`
- 现有稳定模块仅允许挂载入口、状态卡片、i18n 文案和必要 command 接线。

### Decision 3: `macOS` / `Windows` adapter 物理拆分，不共享 runtime 路径

**Decision**

- 通过独立 platform adapter 封装差异，而不是在统一实现里内联平台分支。

**Why**

- 当前只有 `macOS` 存在官方 Computer Use 路径，`Windows` 需要明确 unsupported contract。
- 物理拆分可以避免未来平台逻辑互相污染，也便于官方能力变化时单独替换。

**Implementation shape**

- `platform/macos.rs` 负责：
  - 官方 Codex app / plugin / cache / helper 探测
  - 平台可用性与 blocked reason 解析
- `platform/windows.rs` 负责：
  - 统一返回 unsupported
  - 不尝试解析 `macOS` helper 路径

### Decision 4: Phase 1 采用“只读发现 + 显式调用”模式，不接管官方 plugin lifecycle

**Decision**

- Phase 1 不实现安装、卸载、启用、禁用官方 plugin 的完整生命周期。
- 默认只消费本机真值并暴露状态，不在普通设置保存时写回官方 plugin 状态。

**Why**

- 当前目标是 bridge，不是替代官方 Codex App 的 plugin host。
- lifecycle 一旦接管，就会把桥接问题升级成 marketplace / installer / auth flow 问题。

**Implementation shape**

- 读取官方配置与 cache 信息时使用只读路径。
- 若缺少 plugin / helper / host 前提，只返回 `unavailable` 或 `blocked`。
- 后续若要支持显式“跳转到官方安装/启用入口”，也应走独立 action lane。

### Decision 5: 统一 availability 状态模型，前后端共享 blocked reason 语义

**Decision**

- 系统统一输出以下状态：
  - `ready`
  - `blocked`
  - `unavailable`
  - `unsupported`

**Why**

- 该能力的失败不只有一种原因，UI 不能把“没安装”“没启用”“平台不支持”“helper 不可桥接”混成一个灰色状态。

**Implementation shape**

- 后端返回结构化状态对象，至少包含：
  - `status`
  - `platform`
  - `pluginDetected`
  - `pluginEnabled`
  - `codexAppDetected`
  - `blockedReasons[]`
  - `guidance`
- 前端只消费结构化结果，不自己拼平台或配置推断。

**Phase 1 minimum blocked reason set**

- `platform_unsupported`
- `codex_app_missing`
- `plugin_missing`
- `plugin_disabled`
- `helper_missing`
- `helper_bridge_unverified`
- `permission_required`
- `approval_required`
- `unknown_prerequisite`

**Status precedence**

1. `unsupported`
   - 仅用于平台 contract 不支持，例如当前 `Windows`
2. `unavailable`
   - 用于宿主或 plugin 根本不存在，例如 `codex_app_missing`、`plugin_missing`
3. `blocked`
   - 用于宿主存在但前置条件未满足，例如 `plugin_disabled`、`helper_missing`、`permission_required`
4. `ready`
   - 仅当 Phase 1 已知前置条件都满足，且不存在任何 blocked reason 时才允许返回

补充约束：

- `plugin_disabled` 在 Phase 1 中归类为 `blocked`，而不是 `unavailable`
- 只要存在 `permission_required`、`approval_required` 或 `helper_bridge_unverified`，系统 MUST NOT 返回 `ready`
- `unknown_prerequisite` 只能在确有未归类阻塞时兜底使用，不能替代已知 reason

### Decision 6: bridge 采用惰性激活与 kill switch，默认不进入主流程

**Decision**

- 功能只有在用户显式进入 `Computer Use` 面板或未来显式触发相关动作时才初始化。
- 同时保留整块 kill switch，在回归时可以完全关闭。

**Why**

- 这是一个对宿主环境、系统权限、官方插件布局都敏感的能力，必须让默认路径保持干净。

**Implementation shape**

- feature flag 关闭时：
  - 不加载 bridge 模块
  - 不展示误导性“可用”状态
- 未访问 `Computer Use` 入口时：
  - 不做 helper 探测
  - 不影响现有聊天、MCP、线程与设置保存

### Decision 7: capability surface 先做“可见真相”，再考虑真正执行桥

**Decision**

- Phase 1 的优先级顺序是：
  1. 准确发现本机状态
  2. 准确表达 blocked / unsupported / unavailable
  3. 只有在官方 helper 可桥接时才开放下一步执行入口

**Why**

- 当前最大的产品风险不是“少了一个按钮”，而是“把不可用状态假装成可用”。
- 先把真值表达清楚，后续无论是仅做状态桥，还是逐步打通调用桥，演进成本都更低。

**Implementation shape**

- Availability surface 与 runtime bridge 解耦。
- 即使执行桥暂时不可用，只要状态检测准确，整个模块仍然有可交付价值。

### Decision 8: Phase 1 明确定义为 status-only bridge，不把 invoke 混入本期范围

**Decision**

- Phase 1 只交付：
  - discovery
  - availability status model
  - platform adapters
  - settings/status surface
- Phase 1 不把 helper invoke / activation bridge 作为交付项。

**Why**

- 当前 helper 是否能被第三方宿主稳定桥接仍存在不确定性。
- 如果不先把状态桥与执行桥拆开，整个需求会在“要不要先点起来”上反复横跳。

**Implementation shape**

- 即使 UI 中保留 future activation lane 的设计余地，本期也不得把它实现成真实可点击执行桥。
- 若未来验证通过 helper bridge，可在后续 change 中单独补 activation contract。

## Risks / Trade-offs

- [Risk] 官方 helper 可能存在宿主绑定或父进程约束，导致第三方宿主无法稳定拉起。
  - Mitigation: Phase 1 先把状态桥与执行桥分离；若 helper 不可桥接，也必须准确返回 blocked。

- [Risk] 官方 plugin cache / manifest / app bundle 布局可能随版本变化。
  - Mitigation: 读取路径时优先依据 manifest / config / marketplace 真值，不把单一路径硬编码成唯一契约。

- [Risk] `macOS` 权限与 app approvals 可能无法完全从当前宿主读到真值。
  - Mitigation: 将这类缺失归入 blocked guidance，而不是伪装成 ready。

- [Risk] 用户可能把 `Windows` unsupported 理解成“实现不完整”。
  - Mitigation: UI 和 spec 都明确写明当前平台 contract 是 unsupported，而不是 pending。

- [Trade-off] 只读 bridge 牺牲了“一键安装/启用”的完整体验。
  - 这是有意取舍。当前目标是最小侵入接入，而不是做一套新的 plugin lifecycle。

## Validation Matrix

- 未安装 Codex App 时，系统返回 `unavailable`，且现有功能不受影响。
- 安装 Codex App 但未安装或未启用 `computer-use@openai-bundled` 时，系统返回 `unavailable` 或 `blocked`，并提供明确 guidance。
- `macOS` 上检测到官方 plugin 且前置条件满足时，系统返回 `ready`。
- `macOS` 上若只检测到 plugin 存在，但 helper bridge 可用性、权限或 approvals 仍未确认，系统必须返回 `blocked`，不得抢跑为 `ready`。
- `Windows` 上无论本机是否存在相关路径，系统都必须走 `unsupported` adapter。
- feature flag 关闭时，现有聊天、MCP、设置保存、工作区主流程保持不变。
- 所有官方 helper / bundle / cache 交互必须保持只读，不得复制或重打包资产。
