# claude-tui-resume-affordance Specification

## Purpose
Define the explicit affordance that lets GUI-created Claude Code sessions resume in Claude TUI using the native Claude session id, without mutating Claude transcript metadata or relying on the no-argument TUI resume picker.
## Requirements
### Requirement: Claude GUI Sessions MUST Expose An Explicit TUI Resume Path

The system MUST provide a reliable user-facing way to continue a GUI-created Claude Code session in Claude TUI by using the native Claude session id.

#### Scenario: finalized Claude thread exposes resume command

- **WHEN** the user opens the context menu for a finalized Claude thread with id `claude:<session_id>`
- **THEN** the menu MUST provide an action to copy a Claude TUI resume command
- **AND** the copied command MUST include the thread workspace path
- **AND** the copied command MUST invoke `claude --resume <session_id>`
- **AND** the command MUST use the bare native session id without the `claude:` prefix

#### Scenario: copy id remains bare session id

- **WHEN** the user selects `Copy ID` for a finalized Claude thread with id `claude:<session_id>`
- **THEN** the clipboard MUST receive `<session_id>`
- **AND** it MUST NOT receive `claude:<session_id>`
- **AND** it MUST NOT receive the full resume command

#### Scenario: pending Claude thread does not expose invalid resume command

- **WHEN** the thread id is a pending Claude UI identity such as `claude-pending-*`
- **THEN** the system MUST NOT expose an enabled Claude TUI resume action
- **AND** it MUST NOT copy a command that treats the pending id as a native Claude session id

#### Scenario: provisional Claude session id does not expose resume command

- **WHEN** a Claude turn has only an `engine_send_message` response-derived session id
- **AND** the session has not yet finalized into `claude:<nativeSessionId>`
- **THEN** the system MUST NOT expose a TUI resume command for that response-derived id
- **AND** it MUST wait for finalized native session identity before enabling resume affordances

#### Scenario: virtual Claude subagent thread does not expose top-level resume command

- **WHEN** the thread id represents a virtual Claude subagent session rather than a top-level Claude transcript session
- **THEN** the system MUST NOT expose an enabled top-level Claude TUI resume action
- **AND** it MUST NOT copy a command unless that virtual session id has been explicitly verified as directly resumable by Claude TUI

#### Scenario: non-Claude threads do not expose Claude TUI resume actions

- **WHEN** the thread belongs to Codex, Gemini, OpenCode, or any non-Claude engine
- **THEN** the system MUST NOT show Claude-specific TUI resume actions
- **AND** existing non-Claude thread menu actions MUST remain unchanged

### Requirement: Claude Resume Commands MUST Be Shell-Safe Enough For Supported Platforms

The system MUST construct resume commands using platform-aware quoting for workspace paths and session ids.

#### Scenario: POSIX path with spaces is quoted

- **WHEN** the workspace path is `/Users/demo/My Project`
- **AND** the session id is `abc-123`
- **THEN** the POSIX resume command MUST be equivalent to `cd '/Users/demo/My Project' && claude --resume 'abc-123'`

#### Scenario: Windows drive path uses drive-aware cd

- **WHEN** the workspace path is `C:\Users\demo\My Project`
- **AND** the session id is `abc-123`
- **THEN** the Windows resume command MUST be equivalent to `cd /d "C:\Users\demo\My Project" && claude --resume "abc-123"`

#### Scenario: command builder rejects missing values

- **WHEN** the workspace path or session id is empty
- **THEN** the system MUST NOT copy or execute a malformed resume command
- **AND** the UI SHOULD show a recoverable unavailable state or hide the action

### Requirement: Open In Claude TUI MUST Reuse Existing Terminal Infrastructure When Available

The system MUST reuse existing terminal infrastructure for `Open in Claude TUI` when that action is implemented and terminal integration is available.

#### Scenario: open action starts Claude resume in workspace terminal

- **WHEN** the user selects `Open in Claude TUI` for a finalized Claude thread
- **AND** the app terminal integration is available
- **THEN** the system MUST open or create a terminal scoped to the thread workspace
- **AND** it MUST send `claude --resume <session_id>` to that terminal
- **AND** it MUST use the same bare native session id as the copied resume command

#### Scenario: terminal integration unavailable keeps copy command available

- **WHEN** terminal integration is unavailable or cannot be reached from the current UI boundary
- **THEN** the system MAY omit or disable `Open in Claude TUI`
- **AND** it MUST still keep `Copy Claude resume command` available for finalized Claude threads

### Requirement: Claude TUI Resume Copy MUST Explain Picker Limitations

The UI MUST make the explicit resume path understandable when Claude TUI's no-argument `/resume` picker does not show GUI-created sessions.

#### Scenario: user sees explicit fallback guidance

- **WHEN** the user copies or opens a Claude TUI resume action
- **THEN** the UI SHOULD provide copy, title, tooltip, or toast text that explains explicit resume is reliable
- **AND** the text SHOULD mention `/resume <session_id>` or `claude --resume <session_id>` as the fallback when picker visibility is incomplete

#### Scenario: metadata is not misrepresented

- **WHEN** a GUI-created Claude transcript is marked with `entrypoint: "sdk-cli"`
- **THEN** the system MUST NOT claim it is a native TUI-created `entrypoint: "cli"` session
- **AND** it MUST NOT mutate transcript metadata solely to make the TUI picker list it
