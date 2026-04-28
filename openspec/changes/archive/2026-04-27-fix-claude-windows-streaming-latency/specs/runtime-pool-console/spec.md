## ADDED Requirements

### Requirement: Runtime Process Diagnostics MUST Not Block Claude Stream Hot Paths

The runtime diagnostics contract MUST allow bounded stale process information so user-visible Claude streaming remains low latency.

#### Scenario: Claude stream path does not wait for process diagnostics freshness
- **WHEN** a Claude realtime stream delta is being forwarded
- **THEN** runtime pool process diagnostics freshness MUST NOT be required before the stream delta is delivered
- **AND** the runtime row MAY temporarily retain the previous diagnostics snapshot while background refresh continues

#### Scenario: runtime row still shows active work while diagnostics refresh is pending
- **WHEN** a Claude runtime has active turn or stream protection
- **AND** process diagnostics refresh is pending, stale, or timed out
- **THEN** the runtime pool console MUST still represent the runtime as active-work protected
- **AND** stale process diagnostics MUST NOT cause the row to appear idle or evictable

#### Scenario: diagnostics freshness is observable without forcing synchronous refresh
- **WHEN** runtime pool console displays process diagnostics that came from cache, stale fallback, or timeout fallback
- **THEN** operators MUST have traceable freshness evidence through diagnostics metadata, runtime logs, or equivalent surface
- **AND** opening the console MUST NOT force Claude stream delta delivery to wait for a full Windows process snapshot

#### Scenario: Claude wrapper launch risk is diagnosable without becoming a stream prerequisite
- **WHEN** Claude launch metadata is already available from CLI resolution, command construction, or runtime row state
- **AND** the runtime was launched through a Windows wrapper such as `.cmd` or `.bat`, or with hidden-console process flags
- **THEN** runtime diagnostics MUST expose the available launch evidence such as `resolved_bin`, `wrapper_kind`, launch path classification, or hidden-console risk metadata
- **AND** the system MUST NOT run additional synchronous CLI probing or process-tree probing from the stream hot path solely to fill this wrapper metadata
- **AND** missing wrapper evidence MUST degrade to unknown diagnostics rather than changing runtime active-work protection
