import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { initialState, threadReducer } from "./useThreadsReducer";

describe("threadReducer completed duplicate collapse", () => {
  it("keeps one readable assistant message when final output repeats a large paragraph block", () => {
    const itemId = "assistant-large-complete-duplicate-1";
    const streamed = [
      "先按仓库规范做一次基线扫描。",
      "我会检查项目内的 `.claude/`、`.codex/`、`openspec/`，再看目录结构和技术栈。",
      "最后给你一个简明项目分析。",
    ].join("\n\n");
    const completed = [
      streamed,
      [
        "先按仓库规范做一次基线扫描。",
        "我会先检查项目内的 `.claude/`、`.codex/`、`openspec/`，再快速看目录结构和技术栈。",
        "最后给你一个简明的项目分析。",
      ].join("\n\n"),
    ].join("\n\n");

    const withDelta = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      delta: streamed,
      hasCustomName: false,
    });
    const merged = threadReducer(withDelta, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      text: completed,
      hasCustomName: false,
    });
    const finalized = threadReducer(merged, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: itemId,
        kind: "message",
        role: "assistant",
        text: completed,
      },
      hasCustomName: false,
    });

    const messages = (finalized.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant" && item.id === itemId,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe([
      "先按仓库规范做一次基线扫描。",
      "我会先检查项目内的 `.claude/`、`.codex/`、`openspec/`，再快速看目录结构和技术栈。",
      "最后给你一个简明的项目分析。",
    ].join("\n\n"));
  });

  it("keeps one readable assistant message when markdown sections repeat with only a single newline between copies", () => {
    const itemId = "assistant-markdown-complete-duplicate-1";
    const streamed = [
      "我是你当前这个工作区里的 AI 联合架构师兼 coding agent。",
      "",
      "更准确点说：",
      "",
      "- 角色上，我按“虚拟 CTO 合作伙伴”方式协作",
      "- 工作上，我负责读代码、定方案、改实现、跑验证、做 review",
      "- 流程上，我会先给 `PLAN`，等你确认后再改文件",
      "- 风格上，我默认中文交流，直接、简洁，不讲废话",
      "",
      "你给我需求，我来拆解并推进。",
    ].join("\n");
    const completed = [
      streamed,
      [
        "我是你当前这个工作区里的 AI 联合架构师兼 coding agent。",
        "",
        "更准确点说：",
        "",
        "- 角色上，我按“虚拟 CTO 合作伙伴”方式协作",
        "- 工作上，我负责读代码、定方案、改实现、跑验证，也做 review",
        "- 流程上，我会先给 `PLAN`，等你确认后再改文件",
        "- 风格上，我默认中文交流，直接、简洁，不讲废话",
        "",
        "你给我需求，我来拆解并推进。",
      ].join("\n"),
    ].join("\n");

    const withDelta = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      delta: streamed,
      hasCustomName: false,
    });
    const merged = threadReducer(withDelta, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      text: completed,
      hasCustomName: false,
    });
    const finalized = threadReducer(merged, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: {
        id: itemId,
        kind: "message",
        role: "assistant",
        text: completed,
      },
      hasCustomName: false,
    });

    const messages = (finalized.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant" && item.id === itemId,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe([
      "我是你当前这个工作区里的 AI 联合架构师兼 coding agent。",
      "",
      "更准确点说：",
      "",
      "- 角色上，我按“虚拟 CTO 合作伙伴”方式协作",
      "- 工作上，我负责读代码、定方案、改实现、跑验证，也做 review",
      "- 流程上，我会先给 `PLAN`，等你确认后再改文件",
      "- 风格上，我默认中文交流，直接、简洁，不讲废话",
      "",
      "你给我需求，我来拆解并推进。",
    ].join("\n"));
  });

  it("collapses markdown completed payloads when the final snapshot replays the streamed prefix", () => {
    const itemId = "assistant-markdown-prefix-replay-1";
    const finalReport = [
      "---",
      "",
      "## 📊 项目分析报告",
      "",
      "### 1. 基本信息",
      "",
      "| 维度 | 内容 |",
      "|------|------|",
      "| 项目名 | springboot-demo |",
      "| Java | 11 |",
      "",
      "### 2. 技术栈",
      "",
      "- Spring Boot 2.7.18",
      "- Spring Security + JWT",
      "- Spring Data JPA + H2",
      "",
      "### 3. 结论",
      "",
      "这是一个结构清晰的多端统一认证演示项目。",
    ].join("\n");
    const streamedPrefix = finalReport.slice(0, Math.floor(finalReport.length * 0.5));
    const completedPayload = `${streamedPrefix}\n\n${finalReport}`;

    const withDelta = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      delta: streamedPrefix,
      hasCustomName: false,
    });
    const completed = threadReducer(withDelta, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      text: completedPayload,
      hasCustomName: false,
    });

    const messages = (completed.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant" && item.id === itemId,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe(finalReport);
  });

  it("keeps the existing long markdown when completed snapshot is already contained inside it", () => {
    const itemId = "assistant-markdown-contained-completed-1";
    const completed = [
      "# JinSen 后端架构分析报告",
      "",
      "## 技术栈",
      "",
      "| 组件 | 技术 |",
      "| --- | --- |",
      "| 框架 | FastAPI + Uvicorn |",
      "| 数据库 | PostgreSQL + SQLAlchemy 2.0 |",
      "",
      "## 改进建议",
      "",
      "1. 拆分巨型文件",
      "2. 引入 Repository 模式",
      "3. 清理 Domain Policies 边界",
    ].join("\n");
    const streamed = [
      completed,
      "",
      "总结：这是一个 DDD 架构良好的项目，主要瓶颈集中在 facade 和 routes。",
    ].join("\n");

    const withDelta = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      delta: streamed,
      hasCustomName: false,
    });
    const merged = threadReducer(withDelta, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      text: completed,
      hasCustomName: false,
    });

    const messages = (merged.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant" && item.id === itemId,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe(streamed);
  });

  it("merges equivalent codex completion when fallback uses a different item id", () => {
    const streamed = "Computer Use 现在还没有拿到系统层面的控制权限。";
    const withDelta = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-1",
      itemId: "assistant-live-1",
      delta: streamed,
      hasCustomName: false,
    });
    const completed = threadReducer(withDelta, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "codex-thread-1",
      itemId: "turn-fallback-1",
      text: streamed,
      hasCustomName: false,
    });

    const messages = (completed.itemsByThread["codex-thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("assistant-live-1");
    expect(messages[0]?.isFinal).toBe(true);
    expect(messages[0]?.text).toBe(streamed);
  });

  it("merges codex snapshot-before-delta aliases into one assistant message", () => {
    const snapshotText = "我先确认当前可控的桌面应用状态，再按你说的继续接管 Computer Use。";
    const withSnapshot = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-2",
      itemId: "snapshot-agent-message",
      delta: snapshotText,
      hasCustomName: false,
    });
    const withAliasDelta = threadReducer(withSnapshot, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-2",
      itemId: "stream-agent-message",
      delta: snapshotText,
      hasCustomName: false,
    });
    const completed = threadReducer(withAliasDelta, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "codex-thread-2",
      itemId: "completed-agent-message",
      text: snapshotText,
      hasCustomName: false,
    });

    const messages = (completed.itemsByThread["codex-thread-2"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("snapshot-agent-message");
    expect(messages[0]?.isFinal).toBe(true);
    expect(messages[0]?.text).toBe(snapshotText);
  });

  it("keeps tool-separated non-equivalent codex assistant segments separate", () => {
    const first = "我会先检查权限状态。";
    const second = "权限检查完成，下一步需要重新授权。";
    const withFirst = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-3",
      itemId: "assistant-before-tool",
      delta: first,
      hasCustomName: false,
    });
    const withTool = threadReducer(withFirst, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "codex-thread-3",
      item: {
        id: "tool-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Computer Use / list-apps",
        detail: "",
        status: "completed",
        output: "Apple event error -10000",
      },
      hasCustomName: false,
    });
    const withSecond = threadReducer(withTool, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "codex-thread-3",
      itemId: "assistant-after-tool",
      text: second,
      hasCustomName: false,
    });

    const messages = (withSecond.itemsByThread["codex-thread-3"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.text)).toEqual([first, second]);
  });

  it("keeps similar codex assistant segments with different endings separate", () => {
    const first =
      "我会先检查 Computer Use 权限状态，然后确认系统设置入口是否打开。";
    const second =
      "我会先检查 Computer Use 权限状态，然后确认系统设置入口是否关闭。";
    const withFirst = threadReducer(initialState, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "codex-thread-4",
      itemId: "assistant-first",
      text: first,
      hasCustomName: false,
    });
    const withSecond = threadReducer(withFirst, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "codex-thread-4",
      itemId: "assistant-second",
      text: second,
      hasCustomName: false,
    });

    const messages = (withSecond.itemsByThread["codex-thread-4"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.text)).toEqual([first, second]);
  });

  it("does not apply codex assistant dedupe to bare threads marked as claude", () => {
    const claudeState = {
      ...initialState,
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "thread-claude-1",
            name: "Claude session",
            updatedAt: 1,
            engineSource: "claude" as const,
          },
        ],
      },
    };
    const text =
      "我会先检查当前权限状态，然后确认是否需要你重新授权。";
    const withFirst = threadReducer(claudeState, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-claude-1",
      itemId: "assistant-first",
      text,
      hasCustomName: false,
    });
    const withSecond = threadReducer(withFirst, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-claude-1",
      itemId: "assistant-second",
      text,
      hasCustomName: false,
    });

    const messages = (withSecond.itemsByThread["thread-claude-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.id)).toEqual([
      "assistant-first",
      "assistant-second",
    ]);
  });

  it("collapses repeated trailing codex snapshot text inside one assistant message", () => {
    const firstPass = [
      "我能在这个仓库里帮你做这些事：",
      "",
      "• 读代码、定位 bug、解释调用链和设计问题",
      "• 按你的 PlanFirst 规则先出 PLAN，确认后再改代码",
      "• 实现 Spring Boot 功能、接口、配置、测试和文档",
      "• 生成或同步 API 文档、OpenSpec/Trellis 规范、变更记录",
      "• 做 code review，重点查回归风险、边界条件、安全和性能问题",
      "",
      "一句话：负责把需求变成可靠实现，同时帮你把系统里的混乱和隐性风险压下去。",
    ].join("\n");
    const repeatedTail = [
      "• 读代码、定位 bug、解释调用链和设计问题",
      "• 按你的 PlanFirst 规则先出 PLAN，确认后再改代码",
      "• 实现 Spring Boot 功能、接口、配置、测试和文档",
      "• 生成或同步 API 文档、OpenSpec/Trellis 规范、变更记录",
      "• 做 code review，重点查回归风险、边界条件、安全和性能问题",
      "",
      "一句话：我负责把需求变成可靠实现，同时帮你把系统里的混乱和隐性风险压下去。",
    ].join("\n");
    const withFirst = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-5",
      itemId: "assistant-live",
      delta: firstPass,
      hasCustomName: false,
    });
    const withSnapshot = threadReducer(withFirst, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-5",
      itemId: "assistant-live",
      delta: `${firstPass}\n${repeatedTail}`,
      hasCustomName: false,
    });

    const messages = (withSnapshot.itemsByThread["codex-thread-5"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe([
      "我能在这个仓库里帮你做这些事：",
      "",
      "• 读代码、定位 bug、解释调用链和设计问题",
      "• 按你的 PlanFirst 规则先出 PLAN，确认后再改代码",
      "• 实现 Spring Boot 功能、接口、配置、测试和文档",
      "• 生成或同步 API 文档、OpenSpec/Trellis 规范、变更记录",
      "• 做 code review，重点查回归风险、边界条件、安全和性能问题",
      "",
      "一句话：我负责把需求变成可靠实现，同时帮你把系统里的混乱和隐性风险压下去。",
    ].join("\n"));
  });

  it("collapses repeated codex streaming delta blocks inside one assistant message", () => {
    const firstPass = [
      "Computer Use 还没真正可用：系统返回 Apple event error -100: Sender process is not authenticated，意思是当前 Codex/终端进程还没有 macOS 自动化或辅助功能权限，虽然你刚才点了同意，但权限可能没给到实际发送事件的进程，或者需要重启会话/终端后生效。",
      "",
      "你可以按这个顺序处理：",
      "",
      "1. 打开 macOS：系统设置 -> 隐私与安全性 -> 辅助功能",
      "2. 确认当前运行 Codex 的应用/终端已开启，例如 Terminal、iTerm、Cursor、Code 或对应启动器",
      "3. 再到：隐私与安全性 -> 自动化",
      "4. 确认同一个应用允许控制目标 App",
      "5. 重启当前 Codex 所在终端/应用后再试",
      "",
      "处理完你发我一句“好了”，我再继续拉起 Use。",
    ].join("\n");
    const repeatedCopy = [
      "Computer Use 还没真正可用：系统返回 Apple event error -10000: Sender process is not authenticated，意思是当前 Codex/终端进程还没有 macOS 自动化或辅助功能权限，虽然你刚才点了同意，但权限可能没给到实际发送事件的进程，或者需要重启会话/终端后生效。",
      "",
      "你可以按这个顺序处理：",
      "",
      "1. 打开 macOS：系统设置 -> 隐私与安全性 -> 辅助功能",
      "2. 确认当前运行 Codex 的应用/终端已开启，例如 Terminal、iTerm、Cursor、Code 或对应启动器",
      "3. 再到：隐私与安全性 -> 自动化",
      "4. 确认同一个应用允许控制目标 App",
      "5. 重启当前 Codex 所在终端/应用后再试",
      "",
      "处理完你发我一句“好了”，我再继续拉起 Computer Use。",
    ].join("\n");
    const withFirst = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-6",
      itemId: "assistant-live",
      delta: firstPass,
      hasCustomName: false,
    });
    const withRepeatedDelta = threadReducer(withFirst, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-6",
      itemId: "assistant-live",
      delta: ` ${repeatedCopy}`,
      hasCustomName: false,
    });

    const messages = (withRepeatedDelta.itemsByThread["codex-thread-6"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(1);
    const messageText = messages[0]?.text ?? "";
    expect(messageText.match(/Computer Use 还没真正可用/g)).toHaveLength(1);
    expect(messageText.match(/你可以按这个顺序处理/g)).toHaveLength(1);
    expect(messageText.match(/处理完你发我一句/g)).toHaveLength(1);
    expect(messageText).toContain("Apple event error -10000");
    expect(messageText).toContain("我再继续拉起 Computer Use");
  });

  it("collapses repeated codex delta blocks when the repeated prefix is truncated", () => {
    const firstPass = [
      "Use还没真正拉起来。",
      "",
      "📌 我这边刚试了两步，结果是：",
      "",
      "• list_apps 报：Sender process is not authenticated -> 读取 Finder 状态报：Computer approval denied via MCP elicitation",
      "",
      "这说明当前 Computer / macOS 权限仍没有放行，或者刚才点同意的不是这一次 Finder 访问授权。",
      "",
      "✅ 请你现在检查一下是否又弹了授权框，点 allow / 同意。如果没弹窗，去：",
      "",
      "System Settings -> Privacy & Security -> Accessibility / Automation",
      "",
      "确认 Codex、Terminal 或当前宿主应用有权限。处理好后发我一句“好了”，我再重新拉起。",
    ].join("\n");
    const repeatedCopy = [
      "Computer Use还没真正拉起来。",
      "",
      "📌 我这边刚试了两步，结果是：",
      "",
      "• list_apps 报：Sender process is not authenticated",
      "• 读取 Finder 状态报：Computer Use approval denied via MCP elicitation",
      "",
      "这说明当前 Computer Use / macOS 权限仍没有放行，或者刚才点同意的不是这一次 Finder 访问授权。",
      "",
      "✅ 请你现在检查一下是否又弹了授权框，点 allow / 同意。如果没弹窗，去：",
      "",
      "System Settings -> Privacy & Security -> Accessibility / Automation",
      "",
      "确认 Codex、Terminal 或当前宿主应用有权限。处理好后发我一句“好了”，我再重新拉起。",
    ].join("\n");
    const withFirst = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-7",
      itemId: "assistant-live",
      delta: firstPass,
      hasCustomName: false,
    });
    const withRepeatedDelta = threadReducer(withFirst, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "codex-thread-7",
      itemId: "assistant-live",
      delta: ` ${repeatedCopy}`,
      hasCustomName: false,
    });

    const messages = (withRepeatedDelta.itemsByThread["codex-thread-7"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(1);
    const messageText = messages[0]?.text ?? "";
    expect(messageText.match(/还没真正拉起来/g)).toHaveLength(1);
    expect(messageText.match(/我这边刚试了两步/g)).toHaveLength(1);
    expect(messageText.match(/请你现在检查/g)).toHaveLength(1);
    expect(messageText).toContain("Computer Use approval denied");
  });

  it("merges equivalent codex assistant snapshots that arrive through upsertItem with different ids", () => {
    const firstPass = [
      "Computer Use 当前没法拉起浏览器：系统返回 Apple event error -100: Sender process is not authenticated。",
      "",
      "这通常是 macOS 辅助功能/自动化权限没给到当前宿主进程。你需要在系统里给运行 Codex/终端的应用授权：",
      "",
      "1. 打开 System Settings",
      "2. 进入 Privacy & Security",
      "3. 检查并允许：",
      "   - Accessibility",
      "   - Automation",
      "   - 必要时还有 Screen Recording",
      "4. 授权对象通常是当前运行 Codex 的终端应用，比如 Terminal、iTerm2、Cursor、VS Code 等",
      "5. 授权后重启当前终端/应用，再让我继续操作浏览器",
      "",
      "授权完成后告诉我，我再继续拉起 mac 浏览器。",
    ].join("\n");
    const repeatedCopy = [
      "Computer Use 当前没法拉起浏览器：系统返回 Apple event error -10000: Sender process is not authenticated。",
      "",
      "这通常是 macOS 辅助功能/自动化权限没给到当前宿主进程。你需要在系统里给运行 Codex/终端的应用授权：",
      "",
      "1. 打开 System Settings",
      "2. 进入 Privacy & Security",
      "3. 检查并允许：",
      "   - Accessibility",
      "   - Automation",
      "   - 必要时还有 Screen Recording",
      "4. 授权对象通常是当前运行 Codex 的终端应用，比如 Terminal、iTerm2、Cursor、VS Code 等",
      "5. 授权后重启当前终端/应用，再让我继续操作浏览器",
      "",
      "授权完成后告诉我，我再继续拉起 mac 浏览器。",
    ].join("\n");
    const withFirst = threadReducer(initialState, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "codex-thread-8",
      item: {
        id: "assistant-snapshot-1",
        kind: "message",
        role: "assistant",
        text: firstPass,
      },
      hasCustomName: false,
    });
    const withRepeatedSnapshot = threadReducer(withFirst, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "codex-thread-8",
      item: {
        id: "assistant-snapshot-2",
        kind: "message",
        role: "assistant",
        text: repeatedCopy,
      },
      hasCustomName: false,
    });

    const messages = (withRepeatedSnapshot.itemsByThread["codex-thread-8"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("assistant-snapshot-1");
    const messageText = messages[0]?.text ?? "";
    expect(messageText.match(/Computer Use 当前没法拉起浏览器/g)).toHaveLength(1);
    expect(messageText.match(/这通常是 macOS/g)).toHaveLength(1);
    expect(messageText.match(/授权完成后告诉我/g)).toHaveLength(1);
    expect(messageText).toContain("Apple event error -10000");
  });

  it("merges codex upsert snapshots when the alias starts with the previous bridge sentence", () => {
    const firstPass = [
      "Computer Use 没拉起来：系统返回 Apple event error -100: Sender process is not authenticated。",
      "",
      "这通常是 macOS 权限问题，当前控制进程还没有被授权使用辅助功能/自动化。需要你在系统里给对应应用授权：",
      "",
      "1. 打开 System Settings",
      "2. 进入 Privacy & Security",
      "3. 检查并授权：",
      "   - Accessibility",
      "   - Automation",
      "   - 可能还需要 Screen Recording",
      "4. 给运行 Codex/终端的应用授权，比如 Terminal、iTerm、Cursor 或当前宿主应用",
      "5. 授权后重启当前 Codex/终端会话，再让我重试",
      "",
      "我这边不能绕过这个 macOS 安全授权。",
    ].join("\n");
    const aliasSnapshot = [
      "我这边不能绕过这个 macOS 安全授权。",
      "Computer Use 没拉起来：系统返回 Apple event error -10000: Sender process is not authenticated。",
      "",
      "这通常是 macOS 权限问题，当前控制进程还没有被授权使用辅助功能/自动化。需要你在系统里给对应应用授权：",
      "",
      "1. 打开 System Settings",
      "2. 进入 Privacy & Security",
      "3. 检查并授权：",
      "   - Accessibility",
      "   - Automation",
      "   - 可能还需要 Screen Recording",
      "4. 给运行 Codex/终端的应用授权，比如 Terminal、iTerm、Cursor 或当前宿主应用",
      "5. 授权后重启当前 Codex/终端会话，再让我重试",
      "",
      "我这边不能绕过这个 macOS 安全授权。",
    ].join("\n");
    const withFirst = threadReducer(initialState, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "codex-thread-9",
      item: {
        id: "assistant-snapshot-1",
        kind: "message",
        role: "assistant",
        text: firstPass,
      },
      hasCustomName: false,
    });
    const withAliasSnapshot = threadReducer(withFirst, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "codex-thread-9",
      item: {
        id: "assistant-snapshot-2",
        kind: "message",
        role: "assistant",
        text: aliasSnapshot,
      },
      hasCustomName: false,
    });

    const messages = (withAliasSnapshot.itemsByThread["codex-thread-9"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("assistant-snapshot-1");
    const messageText = messages[0]?.text ?? "";
    expect(messageText.match(/Computer Use 没拉起来/g)).toHaveLength(1);
    expect(messageText.match(/这通常是 macOS 权限问题/g)).toHaveLength(1);
    expect(messageText.match(/我这边不能绕过/g)).toHaveLength(1);
    expect(messageText).toContain("Apple event error -10000");
  });
});
