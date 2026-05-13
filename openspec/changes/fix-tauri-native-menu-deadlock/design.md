## Context

macOS hang report for `cc-gui` 0.4.16 shows a stable cross-thread wait pattern:

```text
main thread
  -> WebKit WebPageProxy::startURLSchemeTask
  -> wry wkwebview url_scheme_handler::start_task
  -> tauri::ipc::protocol::get
  -> tauri::menu::plugin::new
  -> Webview::resources_table
  -> std mutex lock
  -> blocked by tokio-runtime-worker

tokio-runtime-worker
  -> tauri::ipc::InvokeResolver::respond_async_serialized_inner
  -> tauri::menu::Menu::popup_inner
  -> std::sync::mpmc::Receiver::recv
  -> parked waiting for main thread response

other tokio workers
  -> WKURLSchemeTaskImpl didReceiveResponse
  -> WTF::callOnMainRunLoopAndWait
```

这说明问题不是 CPU、内存、磁盘，也不是单纯 WebKit 空闲等待；它是 native menu popup、Tauri resource table、WebKit URL scheme task 同时参与 main runloop 后形成的等待环。

版本对比进一步缩小范围：

- `v0.4.13..v0.4.16` 的 Tauri/Wry/Tao 依赖无实质变化。
- `v0.4.16` 新增 `CheckpointCommitDialog`，其中 `showCommitMessageEngineMenu` 的 native menu action 内再次调用 `showCommitMessageLanguageMenu` 打开第二个 native menu。
- `useSidebarMenus` 在同一版本区间显著加重 thread menu：archive、move-to-folder header、search target、最多 12 个 folder item 等动态菜单项。

因此本设计采用“移除高风险 native popup 触发面 + guard 防回归”的策略，而不是先等待上游依赖修复。

## Design Goals

- 先修不可恢复 hang 的高置信触发面。
- 不牺牲用户现有业务操作。
- 不扩大 Tauri command contract 变更面。
- 用 renderer UI 替代 transient context menu，避免 native bridge 同步等待。
- 让后续新增菜单默认走安全 primitive。

## Options

### Option A: Upgrade Tauri/Wry/WebKit only

做法：升级 Tauri/Wry/Tao/WebKit 相关依赖，观察是否消失。

优点：

- 改动业务代码少。
- 如果上游已经修复，可以快速收益。

缺点：

- `v0.4.13..v0.4.16` 依赖未变化，升级不是当前 regression 的直接解释。
- WebKit/Tauri native menu 同步等待的架构风险仍存在。
- 无法阻止后续业务代码继续新增 nested/dynamic native menu。
- 上游升级可能引入更大桌面兼容性回归。

结论：不作为第一修复路径，可作为后续依赖卫生任务。

### Option B: Patch Tauri menu call sequencing

做法：保留 native menu，但对调用顺序做避让，比如 `setTimeout`、序列化 `MenuItem.new`、避免嵌套 popup、延迟到 idle。

优点：

- UI 视觉接近原生菜单。
- 单点改动看似较小。

缺点：

- 仍然依赖 native popup 与 main runloop 同步通信。
- `setTimeout` 只能降低概率，不能消除等待环。
- large dynamic menu 和 WebKit URL scheme 叠加时仍有风险。
- 难以用测试证明“不会死锁”。

结论：只能作为短期缓解，不足以修 severe bug。

### Option C: Renderer-owned context menu primitive

做法：在 React 层提供轻量 context menu / popover primitive，高风险业务菜单迁移到 renderer UI。native menu 只保留给 app-level / OS-integrated allowlist。

优点：

- 直接移除 `Menu.new` / `menu.popup` 死锁触发面。
- 易于测试 action、disabled state、focus dismissal、keyboard behavior。
- 后续菜单能力可以复用，不再新增 Tauri menu resource。
- 与 WebKit asset/custom protocol 隔离。

缺点：

- 需要补充菜单定位、outside click、escape、keyboard、z-index、viewport clamp。
- 原生 Services menu 等 OS 集成能力不能直接复用。

结论：采用。业务 context menu 不需要 OS-level Services，稳定性收益大于视觉差异成本。

## Proposed Architecture

### Renderer Menu Primitive

新增或复用一个 renderer-owned menu primitive，建议接口保持数据驱动：

```ts
type RendererMenuItem =
  | {
      type: "item";
      id: string;
      label: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void | Promise<void>;
    }
  | {
      type: "separator";
      id: string;
    }
  | {
      type: "label";
      id: string;
      label: string;
    };

type RendererMenuState = {
  x: number;
  y: number;
  items: RendererMenuItem[];
  source: "thread" | "worktree" | "file-link" | "commit-message" | string;
} | null;
```

核心行为：

