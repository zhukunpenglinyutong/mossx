## Why

上轮优化解决了 `需求池` 与执行台默认折叠，但 Spec Hub 作为 OpenSpec 浏览入口的核心摩擦还在：当前 artifact 区本质上还是一整块 markdown 长文，长 proposal / design / spec 在当前窗体里阅读成本很高，用户只能靠 tab 切换和手动滚动来找 requirement / scenario / capability。  
同时，Spec Hub 现在只能附着在主窗体里显示，无法像文件独立窗口那样并行打开；一旦用户想边看规范边回到会话、代码或 Git 面板，阅读上下文就会被迫挤在同一块屏幕里，Spec Hub 很难成为真正稳定的“规范工作台”。

## 目标与边界

- 目标：
  - 把 Spec Hub 的 artifact 浏览体验从“平铺 markdown”提升为“可导航的阅读视图”。
  - 为 OpenSpec proposal / design / specs / tasks / verification 提供更强的结构化阅读能力，尤其是 requirement / scenario 级跳转。
  - 让用户可以把当前 Spec Hub 上下文打开成独立窗口，像 detached file explorer 一样与主窗体并行使用。
  - 让阅读导航成为可折叠的左右结构，并默认以收起状态进入，降低长文打开时的视觉压迫。
  - 让左侧 change browsing 区支持折叠与拖拽调宽，减少“活跃 change 太多时挤压正文”的问题。
  - 修正 detached Spec Hub 独立窗口的壳层与尺寸链，使其真正表现得像专用 reader window，而不是主窗体里的嵌入片段。
  - 保持当前 `resolvedSpecRoot`、change 选择和 artifact 语义一致，不引入第二套规范解析规则。
- 边界：
  - 本次重点是视图层与阅读流，不扩展 execution console / control center 的动作面板能力。
  - detached Spec Hub 以浏览为主，不新增 proposal/apply/verify/archive 等执行台能力；但保留现有 control center 入口，并默认折叠。
  - 不修改 OpenSpec artifact 文件格式，不引入新的 spec metadata 协议。

## 非目标

- 不重做 execution console、gate、timeline 的 IA 或运行时行为。
- 不在本次加入全文搜索、跨 change diff compare、评论/批注、团队协同标记。
- 不把 detached Spec Hub 扩展成完整第二主窗体，也不要求它承接聊天、Git 或文件浏览能力。
- 不把 detached surface 的阅读上下文同步成“全局唯一选择”，避免主窗体和独立窗口互相抢焦点。

## What Changes

- 增强 Spec Hub artifact 阅读层：
  - 为当前 artifact 增加结构化 outline / quick-jump 视图，采用正文 + 右侧阅读导航的左右结构，并支持从 heading、`Requirement:`、`Scenario:` 等语义块直接跳转。
  - 阅读导航默认折叠，用户需要时再展开；展开后可继续作为当前 artifact 的结构化阅读索引。
  - 在 `tasks` artifact 中，当某个阅读导航分组下仍存在未完成 checklist item 时，为对应导航项增加可见提醒标识，减少“正文里有遗漏但导航层无感知”的情况。
  - 为多 spec source 的 change 增加更清晰的 source 导航与上下文恢复，避免来回切 tab 后丢失当前阅读位置。
  - 为 proposal capability 与 spec source 之间增加可达的跳转链路，减少“先看 proposal，再手动去 specs 里找对应文件”的摩擦。
  - 左侧 change 区支持折叠与拖拽调宽，并按 surface 维度记住用户最近一次布局偏好。
- 增加 detached Spec Hub 独立窗口：
  - 在嵌入式 Spec Hub 中提供 `Open in window` 入口，将当前 workspace、resolved spec root、selected change、active artifact、active spec source 等阅读上下文显式交给独立窗口。
  - 项目内其他 `Spec Hub` 入口（如 sidebar / file tree root action / header shortcut）默认直接拉起 detached Spec Hub，而不是先把主窗体切到中间阅读层。
  - detached window 采用固定 window identity，可复用、可重定向、可聚焦，不为每次点击无限创建新窗体。
  - detached surface 与主窗体并行存在，关闭独立窗口不影响主窗体 Spec Hub；主窗体切回聊天/Git/文件视图时，独立窗口继续保留阅读上下文。
  - detached window 的外观与尺寸链对齐 detached file explorer：拥有稳定的专用窗口壳层，并保证 reader surface 占满可用窗口空间。
  - detached window 的默认高度与独立文件窗口保持同一紧凑基线，避免 Spec Hub 独立窗体在中等屏幕上显得过高、压缩正文与边栏的垂直节奏。
  - detached surface 保留旧的 control center toggle，但默认维持折叠，避免执行台长期占据阅读空间。
  - detached window 的 drag handle 需要针对 macOS overlay titlebar 做显式加固，并增加 `startDragging()` 兜底与窗口 capability 对齐；该兜底需要覆盖 menubar 文案文本节点等非交互目标，同时不破坏 Windows 侧原生标题栏拖动能力。
- 引入 surface-scoped reader context：
  - 同一 workspace + spec-root 下，embedded 与 detached surface 各自维护独立的 change / artifact / spec source 阅读上下文。
  - detached window 在冷启动或事件晚到时可从最近一次 session snapshot 恢复，避免空白窗体或错误 change。

## 技术方案对比与取舍

### 方案 A：只在当前窗体继续增强 maximize/read mode

