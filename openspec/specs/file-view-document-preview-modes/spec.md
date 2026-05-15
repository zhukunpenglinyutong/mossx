# file-view-document-preview-modes Specification

## Purpose

Defines the file-view-document-preview-modes behavior contract, covering File view SHALL resolve explicit preview modes for in-scope document formats.

## Requirements
### Requirement: File view SHALL resolve explicit preview modes for in-scope document formats

系统 MUST 为 `doc`、`docx`、`xlsx`、`xls`、`csv`、`pdf`、`png`、`jpg`、`jpeg` 解析显式 preview mode，而不是将这些类型长期视为泛化二进制 fallback。

#### Scenario: word documents resolve to document preview

- **WHEN** 用户打开 `doc` 或 `docx` 文件
- **THEN** 系统 MUST 将其解析为 `document-preview`
- **AND** MUST NOT 将其直接落入 `binary-unsupported`

#### Scenario: spreadsheet and csv files resolve to tabular preview

- **WHEN** 用户打开 `xls`、`xlsx` 或 `csv` 文件
- **THEN** 系统 MUST 将其解析为 `tabular-preview`
- **AND** 预览结果 MUST 以表格语义呈现，而不是默认代码高亮视图

#### Scenario: pdf files resolve to pdf preview

- **WHEN** 用户打开 `pdf` 文件
- **THEN** 系统 MUST 将其解析为 `pdf-preview`
- **AND** MUST 提供桌面内分页阅读结果，而不是仅显示“不支持格式”

#### Scenario: image files resolve to image preview

- **WHEN** 用户打开 `png`、`jpg` 或 `jpeg` 文件
- **THEN** 系统 MUST 将其解析为 `image-preview`
- **AND** 主窗口与 detached file explorer MUST 使用同一图片预览语义

### Requirement: File view SHALL provide bounded Word document outcomes instead of over-promising rich preview

系统 MUST 为 Word 文件提供只读、可解释的受控结果，但不得把不确定的 legacy `.doc` 能力包装成稳定富预览承诺。

#### Scenario: docx file renders as readable document blocks

- **WHEN** 用户打开 `docx` 文件
- **THEN** 系统 MUST 提供可读的文档块预览
- **AND** 文档中的正文、标题或表格文本 MUST 以稳定顺序呈现

#### Scenario: legacy doc file resolves to best-effort preview or explicit fallback

- **WHEN** 用户打开 `doc` 文件
- **THEN** 系统 MUST 提供 best-effort 的可读预览或显式 fallback
- **AND** MUST NOT 将其伪装成与 `docx` 等价的稳定富预览

#### Scenario: word parse failure fails closed to explicit fallback

- **WHEN** `doc` 或 `docx` 文件解析失败、损坏或超出首期预算
- **THEN** 系统 MUST 显示显式 fallback 状态
- **AND** MAY 提供外部打开 escape hatch，但 MUST NOT 将外部打开作为主预览链路

### Requirement: File view SHALL provide bounded tabular preview for csv and spreadsheet files

系统 MUST 为 `csv`、`xls`、`xlsx` 提供有界表格预览，并对超大工作簿或异常单元格数据采用确定性截断策略。

#### Scenario: csv file opens with tabular preview and text edit mode

- **WHEN** 用户打开 `csv` 文件
- **THEN** 预览模式 MUST 显示结构化表格
- **AND** 编辑模式 MUST 保留原始文本编辑能力

#### Scenario: xls and xlsx files open with workbook-aware tabular preview

- **WHEN** 用户打开 `xls` 或 `xlsx` 文件
- **THEN** 系统 MUST 显示工作表级表格预览
- **AND** 首期 MUST 将其保持为只读模式

#### Scenario: oversized spreadsheet preview degrades deterministically

- **WHEN** `csv`、`xls` 或 `xlsx` 文件超过首期行列或工作表预算
- **THEN** 系统 MUST 显示截断后的表格预览与明确提示
- **AND** MUST NOT 因完整解析大文件而导致主界面长期卡死

### Requirement: File view SHALL provide inline PDF preview with safe degradation

系统 MUST 为 PDF 提供桌面内分页预览，并在大文档、加载失败或 Worker 初始化失败时进行显式、安全的降级。

#### Scenario: pdf file opens with paginated inline preview

- **WHEN** 用户打开 `pdf` 文件
- **THEN** 系统 MUST 提供桌面内分页预览
- **AND** 用户 MUST 能继续停留在文件查看上下文中阅读

#### Scenario: large pdf uses bounded lazy rendering

- **WHEN** PDF 页数或渲染成本超过首期预算
- **THEN** 系统 MUST 使用懒加载或分页渲染策略
- **AND** MUST NOT 一次性同步渲染全部页面

#### Scenario: pdf preview failure falls back explicitly

