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
