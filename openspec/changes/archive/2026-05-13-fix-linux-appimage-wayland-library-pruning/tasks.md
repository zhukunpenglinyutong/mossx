## 1. OpenSpec Proposal

- [x] 1.1 [P0][depends: none][input: Arch Linux failure report][output: proposal/design/tasks][verify: code review] Describe why bundled `libwayland-*` conflicts with system Mesa/EGL and why runtime env fallback is insufficient.
- [x] 1.2 [P0][depends: 1.1][input: `linux-appimage-startup-compatibility`][output: spec delta][verify: `openspec validate fix-linux-appimage-wayland-library-pruning --strict`] Add artifact-level AppImage pruning requirement.

## 2. AppImage Pruning Script

- [x] 2.1 [P0][depends: 1][input: generated AppImage path][output: `scripts/prune-appimage-wayland-libs.mjs`][verify: targeted node test] Implement extraction, `usr/lib/libwayland-*` deletion, repack, and failure recovery.
- [x] 2.2 [P0][depends: 2.1][input: script internals][output: `scripts/prune-appimage-wayland-libs.test.mjs`][verify: `node --test scripts/prune-appimage-wayland-libs.test.mjs`] Cover deletion boundary and repack failure recovery.
- [x] 2.3 [P1][depends: 2.1][input: CLI arguments][output: clear CLI errors][verify: targeted node test] Fail fast for missing AppImage path or missing appimagetool.

## 3. Build Integration

- [x] 3.1 [P0][depends: 2][input: `scripts/build-platform.mjs`][output: local Linux build calls pruning script after Tauri AppImage build][verify: code review] Ensure macOS/Windows build functions are untouched.
- [x] 3.2 [P0][depends: 2][input: `.github/workflows/release.yml`][output: Linux release downloads appimagetool, prunes AppImage, then signs final artifact][verify: workflow review] Ensure updater signature is generated after pruning.
- [x] 3.3 [P1][depends: 3.2][input: release artifact upload patterns][output: no change to macOS/Windows upload][verify: code review] Confirm upload still includes final `.AppImage` and `.AppImage.sig`.

## 4. Validation

- [x] 4.1 [P0][depends: 2-3][input: script tests][output: targeted tests pass][verify: `node --test scripts/prune-appimage-wayland-libs.test.mjs`] Run Node tests.
- [x] 4.2 [P0][depends: 2-3][input: TypeScript project][output: typecheck pass][verify: `npm run typecheck`] Run typecheck.
- [x] 4.3 [P1][depends: 3][input: Linux build environment with appimagetool][output: release qualifier recorded][verify: owner-approved archive waiver] Final AppImage extraction check remains a release qualifier; this macOS host did not fabricate Linux artifact contents. See `openspec/docs/phase1-release-closure-2026-05-14.md`.
- [x] 4.4 [P1][depends: 4.3][input: Arch Linux Wayland environment][output: release qualifier recorded][verify: owner-approved archive waiver] Affected Arch Wayland smoke remains a release qualifier; final AppImage must still be run on Arch Wayland before claiming the `wl_fixes_interface` failure is verified fixed. See `openspec/docs/phase1-release-closure-2026-05-14.md`.
