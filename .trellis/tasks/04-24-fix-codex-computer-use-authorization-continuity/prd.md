# Fix Codex Computer Use Authorization Continuity

## Goal

让客户端通过 `codex cli` 使用 `Computer Use` 时，授权链路保持单一、可解释、可复现的 host identity；解决“同机终端可用，但客户端即使已在 macOS 中开启权限仍持续报无权限”的问题。

## Requirements

- 必须识别并暴露当前实际发起 Computer Use broker 的 authorization host。
- 必须区分 generic `permission_required` 与 `authorization continuity` 断裂。
- local packaged app 必须成为稳定 launcher；无法保证 continuity 的 host 必须显式 blocked。
- UI 必须明确告诉用户该重新授权 / 重启 / 重置的是哪个 exact host，而不是只提示去开 Accessibility。
- 变更同时覆盖 backend broker preflight、failure taxonomy、frontend status surface 与手测矩阵。

## Acceptance Criteria

- [ ] `Terminal -> codex exec -> computer-use.list_apps` 成功，而客户端失败时，系统能归因为 continuity / sender mismatch，而不是只显示 generic permission issue。
- [ ] broker result 返回 current authorization host 与 last successful host 的结构化证据。
- [ ] current host 漂移时，UI 显示 continuity blocked verdict，并给出 exact-host remediation。
- [ ] local packaged app 成为稳定 launcher；debug binary / daemon-only / 签名漂移 host 不再被当作同一授权主体。
- [ ] `openspec validate fix-codex-computer-use-authorization-continuity --type change --strict --no-interactive` 通过。

## Technical Notes

- 关联 OpenSpec change：`fix-codex-computer-use-authorization-continuity`
- 当前已确认的关键证据：
  - `2026-04-24` 终端 `codex exec` 成功调用 `computer-use.list_apps`
  - 当前 host 的 `computer_use.list_apps` 返回 `Apple event error -10000: Sender process is not authenticated`
  - 同日本地 session 中已有相同错误记录
  - `/Applications/ccgui.app` 与 `cc_gui_daemon` 都声明了 `automation.apple-events` entitlement，但 launcher identity 不一致
