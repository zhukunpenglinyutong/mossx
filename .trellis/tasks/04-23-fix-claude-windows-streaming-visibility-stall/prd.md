# Fix Claude Windows Streaming Visibility Stall

## Goal

把当前问题从“Qwen/model/provider 特例”收敛为“`Claude Code + Windows` 的实时流式可见性回归”，并一次性补齐 OpenSpec proposal、specs、design、tasks。

## Requirements

- 只分析并提案 `Claude Code` 引擎，不扩散到其他引擎。
- 结论必须明确：模型/provider 不是根因，只能作为诊断维度。
- OpenSpec artifacts 必须明确：
  - root cause 假设
  - 范围边界
  - 备选方案与取舍
  - 新/改 capability
  - 验收标准
- 后续实现必须只分析 Claude Code realtime stream pipeline，不碰其他引擎。

## Acceptance Criteria

- [ ] 新建 OpenSpec change：`fix-claude-windows-streaming-visibility-stall`
- [ ] proposal 将问题定义为 `Claude Code + Windows` 的流式可见性回归
- [ ] proposal 明确指出模型/provider 不是根因，旧 `Qwen` mitigation 属于历史误收窄
- [ ] specs 补齐 Claude Code 专属 visibility contract 和现有 capability delta
- [ ] design 说明 runtime -> frontend visible render 的分析链路与取舍
- [ ] tasks 拆分 diagnostics、mitigation、boundary、validation
- [ ] artifacts 明确只影响 `Claude Code`，不误伤其他引擎
- [ ] artifacts 包含 Windows native Claude Code 手测矩阵要求

## Technical Notes

- 关键证据来自：
  - `src/features/threads/utils/streamLatencyDiagnostics.ts`
  - `src/features/threads/utils/streamLatencyDiagnostics.test.ts`
  - `src-tauri/src/engine/claude.rs`
  - git commit `41aba520 fix(claude): 缓解 Windows 下 Claude 流式输出逐字变慢`
  - archived change `fix-qwen-desktop-streaming-latency`