- 优点：不新增窗口模型，实现最省。
- 缺点：用户仍无法把 Spec Hub 从主窗体工作流中解耦出来；一旦切回会话或 Git，阅读上下文仍然被挤压。

### 方案 B：复用通用 `open_new_window` 打开一个新主应用窗口

- 优点：已有 backend command，可快速打开新实例。
- 缺点：只能得到“另一个完整主窗体”，缺少显式 Spec Hub 上下文交接、固定 window identity、焦点复用和独立恢复能力；用户还要二次导航到 Spec Hub。

### 方案 C：仿照 detached file explorer，创建专用 detached Spec Hub window（采用）

- 优点：可以显式传递阅读上下文，做到单实例复用、focus/retarget、surface 隔离和冷启动恢复；更契合“像文件独立窗口那样”的目标。
- 缺点：需要新增 window route、session snapshot、shared viewer surface 与更多回归测试。

取舍：采用方案 C。Spec Hub 的问题不是“能不能再开一个窗口”，而是“能不能把当前阅读上下文低摩擦地搬到一个专用窗口里继续看”。这需要专门的 detached window contract，而不是通用新窗体能力。

## Capabilities

### New Capabilities

- `detached-spec-hub-window`: 提供可复用的 Spec Hub 独立阅读窗口、显式 session handoff、双 surface 共存和恢复语义。

### Modified Capabilities

- `spec-hub-workbench-ui`: 增加 artifact 结构化导航、proposal/spec 链接跳转、source 上下文恢复以及独立窗口入口。

## 验收标准

1. 在嵌入式 Spec Hub 中查看带 heading 的 proposal / design / tasks / verification 时，系统 SHALL 提供可见的 outline 或 quick-jump 导航入口。
2. 在 `specs` artifact 中查看包含 `Requirement:` / `Scenario:` 语义块的规范文件时，用户 SHALL 能直接跳到对应 requirement 或 scenario，而不必只靠手动滚动。
3. 当 proposal 中存在与当前 change spec source 对应的 capability 时，用户 SHALL 能从 proposal 阅读流跳到对应 spec source。
4. 用户在嵌入式 Spec Hub 中触发 `Open in window` 后，系统 SHALL 打开或聚焦一个 detached Spec Hub window，并把当前 workspace、resolved spec root、selected change、active artifact、active spec source 交给该窗口。
5. 若 detached Spec Hub window 已存在，再次从其他 change 或其他 workspace 触发 `Open in window` 时，系统 SHALL 复用同一窗口 identity，并把该窗口重定向到最新请求上下文。
6. detached Spec Hub window 打开后，主窗体 SHALL 仍可继续使用聊天、Git、文件等其他 surface；关闭 detached window SHALL 不得关闭或重置主窗体内的 Spec Hub。
7. detached Spec Hub window SHALL 以阅读为主，不要求默认展开 execution console 才能完成 artifact 浏览。
8. 若 detached window 的最近一次 session snapshot 缺失、损坏或引用了不可用的 spec root/change，系统 SHALL 显示可恢复的 unavailable state，而不是空白或错误内容。
9. embedded 与 detached 两个 surface 的阅读上下文 SHALL 相互隔离；在 detached window 切换 change / artifact / spec source 时，主窗体当前可见选择不得被被动覆盖。
10. Spec Hub artifact reader SHALL 以“正文 + 可折叠阅读导航”左右布局呈现，且阅读导航默认 SHALL 处于折叠状态。
11. 左侧 change 区 SHALL 支持折叠与拖拽调宽；在当前 surface 再次打开时，系统 SHALL 恢复最近一次安全布局宽度与折叠状态。
12. detached Spec Hub window SHALL 占满独立窗口可用高度，并保留 reader header 中的阅读导航控制入口。
13. 触发 `Spec Hub` 的主入口 SHALL 直接打开或聚焦 detached Spec Hub window，而不是把主窗体切换到嵌入式 reader layer。
14. collapsed 状态下的 change pane expand affordance SHALL 呈现清晰可见的展开 icon。
15. detached Spec Hub window SHALL 保留现有 control center toggle，且首次进入时默认 SHALL 保持折叠。
16. 当 `tasks` artifact 的某个导航分组下仍存在未完成 checklist item 时，对应阅读导航项 SHALL 显示明确但低干扰的提醒标识。
17. detached Spec Hub window 在 macOS overlay titlebar 下 SHALL 继续可拖动，即使用户按下的是 menubar 内的非交互文本区域。
18. detached Spec Hub window 的默认窗口高度 SHALL 与 detached file explorer 维持同一紧凑基线，而不是额外放大成更高的 reader shell。

## Impact

- Frontend view:
  - `src/features/spec/components/spec-hub/presentational/SpecHubPresentationalImpl.tsx`
  - 新增 shared viewer / detached window 相关组件与 hooks
  - `src/router.tsx`
  - `src/bootstrap.ts`
  - `src/styles/spec-hub.css` 或新增 detached spec hub 样式文件
- Frontend state:
  - `src/features/spec/hooks/useSpecHub.ts`
  - 新增 surface-scoped reader session / detached session helper
  - `src/services/clientStorage.ts`（复用存储，不新增存储后端）
- QA / regression:
  - `src/features/spec/components/SpecHub.test.tsx`
  - 新增 detached Spec Hub session / router / reader navigation tests
  - `src/features/spec/components/DetachedSpecHubWindow.test.tsx`
  - `npm run check:large-files`
