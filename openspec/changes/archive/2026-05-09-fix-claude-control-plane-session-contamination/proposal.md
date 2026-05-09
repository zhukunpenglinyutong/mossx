## Why

大量用户反馈 Claude Code 引擎出现自动会话、`app-server` / `developer` 伪会话和空白历史。当前证据显示这不是单纯的渲染问题，而是 Codex app-server 控制面 payload 在特定环境下被投递到 Claude CLI / Claude transcript，随后又被历史扫描和前端 loader 当成真实用户消息展示。

## 目标与边界

目标是建立跨引擎控制面隔离：Codex app-server 启动、握手和内部 `developer_instructions` 只能进入真实 Codex runtime；Claude history 必须过滤已经落盘的控制面污染，避免继续生成伪会话或空白对话。同时把 Win/mac 触发边界、错误识别和 CI 门禁写成可测试 contract，而不是停留在人工排查经验。

边界包括 Codex binary 解析、Codex app-server capability gate、Claude JSONL 后端扫描、Claude history 前端解析和针对性回归测试。

## 非目标

- 不重写多引擎架构。
- 不删除用户本地 Claude 历史文件。
- 不改变正常 Claude Code 发送链路。
- 不改变真实 Codex app-server 的 JSON-RPC 协议。
- 不引入新的用户设置项来让用户手动选择是否过滤污染。

## 技术方案对比

方案 A：只在前端隐藏 `initialize` / `developer_instructions` 文本。  
取舍：改动小，但源头仍会把 Codex payload 送进 Claude，后端 session list 仍可能被污染，属于止血。

方案 B：只移除 Codex 到 Claude 的 fallback。  
取舍：能阻断新增污染的主要入口，但已有脏 JSONL 仍会继续显示伪会话，用户仍感知问题未解决。

方案 C：源头隔离 + capability gate + 后端历史消毒 + 前端兜底。  
取舍：改动覆盖 backend 和 frontend，但能同时解决新增污染和历史污染，是本 change 采用的专业修复路径。

## What Changes

- Codex app-server binary 解析不再 fallback 到 Claude CLI。
- Codex 安装检查必须验证真实 Codex app-server capability，不能只接受任意 CLI `--version`。
- Codex app-server 启动失败时返回明确的 Codex 缺失或 capability 错误，不再推荐安装 Claude 作为 Codex 替代。
- Codex app-server 启动门禁必须跨平台一致：Windows wrapper、Windows direct executable、macOS/Linux direct binary 均不能绕过真实 Codex capability 检查。
- 系统必须能识别并诊断共性架构风险与特殊触发条件：Codex 缺失、custom bin 指向 Claude、PATH/代理劫持、历史已有脏 JSONL。
- Claude history 后端扫描过滤 Codex / GUI control-plane payload，不用其生成 first message、message count 或可见 session。
- Claude history 前端 loader 过滤相同污染 payload，防止 legacy / remote / cached 数据绕过后端消毒。
- 增加 Rust 和 TypeScript 回归测试，并将 focused validation 纳入 CI / release gate 约束，覆盖源头隔离、Win/mac 边界、历史污染隐藏和混合 transcript 保留。

## Capabilities

### New Capabilities

- `engine-control-plane-isolation`: 跨引擎控制面隔离，约束 Codex app-server payload 不得进入 Claude transcript 或用户可见会话。

### Modified Capabilities

- `codex-app-server-wrapper-launch`: 增加 Codex app-server 启动身份校验，禁止 Codex launch path fallback 到 Claude CLI。
- `claude-history-transcript-visibility`: 增加 Claude 历史污染过滤，保证 control-plane-only transcript 不生成可见伪会话。

## Impact

- Backend: `src-tauri/src/backend/app_server_cli.rs`, `src-tauri/src/backend/app_server.rs`, `src-tauri/src/engine/claude_history.rs`。
- Frontend: `src/features/threads/loaders/claudeHistoryLoader.ts`。
- Tests: Rust app-server / Claude history tests，Vitest Claude history loader tests。
- CI / Gate: focused Rust tests、focused Vitest tests、OpenSpec strict validation 必须成为本 change 的验收门禁；如已有 CI 脚本可覆盖，优先复用已有脚本，不新增平行治理体系。
- User impact: Win/mac 均停止新增跨引擎污染；已有污染历史会被隐藏或过滤，正常 Claude/Codex 会话不受影响。

## 验收标准

- 缺少真实 `codex` 时，Codex app-server session 创建必须失败为 Codex-specific error，不得启动 `claude app-server`。
- 配置 Codex binary 指向 Claude 或代理到 Claude 时，系统必须拒绝作为 Codex app-server 使用。
- Windows `.cmd/.bat` wrapper 兼容 retry 只适用于真实 Codex wrapper，不得把 Claude wrapper 当成 Codex。
- macOS/Linux 的 direct binary 也必须通过 app-server capability gate，不能因非 Windows 平台跳过身份校验。
- 诊断必须能把“共性架构风险”和“特殊环境触发”分开：缺 Codex、custom bin 错配、PATH/代理劫持、历史污染分别给出可读错误或过滤结果。
- Claude JSONL 仅包含 `initialize`、`clientInfo.name=ccgui`、`capabilities.experimentalApi`、`developer_instructions`、`app-server` 等控制面 payload 时，不得出现在会话列表。
- Claude JSONL 同时包含真实用户消息和控制面污染时，必须只过滤污染消息并保留真实对话。
- 前端 loader 对相同污染 payload 保持兜底过滤。
- 相关 Rust / TypeScript focused tests 通过，OpenSpec change strict validate 通过，并在最终交付中列出实际执行结果。
