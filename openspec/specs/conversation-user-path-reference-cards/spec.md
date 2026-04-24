# conversation-user-path-reference-cards Specification

## Purpose

定义用户消息中的 `@路径` 引用提取、标准化、去重与引用卡片展示契约，确保在多轮对话里既能保持正文可读性，又能稳定支持 Unix、Windows、UNC 与 `file://` 等跨平台路径形式，而不会把无效 `@` token 误识别成文件引用。

## Requirements

### Requirement: User Message Path Mentions MUST Be Extracted Into Reference Cards

系统 MUST 将用户消息中的 `@路径` 引用从正文中提取，并渲染为独立引用卡片列表。

#### Scenario: valid path mentions are extracted from plain text

- **WHEN** 用户消息包含合法 `@路径` 引用
- **THEN** 系统 MUST 在正文下渲染引用卡片
- **AND** 被提取的路径 MUST 不再以原始 `@路径` 形式残留在正文

#### Scenario: duplicate paths are deduplicated

- **WHEN** 同一路径在同条用户消息内重复出现
- **THEN** 系统 SHOULD 仅展示一条引用卡片
- **AND** 卡片顺序 MUST 保持首次出现顺序

### Requirement: Path Mention Parser MUST Support Cross-Platform Path Forms

解析器 MUST 支持常见跨平台路径形式，并在异常输入下可回退。

#### Scenario: parser supports unix/windows/file-url forms

- **WHEN** 输入包含 Unix 路径、Windows 盘符路径、UNC 路径或 `file://` URL
- **THEN** 系统 MUST 正确识别并标准化路径
- **AND** 引用卡片 MUST 展示名称与父级路径信息

#### Scenario: parser supports quoted paths and keeps punctuation text

- **WHEN** 路径被单引号/双引号包裹且后续带标点或普通文本
- **THEN** 系统 MUST 正确提取路径
- **AND** 后续标点或普通文本 MUST 保留在正文

#### Scenario: unmatched or non-path token stays as plain text

- **WHEN** `@` 后续内容不构成合法路径（例如版本号文本或未闭合引号）
- **THEN** 系统 MUST 保留原文
- **AND** MUST NOT 误提取为引用卡片
