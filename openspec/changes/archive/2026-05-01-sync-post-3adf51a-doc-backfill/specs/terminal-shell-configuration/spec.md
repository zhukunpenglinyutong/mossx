## MODIFIED Requirements

### Requirement: Built-In Terminal MUST Support Optional Shell Path Override

The built-in terminal shell path setting MUST preserve optional override semantics while presenting concrete examples as non-persistent guidance.

#### Scenario: settings copy includes concrete shell path examples
- **WHEN** the terminal shell path setting is shown
- **THEN** user-facing helper copy SHALL include concrete examples for common shells where appropriate
- **AND** the examples SHALL remain guidance only, not validation requirements

#### Scenario: example copy does not change fallback semantics
- **WHEN** a user leaves the setting blank after reading examples
- **THEN** terminal launch SHALL continue to use platform fallback behavior
- **AND** no example path SHALL be implicitly persisted
