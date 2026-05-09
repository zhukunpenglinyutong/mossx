## ADDED Requirements

### Requirement: Claude Continuation Summaries MUST NOT Render As Dialogue

Claude history restore MUST classify synthetic continuation, compaction, and resume summaries as runtime control records rather than user-authored or assistant-authored dialogue.

#### Scenario: continuation summary is hidden or quarantined

- **WHEN** a Claude history transcript contains text matching the synthetic continuation pattern such as `This session is being continued from a previous conversation that ran out of context`
- **THEN** the system MUST NOT render that text as a user bubble or assistant answer
- **AND** it MUST classify the record as synthetic runtime content, quarantine, or an internal diagnostic

#### Scenario: continuation summary does not become first message

- **WHEN** a Claude history transcript starts with a synthetic continuation summary
- **THEN** the backend session scanner MUST NOT use that summary as `first_message`
- **AND** it MUST continue scanning for the first real user dialogue message when present

#### Scenario: continuation-only transcript is not listed as normal chat

- **WHEN** a Claude history transcript contains only synthetic continuation summaries and other control records after classification
- **THEN** the backend MUST omit it from the normal Claude session list
- **AND** the frontend MUST NOT recreate a visible normal conversation from those filtered records

### Requirement: Claude Mixed Transcript Restore MUST Preserve Real Messages While Removing Synthetic Runtime Leakage

Claude history restore MUST preserve real user and assistant messages when synthetic runtime summaries are mixed into the same transcript.

#### Scenario: real user request survives synthetic summary

- **WHEN** a Claude transcript contains a synthetic continuation summary followed by a real user request
- **THEN** the restored conversation MUST include the real user request
- **AND** it MUST exclude the synthetic continuation summary from normal dialogue

#### Scenario: real assistant response survives synthetic summary

- **WHEN** a Claude transcript contains real assistant content mixed with synthetic continuation summaries or control-plane records
- **THEN** the restored conversation MUST include the real assistant content
- **AND** it MUST not treat synthetic runtime content as assistant final answer content

#### Scenario: user-authored discussion about continuation text remains visible

- **WHEN** a real user message asks why the text `This session is being continued from a previous conversation` appeared
- **THEN** the message MUST remain visible as user dialogue
- **AND** the classifier MUST require high-confidence synthetic runtime structure before hiding it

### Requirement: Claude History Frontend Fallback MUST Mirror Backend Synthetic Runtime Filtering

The frontend Claude history loader MUST apply a compatible fallback classifier for synthetic runtime summaries when it receives legacy, cached, or remote payloads that were not already filtered by the backend.

#### Scenario: legacy payload synthetic summary is skipped

- **WHEN** frontend receives a legacy Claude history payload containing a synthetic continuation summary as a message-like record
- **THEN** the loader MUST skip or quarantine that record before conversation assembly
- **AND** the assembled conversation MUST NOT contain that text as a normal user or assistant item

#### Scenario: backend-formatted non-dialogue event remains non-dialogue

- **WHEN** frontend receives a backend-formatted control, diagnostic, or quarantine event
- **THEN** the loader MUST preserve its non-dialogue identity
- **AND** it MUST NOT downgrade the event into a user or assistant message

#### Scenario: fallback does not hide ordinary summary discussion

- **WHEN** frontend receives a real user message discussing summaries, previous conversations, or injected prompts
- **THEN** the loader MUST preserve it as normal dialogue
- **AND** it MUST NOT hide the message solely because the text contains those terms
