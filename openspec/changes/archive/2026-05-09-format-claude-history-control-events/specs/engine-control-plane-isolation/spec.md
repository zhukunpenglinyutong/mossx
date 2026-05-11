## ADDED Requirements

### Requirement: Engine Control Plane Containment MUST Distinguish Displayable Local Events From Internal Records

The system MUST contain Claude history control-plane and local-control records without exposing them as normal dialogue, while allowing user-meaningful Claude-local events to be displayed through a dedicated formatted event surface.

#### Scenario: internal control-plane records are not normal messages

- **WHEN** a Claude history transcript contains internal control-plane or bookkeeping records
- **THEN** the system MUST NOT project those records as normal user or assistant messages
- **AND** it MUST either hide them or expose them only through explicit non-dialogue diagnostics

#### Scenario: displayable local events use non-dialogue identity

- **WHEN** a Claude history transcript contains a user-meaningful local control event such as `/resume` failure, model switch, or interruption marker
- **THEN** the system MUST project it with a non-dialogue identity distinct from ordinary user and assistant messages
- **AND** downstream reducers, assemblers, and renderers MUST NOT treat the event as model-generated answer content

#### Scenario: containment remains non-destructive

- **WHEN** the system formats or hides Claude history control records
- **THEN** it MUST NOT delete, rewrite, or mutate the user's original JSONL transcript
- **AND** it MUST perform classification at read/restore time

#### Scenario: containment is resilient across release-window renderer changes

- **WHEN** downstream curtain, reducer, or history assembly code changes across releases
- **THEN** control-plane containment MUST remain enforced before records are projected as normal dialogue
- **AND** release-window differences MUST NOT be handled by checking app version numbers inside the classifier
