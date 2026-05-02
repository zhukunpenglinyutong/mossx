# Add Claude plugin skill discovery

## Goal

修复 GitHub issue #394：Settings → Skills 面板必须能发现 Claude Code `/plugin` 安装到 `~/.claude/plugins/cache/*/*/skills` 下的 skill。

## Requirements

- OpenSpec change: `add-claude-plugin-skill-discovery`。
- 后端返回新增 source `global_claude_plugin`，用于区分 plugin cache skill。
- 缺少或不可读 plugin cache 时不得影响现有 skill discovery。
- 不在本任务处理 symlink skill 目录；issue #303 可作为后续独立 PR。
- 不新增依赖，不新增 Tauri command。

## Acceptance Criteria

- [x] `skills_list` 可以返回 Claude plugin cache skill。
- [x] Settings Skills Claude 分组可以展示 plugin skill。
- [x] targeted Rust tests 通过。
- [x] `npm run typecheck` 通过。

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml skills::`
- `npm run typecheck`
