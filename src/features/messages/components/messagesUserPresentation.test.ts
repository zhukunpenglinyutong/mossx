import { describe, expect, it } from "vitest";
import {
  resolveUserConversationSummary,
  resolveUserMessagePresentation,
} from "./messagesUserPresentation";

describe("resolveUserMessagePresentation", () => {
  it("extracts only actual user input from assembled prompt payloads", () => {
    const result = resolveUserMessagePresentation({
      text: "[System] hint [Skill Prompt] demo [User Input] 你好啊",
      selectedAgentName: null,
      selectedAgentIcon: null,
      enableCollaborationBadge: false,
    });

    expect(result.displayText).toBe("你好啊");
    expect(result.stickyCandidateText).toBe("你好啊");
  });

  it("strips injected agent prompt block and preserves derived metadata", () => {
    const result = resolveUserMessagePresentation({
      text:
        "请继续。\n\n## Agent Role and Instructions\n\nAgent Name: 后端架构师\nAgent Icon: agent-robot-04\n\n你是一位资深后端架构师。",
      selectedAgentName: null,
      selectedAgentIcon: null,
      enableCollaborationBadge: false,
    });

    expect(result.displayText).toBe("请继续。");
    expect(result.stickyCandidateText).toBe("请继续。");
    expect(result.selectedAgentName).toBe("后端架构师");
    expect(result.selectedAgentIcon).toBe("agent-robot-04");
    expect(result.hasInjectedAgentPromptBlock).toBe(true);
  });

  it("keeps memory-only payload visible while excluding it from sticky candidates", () => {
    const result = resolveUserMessagePresentation({
      text: "<project-memory>\n[项目上下文] 已记录会话摘要\n</project-memory>\n",
      selectedAgentName: null,
      selectedAgentIcon: null,
      enableCollaborationBadge: false,
    });

    expect(result.displayText).toContain("[项目上下文]");
    expect(result.stickyCandidateText).toBe("");
    expect(result.memorySummary?.preview ?? "").toContain("[项目上下文]");
  });

  it("strips consecutive retrieval packs and keeps only the visible user input", () => {
    const result = resolveUserMessagePresentation({
      text: [
        '<project-memory-pack source="manual-selection" count="1" cleaned="false" cleanerStatus="source_records_only" truncated="false">',
        "Cleaned Context:",
        "- source records only",
        "",
        "Source Records:",
        "[M1] memoryId=m-1 title=手动记忆 recordKind=manual_note sourceType=manual threadId=null turnId=null engine=null updatedAt=1",
        "</project-memory-pack>",
        "",
        '<project-memory-pack source="memory-scout" count="1" cleaned="true" cleanerStatus="cleaned" truncated="false">',
        "Cleaned Context:",
        "- [M2] 自动关联事实",
        "",
        "Source Records:",
        "[M2] memoryId=m-2 title=自动记忆 recordKind=conversation_turn sourceType=conversation_turn threadId=t-1 turnId=turn-1 engine=codex updatedAt=2",
        "</project-memory-pack>",
        "",
        "继续分析",
      ].join("\n"),
      selectedAgentName: null,
      selectedAgentIcon: null,
      enableCollaborationBadge: false,
    });

    expect(result.displayText).toBe("继续分析");
    expect(result.memorySummary?.records?.map((record) => record.displayIndex)).toEqual([
      "#1",
      "#2",
    ]);
    expect(result.memorySummary?.records?.map((record) => record.index)).toEqual([
      "[M1]",
      "[M2]",
    ]);
  });

  it("strips codex mode fallback prefix when collaboration badge mode is enabled", () => {
    const result = resolveUserMessagePresentation({
      text:
        "Collaboration mode: code. Do not ask the user follow-up questions.\n\nUser request: 你好",
      selectedAgentName: null,
      selectedAgentIcon: null,
      enableCollaborationBadge: true,
    });

    expect(result.displayText).toBe("你好");
    expect(result.stickyCandidateText).toBe("你好");
  });

  it("excludes memory-only user payloads from conversation summaries", () => {
    const result = resolveUserConversationSummary({
      text: "<project-memory>\n[项目上下文] 已记录会话摘要\n</project-memory>\n",
      images: [],
      selectedAgentName: null,
      selectedAgentIcon: null,
      enableCollaborationBadge: false,
    });

    expect(result.previewText).toBe("");
    expect(result.hasRenderableConversationContent).toBe(false);
  });

  it("keeps image-only user payloads renderable in conversation summaries", () => {
    const result = resolveUserConversationSummary({
      text: "",
      images: ["diagram.png", "trace.png"],
      selectedAgentName: null,
      selectedAgentIcon: null,
      enableCollaborationBadge: false,
    });

    expect(result.previewText).toBe("");
    expect(result.imageCount).toBe(2);
    expect(result.hasRenderableConversationContent).toBe(true);
  });
});
