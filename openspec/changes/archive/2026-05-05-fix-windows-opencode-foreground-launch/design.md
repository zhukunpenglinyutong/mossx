## Context

当前问题只出现在 Windows 用户本机已安装 OpenCode 的场景下。CodeMoss 在 OpenCode readiness、status detection、manual refresh 或显式进入 OpenCode 前置路径中，会调用 `opencode` binary 做安装检测、`--version/--help` probe 或后续命令构造；若 Windows binary resolution 命中了会激活桌面窗口的 launcher，而不是纯 CLI，可见结果就是外部窗口被频繁拉到前台。

现状里已经通过 `opencode-mode-ux` 收敛了“不要自动后台 probe”，但这只能减少触发次数，不能解决“命中了错误 binary”这个根因。为了避免把修复扩散到其他平台和其他引擎，本次设计必须把影响面限制在 `Windows + OpenCode` 的 discovery / probe / command planning。

## Goals / Non-Goals

**Goals:**

- 为 Windows 下的 OpenCode binary resolution 增加 CLI-safe guard，避免 launcher-like candidate 被当作后台 probe 目标。
- 让 OpenCode 的 Windows readiness / refresh path 在 candidate 不安全时返回稳定诊断，而不是抢占前台。
- 显式保护 `macOS/Linux` 的 OpenCode 健康路径不变。
- 显式保护 `Claude`、`Codex`、`Gemini` 的现有 discovery / launch / refresh 行为不变。
- 为该平台修复补齐 targeted tests，防止后续回退。

**Non-Goals:**

- 不重写通用 engine discovery 架构。
- 不改变 OpenCode `run --format json` 的主消息链路。
- 不调整 provider auth、MCP、session persistence、UI 文案体系。
- 不把 Windows 所有 CLI 的 launcher 兼容性统一抽象为本轮必须完成的通用平台框架。

## Decisions

### Decision 1: 在 Windows 为 OpenCode 引入受限的 CLI-safe resolution，而不是只靠前端减少触发

- 方案 A：继续只减少自动 probe 触发点。
  - 优点：改动小。
  - 缺点：用户只要手动 refresh 或显式进入 OpenCode，依旧可能拉起前台窗口，无法根治。
- 方案 B：在 Windows 下把 OpenCode candidate 解析拆成“可安全后台探测的 CLI”和“疑似 launcher”两类。
  - 优点：直接切中根因，且只影响 OpenCode Windows 路径。
  - 缺点：需要增加少量平台分支和诊断分支。
- 结论：采用方案 B。

### Decision 2: 不把 launcher-like candidate 当作“安装成功但不可用”，而是返回可诊断的受限状态

- 方案 A：命中 launcher-like candidate 后仍视为 installed，再在运行时失败。
  - 缺点：前台抢焦点仍可能发生，且错误会延后到更深层链路。
- 方案 B：在 detection/probe 阶段直接阻断危险 candidate，并返回稳定错误信息，提示当前 candidate 不适合作为 CLI。
  - 优点：风险最小，用户反馈可解释，后续 UI 可据此显示 actionable diagnostics。
- 结论：采用方案 B。

### Decision 3: 非 Windows 和非 OpenCode 路径保持完全旁路

- 方案 A：顺手把 `find_cli_binary` 做成通用 launcher filter。
  - 缺点：回归面过大，影响 `Codex/Claude/Gemini` 与其他平台。
- 方案 B：仅在 OpenCode Windows resolution / probe planning 处加专用 guard，其他路径复用现状。
  - 优点：边界清晰，最符合本 change 目标。
- 结论：采用方案 B。

### Decision 4: 诊断文案优先从 backend 稳定返回，前端只做轻量映射

- 方案 A：把 launcher 识别细节全部塞进前端判断。
  - 缺点：前端不具备足够的进程/路径上下文，跨层漂移风险高。
- 方案 B：后端返回稳定错误原因和 candidate 语义，前端仅负责状态展示或沿用现有错误面。
  - 优点：契约更稳定，测试集中在 backend。
- 结论：采用方案 B。

## Risks / Trade-offs

- [Risk] launcher-like heuristics 误判真正可用的 CLI wrapper → Mitigation：只对 OpenCode Windows 启用；优先用“安全后台 probe 成功”作为白名单，通过 targeted tests 锁定已知健康路径。
- [Risk] 诊断分支导致 OpenCode 在部分 Windows 环境显示 unavailable → Mitigation：错误信息必须区分“未安装”和“命中不安全 launcher candidate”，避免误导成普通缺失。
- [Risk] 修改 binary resolution 时意外影响其他引擎 → Mitigation：实现范围限定在 OpenCode Windows helper 或调用点，并补非 OpenCode 防回归测试。
- [Risk] frontend 仍有旧的自动路径触发 probe → Mitigation：保留并复用现有 manual refresh-only contract，同时在 backend 做最终安全兜底。

## Migration Plan

1. 在 backend 为 OpenCode Windows discovery / probe 新增 candidate safety helper。
2. 让 `detect_opencode_status`、OpenCode 相关 command construction 或 provider health path 复用该 helper。
3. 为 launcher-like candidate 返回稳定诊断，不继续执行高风险 probe。
4. 补 Rust tests 锁定 Windows safe/unsafe candidate 行为，并补 focused frontend regression 确认 manual refresh 不被回归。
5. 运行 `openspec validate --all --strict --no-interactive` 与相关 code/test gates。

回滚策略：

- 若新 guard 误伤真实 CLI，可回滚到仅保留现有 manual refresh-only contract 的版本；
- 因为本设计不改 storage schema、不改跨引擎 shared contract，回滚只需撤销 OpenCode Windows guard 相关变更。

## Open Questions

- OpenCode Windows 发行形态中，哪些已知路径或 wrapper 需要视为健康 CLI 白名单，哪些是必须阻断的 desktop launcher？
- 当前前端是否需要新增更明确的 launcher diagnostic copy，还是先复用现有 `error` / `unavailable` 展示即可？
