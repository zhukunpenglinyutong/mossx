# composer-persistent-input-with-filetree Specification

## Purpose

Defines the composer-persistent-input-with-filetree behavior contract, covering 文件查看态下输入框保持可见.

## Requirements

### Requirement: 文件查看态下输入框保持可见

系统 SHALL 在文件查看区打开时保持主页面 Composer 持续可见。

#### Scenario: 打开文件后输入框仍在可视区

- **WHEN** 用户在右侧文件树打开任意文件
- **THEN** 主页面 Composer SHALL 保持可见
- **AND** 不得被文件区域完全覆盖

#### Scenario: 多 Tab 切换时输入框不消失

- **GIVEN** 用户已打开多个文件 Tab
- **WHEN** 用户在 Tab 之间切换
- **THEN** Composer SHALL 持续可见
- **AND** 不得因 Tab 切换被卸载

### Requirement: 文件查看态下输入框保持可用

系统 SHALL 允许用户在查看文件内容时直接输入并发送消息。

#### Scenario: 边看代码边输入

- **GIVEN** 用户正在查看文件内容
- **WHEN** 用户在 Composer 输入文本
- **THEN** 输入行为 SHALL 正常工作
- **AND** 光标焦点与键盘输入 MUST 正常响应

#### Scenario: 文件查看态可直接发送

- **GIVEN** Composer 中已有文本
- **WHEN** 用户触发发送动作（按钮或快捷键）
- **THEN** 系统 SHALL 正常发送消息
- **AND** 不得要求用户先关闭文件查看区

### Requirement: 布局滚动与草稿稳定性

系统 SHALL 避免文件区与输入区的布局冲突，并保证草稿稳定。

#### Scenario: 窄窗口下无关键控件遮挡

- **WHEN** 窗口宽度进入紧凑布局
- **THEN** 文件区与 Composer SHALL 维持可用布局
- **AND** 输入框、发送按钮不得被遮挡

#### Scenario: 文件交互不清空输入草稿

- **GIVEN** 用户已输入未发送草稿
- **WHEN** 用户打开/切换/关闭文件 Tab
- **THEN** Composer 草稿内容 SHALL 保持不变
- **AND** 仅在用户主动发送或清空时才发生变化

