## Context

当前最重要的目标不是保留双语义，而是降低产品复杂度。用户不想再区分 desktop-local override 和 official config；他只需要一个简单、可见、可回退的官方配置入口。

## Decision 1: 收口为 single-lane official config model

**Decision**

- UI 不再暴露 selector。
- `Background terminal` 只负责修改 official `~/.codex/config.toml`。
- 桌面端默认跟随官方；显式行为只有三个按钮：
  - enabled
  - disabled
  - follow official default

**Why**

- 这和用户心智完全一致，没有额外状态机。
- 仍然不会重新引入“普通设置保存静默改全局文件”的 ownership 回退。

## Decision 2: official config actions 必须显式、可见、可诊断

**Decision**

- 卡片内显示当前 official config 状态：
  - explicit enabled
  - explicit disabled
  - no explicit key / follow default
- 暴露三个动作：
  - write enabled
  - write disabled
  - restore official default

**Why**

- 用户只需要理解“当前官方配置是什么”。
- 只给按钮不给状态，仍然会制造混淆。

## Decision 3: 每次 action 后都尝试刷新 runtime，但无连接会话不算错误

**Decision**

- official config action 成功后统一触发 runtime reload。
- 如果当前没有已连接 Codex 会话，界面只提示“下次连接时生效”，不能表现成错误。

**Why**

- 这能避免新的“按钮改了文件，但眼前运行态没变化”困惑。
- 同时避免“无连接会话”被误读成失败。

## Risks

- 用户可能误以为刷新失败
  - Mitigation: “无连接会话”使用中性提示，不加 failed/applied 前缀
- 写 official config 后 reload 失败
  - Mitigation: 反馈必须说明“文件已写入，但 runtime refresh 失败”

## Validation

- Rust:
  - official config write helper 单测
  - settings_core explicit write command 单测
- Frontend:
  - 官方配置动作按钮可见
  - 点击按钮会调用新 command
  - action 后会触发 reload 和状态刷新
  - no-session reload 文案不带错误前缀
- Quality gates:
  - `pnpm vitest run src/features/vendors/components/VendorSettingsPanel.test.tsx src/features/settings/components/SettingsView.test.tsx`
  - `pnpm tsc --noEmit`
  - `cargo test --manifest-path src-tauri/Cargo.toml settings_core -- --nocapture`
