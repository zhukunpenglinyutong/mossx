# codex-compaction-runtime-events Specification

## Purpose

Defines the codex-compaction-runtime-events behavior contract, covering Compaction Lifecycle Event Emission.

## Requirements
### Requirement: Compaction Lifecycle Event Emission
The runtime MUST publish explicit lifecycle events for compaction start and completion.

#### Scenario: Emit compacting event on compaction start
- **WHEN** runtime decides to trigger auto compaction for a Codex thread
- **THEN** runtime SHALL emit a `thread/compacting` event for that thread before sending compact RPC

#### Scenario: Consume compacted event as completion signal
- **WHEN** runtime receives a `thread/compacted` event from Codex app-server
- **THEN** runtime SHALL mark compaction in-flight state as completed for that thread

### Requirement: Compaction Failure Event
The runtime MUST emit a failure diagnostic event when all compaction RPC candidates fail.

#### Scenario: Emit compaction failed event
- **WHEN** runtime cannot start compaction after exhausting configured RPC method candidates
- **THEN** runtime SHALL emit `thread/compactionFailed` with thread id and failure reason summary

### Requirement: Method Compatibility Fallback
The runtime MUST attempt compaction start using an ordered fallback list of RPC methods.

#### Scenario: Fallback to next method on error
- **WHEN** the first compaction RPC method returns an error response
- **THEN** runtime SHALL try the next configured candidate method
- **AND** runtime SHALL stop fallback once one method succeeds

### Requirement: Frontend Event Routing Compatibility
Frontend event routing MUST safely consume new compaction lifecycle events without impacting existing thread flows.

#### Scenario: Handle compacting event without breaking current events
- **WHEN** frontend receives `thread/compacting`
- **THEN** frontend SHALL route it through thread event handlers as a non-breaking additive event
- **AND** existing handling for `thread/compacted` and token usage events SHALL continue to work

### Requirement: Codex Manual Compaction Trigger
Codex runtime MUST provide a manual trigger path that reuses the same compaction compatibility fallback.

#### Scenario: Trigger compaction from tooltip icon
- **WHEN** user clicks the manual compaction icon in Codex context tooltip
- **THEN** frontend SHALL call a dedicated runtime command with workspace id and thread id
- **AND** runtime SHALL attempt compaction using ordered fallback methods
- **AND** runtime SHALL emit `thread/compacting` before request and `thread/compactionFailed` on failure

#### Scenario: Manual trigger stays codex-only
- **WHEN** active engine is non-codex
- **THEN** manual compaction icon SHALL NOT be rendered
- **AND** non-codex behavior SHALL remain unchanged

