## 1. Runtime Liveness Contract

- [ ] 1.1 为 `Codex` waiting-first-event、silent-busy、resume-pending 引入统一的 stalled state vocabulary 与 bounded settlement 入口
- [ ] 1.2 在 runtime diagnostics 中记录可关联的 `workspace/thread/engine/guard state` 证据
- [ ] 1.3 确保 stalled settlement 不破坏 `Claude`、`OpenCode`、`Gemini` 的既有 runtime behavior

## 2. Conversation Lifecycle Settlement

- [ ] 2.1 更新线程生命周期状态机，使 foreground turn 在恢复链停滞时退出 pseudo-processing
- [ ] 2.2 为 stalled/degraded state 接入现有 thread-facing diagnostics 与可恢复提示
- [ ] 2.3 补充 lifecycle regression coverage，验证 completed/error/recoverable-abort 都能清理 stalled state

## 3. RequestUserInput Recovery

- [ ] 3.1 调整 `requestUserInput` 提交后的恢复链，使成功提交进入 bounded `resume-pending` 而不是永久 processing
- [ ] 3.2 确保提交失败保留卡片重试，提交后终态可清理阻塞态并恢复后续卡片交互
- [ ] 3.3 覆盖“卡片已出现但恢复链停滞”的回归场景

## 4. Runtime Pool Console Alignment

- [ ] 4.1 更新 runtime pool snapshot / UI 展示，区分 `true idle`、`warm retained`、`startup-pending`、`silent-busy`、`resume-pending`
- [ ] 4.2 暴露 stalled recovery reason 与最近 exit metadata，避免无解释的 idle 误报
- [ ] 4.3 验证 console 文案与 diagnostics 维度一致，可用于现场排障

## 5. Verification

- [ ] 5.1 补充跨层验证：frontend processing、request queue、runtime snapshot、diagnostics 在 stalled 链路下口径一致
- [ ] 5.2 运行受影响测试与必要的 contract checks
- [ ] 5.3 人工验证长任务、`requestUserInput` 提交后恢复、runtime pool console 展示三条主路径
