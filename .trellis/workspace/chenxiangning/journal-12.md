# Journal - chenxiangning (Part 12)

> Continuation from `journal-11.md` (archived at ~2000 lines)
> Started: 2026-05-09

---



## Session 389: 修复跨平台 CI 前置契约

**Date**: 2026-05-09
**Task**: 修复跨平台 CI 前置契约
**Branch**: `feature/v0.4.15`

### Summary

(Add summary)

### Main Changes

修复 PR #521 中两类 CI 前置契约失败：

- Windows doctor 的 `check-branding` 使用 `fileURLToPath(new URL(...))` 解析仓库根路径，避免 URL pathname 在 Windows 上形成 `D:\D:\...` 双盘符路径。
- macOS Rust CI 的 `memory-kind-contract` 与 `test-tauri` 在 `cargo test` 前执行 `npm run build`，确保 Tauri build script 依赖的 `../dist/*` 资源存在。

验证：
- `npm run check:branding`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml classify_kind_matches_contract_samples`
- `git diff --check -- .github/workflows/ci.yml scripts/check-branding.mjs`

注意：本次提交只包含 `.github/workflows/ci.yml` 与 `scripts/check-branding.mjs`，工作区其他未提交业务改动未纳入提交。


### Git Commits

| Hash | Message |
|------|---------|
| `684395ca` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
