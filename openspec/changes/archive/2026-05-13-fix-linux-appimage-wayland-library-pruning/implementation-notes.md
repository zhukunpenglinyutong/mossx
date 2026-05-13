## Implementation Notes

### Summary

`fix-linux-appimage-wayland-library-pruning` has been implemented as a Linux AppImage packaging post-process. The runtime startup guard remains unchanged; the fix lives at artifact build time because the reported failure is a dynamic loader ABI conflict between system Mesa/EGL and bundled `libwayland-*` libraries inside the AppImage.

### Code Evidence

- `.github/workflows/release.yml`
  - Downloads `appimagetool` for the Linux release job.
  - Runs the Wayland library pruning step after Tauri creates the AppImage.
  - Removes the stale signature and signs the pruned AppImage, so updater metadata matches the final artifact.
- `scripts/build-platform.mjs`
  - Runs the same pruning step for local Linux AppImage builds.
  - Leaves macOS and Windows build paths untouched.
- `scripts/prune-appimage-wayland-libs.mjs`
  - Extracts the AppImage in a temporary directory.
  - Deletes only `squashfs-root/usr/lib/libwayland-*`.
  - Repackages through `appimagetool`.
  - Restores the original AppImage on repack failure.
- `scripts/prune-appimage-wayland-libs.test.mjs`
  - Covers the deletion boundary.
  - Covers missing input / missing tool fail-fast behavior.
  - Covers repack failure recovery.

### Validation Evidence

- `node --test scripts/prune-appimage-wayland-libs.test.mjs` was run during implementation.
- `npm run typecheck` was run during implementation.
- `openspec validate --all --strict --no-interactive` passes after the backfill pass.

### Remaining Manual Evidence

- `tasks.md` keeps `4.3` open until a Linux build artifact is extracted and checked with `find squashfs-root/usr/lib -name 'libwayland-*'`.
- `tasks.md` keeps `4.4` open until an Arch Linux / Wayland smoke test confirms the final AppImage starts without the `wl_fixes_interface` failure.

### Rollback

Rollback is build-only:

- Remove the Linux pruning call from `.github/workflows/release.yml`.
- Remove the local Linux pruning call from `scripts/build-platform.mjs`.
- Delete `scripts/prune-appimage-wayland-libs.mjs` and its targeted tests.

No user data migration or frontend/runtime rollback is required.
