## Why

当前 Git 提交区存在两个已经漂移的 surface：右侧主 Git 面板支持 `selective commit` 与较完整的提交语义，但 Git History/HUB 内的 worktree 提交区仍是另一套独立实现。结果是同一个“提交当前工作区改动”的能力在不同入口下表现不一致，用户会看到“勾选了文件，但 AI 生成提交信息仍按全部 diff 生成”以及“右侧有的能力，HUB 里没有或语义不同”这类明显违背心智模型的问题。

这件事现在必须收敛，因为它已经不是单点 bug，而是 commit scope contract 没有贯穿 `UI -> service -> tauri -> git/codex backend`，并且 secondary surface 长期复制实现导致 behavior drift 持续扩大。若继续局部补丁，后续每次改动都要在两套入口上重复修补，回归风险和维护成本都会继续上升。

## 目标与边界

### 目标

- 目标 1：让“本次提交包含哪些文件”的语义在右侧 Git 面板与 Git History/HUB worktree 提交区完全一致。
- 目标 2：让 AI 生成提交信息严格遵守当前 commit scope，而不是默认读取整个 workspace diff。
- 目标 3：以右侧 Git 面板为 canonical surface，对齐 Git History/HUB 提交区的可见能力、提示文案与 enable/disable 语义。
- 目标 4：把后续实现门禁显式写入本变更规则，避免实现阶段绕过 CI sentry 或引入跨平台路径回归。
- 目标 5：保证切到右侧 Git 面板并打开 Git His 大面板时仍保持响应，不因 commit scope tree 渲染退化而卡死。

### 边界

- 以右侧 Git 面板为主做归一化；Git History/HUB worktree 提交区向其对齐，而不是反过来重写主面板。
- 首期只收敛 commit scope、AI commit message generation scope、surface feedback 与路径兼容性；不重做整个 Git History 面板布局。
- 现有引擎选择 / 语言选择 contract 保持不变，仍支持 `Codex / Claude / Gemini / OpenCode` 与 `zh / en`。
- 后续实现必须把 `.github/workflows/heavy-test-noise-sentry.yml` 作为测试/日志噪音门禁，把 `.github/workflows/large-file-governance.yml` 作为大文件门禁；proposal、design、tasks 与 code spec 均不得忽略这两个规则。
- 后续实现必须把 Win/mac 路径与写法兼容性当成显式规则，而不是实现细节：所有 commit scope path matching、folder toggle、path normalization、diff targeting 都必须对 `\\` / `/`、root trimming、case-stable display 做一致处理。

## 非目标

- 不在本轮引入新的 Git 提交引擎或新的 commit message 模板系统。
- 不在本轮改变真正的 `git commit` 底层事实来源；partial staged file 仍以现有 Git index 语义为准。
- 不在本轮统一整个 Git 面板所有 toolbar / branch / diff preview UI，只处理提交区相关 contract。
- 不为了“彻底复用”而立即做大规模 shared component 重写；若共享逻辑可以局部抽取，则优先抽 contract/helper。

## What Changes

- 把 AI commit message generation 从“workspace 全量 diff”升级为“scope-aware diff”：
  - 生成请求必须允许携带当前选中的 commit scope。
  - 未显式选中的文件不得进入本次提交信息生成上下文。
  - partial staged file 必须继续遵守现有 index 语义，不得因为 scope-aware generation 破坏 staged/unstaged 双态事实。
- 把 Git History/HUB worktree 提交区归一化到右侧 Git 面板 contract：
  - 提供与主 Git 面板一致的 file/folder/section inclusion control。
  - commit button enablement、hint copy、空 scope 阻断语义与主面板一致。
  - AI commit message generation 的 engine/language 入口保持一致，并按当前 scope 生效。
- 明确 secondary surface parity contract：
  - 所有复用“提交当前工作区改动”能力的 surface，必须遵守同一个 no-auto-stage、same-scope、same-feedback contract。
  - 同一 workspace 的不同 surface 不得在 commit scope 解释上出现“一个是选中文件，一个是全部 diff”的分裂行为。
- 把跨平台路径兼容性上升为规则：
  - commit scope 相关路径判断必须统一走 normalized path contract。
  - Win/mac 的路径分隔符、folder scope descendants 判断、single-file targeting 行为必须保持一致。
