## MODIFIED Requirements

### Requirement: Large-File Regression Sentry

The large-file regression sentry SHALL remain baseline-aware, parser-tested, and enforce runtime/style governance while allowing explicitly documented documentation-only skips.

#### Scenario: changed governance script must include parser tests
- **WHEN** `scripts/check-large-files.mjs` or related governance policy logic changes
- **THEN** corresponding automated tests SHALL be updated in the same change
- **AND** the gate SHALL prove both new hard-debt failure and retained baseline acceptance paths

#### Scenario: documentation-only changes may skip runtime large-file scan
- **WHEN** a change only touches OpenSpec, Trellis, Markdown, or other documentation files
- **THEN** runtime large-file gate MAY be skipped with an explicit note
- **AND** code or stylesheet changes SHALL still run the appropriate large-file checks
