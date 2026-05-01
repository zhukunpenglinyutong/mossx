## MODIFIED Requirements

### Requirement: Delete Semantics Must Be Restart-Verifiable

The system MUST keep deletion and empty-list fallback outcomes consistent across current UI state, delayed fallback reloads, and restart-visible session state.

#### Scenario: stale deletion cannot be restored by later fallback reload
- **WHEN** a user deletes a conversation and the frontend locally removes it as settled
- **AND** a later fallback reload or stale cache response arrives
- **THEN** lifecycle consumers SHALL keep the deleted conversation suppressed
- **AND** the deleted entry SHALL NOT be restored solely because the fallback source still contains an old projection

#### Scenario: empty session list fallback keeps valid local continuity
- **WHEN** a thread list reload returns an empty or degraded result while local state still has valid active conversations
- **THEN** lifecycle consumers SHALL avoid destructive replacement unless the empty result is authoritative
- **AND** the UI SHALL NOT drop recoverable local conversation entries solely due to a transient empty list

#### Scenario: missing-session delete remains idempotent across single and bulk paths
- **WHEN** single delete or bulk delete observes that the target session no longer exists
- **THEN** the result SHALL be treated as settled success for that target
- **AND** real IO, permission, or ambiguous identity failures SHALL remain visible
