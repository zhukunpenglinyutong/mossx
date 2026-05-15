# conversation-history-expansion-scroll-restoration Specification

## Purpose

Defines the conversation-history-expansion-scroll-restoration behavior contract, covering Revealing Collapsed History SHALL Preserve The Reader's Current Viewport Context.

## Requirements
### Requirement: Revealing Collapsed History SHALL Preserve The Reader's Current Viewport Context
When the conversation canvas reveals previously collapsed history above the current message window, the system SHALL preserve the user's current reading position instead of jumping to the top of the newly inserted history.

#### Scenario: clicking the history reveal control keeps the current reading slice stable
- **WHEN** the message viewport is showing a collapsed-history control such as "show previous N messages"
- **AND** the user activates that control while reading content below it
- **THEN** the system SHALL reveal the older history items above the current window
- **AND** the content that was being read immediately before the reveal SHALL remain visible in approximately the same viewport region after the reveal completes

#### Scenario: newly revealed history does not take over the viewport top
- **WHEN** older messages are inserted above the current rendered history window
- **THEN** the system SHALL NOT reset the message viewport to the top of the newly revealed history block
- **AND** the user's reading anchor SHALL remain prioritized over exposing the first newly inserted item

### Requirement: History Expansion Scroll Restoration SHALL Remain Presentation-Only And Preserve Existing Sticky Contracts
Viewport restoration for collapsed-history reveal SHALL remain a frontend presentation-layer behavior and SHALL coexist with existing history sticky and live sticky contracts without changing runtime or storage behavior.

#### Scenario: sticky header behavior remains coherent after history reveal
- **WHEN** the message canvas already has history sticky or live sticky behavior active around the current reading position
- **AND** the user reveals previously collapsed history
- **THEN** the viewport restoration SHALL preserve the currently relevant sticky context after the reveal
- **AND** the system SHALL NOT introduce double sticky headers, premature sticky handoff, or a mismatched active section because of the restoration step

#### Scenario: history reveal restoration does not introduce new data contracts
- **WHEN** the system preserves viewport position after revealing collapsed history
- **THEN** the system SHALL NOT require new Tauri commands, runtime events, storage fields, or history loader payload fields
- **AND** the behavior SHALL remain fully implementable within the existing frontend message viewport logic

