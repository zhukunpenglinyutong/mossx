## ADDED Requirements

### Requirement: Runtime Generation MUST Bound Codex Liveness Recovery

The runtime stability layer MUST preserve enough runtime generation identity to distinguish current Codex runtime state from stale predecessor shutdowns, events, and diagnostics.

#### Scenario: predecessor shutdown cannot poison successor conversation state
- **WHEN** a Codex runtime is replaced or reacquired
- **AND** the predecessor later emits runtime-ended, manual-shutdown, stdout-eof, or process-exit diagnostics
- **THEN** those diagnostics MUST be associated with the predecessor generation
- **AND** they MUST NOT mark the successor generation's active conversation as failed unless affected work identity matches

#### Scenario: explicit user recovery starts a fresh generation-aware attempt
- **WHEN** a user explicitly retries, reconnects, or continues in a new Codex conversation after a runtime failure
- **THEN** the recovery path MUST create, await, or verify a fresh generation-aware runtime attempt
- **AND** it MUST NOT reuse a runtime already marked stopping, ended, or stale for foreground execution

#### Scenario: runtime diagnostics include liveness source
- **WHEN** runtime stability emits a diagnostic for a Codex liveness failure
- **THEN** the diagnostic MUST include recovery source, guard state, shutdown source when available, and runtime generation or equivalent process identity when available
- **AND** frontend diagnostics MUST be able to correlate that diagnostic with the affected thread or draft state when known

### Requirement: Runtime Readiness MUST Stay Separate From Conversation Identity Readiness

Runtime stability actions MUST report runtime health without implying that a previously active Codex thread identity is still usable.

#### Scenario: ready runtime with missing thread remains recoverable identity failure
- **WHEN** `ensureRuntimeReady` succeeds for a workspace
- **AND** subsequent `thread/resume` or `turn/start` for the active Codex thread returns `thread not found` or equivalent identity failure
- **THEN** the system MUST treat the result as identity recovery failure, not runtime recovery failure
- **AND** the recovery surface MUST offer rebind, fresh continuation, or failed outcome according to identity recovery contract

#### Scenario: runtime reconnect button does not imply resend target validity
- **WHEN** the user clicks a runtime reconnect action from a conversation surface
- **THEN** the action MUST only certify runtime readiness
- **AND** any resend target MUST still be verified, rebound, or freshly created before user intent is replayed

### Requirement: Codex Runtime Stability MUST Be Cross-Platform Across macOS And Windows

Codex runtime stability MUST use platform-neutral process, path, spawn, shutdown, and watchdog contracts so macOS and Windows produce equivalent lifecycle outcomes.

#### Scenario: runtime identity is not pid-only
- **WHEN** runtime stability records or compares a Codex process identity
- **THEN** the identity MUST use a monotonic runtime generation or a composite identity such as `pid + startedAt`
- **AND** pid alone MUST NOT be used as the generation boundary because process ids can be reused across platforms

#### Scenario: executable paths are resolved with platform APIs
- **WHEN** the system resolves Codex executable, workspace, log, storage, or diagnostic paths
- **THEN** it MUST use Rust/Tauri path APIs, `PathBuf`, app path resolvers, or existing storage helpers
- **AND** it MUST NOT build correctness-critical paths by manually concatenating `/` or `\` separators

#### Scenario: spawn arguments are not shell-quoted strings
- **WHEN** the system starts or restarts a Codex runtime process
- **THEN** command arguments MUST be passed as structured args to the process API
- **AND** lifecycle correctness MUST NOT depend on shell-specific quoting, escaping, or Unix-only wrapper commands

#### Scenario: shutdown reason is normalized
- **WHEN** a Codex runtime ends through manual shutdown, stdout eof, process exit, watchdog settlement, or platform-specific termination
- **THEN** backend diagnostics MUST map that event to a platform-neutral shutdown reason
- **AND** frontend lifecycle decisions MUST consume the normalized reason rather than parsing OS-specific error strings
