## ADDED Requirements

### Requirement: Thread Items Assistant Text Normalization Extraction Compatibility
The system SHALL preserve the effective export surface and user-visible assistant text outcomes when assistant text normalization logic is moved out of `threadItems.ts` into a dedicated utility module.

#### Scenario: Existing callers keep the same import surface
- **WHEN** assistant text normalization logic is extracted from `threadItems.ts`
- **THEN** existing callers importing `stripClaudeApprovalResumeArtifacts` from `src/utils/threadItems.ts` MUST continue working without import-path migration
- **AND** thread item build and merge callers MUST NOT require contract updates for that extraction batch

#### Scenario: Extracted assistant text policy preserves normalization semantics
- **WHEN** assistant message text is normalized after modularization
- **THEN** the system MUST preserve the same effective approval-resume stripping, fragmented-paragraph merge, repeated-text dedupe, no-content placeholder handling, and readability scoring semantics as before extraction
- **AND** the extraction MUST NOT alter `ConversationItem` shapes or assistant/tool/message merge routing

#### Scenario: Extracted assistant text policy remains safe for loader and reducer consumers
- **WHEN** loaders or reducers invoke assistant text normalization helpers after modularization
- **THEN** they MUST observe the same visible cleaned text and fallback behavior as before extraction
- **AND** failure handling MUST remain local to normalization without introducing new runtime exceptions to callers
