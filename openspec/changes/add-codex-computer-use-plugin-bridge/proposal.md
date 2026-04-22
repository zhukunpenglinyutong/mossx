## Why

当前客户端已经具备读取 `~/.codex/config.toml`、查看部分 MCP 状态、编辑全局 Codex 配置的能力，但它还不是 Codex 官方意义上的 plugin host。现状更接近“外围控制台”，而不是能安装、启用、授权、桥接 `Computer Use` 的宿主。因此用户即使本机已经装好了 Codex App，也无法在当前客户端里稳定复用这项能力。

更关键的是，`Computer Use` 的官方实现不是一段普通的 MCP 配置。根据 2026-04-16 的官方文档与本机包体核对结果，它由 bundled marketplace、plugin manifest、原生 helper app、macOS `Screen Recording` / `Accessibility` 权限、以及按应用 approvals 共同构成。最稳的方向不是重做一套 computer-use runtime，而是在当前客户端内引入一个**独立、可插拔、最小侵入**的 bridge module：优先桥接用户本机已安装的官方 `Computer Use` plugin，在 `macOS` 上先落地；`Windows` 由于官方能力当前仍未开放，必须显式走单独 adapter 和 unsupported 路径，不能把平台差异揉进主链路。

## 目标与边界

### 目标

- 以**完全独立模块**方式引入 `Codex Computer Use` bridge，不把实现逻辑散落进现有 Codex/Settings/MCP 主链路。
- 优先复用用户本机已经安装的官方 `Computer Use` plugin 与其缓存/配置状态，不复制、不重打包官方 proprietary helper。
- 在 `macOS` 上提供可检测、可显示、可解释的 bridge 能力；缺少依赖或权限时，返回清晰的 blocked reason。
- 在 `Windows` 上提供独立 adapter，并明确返回 unsupported 状态，确保当前版本不误报“支持中”。
- 整个功能默认可插拔、默认不影响现有功能：未安装 plugin、未打开该功能、未触发 bridge 的用户，其现有行为必须保持不变。
- 保持后续扩展空间：未来若官方开放 Windows 或发布正式 bridge contract，能够只替换 platform adapter，而不推翻上层 UI 和 capability contract。

### 边界

- Phase 1 只覆盖**discover / status / platform adapter / availability surface**，不追求复刻 Codex 官方完整插件市场。
- Phase 1 只桥接 `computer-use@openai-bundled`，不顺手扩展到其他插件。
- Phase 1 只要求 `macOS` 有可工作的 bridge 路径；`Windows` 仅实现明确隔离的 unsupported adapter。
- Phase 1 不改变现有 Codex thread / MCP / settings 保存语义，不在普通设置保存时隐式触发 runtime 重启。
- Phase 1 不开放真正的 helper invoke / activation bridge；只有当官方 helper 可桥接性被验证后，才进入后续 phase 讨论。
- Phase 1 不解决欧洲区、英国、瑞士等账号/区域可用性策略，只做本地客户端能力边界表达。

## 非目标

- 不复制、反编译、重签名或重新分发 OpenAI 官方 `Codex Computer Use.app` / `SkyComputerUseClient`。
- 不在当前客户端内重做一套通用 GUI automation / accessibility engine。
- 不在本期实现通用插件市场、插件安装器或远端 featured marketplace 同步。
- 不在本期承诺 `Windows` 支持 computer use。
- 不在本期改造现有 Codex runtime 的消息协议、工具注入模型或 approval 核心机制。

## What Changes

- 新增一个独立的 `Computer Use Bridge` 模块，负责：
  - 探测本机是否存在官方 Codex App 与 `computer-use@openai-bundled` plugin
  - 读取 plugin enabled 状态、cache 路径、manifest 元信息、平台可用性
  - 统一输出 `ready / blocked / unsupported / unavailable` 状态
- 新增平台适配层：
  - `macOS adapter`：解析官方 plugin cache / bundled marketplace / native helper 路径，并负责最小 bridge contract
  - `Windows adapter`：独立返回 unsupported，不允许共享 `macOS` 代码路径或假装兼容
- 新增用户可见的 `Computer Use` 状态面板或等价入口，展示：
  - 是否检测到 Codex App
  - 是否检测到 `Computer Use` plugin
  - 是否已启用
  - 当前平台是否支持
  - 缺少哪些前置条件（plugin、权限、宿主、平台）
