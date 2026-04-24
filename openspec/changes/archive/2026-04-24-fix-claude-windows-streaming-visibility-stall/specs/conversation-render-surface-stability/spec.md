## ADDED Requirements

### Requirement: Claude Render Safety MUST Preserve Progressive Assistant Text Visibility
Claude render-safe behavior MUST protect live assistant text visibility in addition to preventing blank or flashing conversation surfaces.

#### Scenario: render-safe mode keeps live assistant text progressing
- **WHEN** current conversation engine is `claude`
- **AND** the conversation is processing
- **AND** assistant text deltas continue to arrive
- **THEN** render-safe mode MUST keep the live assistant message visibly progressing
- **AND** the message surface MUST NOT degrade to a spinner-only or first-few-characters-only state until completion

#### Scenario: render-safe degradation does not suppress meaningful live text
- **WHEN** Claude render-safe mode disables high-risk visual effects, animations, or render optimizations
- **THEN** those degradations MUST prioritize preserving readable live assistant text
- **AND** the system MUST NOT solve blanking by hiding or deferring all intermediate assistant content until the terminal event

#### Scenario: a shorter degraded stub does not overwrite the last readable live assistant surface
- **WHEN** `Claude` render-safe mode is active during processing
- **AND** the current turn had already rendered a more readable assistant body
- **AND** the current live surface regresses to a shorter prefix-only stub under visible stall evidence
- **THEN** render-safe recovery MUST keep the last more-readable same-turn surface available
- **AND** the shorter stub MUST NOT overwrite the preserved readable surface as the only visible body
