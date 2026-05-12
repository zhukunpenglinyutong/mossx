## ADDED Requirements

### Requirement: Claude Project Attribution MUST Not Require Large Media Parsing

Claude Code project attribution MUST derive workspace membership from bounded transcript metadata and MUST NOT require full parsing of large inline base64 media payloads.

#### Scenario: attribution uses metadata without image payload
- **WHEN** a Claude transcript includes cwd, workspace path, git root, timestamp, or equivalent metadata outside a large image payload
- **THEN** project attribution MUST use that metadata without materializing the base64 image string
- **AND** the session MUST remain eligible for strict-match or inferred-related classification

#### Scenario: oversized media line degrades only that transcript evidence
- **WHEN** attribution encounters a JSONL line whose content exceeds the safe summary parsing budget
- **THEN** the system MUST avoid full media parsing for that line
- **AND** it MUST continue scanning other bounded evidence in the same transcript when possible
- **AND** it MUST NOT force the entire workspace history source into an empty result

#### Scenario: metadata parse failure remains explainable
- **WHEN** Claude attribution cannot parse enough safe metadata from a transcript because of malformed or oversized content
- **THEN** the system MUST classify or omit that transcript according to existing attribution rules
- **AND** it MUST preserve an explainable degraded reason for diagnostics