- 由 React state 控制 open/close。
- 位置基于 pointer/client coordinate，并做 viewport clamp。
- 点击 item 后先 close，再执行 action，避免 action 期间菜单仍持有 transient UI 状态。
- Escape / outside pointer down / window blur 关闭。
- disabled item 不触发 action。
- 视觉层使用现有 CSS 变量和 sidebar/menu 风格，不引入新依赖。

### Migration Priority

P0 先迁移 stackshot 高相关路径：

1. `CheckpointCommitDialog`
   - 去掉 nested native menu。
   - 推荐 flatten：展示 engine choices 后直接展示 language options，或使用二级 renderer submenu。
   - 最小实现可用一个 popover：engine rows + language chips。

2. `useSidebarMenus`
   - 将 thread/worktree menu item 构建从 async Tauri resource creation 改成 pure data。
   - move folder target 列表直接渲染在 menu 中；超过 inline limit 时保留 search picker action。

3. `useFileLinkOpener`
   - 由于文件链接常出现在 markdown render / asset URL 场景，优先迁移。
   - `Services` native item 可以删除或以 disabled label 保留，不作为业务关键功能。

P1 迁移剩余 renderer feature native popup：

- `GitDiffPanel`
- `GitHistoryWorktreePanel`
- `FileTreePanel`
- `PromptPanel`
- `ComposerQueue`
- `useLayoutNodes`

### Native Menu Allowlist

允许范围：

- Rust app menu bar：`src-tauri/src/menu.rs`
- 系统 tray / app-level OS integration，如未来存在。
- 显式记录的例外文件，必须说明为什么 renderer menu 不满足。

禁止范围：

- `src/features/**` 内的动态业务 context menu。
- native menu action 内再打开 native menu。
- 与 file/markdown/image preview、`convertFileSrc`、`asset://`、custom protocol 交互邻近的 popup。

### Backend Defensive Fix

`MenuItemRegistry::set_text` 当前存在持 registry mutex 后调用 `item.set_text(text)` 的模式。即使这不是本次 stackshot 的主因，也属于同类锁顺序风险。应改为：

```rust
let item = self.items.lock().ok().and_then(|items| items.get(id).cloned());
if let Some(item) = item {
    item.set_text(text)?;
    return Ok(true);
}
```

submenu 同理。`set_accelerator` 已接近这种模式，应保持一致。

## Data Flow

### Before

```text
React right click / button click
  -> async MenuItem.new N times
  -> Menu.new
  -> menu.popup(position, window)
  -> Tauri resource table / native menu plugin
  -> main runloop synchronous response
```

### After

```text
React right click / button click
  -> build RendererMenuItem[]
  -> setRendererMenuState
  -> React renders menu overlay
  -> user selects item
  -> close menu
  -> call existing business callback / Tauri command only for actual action
```

## Test Strategy

### Automated

- Vitest for migrated menu item projection:
  - thread menu labels/actions/disabled states
  - commit message engine/language callback payload
  - file link open/reveal/copy behavior
- Static guard:
  - detect direct `@tauri-apps/api/menu` imports under `src/features/**`
  - detect `.popup(` call sites in high-risk paths
  - allowlist must be explicit and small
- Rust tests for `MenuItemRegistry` lock-scope behavior where feasible; otherwise add focused code review guard and existing menu tests.

### Manual macOS Matrix

- Open commit checkpoint dialog, rapidly open/close generate menu 30 times.
- Select each engine/language path.
- Right-click a thread with more than 12 folder targets, rapidly move pointer/click outside/open again.
- Right-click file links inside markdown messages with image/file previews present.
- Repeat while the app is loading images via `asset://`.
- Confirm app remains responsive for at least 5 minutes without force quit.

## Rollout

1. Land renderer menu primitive and static guard in disabled/no-op migration form.
2. Migrate `CheckpointCommitDialog`, `useSidebarMenus`, `useFileLinkOpener`.
3. Run focused tests and macOS manual matrix.
4. Migrate remaining `src/features/**` native popup paths.
5. Tighten guard from warn/list mode to fail mode.

## Rollback

- If renderer menu has visual/interaction regression, rollback can be scoped per migrated menu by keeping the old native implementation behind a temporary development-only flag.
- Release rollback must prefer disabling the affected menu feature over re-enabling native popup on macOS, because the native popup path can hard hang the whole app.
- Backend lock-scope fix is low risk and should not need rollback unless it changes error propagation.

## Open Questions

- 是否需要保留 macOS native `Services` entry for file links？当前它不是关键业务能力，建议第一阶段移除或降级为普通 disabled label。
- P1 迁移是否一次性完成所有 native popup，还是先 P0 发 hotfix？建议先 P0 hotfix，再 P1 收口。
