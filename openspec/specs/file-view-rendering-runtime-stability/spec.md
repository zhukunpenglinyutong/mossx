# file-view-rendering-runtime-stability Specification

## Purpose

Defines the file-view-rendering-runtime-stability behavior contract, covering File view surfaces MUST share a stable render profile contract.

## Requirements
### Requirement: File view surfaces MUST share a stable render profile contract

The system MUST resolve file rendering through a shared render profile contract so that the main window file view and the detached file explorer use the same capability baseline for preview, edit, structured rendering, and fallback behavior.

#### Scenario: same file kind resolves consistently across surfaces
- **WHEN** the user opens the same workspace file in the main window file view and in the detached file explorer
- **THEN** both surfaces MUST resolve the same rendering kind for that file
- **AND** both surfaces MUST use the same fallback semantics when the file is not fully supported

#### Scenario: platform-normalized file path still resolves to one render profile
- **WHEN** the same logical file reaches the file view through different platform path forms, including Windows-style separators, Windows case variants, or macOS restored absolute paths
- **THEN** the system MUST normalize those path forms before render-profile resolution
- **AND** the resulting render kind and fallback behavior MUST remain equivalent across surfaces

#### Scenario: render decisions are shared across preview and edit
- **WHEN** the user switches between preview mode and edit mode for a supported text file
- **THEN** the system MUST derive preview language, editor language, and fallback behavior from the same render profile decision
- **AND** the mode switch MUST NOT require a second independent file-type inference path

### Requirement: File rendering MUST degrade safely without blank or broken states

The system MUST provide an explicit and readable fallback when a file cannot be rendered through a richer renderer, and it MUST NOT fail into blank content, stale content, or unhandled exceptions.

#### Scenario: unsupported binary files show an explicit fallback state
- **WHEN** the user opens a binary file type that does not have a dedicated preview renderer
- **THEN** the system MUST show an explicit unsupported-format fallback state
- **AND** it MUST NOT render an empty panel or a broken partial view

#### Scenario: unknown text files fall back to readable text rendering
- **WHEN** the user opens a text file type that is not covered by language-specific rules
- **THEN** the system MUST fall back to readable plain text or code-style preview
- **AND** the fallback MUST preserve access to the file content rather than treating it as a fatal error

### Requirement: File rendering MUST remain stable during file, tab, and mode transitions

The system MUST reconcile render state transitions when the user changes files, tabs, or modes so that content, active renderer, and navigation state stay aligned with the newly selected file.

#### Scenario: switching tabs does not leak previous renderer state
- **WHEN** the user switches from one open file tab to another file tab with a different rendering kind
- **THEN** the newly active file MUST render with its own resolved renderer state
- **AND** the system MUST NOT leave stale content, stale controls, or stale language markers from the previous file visible

#### Scenario: switching preview or edit mode does not blank the panel
- **WHEN** the user toggles between preview mode and edit mode for a supported file
- **THEN** the file content area MUST remain usable through the transition
- **AND** the system MUST NOT enter a transient blank state that requires reopening the file

### Requirement: Large or high-cost file previews MUST protect runtime responsiveness

The system MUST protect runtime responsiveness when rendering large files or high-cost preview content, and it MUST support bounded degradation instead of unbounded main-thread work.

#### Scenario: first-phase degradation uses static size and line-count thresholds
- **WHEN** the system decides whether a file can stay on a richer preview path
- **THEN** it MUST use deterministic thresholds derived from file size, line count, and the existing `truncated` signal
- **AND** it MUST NOT depend on machine-local timing or device-specific render speed as the primary degradation trigger

#### Scenario: large text preview can degrade instead of blocking indefinitely
- **WHEN** the user opens a text file whose preview cost exceeds the safe rendering budget
- **THEN** the system MUST degrade to a lower-cost readable rendering strategy
- **AND** it MUST NOT block the UI indefinitely while attempting the richest preview

#### Scenario: truncated file bypasses richer preview paths
- **WHEN** the file read result already reports `truncated=true`
- **THEN** the file view MUST bypass richer Markdown, structured, and high-cost highlighted preview paths
- **AND** it MUST converge to the readable low-cost fallback defined by the render profile for that file

#### Scenario: renderer changes do not introduce high-frequency IPC churn
- **WHEN** the user scrolls, hovers, drags, or performs other high-frequency interactions inside the file view
- **THEN** the system MUST NOT introduce new per-interaction Tauri command calls as part of rendering stability handling
- **AND** render-state maintenance MUST remain local to the frontend unless a file content refresh is explicitly required