- 新增显式调用门禁位：
  - Phase 1 仅保留 future activation lane 的门禁位定义，不开放真正 invoke
  - 未触发时不改变现有聊天、MCP、设置、工作区行为
- 新增 feature flag / kill switch，使该能力可以整块关闭，避免回归时污染主流程

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 在当前客户端中直接复刻一套 computer-use runtime，包括原生 helper、权限、automation 控制 | 可完全自控，理论上跨平台空间更大 | 范围过大，安全/合规/签名/权限成本极高，明显违背最小侵入 | 不采用 |
| B | 以独立 bridge module 复用本机已安装的官方 Codex `Computer Use` plugin，只做探测、状态、受控桥接 | 最小侵入，尊重官方 ownership boundary，适合渐进式上线 | 依赖本机 Codex 安装状态，bridge contract 受官方实现演进影响 | **采用** |
| C | 先做一个通用插件市场，再把 `Computer Use` 当作市场中的一个插件接入 | 结构更完整，长期扩展性看似更强 | 会把单一能力接入扩大为平台级重构，回归面与工期都不受控 | 本期不采用 |

采用 `B` 的原因很直接：用户当前诉求是“把官方 `Computer Use` 能力安全接进来”，不是“现在就做一个新的 Codex 宿主替代品”。bridge 模式最符合“独立模块、最小侵入、可插拔、平台分治”的要求。

## Capabilities

### New Capabilities

- `codex-computer-use-plugin-bridge`: 定义当前客户端如何探测、识别、启用并受控桥接本机官方 `Computer Use` plugin。
- `computer-use-platform-adapter`: 定义 `macOS` 与 `Windows` 的平台差异契约，确保支持路径与 unsupported 路径物理隔离。
- `computer-use-availability-surface`: 定义用户可见的状态面板、blocked reason、平台提示与最小操作入口。

### Modified Capabilities

- （无）

## 验收标准

- 在未安装 Codex App 或未启用 `computer-use@openai-bundled` 的机器上，当前客户端 MUST 保持现有功能不变，且新能力只显示 `unavailable` / `blocked`，不得影响现有 Codex 会话、MCP 面板或设置保存。
- 在 `macOS` 上，当用户本机已安装 Codex App 且 `computer-use@openai-bundled` 已启用时，系统 MUST 能正确识别 plugin 状态并展示明确的 readiness / blocked reason。
- 在 `Windows` 上，系统 MUST 使用独立 adapter 返回 `unsupported`，不得尝试加载 `macOS` helper 路径，不得伪装成“可安装但未完成”。
- Phase 1 MUST 只交付 status-only bridge：即 discovery、status model、platform adapter 与 availability surface；MUST NOT 把 helper invoke 当作本期完成条件。
- bridge 能力 MUST 以新增模块承载，对现有稳定模块仅允许最小接线改动，例如 command registration、settings/card 挂载、i18n 文案补充。
- 普通用户在不触发 `Computer Use` 功能时，现有聊天、线程、工作区、MCP、设置等主流程 MUST 与当前版本保持一致。
- Phase 1 MUST NOT 引入对官方 proprietary helper 的复制、重打包或重签名行为。
- availability contract MUST 明确状态优先级与最小 blocked reason 枚举，避免前后端各自推断。
- 质量门禁至少覆盖：
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - 受影响平台分流与 plugin detection 的 targeted tests

## Impact

- Frontend:
  - new `src/features/computer-use/**`
  - additive settings/status entry such as `src/features/settings/components/ComputerUseSection.tsx`
  - additive service facade such as `src/services/tauri/computerUse.ts`
  - minimal wiring in existing settings/sidebar surfaces
- Backend:
  - new `src-tauri/src/computer_use/**`
  - separate platform adapters such as:
    - `src-tauri/src/computer_use/platform/macos.rs`
    - `src-tauri/src/computer_use/platform/windows.rs`
  - additive command registration in `src-tauri/src/command_registry.rs`
  - limited read-only integration with existing Codex config/path helpers
- Systems / Contracts:
  - local bridge to `~/.codex/config.toml`
  - local bridge to official plugin cache / bundled marketplace metadata
  - no change to existing Codex message protocol in Phase 1
- Dependencies:
  - 优先复用现有文件读取、路径解析、Tauri IPC 与 settings 基础设施
  - Phase 1 默认不新增第三方 automation dependency
