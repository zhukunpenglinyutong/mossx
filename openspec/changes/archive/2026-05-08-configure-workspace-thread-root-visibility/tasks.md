## 1. Spec And Contract

- [x] 1.1 [P0][depends:none][input: confirmed product direction][output: proposal/spec/design for workspace-scoped root visibility setting][verify: `openspec validate configure-workspace-thread-root-visibility --strict --no-interactive`] 补齐 OpenSpec artifacts，明确默认值、范围、会话管理入口和 sidebar 阈值语义。

## 2. Cross-Layer Setting

- [x] 2.1 [P0][depends:1.1][input: existing WorkspaceSettings contract][output: `visibleThreadRootCount` added to TS + Rust workspace settings with normalize/clamp helper][verify: `npm run typecheck` plus targeted payload tests if needed] 扩展 workspace settings 数据模型，并保持 frontend->Tauri->Rust 持久化链路一致。

- [x] 2.2 [P0][depends:2.1][input: existing thread row derive path][output: sidebar/worktree/folder tree root visibility uses workspace-scoped threshold instead of hardcoded constant][verify: focused Vitest on `ThreadList` / sidebar threshold behavior] 让 sidebar 展示阈值按 workspace 设置生效，并保持 `More...` / `Load older...` 原语义。

## 3. Session Management UI

- [x] 3.1 [P1][depends:2.1][input: `SessionManagementSection` and `SettingsView` wiring][output: workspace-level numeric setting editor with default 20 and save flow][verify: focused Vitest on session management setting interaction] 在会话管理页提供 root 会话默认显示数量配置入口。

## 4. Verification

- [x] 4.1 [P0][depends:2.2,3.1][input: completed implementation][output: regression coverage for default 20, custom value, clamp, and pagination gating semantics][verify: focused Vitest suites + `npm run typecheck`] 验证默认值、动态生效、折叠展开与分页门禁不回归。

## 5. Folder-Scoped Session Creation

- [x] 5.1 [P1][depends:2.2][input: existing session folder tree and create-session menu][output: child folder new-session action assigns the created session to the target folder][verify: focused Vitest on sidebar folder-scoped new session] 在子文件夹层提供添加会话入口，并确保新建会话落入对应子文件夹。
