## MODIFIED Requirements

### Requirement: Refresh Config Action MUST Reload Only The Current Provider

The model selector refresh flow MUST treat parent-provided refreshed provider catalog data as the source of truth for visible labels.

#### Scenario: refreshed Claude labels override stale local mapping cache
- **WHEN** Claude config refresh returns a model catalog with updated labels
- **AND** localStorage still contains an older Claude model mapping
- **THEN** the selector SHALL display the parent-provided refreshed catalog label
- **AND** the selector SHALL NOT treat stale localStorage mapping as a source of truth

#### Scenario: model selector remains presentational after refresh
- **WHEN** `ModelSelect` renders provider model options
- **THEN** display labels SHALL come from the `models` prop and default i18n fallback
- **AND** the selector SHALL NOT independently reread provider mapping caches on mount
