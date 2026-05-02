## Context

当前 `ChatInputBox` 基于 `contenteditable div` 构建 rich input，并通过多层 hook 接管输入行为：`useNativeEventCapture` 在 capture phase 处理 `keydown` / `beforeinput`，`useIMEComposition` 维护 composition state，`useKeyboardHandler` 处理 send shortcut / completion / undo-redo，`useSpaceKeyListener` 在空格后触发文件标签重渲染。这套设计对 Chromium/JCEF 下的 IME 问题做过多轮补丁，重点约束是“减少 composition 期间 re-render 与 DOM rewrite”。

但 issue #453 说明 Linux `WebKitGTK/WRY` 路径与现有假设不兼容：在 `Linux Mint 22.3 + RIME` 下，输入框内中文输入和中英文切换都失效，说明问题不是单纯的“确认后发送错了”，而是输入法事件在抵达稳定文本前就被应用层接管或扰动。当前代码里 Linux 与 macOS / Windows 基本共用同一套 native capture 逻辑，因此任何 fix 都必须首先建立 **平台隔离边界**，而不是继续在全平台条件分支上堆补丁。

约束条件也很明确：

- 输入 source-of-truth 必须继续留在 `ChatInputBox` 的 local state / ref / composition state。
- 不允许为了修 Linux 顺手改动 macOS / Windows 既有 send/completion/undo-redo 行为。
- 不做全量 `textarea` 回退，避免把 rich input 体系整段推倒重来。
- 关键行为必须补前端回归测试，覆盖 Linux 路径与跨平台隔离。

## Goals / Non-Goals

**Goals:**

- 恢复 Linux 下 `ChatInputBox` 的 IME composition、候选确认与输入法切换能力。
- 将修复严格限制在 Linux-only compatibility guard，不影响 macOS / Windows 当前输入链路。
- 保留 rich input 能力，包括补全、文件标签、发送、撤销/重做与流式输入响应。
- 建立可以通过 hook/unit tests 验证的平台边界和事件时序边界。

**Non-Goals:**

- 不重构整个 `ChatInputBox` 架构或更换输入技术栈。
- 不新增 backend / runtime contract。
- 不实现新的跨平台 feature flag 或全局设置项。
- 不把 Linux 首版 fix 升级成“支持所有输入法热键映射的可配置系统”。

## Decisions

### 1. 引入 Linux-only IME compatibility mode，而不是继续做全平台补丁

**Decision**

新增一个集中式平台判断边界，让 `ChatInputBox` 在 Linux 下进入更保守的 IME compatibility mode；macOS / Windows 继续保留现有路径。

**Why**

问题只在 Linux 路径稳定暴露，而当前 native capture 逻辑是按“跨平台统一”写的。若继续把 Linux 特判揉进全平台分支，回归面会扩散到 Win/mac 的 send、completion、undo-redo 链路。

**Alternatives considered**

- 继续在现有 capture 逻辑上追加 `isComposing` / `keyCode` 补丁：改动小，但无法建立可靠平台边界，不采用。
- 直接让全平台都走保守路径：可能修 Linux，但会回伤 Win/mac 已经稳定的 UX，不采用。

### 2. Linux compatibility mode 中禁用最激进的 capture-phase submit / beforeinput hijack

**Decision**

在 Linux compatibility mode 下，`useNativeEventCapture` 不再承担 capture-phase 的 submit fallback 主路径，也不在 composition 活跃或刚结束窗口内消费 `beforeinput(insertParagraph)`。Linux 下提交时序优先依赖 React 层 keyboard handler 与 composition state 收敛后的稳定快照。

**Why**

Issue 现象已经不是“误发一次空消息”这么轻，而是输入法本身被打断。capture-phase `preventDefault()` 对 Linux IME 风险最高，尤其是候选确认使用的 Enter / Space 与 `beforeinput(insertParagraph)` 链路。

**Alternatives considered**

