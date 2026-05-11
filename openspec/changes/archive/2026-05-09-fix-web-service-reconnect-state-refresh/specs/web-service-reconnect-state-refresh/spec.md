## ADDED Requirements

### Requirement: Web service reconnect SHALL trigger scoped state refresh
The system SHALL reconcile frontend thread state after a Web service socket reconnect without changing the backend realtime event contract.

#### Scenario: reconnect refreshes active workspace
- **WHEN** the Web service browser socket reconnects after a previous successful connection
- **THEN** the frontend SHALL refresh the active workspace thread list
- **AND** the refresh MUST preserve existing UI state while the authoritative snapshot is loading

#### Scenario: first socket open does not trigger compensation
- **WHEN** the Web service browser socket opens for the first time during page boot
- **THEN** the frontend MUST NOT run reconnect compensation

#### Scenario: active processing thread is refreshed
- **WHEN** a Web service reconnect signal is received
- **AND** the active thread is still marked processing in frontend state
- **THEN** the frontend SHALL refresh that active thread snapshot

#### Scenario: local desktop mode is unchanged
- **WHEN** the app is running outside Web service browser mode
- **THEN** reconnect compensation MUST NOT register the Web service browser reconnect listener