- 把实现门禁写入本变更：
  - 测试与日志输出必须遵守 `.github/workflows/heavy-test-noise-sentry.yml`。
  - 触碰大前端组件/hook/test/css 或 Rust git command 时，必须遵守 `.github/workflows/large-file-governance.yml`。

## 方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 只修 AI 生成提交信息，让它支持 selected paths；Git History/HUB 面板维持现状 | 改动小，见效快 | 两套 surface 继续漂移，后续 commit 语义仍不统一 | 不采用 |
| B | 以右侧 Git 面板为 canonical surface，补齐 Git History/HUB 提交区 contract，并打通 scope-aware generation | 用户心智一致，后续维护面收敛，能一次解决 bug + 漂移 | 需要前后端 contract 一起调整，并补跨层测试 | **采用** |
| C | 立即抽成一套全共享 Git commit surface 组件/状态机 | 长期最干净 | 当前范围过大，容易把提案从 bug fix 拉成大重构 | 暂不采用 |

取舍：采用方案 B。先把“同一能力跨 surface 一致”这个 contract 收敛到位，再决定是否进一步抽象为全共享组件。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `git-selective-commit`: 将 selective commit contract 从“主 Git 面板专属”升级为“所有共享提交 surface 的统一 contract”，并补齐 Git History/HUB worktree 提交区的 file/folder/section inclusion parity 与 Win/mac path normalization 规则。
- `git-commit-message-generation`: 将 AI 提交信息生成从 workspace-wide diff 语义升级为 scope-aware diff 语义，要求生成链路严格遵守当前 commit scope，并保持 engine/language selection contract 不变。
- `git-history-panel`: 调整 overview/worktree 提交区 requirement，使其与右侧主 Git 面板保持同一提交语义、同一阻断逻辑与同一反馈文案，而不是维持独立弱化版本。

## 验收标准

- 当用户在右侧 Git 面板只勾选部分文件时，AI 生成提交信息 MUST 只基于这些文件对应的 commit scope 生成，不得混入未选文件 diff。
- 当用户在 Git History/HUB worktree 提交区执行同样的勾选操作时，commit enablement、hint copy、生成结果 scope 与右侧 Git 面板 MUST 保持一致。
- 当同一路径同时存在 staged 与 unstaged changes 时，系统 MUST 继续保持 partial staged file 的 Git index 语义，不得因为 scope-aware generation 或 surface 对齐而破坏现有提交事实。
- 当路径来自 Windows 风格 `\\` 分隔符或 POSIX 风格 `/` 分隔符时，folder toggle、file toggle、selected path matching 与 diff targeting MUST 得到一致结果。
- 当用户切到右侧 Git 面板并打开 Git His 大面板时，提交区 tree 渲染与 scope 计算 MUST 保持响应，MUST NOT 因重复全树遍历导致界面卡死。
- 后续实现与验证 MUST 明确通过 `.github/workflows/heavy-test-noise-sentry.yml` 对应的噪音规则与 `.github/workflows/large-file-governance.yml` 对应的大文件规则，不得以“只是 UI 小改”绕过门禁。

## Impact

- Affected frontend:
  - `src/features/git/components/*`
  - `src/features/git-history/components/GitHistoryWorktreePanel.tsx`
  - `src/features/app/hooks/useGitCommitController.ts`
  - `src/services/tauri.ts`
  - 对应 Vitest 测试与 i18n copy
- Affected backend:
  - `src-tauri/src/codex/mod.rs`
  - `src-tauri/src/git/commands.rs`
  - `src-tauri/src/git/mod.rs`
  - 相关 command registry / payload mapping 测试
- API / contract impact:
  - `generate_commit_message` 与 `get_commit_message_prompt` 预计需要扩展可选 scope payload。
  - frontend -> tauri -> rust 的 commit message generation request mapping 会发生变更，但应保持 backward-compatible optional field 语义。
- Dependencies:
  - 不引入新第三方依赖。
- Systems / rules:
  - 本变更后续 design/tasks/specs 必须显式引用测试噪音 sentry、大文件治理 sentry 与 Win/mac path compatibility 规则。
