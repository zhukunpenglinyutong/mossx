## MODIFIED Requirements

### Requirement: Note Card References MUST Render Once Across Realtime And History

Composer note-card references MUST converge realtime, authoritative, and history payloads into a single visible note context representation per turn.

#### Scenario: realtime and authoritative payload do not duplicate the same note reference
- **WHEN** a message is sent with `@#` note-card references
- **AND** the realtime optimistic item later converges with authoritative history payload
- **THEN** the message surface SHALL show one note context representation for that turn
- **AND** duplicate injected note wrappers SHALL be canonicalized before row rendering

#### Scenario: ordinary user screenshots are not suppressed by note-card image filtering
- **WHEN** a history message contains ordinary user image attachments
- **AND** note-card reference filtering is also active for the same conversation
- **THEN** only attachments proven to be injected note-card assets SHALL be suppressed from the ordinary image grid
- **AND** normal user screenshots SHALL remain visible after history reopen
