## MODIFIED Requirements

### Requirement: Cross-Platform Architecture Extraction MUST Preserve Equivalent Behavior

架构抽取与主干稳定性重构 MUST 将 Windows、macOS 与 Linux 视为同级目标平台，并保持 shell、process、path、filesystem、window 与 fallback 行为等价可解释。

#### Scenario: extraction preserves win/mac/linux launch semantics

- **WHEN** 某个架构抽取批次触及 shell path、CLI launch、terminal launch、runtime spawn、process termination、wrapper fallback 或 daemon reconnect
- **THEN** 该批次 MUST 保持 Windows、macOS 与 Linux 上的启动结果、错误分类与 fallback 语义等价
- **AND** 实现 MUST NOT 仅因抽取而引入 undocumented platform-only branch

#### Scenario: extraction uses platform-safe path handling

- **WHEN** 某个批次新增或重写 path resolution、临时文件写入、目录拼接、home directory 解析、fixture path 或 snapshot path
- **THEN** 实现 MUST 使用平台安全的 path API 或等价抽象
- **AND** 实现 MUST NOT 依赖硬编码 `/`、`\\`、case-only 文件名差异、单平台 newline 假设或 POSIX-only shell quoting

#### Scenario: tests remain platform-neutral

- **WHEN** runtime/realtime/AppShell contract tests are added or changed
- **THEN** test fixtures MUST avoid platform-specific path separators, shell syntax, newline assumptions, or filesystem case assumptions unless explicitly under platform-specific coverage
- **AND** platform-specific behavior MUST be guarded, named, and bounded

### Requirement: Platform Compatibility Evidence MUST Accompany High-Risk Batches

触及 Win/Mac/Linux 高风险路径的批次 MUST 提供显式兼容性证据，而不是只依赖单平台通过。

#### Scenario: win mac linux evidence is recorded for high-risk extraction

- **WHEN** 批次触及 shell、process、path、terminal、runtime launch、filesystem、window behavior 或 wrapper fallback
- **THEN** 变更记录 MUST 包含 Windows、macOS 与 Linux 的 smoke evidence、CI evidence 或等价验证结果
- **AND** 若当前环境无法覆盖其中一端，记录 MUST 明确缺口、残余风险与待补路径

#### Scenario: platform-specific deviation remains explicit and bounded

- **WHEN** 某个行为因平台差异必须保留分支
- **THEN** 该差异 MUST 在 capability 或 design 中被显式说明
- **AND** 差异 MUST 保持 bounded，不得扩散为 unrelated feature branch
