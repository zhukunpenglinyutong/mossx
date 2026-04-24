## 1. Guard Structure

- [x] 1.1 提取 Linux startup compatibility guard 模块与薄 facade，保持 `lib.rs` 只做平台调用接线，不把新逻辑继续堆进主入口。
- [x] 1.2 为 Linux guard 增加独立状态持久化与 renderer-ready reset 路径，复用现有 `bootstrap_mark_renderer_ready` 信号且不污染 Windows 语义。

## 2. Linux Fallback Implementation

- [x] 2.1 实现 `Wayland + AppImage` 高风险上下文探测与第一层 `WEBKIT_DISABLE_DMABUF_RENDERER=1` 注入，保持用户显式 `WEBKIT_*` env 优先级不被覆盖。
- [x] 2.2 实现连续未就绪启动后的第二层 fallback 升级与启动诊断日志，明确记录上下文输入、启用层级和 user override 证据。

## 3. Verification And Governance

- [x] 3.1 补齐 Rust 定向测试，覆盖风险上下文判定、用户 env 保留、未就绪升级和 renderer-ready reset。
- [x] 3.2 运行并记录定向验证：`cargo test --manifest-path src-tauri/Cargo.toml`、`npm run lint`、`npm run typecheck`、`npm run check:large-files`；如新增测试触及相关路径，再确认不会破坏 `heavy-test-noise` 门禁预期。
