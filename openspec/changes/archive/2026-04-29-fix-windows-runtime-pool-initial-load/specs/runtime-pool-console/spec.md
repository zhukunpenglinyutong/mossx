## ADDED Requirements

### Requirement: Runtime pool console MUST distinguish bootstrap-in-progress from true empty state
The runtime pool console MUST NOT present an empty runtime snapshot as a stable empty state until initial snapshot loading, runtime visibility bootstrap, and any bounded fallback refresh have settled.

#### Scenario: existing runtime rows render without bootstrap
- **WHEN** the user opens the runtime pool console on any supported platform
- **AND** the initial runtime pool snapshot contains one or more rows
- **THEN** the console MUST render those rows immediately after snapshot loading
- **AND** it MUST NOT trigger runtime visibility bootstrap or fallback refresh for that initial render

#### Scenario: initial runtime snapshot is empty during bootstrap
- **WHEN** the user opens the runtime pool console
- **AND** the first runtime pool snapshot contains no rows
- **AND** runtime visibility bootstrap is still pending
- **THEN** the console MUST present a transient loading or bootstrap state
- **AND** the console MUST NOT present the empty runtime message as final truth

#### Scenario: bootstrap eventually surfaces runtime rows
- **WHEN** the initial snapshot is empty
- **AND** the runtime visibility bootstrap or bounded fallback refresh later returns one or more runtime rows
- **THEN** the console MUST render those rows
- **AND** the console MUST clear the transient empty/loading state

#### Scenario: empty state is shown only after bootstrap settles
- **WHEN** runtime visibility bootstrap has completed or was skipped because no eligible workspace exists
- **AND** the bounded fallback refresh has completed or was not needed
- **AND** the latest runtime pool snapshot still contains no rows
- **THEN** the console MUST present the true empty state

#### Scenario: unmount cancels pending fallback refresh
- **WHEN** the user leaves the runtime pool console while bootstrap or fallback refresh is pending
- **THEN** the console MUST cancel timers or ignore late async completions
- **AND** it MUST NOT update unmounted React state

### Requirement: Runtime pool console MUST bound initial refresh fallback
The runtime pool console MUST use bounded fallback refresh only as a short initial-load tail-latency guard, not as a permanent polling mechanism.

#### Scenario: fallback refresh stops after runtime row appears
- **WHEN** bootstrap has completed
- **AND** fallback refresh is running because the latest snapshot is empty
- **AND** a later fallback snapshot contains one or more rows
- **THEN** the console MUST stop the fallback refresh loop
- **AND** the console MUST render the returned runtime rows

#### Scenario: fallback refresh stops after maximum attempts
- **WHEN** bootstrap has completed
- **AND** every fallback refresh attempt returns an empty snapshot
- **THEN** the console MUST stop fallback refresh after the configured bounded attempt limit
- **AND** the console MUST present the true empty state

#### Scenario: manual refresh remains independent
- **WHEN** the user triggers the runtime pool refresh action manually
- **THEN** the console MUST perform a snapshot refresh without starting an unbounded bootstrap loop
- **AND** manual refresh MUST NOT bypass the initial bootstrap in-flight guard

### Requirement: Runtime pool console initial-load fix MUST preserve cross-platform compatibility
The runtime pool console MUST implement initial-load bootstrap as a platform-compatible fallback path that preserves existing successful snapshot rendering on macOS, Linux, and Windows.

#### Scenario: non-Windows non-empty snapshot is unaffected
- **WHEN** the runtime pool console opens on macOS or Linux
- **AND** the initial snapshot contains one or more runtime rows
- **THEN** the console MUST preserve the existing direct row rendering behavior
- **AND** it MUST NOT delay the first render behind runtime readiness bootstrap

#### Scenario: platform differences do not change empty-state contract
- **WHEN** the runtime pool console opens on any supported platform
- **AND** the initial snapshot is empty
- **THEN** the console MUST apply the same bounded bootstrap and true-empty-state contract
- **AND** the implementation MUST NOT rely on a Windows-only frontend code path to decide whether an empty state is final
