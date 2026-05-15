# Phase 1 Release Closure

Date: 2026-05-14
Owner approval context: user requested Phase 1 full closure and commit in the current session.
Host used for closure: macOS 26.4.1, Darwin 25.4.0, arm64.

## Closure Rule

This document closes the remaining Phase 1 OpenSpec archive gate without fabricating platform evidence.

- Local deterministic gates and macOS smoke evidence remain accepted as real evidence.
- Windows, WSL, Linux AppImage, Arch Wayland, isolated remote daemon, and live multi-session UI traces cannot be generated truthfully from this macOS host.
- Those items are closed for archive as owner-approved release qualifiers, not as claims that the platform smoke passed.
- Any release note or support decision that names those platforms must still use the qualifier matrix below.

## Release Qualifier Matrix

| Change | Remaining item | Closure decision | Release qualifier |
| --- | --- | --- | --- |
| `optimize-runtime-session-background-scheduling` | Interactive two-running-session UI profile | Archive waiver accepted; deterministic replay, focused tests, and noise gate remain the shipped evidence | Before claiming measured UI switch-lag improvement, capture a real app trace showing shell-visible-before-heavy-hydration and no inactive per-delta heavy render |
| `add-cli-one-click-installer` | Windows native npm `.cmd` install/update + doctor | Archive waiver accepted; macOS daemon smoke and command whitelist tests remain the shipped evidence | Before claiming Windows one-click installer support, run native Win11 smoke |
| `add-cli-one-click-installer` | Isolated remote daemon host installer smoke | Archive waiver accepted | Before claiming remote installer parity, verify the installer mutates daemon host only |
| `add-cli-one-click-installer` | WSL boundary verification | Archive waiver accepted | Before claiming WSL boundary coverage, verify Windows desktop does not cross-install into WSL except via remote daemon inside WSL/Linux |
| `fix-linux-appimage-wayland-library-pruning` | Linux AppImage artifact inspection | Archive waiver accepted; pruning script tests and workflow integration remain the shipped evidence | Before claiming Linux artifact proof, extract final AppImage and confirm `usr/lib/libwayland-*` is absent |
| `fix-linux-appimage-wayland-library-pruning` | Arch Wayland smoke | Archive waiver accepted | Before claiming affected Arch fix verified, run final AppImage directly on Arch Wayland and confirm no `wl_fixes_interface` failure |
| `fix-windows-codex-app-server-wrapper-launch` | Affected Win11 reproduction/fallback smoke | Archive waiver accepted; targeted Rust tests and macOS no-regression remain the shipped evidence | Before claiming affected-machine remediation verified, run the wrapper command and session creation on affected Win11 |
| `fix-windows-codex-app-server-wrapper-launch` | Healthy Win11 primary-path no-regression | Archive waiver accepted | Before claiming Windows no-regression, verify a healthy Win11 wrapper succeeds without fallback |
| `claude-code-mode-progressive-rollout` | Non-file native approval bridge | Closed as future work; generic shell/native command remains intentionally blocked through `modeBlocked` | Do not advertise shell/native command synthetic approval bridge in Phase 1 |
| `claude-code-mode-progressive-rollout` | `acceptEdits` rollout | Closed as future work; remains disabled until a separate semantic rollout change | Do not advertise `acceptEdits` as enabled in Phase 1 |
| `claude-code-mode-progressive-rollout` | Manual rollout matrix | Archive waiver accepted for matrix completion; existing tests and documented matrix remain shipped evidence | Before broad rollout, execute the manual matrix in `openspec/docs/claude-mode-rollout-v4-manual-test-matrix-2026-04-17.md` |

## Archive Candidates

The following Phase 1 changes may be archived after tasks are updated with this closure note:

- `add-cli-one-click-installer`
- `optimize-runtime-session-background-scheduling`
- `fix-linux-appimage-wayland-library-pruning`
- `fix-windows-codex-app-server-wrapper-launch`
- `claude-code-mode-progressive-rollout`

The following active changes are intentionally out of scope for this Phase 1 closure:

- `add-codex-structured-launch-profile`
- `project-memory-refactor`

## Follow-up Evidence

- 2026-05-15: `desktop-cc-gui#379` was recorded against `fix-linux-appimage-wayland-library-pruning` as the affected-user validation reference. The issue confirms the correct fix direction: remove bundled `usr/lib/libwayland-*` from the final Linux AppImage so host Mesa/EGL resolves against the system Wayland client ABI.
