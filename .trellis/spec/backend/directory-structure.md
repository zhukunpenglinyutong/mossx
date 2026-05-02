# Directory Structure（backend）

## 模块布局（基于当前代码）

```text
src-tauri/src/
  command_registry.rs
  state.rs
  storage.rs
  client_storage.rs
  engine/
  codex/
  workspaces/
  git/
  files/
  settings/
  local_usage/
  runtime_log/
  web_service/
```

## 落位规则

- command 函数按 domain 放在对应模块（如 `git/mod.rs`, `workspaces/mod.rs`）。
- command 注册统一在 `command_registry.rs`，禁止分散注册。
- 全局状态结构统一在 `state.rs`。
- 通用存储逻辑优先复用 `storage.rs` / `client_storage.rs`，避免重复造锁。

## 拆分规则

- 单文件过大时优先按 domain 子模块拆分（例如 `local_usage/*`）。
- 禁止按“技术类型”拆分成无业务语义目录（例如 `helpers_everything`）。
- 新增模块需在 `lib.rs`/`mod.rs` 中清晰导出，避免隐式依赖。

## 命名规则

- Rust 模块文件使用 `snake_case.rs`。
- command 名称与 frontend invoke 名保持语义一致。
- DTO/struct 命名保持 domain 语义，避免 `Data/Info/Temp`。

## Scenario: CLI / Skill Discovery Source Expansion

### 1. Scope / Trigger

- Trigger：修改 `src-tauri/src/skills.rs`、Claude/Codex CLI discovery、doctor probe、app-server binary resolution、Windows fallback 路径。
- 目标：新增 discovery source 时保持 deterministic priority、non-blocking scan 与可诊断 fallback。

### 2. Signatures

- Claude skill sources:
  - `project_claude`
  - `project_codex`
  - `global_claude`
  - `global_claude_plugin`
  - `global_codex`
- Windows CLI lookup:
  - PATH lookup first.
  - User-local install fallback only before reporting missing CLI.

### 3. Contracts

- Skill discovery MUST treat missing/unreadable roots as skipped sources, not fatal errors.
- Symlinked skill directories MAY be followed only when they resolve to a directory with `SKILL.md`; broken symlinks MUST be skipped.
- Duplicate skill names MUST resolve by explicit source priority, never by filesystem traversal order.
- Claude plugin cache roots MUST rank below user global Claude skills and above global Codex skills.
- Windows user-local CLI fallback MUST preserve diagnostics showing whether the binary came from PATH or fallback.
- A user-local fallback that resolves to `.cmd` / `.bat` MUST still pass through Windows wrapper compatibility checks.

### 4. Validation & Error Matrix

| 场景 | 必须行为 | 禁止行为 |
|---|---|---|
| plugin cache exists | return `global_claude_plugin` skills | override user `~/.claude/skills` with plugin copy |
| broken symlink | skip and continue | fail entire `skills_list` |
| unreadable root | skip source with diagnostic path if available | throw raw IO error to UI list |
| Windows PATH miss + user-local hit | use fallback and report fallback origin | report CLI missing before checking fallback |
| fallback wrapper | reuse `.cmd/.bat` compatibility planning | bypass wrapper retry guard |

### 5. Tests Required

- Rust unit tests for plugin cache root discovery and source priority.
- Rust unit tests for symlink skill directory inclusion and broken symlink skip.
- Windows CLI discovery tests for PATH miss + user-local fallback and wrapper classification.
