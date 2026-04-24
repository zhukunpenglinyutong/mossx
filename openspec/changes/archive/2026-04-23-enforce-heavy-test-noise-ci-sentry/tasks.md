## 1. Gate script

- [x] 1.1 Add a Node-based heavy test noise gate script that can run heavy batched tests, capture the combined log, and classify `act(...)`, stdout, stderr, and environment-owned warnings.
- [x] 1.2 Add parser tests covering clean logs, repo-owned `act(...)` violations, repo-owned stdout/stderr payload leaks, and environment-owned allowlist handling.

## 2. CI integration

- [x] 2.1 Add a package script entry for the heavy test noise gate.
- [x] 2.2 Add a dedicated GitHub Actions workflow that runs on `pull_request`, `push`, and `workflow_dispatch`, executes the heavy test noise gate, and uploads the captured log artifact.

## 3. Verification

- [x] 3.1 Run `node --test scripts/check-heavy-test-noise.test.mjs`.
- [x] 3.2 Run `npm run check:heavy-test-noise`.
- [x] 3.3 Run `npm run lint`.
- [x] 3.4 Run `npm run typecheck`.
