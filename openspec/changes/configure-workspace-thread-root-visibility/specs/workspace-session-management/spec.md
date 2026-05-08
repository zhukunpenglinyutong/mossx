## MODIFIED Requirements

### Requirement: Session Management SHALL Be A Dedicated Settings Surface

系统 MUST 提供 `项目管理 -> 会话管理` 设置页 tab，用于治理 workspace 级真实会话历史，并能引导用户访问全局历史 / 归档中心；同时该 surface MUST 暴露影响 sidebar 默认 root 会话展示窗口的 workspace 级设置。

#### Scenario: session management lives under project management tabs
- **WHEN** 用户浏览设置页左侧导航
- **THEN** 系统 MUST 显示 `项目管理` 父级入口
- **AND** 系统 MUST NOT 显示独立的 `会话管理` 一级入口

#### Scenario: dedicated session management links to global history center
- **WHEN** 用户进入 `项目管理 -> 会话管理`
- **THEN** 系统 MUST 提供进入全局历史 / 归档中心的明确入口
- **AND** 用户 MUST 能理解该入口用于查看不依赖当前 workspace strict 命中的历史

#### Scenario: session management exposes workspace thread visibility setting
- **WHEN** 用户在 `项目管理 -> 会话管理` 中查看某个 workspace
- **THEN** 系统 MUST 提供一个用于配置 sidebar 默认显示 root 会话数量的 workspace 级输入入口
- **AND** 该设置 MUST 明确说明只影响 sidebar 折叠态默认展示窗口
- **AND** 该设置 MUST NOT 改变会话管理页自身的分页或筛选总量

#### Scenario: unset workspace setting falls back to default visibility count
- **WHEN** 某个 workspace 尚未配置 root 会话显示阈值
- **THEN** 系统 MUST 使用默认值 `20`
- **AND** 会话管理页 SHOULD 让用户可见当前默认值正在生效

#### Scenario: new session can be created inside a session folder
- **WHEN** 用户从 sidebar 的某个会话文件夹行触发新建会话
- **THEN** 系统 MUST 复用当前 workspace 的新建会话菜单
- **AND** 新建成功后 MUST 将返回的 session/thread id 分配到该文件夹
- **AND** 该会话 MUST 出现在对应文件夹投影中，而不是项目根目录
