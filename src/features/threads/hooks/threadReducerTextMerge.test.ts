import { describe, expect, it } from "vitest";
import {
  mergeAgentMessageText,
  mergeCompletedAgentText,
} from "./threadReducerTextMerge";
import { mergeNearDuplicateParagraphVariants } from "../../../utils/assistantDuplicateParagraphs";

describe("threadReducerTextMerge", () => {
  it("strips synthetic Claude approval resume text from completed assistant payloads", () => {
    const completed = [
      "文件已经创建完成。",
      "",
      "Completed approved operations:",
      "- Created aaa.txt",
      "- Updated bbb.txt",
      "Please continue from the current workspace state and finish the original task.",
      "",
      "No response requested.",
    ].join("\n");

    expect(mergeCompletedAgentText("", completed)).toBe("文件已经创建完成。");
  });

  it("collapses near-duplicate completed paragraph blocks into one readable result", () => {
    const firstPass = [
      "先按仓库规范做一次基线扫描。",
      "我会检查项目内的 `.claude/`、`.codex/`、`openspec/`，再看目录结构和技术栈。",
      "最后给你一个简明项目分析。",
    ].join("\n\n");
    const secondPass = [
      "先按仓库规范做一次基线扫描。",
      "我会先检查项目内的 `.claude/`、`.codex/`、`openspec/`，再快速看目录结构和技术栈。",
      "最后给你一个简明的项目分析。",
    ].join("\n\n");

    expect(mergeCompletedAgentText(firstPass, `${firstPass}\n\n${secondPass}`)).toBe(secondPass);
  });

  it("collapses repeated markdown sections when duplicate copies are only separated by a single newline", () => {
    const firstPass = [
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
    const secondPass = [
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
    ].join("\n");

    expect(mergeCompletedAgentText(firstPass, `${firstPass}\n${secondPass}`)).toBe(secondPass);
  });

  it("collapses trailing repeated markdown list blocks when the first copy has a prefix", () => {
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

    expect(mergeCompletedAgentText(firstPass, `${firstPass}\n${repeatedTail}`)).toBe([
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

  it("collapses markdown completed payloads when the final snapshot replays the streamed prefix", () => {
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

    expect(
      mergeCompletedAgentText(
        streamedPrefix,
        `${streamedPrefix}\n\n${finalReport}`,
      ),
    ).toBe(finalReport);
  });

  it("collapses trailing repeated Computer Use permission guidance blocks", () => {
    const firstPass = [
      "Computer Use 这边还没真正拿到系统自动化权限，调用返回：",
      "",
      "Apple event error -100: Sender process is not authenticated",
      "",
      "这通常表示 macOS 仍没有给当前进程授予 Automation / Accessibility 权限，或者授权后进程需要重启才生效。",
      "",
      "你可以先做这两步：",
      "",
      "1. 打开 System Settings -> Privacy & Security -> Accessibility，确认运行 Codex/终端的 App 已启用。",
      "2. 打开 System Settings -> Privacy & Security -> Automation，确认它允许控制目标 App。",
      "",
      "如果你刚已经点了同意，重启当前终端/Codex 会话通常能刷新权限状态。",
    ].join("\n");
    const repeatedTail = [
      "Apple event error -10000: Sender process is not authenticated",
      "",
      "这通常表示 macOS 仍没有给当前进程授予 Automation / Accessibility 权限，或者授权后进程需要重启才生效。",
      "",
      "你可以先做这两步：",
      "",
      "1. 打开 System Settings -> Privacy & Security -> Accessibility，确认运行 Codex/终端的 App 已启用。",
      "2. 打开 System Settings -> Privacy & Security -> Automation，确认它允许控制目标 App。",
      "",
      "如果你刚刚已经点了同意，重启当前终端/Codex 会话通常能刷新权限状态。",
    ].join("\n");

    expect(mergeCompletedAgentText(firstPass, `${firstPass}\n${repeatedTail}`)).toBe([
      "Computer Use 这边还没真正拿到系统自动化权限，调用返回：",
      "",
      "Apple event error -10000: Sender process is not authenticated",
      "",
      "这通常表示 macOS 仍没有给当前进程授予 Automation / Accessibility 权限，或者授权后进程需要重启才生效。",
      "",
      "你可以先做这两步：",
      "",
      "1. 打开 System Settings -> Privacy & Security -> Accessibility，确认运行 Codex/终端的 App 已启用。\n2. 打开 System Settings -> Privacy & Security -> Automation，确认它允许控制目标 App。",
      "",
      "如果你刚刚已经点了同意，重启当前终端/Codex 会话通常能刷新权限状态。",
    ].join("\n"));
  });

  it("collapses repeated Computer Use blocks when a streaming delta appends a second copy", () => {
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

    const merged = mergeAgentMessageText(firstPass, ` ${repeatedCopy}`);

    expect(merged.match(/Computer Use 还没真正可用/g)).toHaveLength(1);
    expect(merged.match(/你可以按这个顺序处理/g)).toHaveLength(1);
    expect(merged.match(/处理完你发我一句/g)).toHaveLength(1);
    expect(merged).toContain("Apple event error -10000");
    expect(merged).toContain("我再继续拉起 Computer Use");
  });

  it("collapses repeated Computer Use blocks when the repeated prefix is partially truncated", () => {
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

    const merged = mergeAgentMessageText(firstPass, ` ${repeatedCopy}`);

    expect(merged.match(/还没真正拉起来/g)).toHaveLength(1);
    expect(merged.match(/我这边刚试了两步/g)).toHaveLength(1);
    expect(merged.match(/请你现在检查/g)).toHaveLength(1);
    expect(merged).toContain("Computer Use approval denied");
  });

  it("collapses repeated Computer Use browser permission blocks with nested list items", () => {
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

    const merged = mergeAgentMessageText(firstPass, ` ${repeatedCopy}`);

    expect(merged.match(/Computer Use 当前没法拉起浏览器/g)).toHaveLength(1);
    expect(merged.match(/这通常是 macOS/g)).toHaveLength(1);
    expect(merged.match(/授权完成后告诉我/g)).toHaveLength(1);
    expect(merged).toContain("Apple event error -10000");
  });

  it("collapses repeated Computer Use permission blocks when a bridge sentence sits between copies", () => {
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
    const repeatedCopy = [
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

    const merged = mergeAgentMessageText(firstPass, ` ${repeatedCopy}`);

    expect(merged.match(/Computer Use 没拉起来/g)).toHaveLength(1);
    expect(merged.match(/这通常是 macOS 权限问题/g)).toHaveLength(1);
    expect(merged.match(/我这边不能绕过/g)).toHaveLength(1);
    expect(merged).toContain("Apple event error -10000");
  });

  it("does not run expensive fuzzy collapse for unrelated very long paragraph variants", () => {
    const leftLongParagraph = Array.from(
      { length: 760 },
      (_, index) => `alpha${index % 17}`,
    ).join(" ");
    const rightLongParagraph = Array.from(
      { length: 760 },
      (_, index) => `omega${index % 19}`,
    ).join(" ");

    expect(
      mergeNearDuplicateParagraphVariants(
        `${leftLongParagraph}\n\n同一个短尾段。`,
        `${rightLongParagraph}\n\n同一个短尾段。`,
      ),
    ).toBeNull();
  });
});
