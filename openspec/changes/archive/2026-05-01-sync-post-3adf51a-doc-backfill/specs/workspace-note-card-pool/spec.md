## MODIFIED Requirements

### Requirement: Workspace Note Card Surface MUST Keep Empty And Preview States Stable

The workspace note card surface MUST render intentional empty states and robust image previews across saved and restored note-card data.

#### Scenario: empty note pool card keeps layout baseline
- **WHEN** the current workspace has no active note cards
- **THEN** the note-card pool surface SHALL render an intentional empty state card
- **AND** the empty state SHALL NOT collapse, overlap toolbar controls, or create broken spacing

#### Scenario: note image preview supports cross-surface attachment paths
- **WHEN** a note card contains local image attachments from paste, drag, upload, or restored storage metadata
- **THEN** the preview SHALL use the shared local image/preview contract
- **AND** missing or unavailable images SHALL degrade to an explanatory fallback rather than breaking the note list
