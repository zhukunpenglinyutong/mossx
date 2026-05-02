## Why

`v0.4.10` 引入 `ChatInputBox` 新输入架构后，Linux 用户在 `desktop-cc-gui#453` 报告了明确回归：`Linux Mint 22.3 + RIME` 下，主输入框无法正常输入中文，且在输入框聚焦时无法稳定切换中英文输入。现象已经超出“某个输入法配置问题”的边界，因为同一版本链路在 macOS / Windows 正常，而 Linux 路径统一落在 `contenteditable + native keydown/beforeinput capture + composition state` 这套更激进的输入拦截模型上。

这类问题不能再靠用户手工换输入法、失焦重试或规避版本解决。仓库需要为 Linux IME 建立一个明确、可验证、且不污染 macOS / Windows 的兼容边界：恢复 Linux 下中文输入可用性，同时保持现有 rich input、发送、补全、撤销等主能力不回退。

## What Changes

- 为 `ChatInputBox` 增加 **Linux-only IME compatibility guard**，收敛 Linux 下对 `keydown`、`beforeinput` 与 DOM rewrite 的激进接管，避免在 IME composition / candidate confirm / input-method toggle 期间打断原生输入链路。
- 保持 macOS / Windows 当前 `ChatInputBox` 事件策略不变，不把 Linux 修复扩展成跨平台统一重写，也不顺手调整既有 Win/mac 快捷键或 send shortcut 语义。
- 在 Linux 兼容模式下继续保留 `ChatInputBox` 的 rich input 能力，包括已确认文本后的补全、文件标签渲染、发送与撤销/重做行为；不默认降级为全平台 `textarea`。
- 为 Linux IME 补充 targeted regression tests，覆盖 composition commit、Enter/Space 候选确认、输入法切换后继续输入、以及 macOS / Windows 不触发 Linux 分支的隔离验证。

## 目标与边界

### 目标

- 恢复 Linux 桌面环境下 `ChatInputBox` 的中文 IME 可输入性，至少覆盖 issue 已明确出现的 `Linux Mint + RIME` 场景。
- 保证 Linux 下的 IME candidate confirm、composition commit 与输入法切换不会被 composer 自己的 native capture / DOM rewrite 提前拦截。
- 将修复严格收口为 Linux-only compatibility guard，不让 macOS / Windows 现有输入与发送路径发生行为漂移。
- 保持 `ChatInputBox` 的 rich input 能力和现有 UX 契约：文本提交、补全、文件标签、撤销/重做、流式输入响应边界继续成立。

### 边界

- 本变更只处理 `src/features/composer/components/ChatInputBox/**` 输入链路，不触及 backend、Tauri command、持久化存储或跨层 contract。
- 首期只建立 **Linux 定向兼容策略**，不承诺一次性修复所有 Linux 桌面 / 所有 IME / 所有发行版组合，但必须把已知高频回归路径修通。
- 不把 `ChatInputBox` 整体回退到朴素 `textarea` 实现，也不在本变更中重构全部 `contenteditable` 架构。
- 不修改 macOS / Windows 现有 send shortcut、undo/redo shortcut、prompt enhancer shortcut、completion 键盘导航规则，除非测试证明 Linux 分支隔离不足以修复问题。

## 非目标

- 不在本变更内重做 `ChatInputBox` 的全部 hooks 拆分或组件架构。
- 不引入新的 runtime / backend diagnostics channel。
- 不把 Linux 的兼容分支扩展成新的全平台 feature flag 系统。
- 不顺手修改与本 issue 无关的 Composer UI、样式、模型选择或流式状态刷新逻辑。

## Capabilities

### New Capabilities

- `composer-linux-ime-compatibility`: 为 `ChatInputBox` 定义 Linux IME composition、candidate confirm、输入法切换与平台隔离的兼容契约。

### Modified Capabilities

- None.

## 技术方案对比与取舍

| 方案 | 核心思路 | 优点 | 风险 / 代价 | 结论 |
|---|---|---|---|---|
| A | 全平台回退到更朴素的 `textarea` 输入链路 | IME 兼容直觉上更强 | 会破坏现有 rich input 架构，复制大量补全 / 文件标签 / 选区逻辑，回归面过大 | 不采用 |
| B | 保持 `contenteditable`，但在 Linux-only 分支里关闭最激进的 native capture / DOM rewrite 时机，改为更保守的 composition-safe 事件路径 | 修复范围最小；可保留 rich input；易于与 mac/win 隔离 | 需要仔细梳理 `keydown` / `beforeinput` / `composition` 先后顺序与测试矩阵 | **采用** |
| C | 继续沿用当前 capture 模型，只针对 `keyCode` / `isComposing` 条件追加补丁 | 改动看似最小 | 高概率继续漏掉 Linux WebKitGTK/WRY 与 RIME 的事件差异，补丁化风险高 | 不采用 |

取舍说明：这次问题本质不是“某个 key 判断少了一条 if”，而是 Linux IME 事件链路与当前 platform-agnostic native capture 假设不兼容。方案 B 既能恢复 Linux 输入，又能把修复风险限制在 Linux 分支内。

## Impact

- Affected frontend modules:
  - `src/features/composer/components/ChatInputBox/ChatInputBox.tsx`
  - `src/features/composer/components/ChatInputBox/hooks/useNativeEventCapture.ts`
  - `src/features/composer/components/ChatInputBox/hooks/useIMEComposition.ts`
  - `src/features/composer/components/ChatInputBox/hooks/useKeyboardHandler.ts`
  - `src/features/composer/components/ChatInputBox/hooks/useSpaceKeyListener.ts`
  - 相关 hook / component tests
- Affected behavior:
  - Linux `ChatInputBox` 输入法 composition、候选确认与输入法切换
  - Linux 下发送与补全在 composition 前后的时序边界
  - macOS / Windows 平台隔离与非回归保证
- Dependencies / APIs:
  - 无新增第三方依赖
  - 无 backend API / Tauri command 变更

## 验收标准

- 在 Linux `ChatInputBox` 中使用中文 IME 输入时，已确认候选文本 MUST 稳定进入输入框，且不出现“只能英文 / 中文无法上屏”的回归。
- 在 Linux IME composition 活跃期间，Enter / Space 等候选确认键 MUST NOT 被 composer 提前当作 submit 或 DOM rewrite 触发器消费。
- 用户在 Linux 输入框内切换输入法后，无需失焦 / 重聚焦即可继续输入新的语言模式文本。
- 在 Linux IME 文本确认后，发送 MUST 使用最终确认文本快照，且仅发送一次。
- Linux 修复后，文件标签渲染、补全选择、撤销/重做、streaming 下输入响应边界 MUST 继续可用。
- macOS / Windows MUST 继续走现有 composer 事件路径；本 change 不得因为 Linux guard 而改变它们的默认行为。
- 相关前端测试 MUST 覆盖 Linux 兼容路径与 macOS / Windows 隔离路径，且项目基础质量门禁通过。
