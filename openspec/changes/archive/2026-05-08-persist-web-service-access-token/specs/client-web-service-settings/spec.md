## MODIFIED Requirements

### Requirement: Settings MUST Expose Web Service Management Panel

系统 MUST 在客户端设置中提供 Web 服务管理面板，至少包含端口输入、固定访问 Token 设置、运行状态、启动/停止动作与错误提示区域。

#### Scenario: panel is visible in settings
- **WHEN** 用户打开设置页并进入 Web 服务配置区域
- **THEN** 系统 MUST 展示端口输入控件、固定访问 Token 设置控件、状态显示与启动/停止按钮

#### Scenario: invalid port is blocked before start
- **WHEN** 用户输入非法端口（非数字或不在 1024-65535）并尝试启动
- **THEN** 系统 MUST 阻止启动请求
- **AND** MUST 显示可恢复的校验提示

#### Scenario: empty fixed token means automatic generation
- **WHEN** 用户未配置固定访问 Token 或清空固定访问 Token
- **THEN** 系统 MUST 将该设置解释为自动生成模式
- **AND** 下一次启动 Web Service 时 MUST NOT 向 daemon 传入固定 Token

#### Scenario: fixed token setting is persisted for future starts
- **WHEN** 用户在 Web 服务设置中输入非空固定访问 Token 并保存
- **THEN** 系统 MUST 将修剪后的 Token 持久化到 `AppSettings`
- **AND** 后续打开设置页 MUST 恢复该固定 Token 设置

#### Scenario: fixed token can be rotated explicitly
- **WHEN** 用户触发生成或轮换固定访问 Token
- **THEN** 系统 MUST 使用安全随机来源生成一个非空 Token 并保存为固定访问 Token
- **AND** 系统 MUST NOT 使用 `Math.random()` 或其它可预测伪随机来源生成固定访问 Token
- **AND** UI MUST 明确该 Token 会在下一次启动 Web Service 时生效

#### Scenario: fixed token is redacted from diagnostics
- **WHEN** 系统生成 diagnostics bundle、settings summary、日志或错误信息
- **THEN** 系统 MUST NOT 输出 `AppSettings.webServiceToken` 原值
- **AND** 系统 MAY 仅输出 `hasWebServiceToken` 或等价布尔状态

### Requirement: Web Service Lifecycle MUST Be Deterministic and Idempotent

系统 MUST 提供可重复调用的生命周期接口（start/stop/status），并保证状态收敛可预测。

#### Scenario: start transitions to running with runtime info
- **WHEN** 用户触发启动且端口可用
- **THEN** 系统 MUST 启动 Web 服务并返回 `port`、`token`、`addresses[]`
- **AND** 状态 MUST 变为 `running`

#### Scenario: fixed token is reused during start
- **WHEN** 用户已保存固定访问 Token 并触发启动
- **THEN** 系统 MUST 将该 Token 传给 daemon 的 Web Service start command
- **AND** daemon 返回的运行期 `webAccessToken` MUST 与保存的固定访问 Token 一致

#### Scenario: rotated token applies to next start when service is stopped
- **WHEN** Web Service 当前未运行
- **AND** 用户生成或保存新的固定访问 Token
- **THEN** 随后的 Start 操作 MUST 使用新的固定访问 Token

#### Scenario: rotated token does not mutate current running auth implicitly
- **WHEN** Web Service 当前正在运行
- **AND** 用户生成、保存或清空固定访问 Token
- **THEN** 当前运行期 `webAccessToken` MUST 保持不变直到服务停止或重启
- **AND** UI MUST NOT 暗示当前运行期 Token 已被立即替换

#### Scenario: auto-generated runtime token is not silently persisted
- **WHEN** 用户处于自动生成模式并启动 Web Service
- **THEN** daemon MAY 返回本次运行期生成的 `webAccessToken`
- **AND** 系统 MUST NOT 将该运行期 Token 自动写回 `AppSettings.webServiceToken`

#### Scenario: stop is idempotent
- **WHEN** 用户在服务已停止状态重复触发停止
- **THEN** 系统 MUST 返回成功或无副作用结果
- **AND** 状态 MUST 保持 `stopped`

#### Scenario: start failure remains recoverable
- **WHEN** 端口被占用或监听参数无效导致启动失败
- **THEN** 系统 MUST 返回结构化错误信息
- **AND** MUST 保持服务状态为 `stopped`

### Requirement: Runtime Access Metadata MUST Be Observable in UI

系统 MUST 在服务运行时提供访问元数据展示，且敏感信息展示方式必须受控。

#### Scenario: addresses are rendered for local access
- **WHEN** 服务启动成功
- **THEN** 系统 MUST 至少展示 `http://127.0.0.1:<port>` 访问地址
- **AND** 若可解析局域网地址，SHALL 同步展示 LAN 地址

#### Scenario: runtime token supports masked display and reveal
- **WHEN** 服务处于运行中
- **THEN** 系统 MUST 默认以掩码形式显示当前运行期访问 Token
- **AND** 用户显式操作后 MUST 支持明文查看与恢复掩码

#### Scenario: runtime token can be copied explicitly
- **WHEN** 用户点击复制操作
- **THEN** 系统 MUST 将当前运行期访问 Token 写入剪贴板
- **AND** MUST 给出已复制反馈

#### Scenario: fixed token setting is distinct from runtime token
- **WHEN** 用户查看 Web 服务设置面板
- **THEN** UI MUST 区分“固定访问 Token 设置”和“当前运行期 Token”
- **AND** UI MUST NOT 暗示修改固定访问 Token 会立即改变已运行服务的当前 Token
