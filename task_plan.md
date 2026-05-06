# Contributor Issue Sweep Plan

## Goal
Find the 5 highest-value, easiest-to-fix open issues in `zhukunpenglinyutong/desktop-cc-gui`, implement focused fixes, and open separate PRs against `chore/bump-version-0.4.12` where feasible.

## Constraints
- Keep maintainer trust: small scoped PRs, no large features.
- Base every PR on `chore/bump-version-0.4.12`.
- Use TDD for bugfixes: reproduce with failing test before implementation.
- Do not include `.omx/` or planning files in PR commits unless explicitly needed.
- Prefer existing patterns and avoid new dependencies.

## Phases
1. [complete] Refresh issue list and rank by value/ease.
2. [in_progress] Select top 5 candidates and map code/test surfaces.
3. [pending] Implement candidate 1 as focused branch/PR.
4. [pending] Implement candidate 2 as focused branch/PR.
5. [pending] Implement candidate 3 as focused branch/PR.
6. [pending] Implement candidate 4 as focused branch/PR.
7. [pending] Implement candidate 5 as focused branch/PR.
8. [pending] Final report with PR links and any skipped candidates.

## Success Criteria
- At least 5 issues ranked with evidence.
- Each implemented issue has a minimal fix, regression test, verification, commit, push, and PR.
- If fewer than 5 are safely fixable, document blockers and continue with the next-best candidate.

## Errors Encountered
| Time | Error | Resolution |
|---|---|---|
| 2026-05-01 | `gh issue list` network error: error connecting to api.github.com | Retry with escalated network command; fall back to previously fetched `gh api` output if needed. |
| 2026-05-01 | `omx explore` unavailable (`command not found`) | Fall back to `rg`/local inspection. |
