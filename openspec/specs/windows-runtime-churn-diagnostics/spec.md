# windows-runtime-churn-diagnostics Specification

## Purpose

Defines the windows-runtime-churn-diagnostics behavior contract, covering Windows runtime churn diagnostics MUST attribute guarded recovery and replacement sources.

## Requirements
### Requirement: Windows runtime churn diagnostics MUST attribute guarded recovery and replacement sources

The system MUST persist enough source-aware evidence to explain which caller initiated guarded recovery or replacement for a Windows managed runtime pair.

#### Scenario: automatic guarded recovery records triggering source

- **WHEN** an automatic recovery source such as thread list refresh, workspace restore, or focus refresh begins or joins a guarded recovery attempt
- **THEN** the system MUST record the triggering source and whether that caller became leader or waiter
- **AND** the evidence MUST remain queryable through existing runtime diagnostics surfaces

#### Scenario: explicit reconnect is distinguishable from automatic recovery

- **WHEN** a user explicitly reconnects or retries a managed runtime pair after a cooldown or quarantine period
- **THEN** the system MUST record that recovery source as user-initiated rather than automatic
- **AND** operators MUST be able to distinguish it from suppressed automatic churn

### Requirement: Windows runtime churn diagnostics MUST retain bounded recent churn counters

The system MUST maintain bounded recent counters for the Windows runtime churn signals that matter for remote debugging.

#### Scenario: recent spawn replace and force-kill counts are captured

- **WHEN** a Windows managed runtime pair experiences spawn, replacement, or force-kill events within the configured diagnostics window
- **THEN** the system MUST update recent bounded counters for those event classes
- **AND** those counters MUST be available to runtime snapshots or equivalent diagnostics queries

#### Scenario: stale historical churn does not accumulate forever

- **WHEN** the bounded diagnostics window has elapsed without new churn activity for a Windows managed runtime pair
- **THEN** old churn counts MUST age out or reset according to the configured retention rule
- **AND** the system MUST avoid presenting indefinite historical churn as current active instability

### Requirement: Windows startup and stale-session misclassification MUST remain diagnosable

The system MUST preserve enough evidence to tell whether a Windows runtime failure happened during startup grace or after the runtime had already become healthy.

#### Scenario: startup-time read timeout is recorded as startup-related degraded state

- **WHEN** a thread list or equivalent runtime-dependent read times out while the same Windows managed runtime pair is still startup-pending
- **THEN** diagnostics MUST record that event as startup-related degraded continuity rather than a confirmed stale-session replacement
- **AND** the evidence MUST preserve the startup state that was active at the time

#### Scenario: post-ready failed probe is recorded as stale-session suspicion

- **WHEN** a Windows managed runtime pair has already reached ready state and later fails a health probe
- **THEN** diagnostics MUST record that failure as a stale-session suspicion with the last probe failure reason
- **AND** operators MUST be able to distinguish it from startup-pending slowdown

