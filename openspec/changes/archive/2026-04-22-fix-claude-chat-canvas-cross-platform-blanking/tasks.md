## 1. Root Cause Contract Alignment

- [x] 1.1 [P0][depends:none][I: `Messages.tsx` 中现有 processing/render-safe 判定、issue #392 评论证据][O: Claude render-safe mode 的统一判定入口][V: code review 可确认 render-safe mode 不再由 Windows-only 条件独占] 收敛 `Claude + normalized processing + desktop surface` 的 render-safe mode 判定。
- [x] 1.2 [P0][depends:1.1][I: `waitingForFirstChunk`、`streamActivityPhase`、legacy props 与 `conversationState`][O: 统一的 normalized processing 驱动关系][V: Vitest 覆盖 stale legacy props 仍能启用 render-safe mode] 清理消息幕布对 legacy `isThinking` 的残留主判据。

## 2. Safe Degradation Implementation

- [x] 2.1 [P0][depends:1.1][I: `src/styles/messages.css` 中 ingress 特效与 `content-visibility` 优化][O: Claude render-safe mode 下的安全降级样式][V: 样式断言覆盖 Claude processing 时高风险动画/优化被关闭或弱化] 将高风险视觉与渲染优化收敛到 Claude render-safe contract。
- [x] 2.2 [P0][depends:2.1][I: history sticky、live sticky、collapsed history 相关渲染路径][O: 降级后仍可读的消息幕布][V: Vitest 覆盖 sticky/header/collapsed-history 在 render-safe mode 下不消失、不双挂] 确保 render-safe mode 不破坏现有消息阅读主链路。
- [x] 2.3 [P1][depends:2.1][I: 平台 class 与 desktop surface 作用域][O: 跨 Windows/macOS 的统一桌面保护语义][V: 平台 guard 测试断言不再把核心保护能力写死为 Windows-only] 对齐 desktop surface 的样式与作用域策略。

## 3. Regression Coverage

- [x] 3.1 [P0][depends:1.2,2.2][I: `Messages.windows-render-mitigation.test.tsx` 与相关消息组件测试][O: Claude 空白回归测试矩阵][V: Vitest 覆盖 Claude 第二轮消息、normalized state mismatch、Codex 对照组] 补齐 Claude-only blanking regression tests。
- [x] 3.2 [P1][depends:3.1][I: 样式 guard tests 与平台 class 断言][O: cross-platform render-safe coverage][V: 断言 Windows/macOS desktop surface 都有明确保护，且 Codex 不被误伤] 增加平台与引擎边界测试。

## 4. Verification

- [x] 4.1 [P0][depends:3.2][I: 受影响前端模块与样式文件][O: 通过的质量门禁][V: `npm run lint`、`npm run typecheck`、相关 Vitest 全通过] 运行前端质量门禁并修复回归。
- [x] 4.2 [P1][depends:4.1][I: change artifacts 与 delta specs][O: 可继续 apply 的 OpenSpec change][V: `openspec validate fix-claude-chat-canvas-cross-platform-blanking --type change --strict --no-interactive` 通过] 完成 OpenSpec 严格校验并确认 proposal/design/specs/tasks 闭环。
