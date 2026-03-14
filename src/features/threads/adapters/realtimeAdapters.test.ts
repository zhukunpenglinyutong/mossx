import { describe, expect, it } from "vitest";
import { claudeRealtimeAdapter } from "./claudeRealtimeAdapter";
import { codexRealtimeAdapter } from "./codexRealtimeAdapter";
import { opencodeRealtimeAdapter } from "./opencodeRealtimeAdapter";

describe("realtime adapters", () => {
  it("maps codex item/started tool payload to normalized tool event", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-1",
      message: {
        method: "item/started",
        params: {
          threadId: "thread-1",
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: ["npm", "run", "typecheck"],
            status: "started",
          },
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("codex");
    expect(event?.operation).toBe("itemStarted");
    expect(event?.item.kind).toBe("tool");
    expect(event?.itemKind).toBe("tool");
  });

  it("maps claude reasoning text delta to normalized reasoning delta event", () => {
    const event = claudeRealtimeAdapter.mapEvent({
      workspaceId: "ws-2",
      message: {
        method: "item/reasoning/textDelta",
        params: {
          threadId: "claude:session-1",
          itemId: "reasoning-1",
          delta: "checking files...",
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("claude");
    expect(event?.operation).toBe("appendReasoningContentDelta");
    expect(event?.item.kind).toBe("reasoning");
    expect(event?.delta).toBe("checking files...");
  });

  it("maps codex newer reasoning summary delta event to normalized reasoning summary", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-2",
      message: {
        method: "response.reasoning_summary_text.delta",
        params: {
          threadId: "thread-1",
          item_id: "reasoning-1",
          delta: "checking files...",
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("codex");
    expect(event?.operation).toBe("appendReasoningSummaryDelta");
    expect(event?.item.kind).toBe("reasoning");
    expect(event?.delta).toBe("checking files...");
  });

  it("maps codex reasoning summary delta alias to normalized reasoning summary", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-2",
      message: {
        method: "response.reasoning_summary.delta",
        params: {
          threadId: "thread-1",
          item_id: "reasoning-1b",
          delta: "summary alias delta",
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("codex");
    expect(event?.operation).toBe("appendReasoningSummaryDelta");
    expect(event?.item.kind).toBe("reasoning");
    expect(event?.item.id).toBe("reasoning-1b");
    expect(event?.delta).toBe("summary alias delta");
  });

  it("maps codex newer reasoning summary boundary event using nested part item id", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-2",
      message: {
        method: "response.reasoning_summary_part.added",
        params: {
          threadId: "thread-1",
          part: {
            item_id: "reasoning-2",
          },
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("codex");
    expect(event?.operation).toBe("appendReasoningSummaryBoundary");
    expect(event?.item.kind).toBe("reasoning");
    expect(event?.item.id).toBe("reasoning-2");
  });

  it("maps codex newer reasoning summary done event using text payload fallback", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-2",
      message: {
        method: "response.reasoning_summary_text.done",
        params: {
          threadId: "thread-1",
          item: {
            id: "reasoning-3",
          },
          text: "summary done",
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("codex");
    expect(event?.operation).toBe("appendReasoningSummaryDelta");
    expect(event?.item.kind).toBe("reasoning");
    expect(event?.item.id).toBe("reasoning-3");
    expect(event?.delta).toBe("summary done");
  });

  it("maps codex newer reasoning summary part done event using nested part text", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-2",
      message: {
        method: "response.reasoning_summary_part.done",
        params: {
          threadId: "thread-1",
          item_id: "reasoning-4",
          part: {
            type: "summary_text",
            text: "finalized summary",
          },
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("codex");
    expect(event?.operation).toBe("appendReasoningSummaryDelta");
    expect(event?.item.kind).toBe("reasoning");
    expect(event?.item.id).toBe("reasoning-4");
    expect(event?.delta).toBe("finalized summary");
  });

  it("maps claude item/updated agentMessage snapshot to assistant delta event", () => {
    const event = claudeRealtimeAdapter.mapEvent({
      workspaceId: "ws-2",
      message: {
        method: "item/updated",
        params: {
          threadId: "claude:session-1",
          item: {
            id: "assistant-1",
            type: "agentMessage",
            text: "streaming body",
          },
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("claude");
    expect(event?.operation).toBe("appendAgentMessageDelta");
    expect(event?.item.kind).toBe("message");
    expect(event?.delta).toBe("streaming body");
  });

  it("maps fileChange outputDelta to normalized tool output delta event", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-file",
      message: {
        method: "item/fileChange/outputDelta",
        params: {
          threadId: "thread-file",
          itemId: "file-1",
          delta: "@@ -0,0 +1 @@\n+const x = 1;",
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.operation).toBe("appendToolOutputDelta");
    expect(event?.item.kind).toBe("tool");
    if (event?.item.kind === "tool") {
      expect(event.item.toolType).toBe("fileChange");
      expect(event.item.title).toBe("File changes");
      expect(event.item.output).toContain("const x = 1");
    }
  });

  it("hydrates claude tool snapshot output from event params when item output is missing", () => {
    const event = claudeRealtimeAdapter.mapEvent({
      workspaceId: "ws-claude",
      message: {
        method: "item/completed",
        params: {
          threadId: "claude:session-1",
          output: "line-1\nline-2",
          item: {
            id: "cmd-1",
            type: "commandExecution",
            command: "ls -la",
            status: "completed",
          },
        },
      },
    });
    expect(event).toBeTruthy();
    expect(event?.engine).toBe("claude");
    expect(event?.operation).toBe("itemCompleted");
    expect(event?.item.kind).toBe("tool");
    if (event?.item.kind === "tool") {
      expect(event.item.toolType).toBe("commandExecution");
      expect(event.item.output).toBe("line-1\nline-2");
    }
  });

  it("maps opencode text:delta to assistant delta and ignores heartbeat", () => {
    const deltaEvent = opencodeRealtimeAdapter.mapEvent({
      workspaceId: "ws-3",
      message: {
        method: "text:delta",
        params: {
          threadId: "opencode:ses_1",
          itemId: "agent-1",
          delta: "still working",
        },
      },
    });
    expect(deltaEvent).toBeTruthy();
    expect(deltaEvent?.engine).toBe("opencode");
    expect(deltaEvent?.operation).toBe("appendAgentMessageDelta");
    expect(deltaEvent?.item.kind).toBe("message");
    expect(deltaEvent?.item.id).toBe("agent-1");

    const heartbeatEvent = opencodeRealtimeAdapter.mapEvent({
      workspaceId: "ws-3",
      message: {
        method: "processing/heartbeat",
        params: {
          threadId: "opencode:ses_1",
          pulse: 2,
        },
      },
    });
    expect(heartbeatEvent).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-1",
      message: {
        method: "item/agentMessage/delta",
        params: {
          threadId: "",
          itemId: "msg-1",
          delta: "hello",
        },
      },
    });
    expect(event).toBeNull();
  });

  it("keeps item/completed usage metadata for downstream token accounting", () => {
    const event = codexRealtimeAdapter.mapEvent({
      workspaceId: "ws-1",
      message: {
        method: "item/completed",
        params: {
          threadId: "thread-1",
          item: {
            id: "agent-1",
            type: "agentMessage",
            text: "done",
          },
          usage: {
            input_tokens: 3,
            output_tokens: 7,
          },
        },
      },
    });
    expect(event?.operation).toBe("completeAgentMessage");
    expect(event?.rawUsage).toEqual({
      input_tokens: 3,
      output_tokens: 7,
    });
  });
});
