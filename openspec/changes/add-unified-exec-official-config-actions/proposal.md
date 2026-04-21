## Why

当前 `Background terminal` 的三态 selector + official config actions 方案过于复杂，用户反馈也很直接：他不需要桌面端再维护一套本地 override 语义，只需要一个简单入口去改官方 `~/.codex/config.toml` 的 `unified_exec`。

当前体验的问题是：

- selector 和官方配置按钮语义重叠，用户难以理解
- 顶部 reload 提示容易把“无连接会话”误读成错误
- 用户真正想要的只是三个动作：
  - 启用 -> 写 `unified_exec = true`
  - 停用 -> 写 `unified_exec = false`
  - 跟随官方默认 -> 删除显式 key

因此本轮目标是把 `Background terminal` 收口为**单车道 official config action model**：桌面端默认跟随官方，不再暴露 selector；只有用户点击显式按钮时，桌面端才修改 `~/.codex/config.toml` 的 `unified_exec`。

## Goals

- 在 `供应商管理 > Codex > Background terminal` 卡片中增加显式 official config actions：
  - 写入 `unified_exec = true`
  - 写入 `unified_exec = false`
  - 恢复官方默认（删除显式 key）
- 桌面端 UI 默认且始终跟随官方，不再暴露 `inherit / forceEnabled / forceDisabled` selector。
- 普通 settings save 继续不得写 global config。
- 动作后刷新 config 预览与 external status。
- 写入/恢复后尝试刷新当前 Codex runtime；如果没有已连接会话，只提示“下次连接时生效”。

## Non-Goals

- 不重新引入 desktop-local runtime selector。
- 不引入新的 persisted settings 字段。
- 不扩展到其他 official config key。

## What Changes

- backend 新增显式 command：写入 official `unified_exec` true/false。
- frontend 将现有卡片简化为官方配置状态 + 三个显式按钮。
- spec 将 unified_exec 路径定义为“默认跟随官方 + 显式 official config actions”。
