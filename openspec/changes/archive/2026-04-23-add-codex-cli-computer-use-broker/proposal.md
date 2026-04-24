## Why

实机验证证明官方 Codex CLI 可以在同一账号与本机授权下调用 `computer-use` plugin。mossx 当前已经能识别 CLI plugin cache contract，但还没有一个安全、产品化的入口把用户意图交给官方 Codex CLI 会话执行 Computer Use。

## 目标与边界

- 目标：让当前 mossx 客户端通过官方 Codex runtime 间接使用 Computer Use。
- 目标：新增显式 Computer Use broker action，由用户输入任务，mossx 创建受控 Codex hidden thread 并回收结果。
- 目标：继续尊重官方 helper parent contract；Computer Use tool 只能由 Codex CLI/app-server 会话触发。
- 边界：mossx 不 direct exec `SkyComputerUseClient`，不伪装 OpenAI team id，不复制/重签/patch 官方 helper。
- 边界：本阶段只做 macOS；Windows 继续 unsupported。
- 边界：本阶段先返回文本结果与诊断证据，不把 Computer Use 注册成 mossx 自有 runtime tool。

## 非目标

- 不实现自研 screen capture / accessibility executor。
- 不接管官方 `computer-use` MCP server 的 stdin/stdout。
- 不绕过 macOS Screen Recording、Accessibility、App approval。
- 不做后台自动化或无用户确认的 app 操作。
- 不把任意聊天消息自动路由到 Computer Use。

## What Changes

- 新增 `codex-cli-computer-use-broker` capability，定义通过 Codex CLI/app-server hidden thread 执行 Computer Use 任务的行为契约。
- 修改 `codex-cli-computer-use-plugin-bridge`，从“只识别/验证插件缓存”推进到“可作为 broker 前置条件”。
- 修改 `computer-use-activation-lane`，明确 broker 必须在 helper bridge 已验证且仍由权限/approval 阻塞时保持禁用或给出明确阻塞。
- 后端新增 broker command：接收 workspace、用户任务、可选 model/effort，创建 Codex hidden thread，要求 Codex 使用 Computer Use 完成任务并返回结果。
- 前端 Computer Use surface 新增 broker 区块：输入任务、运行、展示结果/错误/当前阻塞原因。
- 增加 kill switch 与 single-flight 约束，避免并发 desktop automation。

## Capabilities

### New Capabilities

- `codex-cli-computer-use-broker`: 定义 mossx 如何通过官方 Codex CLI/app-server 会话代理 Computer Use 任务。

### Modified Capabilities

- `codex-cli-computer-use-plugin-bridge`: CLI plugin cache contract 从 diagnostics evidence 变成 broker 的必要前置条件。
- `computer-use-activation-lane`: activation 成功后 broker 才可进入显式运行；剩余权限/approval blockers 必须继续阻止 broker。
- `codex-computer-use-plugin-bridge`: bridge surface 需要表达 broker 可用/阻塞状态。

## 技术方案对比

| 方案 | 做法 | 取舍 |
|------|------|------|
| Codex hidden thread broker | mossx 复用现有 Codex app-server session，开隐藏线程并提示 Codex 使用 Computer Use | 符合官方 parent contract；最小改动；结果受 Codex 对话协议限制 |
| 直接接管 `SkyComputerUseClient mcp` | mossx 直接启动官方 helper 并作为 MCP client 调用 tools | 实测会被 macOS launch constraint 拒绝；违反边界；拒绝 |
| 自研 Computer Use executor | mossx 自己实现截图、accessibility、点击输入 | 可控但成本高、风险大；非本阶段目标 |

选择：Codex hidden thread broker。它利用官方 Codex runtime 触发官方 Computer Use plugin，mossx 只做受控编排。

## Impact

- Backend: `src-tauri/src/computer_use/**`、`src-tauri/src/engine/codex_prompt_service.rs` 或等价 Codex prompt service、`src-tauri/src/command_registry.rs`、`src-tauri/src/state.rs`。
- Frontend: `src/features/computer-use/**`、`src/services/tauri/computerUse.ts`、`src/types.ts`、i18n 文案。
- Specs: `openspec/specs/**`、`.trellis/spec/backend/computer-use-bridge.md`。
- Tests: Rust broker unit tests、frontend hook/component tests、Tauri service mapping tests。

## 验收标准

- 当 CLI plugin cache contract 已识别且 helper bridge 已验证时，Computer Use surface 显示 broker 输入区；若只剩权限/approval 未验证，允许用户显式尝试并由官方 Codex 触发真实授权路径。
- 用户显式输入任务并点击运行后，mossx 通过 Codex hidden thread 执行，不 direct exec helper。
- broker 同一时间只允许一个任务运行；重复点击不会启动并发 desktop automation。
- 缺少 workspace、Codex runtime、CLI plugin cache、helper verification、权限或 approval 时，broker 返回结构化 blocked result。
- Windows 与非 macOS 不暴露 broker action。
- 测试与 OpenSpec 校验通过。
