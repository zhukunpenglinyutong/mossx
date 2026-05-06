# Deep Interview Spec — desktop-cc-gui Contributor Strategy

## Metadata
- Profile: standard
- Rounds: 2
- Final ambiguity: 16.4% (threshold 20%)
- Context type: brownfield GitHub repository
- Context snapshot: `.omx/context/contributor-strategy-20260430T104428Z.md`
- Generated: 2026-04-30T11:17:54.996323+00:00

## Intent
The user wants to become a contributor to `zhukunpenglinyutong/desktop-cc-gui` in a way that builds maintainer trust.

## Desired Outcome
A ranked recommendation of open issues that are high-value, relatively easy to fix, and easy to submit as a focused PR, plus a concrete first-PR strategy.

## In Scope
- Analyze current contributors' commit/PR/issue counts.
- Inspect current open issues and local code touchpoints.
- Recommend first PR candidates and follow-up issues.
- Keep recommendations practical and evidence-backed.

## Out of Scope / Non-goals
- Do not choose a large feature as the first PR.
- Do not implement code directly inside deep-interview mode.
- Avoid roadmap-sized changes such as mobile app, remote dev, WeChat integration, or major runtime rewrites as the first PR.

## Decision Boundaries
- Optimize for maintainer trust over raw speed or maximum impact.
- Prefer small, well-tested fixes with clear issue references and low review burden.
- It is acceptable to recommend commenting first when a change may touch security/symlink/runtime policy.

## Constraints
- No new dependency should be needed for the best first PR candidate.
- Prefer changes that can be verified with targeted Rust/TS tests plus typecheck/lint if implementing later.
- GitHub API queries hit secondary rate limiting during analysis; avoid unnecessary repeated API scraping.

## Acceptance Criteria
- Provides contributor counts and caveats.
- Lists top issue candidates with value/ease/PR-risk reasoning.
- Identifies one recommended first PR and a concise implementation/test plan.
- Includes links to repo/issues/PRs used as sources.

## Brownfield Evidence vs Inference
- Evidence: `src-tauri/src/skills.rs` scans `.claude/skills`, `.codex/skills`, `.agents/skills`, `.gemini/skills`; no `~/.claude/plugins/cache/*/*/skills` scan found.
- Evidence: `src-tauri/src/skills.rs` explicitly skips symlink entries, relevant to #303.
- Evidence: Git commit message generation uses workspace-wide diff via `get_workspace_diff`, while the UI already tracks `selectedCommitPaths` for committing.
- Evidence: terminal shell path currently comes from `COMSPEC` on Windows or `$SHELL` on non-Windows in `src-tauri/src/terminal.rs`.
- Inference: #394 is the best trust-building first PR because a commenter explicitly invited a PR, the code path is localized, and no open PR mentioning #394 was found in the successful search snapshot.

## Recommended Handoff
Use `$ralplan` or direct solo execution for issue #394 if implementation is requested next. Do not implement from this deep-interview artifact alone unless the user explicitly switches execution mode.
