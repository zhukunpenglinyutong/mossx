## 1. Platform Boundary

- [x] 1.1 [P0][depends:none][I:`ChatInputBox` platform detection与现有 hooks 接口][O: Linux-only IME compatibility predicate 与统一传参边界][V: 单测覆盖 linux=true、mac/win=false，且相关 hooks 只从统一入口接收平台模式]
- [x] 1.2 [P0][depends:1.1][I:`useNativeEventCapture` 当前 capture-phase `keydown` / `beforeinput` 提交拦截][O: Linux 兼容模式下的保守事件路径，mac/win 保持原行为][V: Hook 测试覆盖 Linux composition 中 Enter 不 premature submit、非 Linux 路径行为不变]

## 2. Composition Safety

- [x] 2.1 [P0][depends:1.2][I:`useSpaceKeyListener`、file tag render、composition settle 时机][O: Linux 下 composition 活跃或刚结束窗口内不触发破坏性 DOM rewrite][V: 测试覆盖 Space 候选确认不破坏已确认文本]
- [x] 2.2 [P0][depends:2.1][I:`useIMEComposition` / `useKeyboardHandler` / submit 快照链路][O: Linux IME 完成后的 finalized snapshot 提交一次且仅一次][V: 组件测试覆盖 committed IME text send exactly once]

## 3. Rich Input Continuity

- [x] 3.1 [P1][depends:2.2][I: Linux IME commit 后的 completion / file-tag / undo-redo 主路径][O: 兼容模式下 rich input 能力保持可用][V: 测试覆盖 IME 后补全插入正常、undo/redo 不丢最终文本]
- [x] 3.2 [P1][depends:3.1][I: macOS / Windows 既有 composer 交互边界][O: 非 Linux 平台隔离验证矩阵][V: 至少一组测试断言 Linux guard 不在 mac/win 激活]

## 4. Verification

- [x] 4.1 [P0][depends:3.2][I: 相关 ChatInputBox / hook 测试套件][O: 自动化回归结果][V: `npm run test -- ChatInputBox` 或等价定向测试通过]
- [x] 4.2 [P0][depends:4.1][I: 仓库前端质量门禁][O: lint/typecheck/test 通过记录][V: `npm run lint`、`npm run typecheck`、`npm run test` 全部通过]
- [x] 4.3 [P1][depends:4.1][I: Linux Mint + RIME 与 mac/win 最小手测矩阵][O: 手测验收记录][V: Linux 可中英文切换并输入中文；mac/win 发送、补全、撤销/重做无回归]
