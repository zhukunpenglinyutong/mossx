# CodeMoss 桌面开发版快速启动 Runbook

## 目标
把“启动桌面开发版”固化成可重复、可观测、可恢复的最短路径，避免每次现查现判导致慢响应。

## 适用范围
- 工程目录：`codex-skill-bug-fix-3`
- 启动脚本：`scripts/dev-local.sh`
- 运行模式：Tauri 桌面开发模式（前端 + Rust 后端）

## 标准快启流程（默认执行）
1. 预清理上次残留（仅当前工程相关进程）。
2. 后台启动 `scripts/dev-local.sh`。
3. 验证三件事：
- `tauri dev`/`cargo run` 进程存在。
- `1420` 端口被本工程 `vite` 监听。
- 日志中无 `Error`/`panic`/端口冲突。
4. 回传：
- 启动 PID
- 日志路径
- 当前是否“可开始测试”

## 一键命令（可直接复制）

### 启动
```bash
zsh -lc 'source ~/.zshrc && nohup scripts/dev-local.sh > /tmp/codemoss-dev-local.log 2>&1 & echo $!'
```

### 看日志
```bash
zsh -lc 'source ~/.zshrc && tail -f /tmp/codemoss-dev-local.log'
```

### 查 1420 端口占用
```bash
zsh -lc 'source ~/.zshrc && lsof -nP -iTCP:1420 -sTCP:LISTEN || true'
```

### 清理本工程开发进程（温和）
```bash
zsh -lc 'source ~/.zshrc && pgrep -af "codex-skill-bug-fix-3|tauri dev|vite/bin/vite.js|cargo run --no-default-features" | awk "{print \$1}" | xargs -I{} kill {} 2>/dev/null || true'
```

### 清理本工程开发进程（强制）
```bash
zsh -lc 'source ~/.zshrc && pgrep -af "codex-skill-bug-fix-3|tauri dev|vite/bin/vite.js|cargo run --no-default-features" | awk "{print \$1}" | xargs -I{} kill -9 {} 2>/dev/null || true'
```

## 常见问题分流

### 1) `sh: tauri: command not found`
现象：`scripts/dev-local.sh` 里进入 `npm run tauri:dev` 后报找不到 `tauri`。

处理：
1. 先验证本地 CLI：
```bash
zsh -lc 'source ~/.zshrc && npm run tauri -- --version'
```
2. 若可输出版本（如 `tauri-cli 2.x`），继续跑 `npm run tauri:dev`；通常只是链路临时态问题。
3. 若仍失败，检查：
```bash
zsh -lc 'source ~/.zshrc && [ -x node_modules/.bin/tauri ] && echo found || echo missing'
```

### 2) `Port 1420 is already in use`
现象：Vite 启动失败，Tauri beforeDevCommand 退出。

处理：
1. 查占用：
```bash
zsh -lc 'source ~/.zshrc && lsof -nP -iTCP:1420 -sTCP:LISTEN'
```
2. 精准结束占用 PID 后重启：
```bash
zsh -lc 'source ~/.zshrc && kill <PID>'
```
3. 再启动 `scripts/dev-local.sh`。

## “我以后收到启动请求”的固定执行模板
收到“启动桌面开发版”后，按下面顺序直接执行，不再临场探索：

1. `预清理`：清理当前工程残留 `tauri/vite/cargo`。
2. `后台启动`：`nohup scripts/dev-local.sh > /tmp/codemoss-dev-local.log 2>&1 &`。
3. `三项验收`：进程、端口、日志关键字。
4. `结果回报`：
- 已启动/未启动
- 阻塞原因（若失败）
- 下一条可直接执行命令

## 验收标准（Ready for Test）
满足以下条件即判定“可测试”：
- `tauri dev` 与 `cargo run --no-default-features` 在运行。
- `1420` 端口由本工程 `node ... vite.js` 监听。
- 启动日志无新出现的 `Error`、`panic`、`Port 1420 is already in use`。

## 备注
- 首次或依赖变更后，Rust 编译时间会明显更长，属于正常现象。
- `npm warn Unknown user config "electron_mirror"` 是 warning，不阻塞启动。
