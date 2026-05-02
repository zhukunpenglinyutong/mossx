## MODIFIED Requirements

### Requirement: Project-Scoped Skill Discovery

The system SHALL discover project-scoped, global, plugin-cache, and symlink-backed skills with deterministic priority and non-blocking failure handling.

#### Scenario: Claude plugin cache skills are discovered after user global skills
- **WHEN** `~/.claude/plugins/cache/<owner>/<plugin>/skills/<skill>/SKILL.md` exists
- **THEN** `skills_list` SHALL include that skill with `source = global_claude_plugin`
- **AND** user-authored `~/.claude/skills` entries SHALL keep priority over plugin cache entries with the same normalized skill name

#### Scenario: symlinked skill directories are followed safely
- **WHEN** a supported skill root contains a symbolic link that resolves to a directory with `SKILL.md`
- **THEN** discovery SHALL include the resolved skill
- **AND** discovery SHALL keep deterministic deduplication by normalized skill name and source priority
- **AND** missing or broken symlink targets SHALL be skipped without failing the whole scan

#### Scenario: review boundary fixes keep discovery non-blocking
- **WHEN** a discovery source is unreadable, stale, or points to a missing directory
- **THEN** resource discovery SHALL skip that source
- **AND** the returned list SHALL still include skills from remaining healthy sources
