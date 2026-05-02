## MODIFIED Requirements

### Requirement: Detached Spec Hub Window SHALL Preserve Reader-Only Window Semantics

Detached Spec Hub windows SHALL preserve dedicated reader-window semantics, including bounded chrome affordances and full-surface reader layout.

#### Scenario: detached reader artifact window hides maximize affordance when unsupported
- **WHEN** detached Spec Hub opens as a dedicated reader artifact window
- **THEN** window chrome SHALL NOT expose a maximize button if the window contract or platform surface does not support meaningful maximize behavior
- **AND** removing that affordance SHALL NOT remove close, drag, or focus behavior

#### Scenario: reader surface fills available window space
- **WHEN** the detached Spec Hub window is opened or retargeted
- **THEN** the reader shell SHALL occupy the available window height and width
- **AND** no host-app panel chrome SHALL create an unexplained blank band around the artifact body
