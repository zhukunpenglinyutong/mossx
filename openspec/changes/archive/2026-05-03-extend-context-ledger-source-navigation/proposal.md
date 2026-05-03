## Why

`Context Ledger` 现在已经能解释“上下文从哪来”以及“刚刚发生了什么变化”，但还缺最后一段闭环：**用户看到一条来源后，无法立刻回到原始对象继续处理。**

这会让 ledger 停留在解释层，而不是操作层：

- 看到一条 `manual_memory`，不能直接回到 memory 面板确认详情或清理污染项
- 看到一条 `note_card`，不能直接跳回便签编辑区继续补充
- 看到一条 `file_reference`，不能直接打开对应文件继续检查上下文是否准确

如果不补这一段，`Context Ledger` 会继续像“说明书”，而不是“治理入口”。

## What Changes

- 为 `Context Ledger` 增加最小来源导航闭环。
- 支持从 ledger block 直接打开三类来源：
  - `manual_memory` -> Project Memory 面板并定位到对应 memory
  - `note_card` -> Workspace Notes 面板并定位到对应 note
  - `file_reference` -> 复用现有文件打开链路
- 继续保留已有 `source detail` inspection dialog，不用来源跳转替代详情查看。

## Goals

- 让 ledger 从“只解释”升级为“可回查、可继续治理”。
- 复用现有 `memory` / `notes` / `file open` 面板与链路，不引入新的全局导航系统。
- 保持改动限定在前端 surface 与 AppShell panel orchestration，不触碰 backend contract。

## Non-Goals

- 不在本次变更实现 helper/sourcePath 的跨工作区跳转。
- 不在本次变更新增批量治理或长期保留策略。
- 不在本次变更改写现有 detail dialog。

## Acceptance Criteria

- 用户点击 `manual_memory` 的来源动作后，系统 MUST 打开 `memory` 面板并聚焦对应 memory。
- 用户点击 `note_card` 的来源动作后，系统 MUST 打开 `notes` 面板并聚焦对应 note。
- 用户点击 `file_reference` 的来源动作后，系统 MUST 复用现有文件打开链路打开该文件。
- 原有 `Open source detail` 行为 MUST 保持可用，不得被来源跳转替代。
