## ADDED Requirements

### Requirement: Model Selector MUST Render Refreshed Labels From Parent Catalog

The model selector MUST treat the `models` prop as the current source of truth for visible model labels after provider config refresh.

#### Scenario: refreshed Claude settings label replaces stale local mapping
- **GIVEN** the selector previously observed a Claude model mapping from `settings.json`
- **AND** stale mapping data still exists in localStorage
- **WHEN** the parent model catalog is refreshed with a new label for the same model id
- **THEN** the selector MUST display the refreshed parent-provided label
- **AND** it MUST NOT keep showing the stale localStorage mapping value
