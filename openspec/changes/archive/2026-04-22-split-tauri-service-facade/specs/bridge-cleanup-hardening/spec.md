## ADDED Requirements

### Requirement: Frontend Tauri Service Facade Compatibility
The system SHALL preserve the exported API surface of `src/services/tauri.ts` when implementation is modularized into domain submodules.

#### Scenario: Existing import path remains valid after modularization
- **WHEN** frontend code imports functions or types from `src/services/tauri.ts`
- **THEN** the same exported names MUST remain available from that façade file
- **AND** callers MUST NOT require import path migration for the modularization batch

#### Scenario: Extracted domain keeps command contract stable
- **WHEN** a `src/services/tauri.ts` domain is moved into a submodule
- **THEN** the invoked Tauri command names, argument names, and response semantics MUST remain unchanged
- **AND** the modularization MUST preserve existing fallback behavior for that domain, if any
