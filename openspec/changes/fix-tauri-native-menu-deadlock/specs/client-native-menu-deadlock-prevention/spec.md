## ADDED Requirements

### Requirement: Dynamic Renderer Menus MUST Avoid Tauri Native Popup
The client MUST NOT use `@tauri-apps/api/menu` dynamic `Menu.new`, `MenuItem.new`, or `menu.popup(...)` for renderer-owned business menus that are opened from React views, WebView content, markdown/file previews, thread lists, git panels, composer controls, or status panels.

#### Scenario: Thread context menu opens from renderer UI
- **WHEN** the user opens a thread context menu from the sidebar
- **THEN** the menu MUST be rendered by the frontend renderer process
- **AND** the path MUST NOT create Tauri native menu resources or call `menu.popup(...)`

#### Scenario: Commit message selector opens nested choices
- **WHEN** the user selects commit message engine and language
- **THEN** the selector MUST remain within renderer-owned UI state
- **AND** it MUST NOT open a native menu from inside another native menu action

#### Scenario: File link context menu opens near WebKit asset content
- **WHEN** the user opens a context menu for a file link rendered from markdown or file preview content
- **THEN** the menu MUST use renderer UI
- **AND** it MUST NOT combine WebKit URL scheme task handling with Tauri native menu popup for that interaction

### Requirement: Native Menu Usage MUST Be Explicitly Allowlisted
The client MUST keep any remaining Tauri native menu usage behind an explicit allowlist for app-level or OS-integrated menus. Business feature code under `src/features/**` MUST NOT directly import `@tauri-apps/api/menu` unless the path is documented as an approved exception.

#### Scenario: New feature attempts to add direct native menu import
- **WHEN** a feature file under `src/features/**` imports `@tauri-apps/api/menu`
- **THEN** the static guard MUST fail unless that file is listed in the approved allowlist with a reason

#### Scenario: App-level native menu remains available
- **WHEN** the application builds the top-level app menu or a system-level OS menu that requires native integration
- **THEN** the implementation MAY use Tauri native menu APIs
- **AND** the usage MUST remain outside high-frequency renderer context menu paths

### Requirement: Renderer Menu Actions MUST Preserve Existing Business Behavior
Replacing native popup menus with renderer UI MUST preserve the existing user-visible actions, disabled states, labels, and callback semantics for migrated menus.

#### Scenario: Sidebar thread menu actions remain reachable
- **WHEN** the thread menu is migrated to renderer UI
- **THEN** rename, auto-name, sync when applicable, pin/unpin, copy id, archive, move-to-folder, size display, and delete MUST remain reachable with equivalent enabled/disabled semantics

#### Scenario: Commit message generation remains reachable
- **WHEN** the commit dialog menu is migrated to renderer UI
- **THEN** Codex, Claude, Gemini, and OpenCode engine choices MUST remain available
- **AND** Chinese and English commit message generation MUST still call the existing generation callback with the selected engine and language

#### Scenario: File link actions remain reachable
- **WHEN** the file link menu is migrated to renderer UI
- **THEN** open file, open in configured target, reveal in directory when applicable, disabled download placeholder, and copy link MUST remain available with equivalent behavior

### Requirement: Menu Deadlock Regression MUST Be Testable
The project MUST provide automated and manual evidence that migrated high-risk menus no longer rely on native popup and do not reintroduce the observed WebKit/Tauri deadlock pattern.

#### Scenario: Static guard detects native popup regression
- **WHEN** validation runs for the client menu implementation
- **THEN** it MUST enumerate direct Tauri menu imports and native popup call sites
- **AND** it MUST fail on non-allowlisted high-risk renderer paths

#### Scenario: Manual macOS hang matrix is executed
- **WHEN** release validation targets the Tauri desktop app on macOS
- **THEN** it MUST include repeated interactions for commit message selector, sidebar thread menu with many folder targets, file link menu from markdown/file preview, and rapid open/close sequences
- **AND** the app MUST remain responsive without force quit

### Requirement: Backend Menu Registry MUST Not Hold Locks During Native Mutators
The Rust menu registry MUST avoid holding registry mutex guards while calling Tauri menu item or submenu mutator methods that may enter native menu internals.

#### Scenario: Top-level menu text is updated
- **WHEN** backend code updates a registered menu item or submenu text
- **THEN** it MUST clone or extract the target handle while holding the registry lock
- **AND** it MUST release the registry lock before invoking Tauri native mutator methods

#### Scenario: Menu accelerator is updated
- **WHEN** backend code updates menu item accelerators
- **THEN** it MUST follow the same no-lock-during-mutator rule
- **AND** the update MUST preserve existing error propagation semantics
