## 1. Backend Discovery

- [x] 1.1 [P0][Input: `src-tauri/src/skills.rs`][Output: `global_claude_plugin` source constant and root discovery helper][Verify: Rust unit test] Add Claude plugin cache skill root discovery.
- [x] 1.2 [P0][Depends: 1.1][Input: skill source merge order][Output: plugin cache skills merged after `global_claude` and before `global_codex`][Verify: Rust merge test] Preserve deterministic merge behavior.

## 2. Frontend Presentation

- [x] 2.1 [P1][Input: Settings Skills engine config][Output: Claude engine recognizes `global_claude_plugin` and plugin cache path marker][Verify: `npm run typecheck`] Wire plugin skill source into Settings Skills.
- [x] 2.2 [P1][Input: Composer skill source priority][Output: plugin skill source sorted after user Claude global skills][Verify: `npm run typecheck`] Keep slash skill candidate ordering deterministic.

## 3. Verification

- [x] 3.1 [P0][Depends: 1.x][Input: Rust unit tests][Output: targeted `skills::` tests pass][Verify: `cargo test --manifest-path src-tauri/Cargo.toml skills::`]
- [x] 3.2 [P1][Depends: 2.x][Input: TS changes][Output: clean typecheck][Verify: `npm run typecheck`]
