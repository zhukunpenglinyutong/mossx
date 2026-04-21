## 1. Settings Contract And Migration

- [x] 1.1 引入 unified_exec 三态 policy（`inherit` / `force_enabled` / `force_disabled`）并实现 legacy bool 迁移；输入为现有 TS/Rust settings 结构，输出为兼容序列化的新字段与迁移测试。
- [x] 1.2 收口 `update_app_settings` / restore / normalize 路径，禁止普通设置保存再回写 `~/.codex/config.toml`；验证任意非 repair 设置更新不产生 global config 写入。

## 2. Runtime Override And Reload

- [x] 2.1 在 Codex runtime 启动链路实现 launch-scoped unified_exec override；输入为三态 policy，输出为仅对本次 runtime 生效的 explicit override，并验证不依赖 global config mutation。
- [x] 2.2 调整 external config reload / restore 语义：inherit 模式消费 external `unified_exec`，explicit override 模式由桌面端策略优先；补齐 targeted Rust tests 证明 reload 行为稳定。

## 3. Settings UI And Legacy Repair

- [x] 3.1 将“后台终端”布尔 toggle 改为 tri-state selector + 平台默认说明；验证 Windows 呈现 official default disabled，macOS / Linux 呈现 official default enabled。
- [x] 3.2 增加 legacy global `unified_exec` 检测与 repair flow；输入为显式 external key，输出为 keep / restore 官方默认动作，并验证只有用户确认后才修改 global config。

## 4. Verification

- [x] 4.1 补齐前后端回归测试并执行最小验证矩阵：`cargo test`（settings / runtime reload / config bridge）、`vitest`（settings UI / repair flow）、`npm run lint`、`npm run typecheck`。
