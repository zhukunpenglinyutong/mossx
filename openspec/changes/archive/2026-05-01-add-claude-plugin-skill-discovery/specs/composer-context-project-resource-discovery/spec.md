## ADDED Requirements

### Requirement: Claude Plugin Cache Skill Discovery

The system SHALL discover Claude Code plugin skills installed under the Claude home plugin cache in addition to existing managed, project, and global skill sources.

#### Scenario: Discover skills from Claude plugin cache

- **WHEN** Claude home contains `plugins/cache/<owner>/<plugin>/skills/<skill>/SKILL.md`
- **THEN** `skills_list` result SHALL include skills discovered from that plugin `skills` directory
- **AND** each discovered item SHALL carry `source = global_claude_plugin`

#### Scenario: Missing Claude plugin cache does not fail discovery

- **WHEN** Claude home does not contain `plugins/cache` or no plugin has a `skills` directory
- **THEN** discovery SHALL continue using other sources
- **AND** API call SHALL still return success with available items
