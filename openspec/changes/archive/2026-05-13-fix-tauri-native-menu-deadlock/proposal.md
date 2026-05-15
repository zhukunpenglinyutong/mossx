## Why

`cc-gui` 0.4.16 在 macOS 上出现 280s 不恢复 hang，stackshot 显示主线程卡在 Tauri/Wry/WebKit URL scheme handling 与 `tauri::menu` resource table mutex，后台 Tokio 线程同时卡在 `tauri::menu::Menu::popup_inner` 的同步等待。这不是性能慢，而是 native menu popup、WebKit main runloop、Tauri resource table 之间的死锁级风险。

0.4.13 已存在同类 native menu 风险但触发面较轻，0.4.16 新增 `CheckpointCommitDialog` 的嵌套 native menu，并显著加重 sidebar thread menu item 构建量，使“偶发可恢复卡顿”升级为“不可恢复假死”。必须把高风险 native popup 从关键 UI 路径中移除，并建立后续禁止回归的行为契约。

> 🛠 **深度推演**：[L2] 根因不是某一个菜单项写错，而是 React/WebKit UI 线程与 Tauri native menu 同步 API 共用主线程资源时形成了跨线程等待环；[L3] 桌面 WebView 应用的上下文菜单若不是系统级必须能力，应优先使用 renderer-owned UI，避免把 transient interaction 交给会阻塞 main runloop 的 native bridge。

## 目标与边界

### 目标

- 消除 macOS 上由 `@tauri-apps/api/menu` 动态创建和 `menu.popup(...)` 触发的不可恢复 UI deadlock。
- 将高频、动态、嵌套、靠近 WebKit asset/custom protocol 的菜单迁移为 React-rendered context menu / popover。
- 保持用户交互能力不倒退：thread 操作、commit message engine/language 选择、file link 操作仍可达。
- 建立 lint / test / code review guard，防止未来继续在高风险路径新增 native popup。
- 对 Rust app menu registry 的 mutex 持锁调用进行防御性收敛，降低同类锁等待风险。

### 非目标

- 不重写全局菜单栏、系统托盘、应用级 menu bar 这类真正需要 native menu 的场景。
- 不升级 Tauri/Wry/WebKit 作为第一解法；当前 `v0.4.13..v0.4.16` 依赖未变化，升级不是直接根因修复。
- 不重做所有右键菜单视觉体系；第一阶段只抽一个轻量共享菜单 primitive 并迁移高风险调用点。
- 不改变 thread/file/git/commit 的业务 command contract。
- 不把本问题混入 runtime session lifecycle 或 provider stream 稳定性修复。

## What Changes

- 新增客户端 native menu deadlock prevention 契约：
  - renderer 内动态业务菜单 MUST 使用 React-rendered menu / popover。
  - nested menu、large dynamic menu、WebKit asset/custom protocol 附近的菜单 MUST NOT 使用 `@tauri-apps/api/menu` popup。
  - native menu 仅允许保留在 app-level menu bar、OS services 或经明确登记的例外路径。
- 迁移最高风险触发面：
  - `CheckpointCommitDialog` 的 engine -> language 嵌套 native menu 改为 renderer popover 或 flatten menu。
  - `useSidebarMenus` 的 thread menu / worktree menu 改为 renderer context menu，尤其覆盖 move-to-folder 动态列表。
  - `useFileLinkOpener` 的 file link menu 改为 renderer context menu，避免与 `asset://` markdown/file preview 链路叠加。
- 分阶段迁移剩余 native popup：
  - Git diff / git history / file tree / prompt / composer queue / layout tab 等较低风险路径纳入同一 primitive，避免长期双栈。
- 增加静态 guard：
  - 禁止在 `src/features/**` 直接 import `@tauri-apps/api/menu`，除 allowlist 文件外。
  - 测试或脚本必须能列出所有剩余 native popup 使用点。
- 增加回归验证：
  - menu action unit tests 覆盖迁移后关键操作。
  - manual hang matrix 覆盖 0.4.16 stackshot 对应触发路径。
- 防御性 backend 修复：
  - `MenuItemRegistry` 更新 text / accelerator 时不得在 registry mutex 持锁期间调用 Tauri menu item mutator。

## Capabilities

### New Capabilities

- `client-native-menu-deadlock-prevention`: 约束 renderer 内动态业务菜单的实现方式、native menu allowlist、deadlock 防护、迁移优先级和验证要求。

### Modified Capabilities

- None.

## Impact

### Affected Frontend Code

- `src/features/status-panel/components/CheckpointCommitDialog.tsx`
- `src/features/app/hooks/useSidebarMenus.ts`
- `src/features/messages/hooks/useFileLinkOpener.ts`
- 后续阶段包括：
  - `src/features/git/components/GitDiffPanel.tsx`
  - `src/features/git-history/components/GitHistoryWorktreePanel.tsx`
  - `src/features/files/components/FileTreePanel.tsx`
  - `src/features/layout/hooks/useLayoutNodes.tsx`
  - `src/features/composer/components/ComposerQueue.tsx`
  - `src/features/prompts/components/PromptPanel.tsx`

### Affected Backend Code

- `src-tauri/src/menu.rs`

### Tooling / Tests

- 新增或扩展 native menu usage guard script。
- 更新相关 Vitest mock，不再默认 mock `@tauri-apps/api/menu` 作为业务菜单依赖。
- 增加 targeted tests 与 macOS manual verification matrix。

### Acceptance Criteria

- 复现路径中不再出现 `Menu.new` / `MenuItem.new` / `menu.popup` 调用。
- `CheckpointCommitDialog` 不再从 native menu action 中打开另一个 native menu。
- thread right-click 菜单在 12 个以上 folder target 场景下仍由 renderer UI 承载，不阻塞 main runloop。
- file link context menu 在 markdown/image/file preview 页面可用，且不触发 Tauri native popup。
- 静态 guard 能阻断 `src/features/**` 新增非 allowlist native menu import。
- `openspec validate fix-tauri-native-menu-deadlock --type change --strict --no-interactive` 通过。

## Release Note

- Fixed a macOS desktop hang risk caused by native popup menus in dynamic in-app menus. File, Git, prompt, composer, sidebar, file-link, layout tab, and commit-message selector menus now use renderer-owned menus; app-level native menus remain unchanged.
