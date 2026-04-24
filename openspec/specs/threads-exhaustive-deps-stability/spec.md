# threads-exhaustive-deps-stability Specification

## Purpose
TBD - created by archiving change stabilize-threads-exhaustive-deps-hotspot. Update Purpose after archive.
## Requirements
### Requirement: Threads hook dependencies remain complete after remediation
The system SHALL allow `threads` domain hooks to include all referenced dependencies in callbacks and effects without changing send, resume, or event-handling behavior.

#### Scenario: Missing dependency warnings are remediated
- **WHEN** `useQueuedSend.ts`, `useThreadItemEvents.ts`, `useThreadTurnEvents.ts`, and `useThreadActions.ts` complete their dependency arrays
- **THEN** each callback or effect MUST include the referenced dependencies
- **AND** queue send, resume, item event, and turn event behavior MUST preserve existing semantics

### Requirement: Factory-produced thread actions remain stable after remediation
The system SHALL construct factory-produced thread action callbacks with a lint-safe stable memoization strategy without changing archive, delete, rename, or shared-session start behavior.

#### Scenario: Factory callback warnings are remediated
- **WHEN** `useThreadActions.ts` and `useThreadActionsSessionRuntime.ts` replace `useCallback(factory(...))` with a stable factory callback construction pattern
- **THEN** the resulting callbacks MUST remain stable across renders for identical dependencies
- **AND** archive, delete, rename, and shared-session start behavior MUST preserve existing semantics