- 保留 capture-phase submit，只加更长的 `recentlyComposing` 窗口：可能继续拦截 Linux IME 控制键，不采用。
- 全量移除 `useNativeEventCapture`：会丢掉现有 JCEF/IME 兼容收益，范围过大，不采用。

### 3. 保留 `contenteditable` rich input，但延后 Linux 下的 DOM rewrite 触发点

**Decision**

不默认回退到 `textarea`。Linux compatibility mode 继续使用 `contenteditable`，但对 `useSpaceKeyListener` / file tag render / 其他可能改写 DOM 的路径增加更严格的 composition guard，确保这些改写只在 composition settled 后发生。

**Why**

`textarea` 虽然看似更稳，但会把文件标签、虚拟光标、补全插入等一整套逻辑推倒重写；这不符合本次“最小修复、严格边界”的目标。真正高风险的是 Linux 下“在 IME 还没完成时重写 DOM”，而不是 rich input 本身。

**Alternatives considered**

- Linux 默认 `textarea` fallback：稳妥但代价过大，不采用。
- 完全保留现有 DOM rewrite 时机：高概率继续中断 IME，不采用。

### 4. 用测试矩阵锁住 Linux 修复与 macOS / Windows 隔离

**Decision**

新增 targeted hook/component tests，至少覆盖：

- Linux composition commit 后文本成功上屏
- Linux candidate confirm 的 Enter / Space 不触发 premature submit / rewrite
- Linux 输入法切换后继续输入可用
- macOS / Windows 不触发 Linux-only compatibility branch

**Why**

输入法问题极易被“看起来像是修了”的条件分支掩盖；没有平台矩阵测试，后续继续调整 send shortcut 或 completion 时很容易再次破坏 Linux。

**Alternatives considered**

- 只做人工验证：无法防回归，不采用。
- 只测 Linux 正向路径，不测 Win/mac 隔离：无法保证边界，不采用。

## Risks / Trade-offs

- [Risk] Linux 各发行版 / IME 框架（RIME、fcitx、ibus）事件顺序并不完全一致  
  → Mitigation: 规则围绕“不要在 composition 活跃或刚收敛时抢先消费事件”设计，而不是硬编码单一输入法热键。

- [Risk] 关闭 Linux capture-phase submit fallback 后，可能重新暴露某些 Enter-to-send 边角时序  
  → Mitigation: 用最终快照提交流程和 targeted tests 覆盖 plain Enter、confirmed IME Enter、completion selected Enter 三类场景。

- [Risk] Linux compatibility mode 过宽，误伤原本正常的 Linux 英文输入或 completion 交互  
  → Mitigation: 仅收紧高风险事件拦截与 DOM rewrite 时机，不关闭 completion / file-tag / undo-redo 等核心能力；同时增加非 IME Linux 路径测试。

- [Risk] 平台判断散落在多个 hooks，后续维护又回到平台分支漂移  
  → Mitigation: 抽一个共享 predicate / option 入口，由 `ChatInputBox` 统一下发到相关 hooks。

## Migration Plan

1. 抽取 Linux-only compatibility predicate，并把它作为 `ChatInputBox` -> hooks 的统一输入。
2. 调整 `useNativeEventCapture`、`useSpaceKeyListener`、必要的 keyboard/composition 边界，让 Linux 在 composition 期间不再抢先消费高风险事件。
3. 增补 Linux IME 与 macOS / Windows 隔离测试。
4. 跑 `npm run lint`、`npm run typecheck`、`npm run test`；若修改触及大文件阈值，再补 `npm run check:large-files`。
5. 人工验证 Linux Mint + RIME 主场景，并对 macOS / Windows 做最小非回归核验。

**Rollback**

本变更是纯前端 Linux-only guard。若出现异常，可直接回滚本次 compatibility branch，而不影响 backend 或持久化数据。

## Open Questions

- 当前先不把 Linux compatibility mode 暴露成用户可配置项；若后续仍有极少数 Linux 发行版需要更强 fallback，再基于新的 issue 决定是否引入二级策略。
