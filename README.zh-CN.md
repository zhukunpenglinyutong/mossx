<div align="center">

# MossX

<img width="120" alt="Image" src="./icon.png" />

**English** · [简体中文](./README.zh-CN.md)

![][github-contributors-shield] ![][github-forks-shield] ![][github-stars-shield] ![][github-issues-shield]

</div>

**MossX** 目标群体是专业开发者，可以替代Curosr使用。专注于开发者体验，我们最终目标是打造一个100%开源透明的 **下一代VibeCoding编辑器（支持Claude Code，Codex等引擎）**

> 这是一个基于 [CodexMonitor](https://github.com/Dimillian/CodexMonitor) 的二开项目

<img src="./docs/banner.png" alt="MossX Banner" width="800" />

---

### 核心特性

#### 多引擎驱动

统一管理多个 AI 编程引擎，在同一界面中自由切换：

- **Claude Code** — 深度集成 Anthropic 全系模型（Haiku / Sonnet / Opus）
- **Codex CLI** — 完整生命周期管理，支持自定义模型与参数
- **OpenCode CLI** — 内置控制面板，Provider / MCP / Sessions 可视化配置
- **Gemini CLI** — 支持接入（持续完善中）
- **自定义 Provider** — 可配置官方、国内、聚合商、第三方等多种渠道

#### 专业级开发面板

不只是聊天窗口，更是完整的开发工作台：

- **对话画布** — 富文本输入，支持文件/图片/代码片段附件，`@` 文件引用，`/` 命令触发
- **内置终端** — 基于 xterm.js 的完整 Shell 终端，支持伪终端交互
- **Git 面板** — 提交历史可视化、分支管理、Worktree 支持、Diff 审查
- **看板面板** — 拖拽式任务管理（Todo → 进行中 → 测试 → 完成）
- **计划面板** — 任务分解与规划可视化
- **并行执行** — 多 Agent 同时运行，状态实时追踪

#### AI 记忆系统

- **项目记忆** — 语义分类的持久化记忆存储（8+ 记忆类型）
- **Skills 系统** — 可复用的技能/Agent 管理，支持导入导出
- **Prompt 库** — 自定义提示词管理与快速执行

#### MCP 协议支持

内置 Model Context Protocol 支持，可配置和管理 MCP Server，扩展 AI 的工具调用能力

#### 跨平台原生体验

- **macOS** — 无边框窗口，原生标题栏融合（Intel / Apple Silicon / Universal）
- **Windows** — 无边框窗口，自定义拖拽区域
- **Linux** — AppImage 打包，开箱即用

#### 更多能力

- 语音听写（Whisper 模型，macOS/Linux）
- 全局搜索（文件、对话、看板、技能、命令等 8 种结果类型）
- 代码高亮（CodeMirror 6 + Prism.js，支持 10+ 语言）
- Mermaid 图表渲染
- 多语言界面（中文 / English）
- 自动更新

---

### 本地开发与调试

#### 1. 环境准备

确保已安装以下工具：

- [Node.js](https://nodejs.org/) (>= 18)
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://tauri.app/) (`npm install -g @tauri-apps/cli`)
- cmake

环境检查：

```bash
npm run doctor
```

#### 2. 安装前端依赖

```bash
npm install
```

#### 3. 启动开发模式

```bash
npm run tauri:dev
```

> 首次启动会编译 Rust 后端，耗时较长，后续启动为增量编译。

#### 4. 仅前端开发（不启动 Tauri）

```bash
npm run dev
```

#### 5. 构建生产版本

```bash
# macOS (Apple Silicon)
npm run build:mac-arm64

# macOS (Universal)
npm run build:mac-universal

# Windows
npm run build:win-x64

# Linux
npm run build:linux-x64
```

#### 6. 代码检查与测试

```bash
npm run lint          # ESLint 检查
npm run typecheck     # TypeScript 类型检查
npm run test          # 运行前端测试
```

---
### 客户端下载

下载地址：https://www.mossx.ai/download

---

### 未来迭代

目前虽然能用，但是细节打磨的还不满意，我至少会每天迭代一个版本，先迭代100个版本，欢迎大家使用提出问题

感谢你的Star和推荐，这将让更多人用到

---

### License

[MIT](https://github.com/zhukunpenglinyutong/idea-claude-code-gui?tab=MIT-1-ov-file)

---

## 贡献者列表

感谢所有帮助 MossX 变得更好的贡献者！

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/zhukunpenglinyutong">
        <img src="https://avatars.githubusercontent.com/u/31264015?size=100" width="100" height="100" alt="zhukunpenglinyutong" style="border-radius: 50%; border: 3px solid #ff6b35; box-shadow: 0 0 15px rgba(255, 107, 53, 0.6);" />
      </a>
      <div>🔥🔥🔥</div>
    </td>
    <td align="center">
      <a href="https://github.com/chenxiangning">
        <img src="https://avatars.githubusercontent.com/u/19299585?size=100" width="100" height="100" alt="chenxiangning" style="border-radius: 50%;" />
      </a>
      <div>🔥🔥🔥</div>
    </td>
    <td align="center">
      <a href="https://github.com/youcaizhang">
        <img src="https://avatars.githubusercontent.com/u/95678323?size=100" width="100" height="100" alt="youcaizhang" style="border-radius: 50%;" />
      </a>
    </td>
  </tr>
</table>

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=zhukunpenglinyutong/mossx&type=date&legend=top-left)](https://www.star-history.com/#zhukunpenglinyutong/mossx&type=date&legend=top-left)

<!-- LINK GROUP -->

[github-contributors-shield]: https://img.shields.io/github/contributors/zhukunpenglinyutong/mossx?color=c4f042&labelColor=black&style=flat-square
[github-forks-shield]: https://img.shields.io/github/forks/zhukunpenglinyutong/mossx?color=8ae8ff&labelColor=black&style=flat-square
[github-issues-link]: https://github.com/zhukunpenglinyutong/mossx/issues
[github-issues-shield]: https://img.shields.io/github/issues/zhukunpenglinyutong/mossx?color=ff80eb&labelColor=black&style=flat-square
[github-license-link]: https://github.com/zhukunpenglinyutong/mossx/blob/main/LICENSE
[github-stars-shield]: https://img.shields.io/github/stars/zhukunpenglinyutong/mossx?color=ffcb47&labelColor=black&style=flat-square
