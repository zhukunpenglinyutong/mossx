## ADDED Requirements

### Requirement: Context Ledger Attribution SHALL Keep Coarse Provenance Explicit

系统 MUST 对 coarse / degraded attribution 保持显式 truthfulness，避免把粗粒度来源伪装成精确归因。

#### Scenario: degraded helper attribution stays visibly coarse

- **WHEN** helper / engine / system source 当前只有 coarse provenance signal
- **THEN** ledger SHALL 明示该来源为 degraded 或 coarse attribution
- **AND** 系统 SHALL NOT 伪装成已精确定位到具体 memory / file / note source

#### Scenario: precise attribution remains distinguishable from degraded attribution

- **WHEN** 当前 ledger 同时存在 precise block 与 degraded block
- **THEN** 用户 SHALL 能区分哪部分来源可直接信任为精确归因
- **AND** 哪部分仅是最佳努力的 coarse summary