- **WHEN** PDF viewer 无法完成加载
- **THEN** 系统 MUST 显示显式 fallback 状态
- **AND** MUST NOT 留下空白面板或未捕获异常

### Requirement: Preview payload transport SHALL avoid unbounded binary IPC

系统 MUST 避免将高成本二进制文件以无界原始 bytes 形式通过 Tauri IPC 整包传输，并应优先使用受控的 file-backed、asset-backed 或提取后结构化 payload。

#### Scenario: large pdf and workbook previews do not default to inline bytes

- **WHEN** 用户打开超出小文件预算的 `pdf`、`xls` 或 `xlsx`
- **THEN** 系统 MUST 优先使用 file-backed 或 asset-backed payload
- **AND** MUST NOT 默认通过无界 inline bytes 传输整文件

#### Scenario: small-file inline bytes stay within explicit budget

- **WHEN** 某类预览确实使用 inline bytes
- **THEN** 系统 MUST 受显式小文件预算约束
- **AND** 超出预算后 MUST 切换为其他 source kind 或显式 fallback

### Requirement: Preview-only formats SHALL keep edit behavior explicit and safe

系统 MUST 明确区分 preview-only 与 preview-plus-text-edit 两类文件，避免用户进入不可保存的伪编辑状态。

#### Scenario: office, pdf, and image previews remain read-only

- **WHEN** 用户打开 `doc`、`docx`、`xls`、`xlsx`、`pdf`、`png`、`jpg` 或 `jpeg`
- **THEN** 系统 MUST 将这些类型标记为只读预览
- **AND** MUST NOT 提供看似可编辑但实际不可保存的编辑界面

#### Scenario: csv keeps explicit preview and edit split

- **WHEN** 用户在 `csv` 文件上切换 preview 与 edit
- **THEN** preview MUST 保持表格视图
- **AND** edit MUST 保持原始文本编辑视图

### Requirement: File preview loaders SHALL honor workspace scope and cross-platform normalization

系统 MUST 在加载多格式预览 payload 前先执行工作区范围校验与路径归一化，确保 Windows 和 macOS 下的预览行为一致。

#### Scenario: windows path variants resolve to one preview mode

- **WHEN** 同一文件以 Windows 反斜杠路径或大小写变体路径进入文件查看链路
- **THEN** 系统 MUST 将其归一化后再决定 preview mode
- **AND** MUST NOT 因路径形态差异得到不同结果

#### Scenario: windows drive-letter and UNC paths reuse one lookup contract

- **WHEN** 同一文件通过 Windows 盘符路径或 UNC 路径进入 preview payload 入口
- **THEN** 系统 MUST 将二者归一化为一致的 lookup 语义
- **AND** MUST NOT 因路径来源不同而进入不同 viewer 或 fallback

#### Scenario: macos restored absolute paths reuse the same preview contract

- **WHEN** detached file explorer 从 macOS 恢复绝对路径并重新打开文件
- **THEN** 系统 MUST 复用与主窗口相同的 preview mode 与 payload loader
- **AND** MUST NOT 因恢复路径形态不同而降级为错误 fallback

#### Scenario: macos asset urls remain stable after convertFileSrc encoding

- **WHEN** 图片或 PDF 文件路径包含空格、中文或需要 URL 编码的字符
- **THEN** 系统 MUST 在 macOS 下生成稳定可用的 `convertFileSrc` 资源地址
- **AND** MUST NOT 因 URL 编码不一致导致预览失败或资源错位

#### Scenario: csv newline differences do not change tabular preview semantics

- **WHEN** `csv` 文件分别使用 Windows `CRLF` 和 macOS `LF` 换行
- **THEN** 系统 MUST 将其解析为同一 `tabular-preview` 语义
- **AND** MUST NOT 因换行风格差异出现额外空行、列错位或错误 fallback

#### Scenario: out-of-workspace preview request is rejected safely

- **WHEN** 预览加载请求指向超出工作区范围的路径
- **THEN** 系统 MUST 拒绝该请求
- **AND** MUST NOT 将任意文件系统读取能力暴露给前端

### Requirement: Preview runtime resources SHALL be cleaned up on surface transitions

系统 MUST 在文件切换、tab 关闭、surface 销毁和 detached window 关闭时释放 preview runtime 资源，避免 worker、object URL、临时句柄和旧请求残留。

#### Scenario: switching files cancels previous preview work

- **WHEN** 用户在高成本 preview 仍在加载时切换到另一个文件
- **THEN** 系统 MUST 取消或忽略上一文件的未完成任务
- **AND** MUST NOT 让旧结果回灌到当前文件视图

#### Scenario: closing detached window disposes preview runtime resources

- **WHEN** detached file explorer 关闭时存在 PDF worker、表格 worker 或 object URL
- **THEN** 系统 MUST 释放这些 runtime 资源
- **AND** MUST NOT 在窗口关闭后继续保留活跃 preview 任务

