import { describe, expect, it } from "vitest";
import {
  classifyConversationObservation,
  formatCompactControlToolItem,
  isRequestUserInputSettled,
} from "./conversationFactContract";

describe("conversationFactContract", () => {
  it("classifies synthetic approval resume marker as hidden control-plane", () => {
    const fact = classifyConversationObservation({
      engine: "claude",
      threadId: "thread-1",
      source: "history",
      rawText: '<ccgui-approval-resume>[{"path":"a.ts"}]</ccgui-approval-resume>',
      item: {
        id: "assistant-approval-marker",
        kind: "message",
        role: "assistant",
        text: '<ccgui-approval-resume>[{"path":"a.ts"}]</ccgui-approval-resume>',
      },
    });

    expect(fact.factKind).toBe("hidden-control-plane");
    expect(fact.visibility).toBe("hidden");
    expect(fact.controlReason).toBe("hidden-control-plane");
  });

  it("classifies modeBlocked as compact control event instead of assistant prose", () => {
    const fact = classifyConversationObservation({
      engine: "codex",
      threadId: "thread-1",
      source: "realtime",
      rawType: "modeBlocked",
      rawText: "modeBlocked: code mode is unavailable",
    });

    expect(fact.factKind).toBe("control-event");
    expect(fact.visibility).toBe("compact");
    expect(fact.controlReason).toBe("modeBlocked");
  });

  it("does not hide natural language that only mentions a control marker", () => {
    const fact = classifyConversationObservation({
      engine: "claude",
      threadId: "thread-1",
      source: "history",
      rawText: 'The user asked why the log says "No response requested." yesterday.',
      item: {
        id: "assistant-control-mention",
        kind: "message",
        role: "assistant",
        text: 'The user asked why the log says "No response requested." yesterday.',
      },
    });

    expect(fact.factKind).toBe("dialogue");
    expect(fact.visibility).toBe("visible");
  });

  it("does not compact normal assistant prose that mentions interruption", () => {
    const fact = classifyConversationObservation({
      engine: "codex",
      threadId: "thread-1",
      source: "history",
      rawText: "The deploy was interrupted by a flaky network.",
      item: {
        id: "assistant-interrupted-mention",
        kind: "message",
        role: "assistant",
        text: "The deploy was interrupted by a flaky network.",
      },
    });

    expect(fact.factKind).toBe("dialogue");
    expect(fact.visibility).toBe("visible");
  });

  it("does not hide natural language that mentions developer_instructions", () => {
    const fact = classifyConversationObservation({
      engine: "claude",
      threadId: "thread-1",
      source: "history",
      rawText: "Please explain what the developer_instructions field means.",
      item: {
        id: "assistant-developer-instructions-mention",
        kind: "message",
        role: "assistant",
        text: "Please explain what the developer_instructions field means.",
      },
    });

    expect(fact.factKind).toBe("dialogue");
    expect(fact.visibility).toBe("visible");
  });

  it("hides high-confidence developer_instructions control lines", () => {
    const fact = classifyConversationObservation({
      engine: "claude",
      threadId: "thread-1",
      source: "history",
      rawText: 'developer_instructions="follow workspace policy"',
    });

    expect(fact.factKind).toBe("hidden-control-plane");
    expect(fact.visibility).toBe("hidden");
  });

  it("formats compact control events as stable tool rows", () => {
    const item = formatCompactControlToolItem({
      id: "mode-blocked-1",
      kind: "tool",
      toolType: "mode_blocked",
      title: "",
      detail: "",
      status: undefined,
      output: "",
    });

    expect(item).toMatchObject({
      toolType: "modeBlocked",
      title: "Tool: mode policy",
      detail: "modeBlocked",
      status: "completed",
      output: "Mode policy blocked this action.",
    });
  });

  it("keeps request_user_input lifecycle settled states explicit", () => {
    const pending = classifyConversationObservation({
      engine: "codex",
      threadId: "thread-1",
      source: "realtime",
      rawType: "request_user_input",
      requestUserInputState: "pending",
    });
    const submitted = classifyConversationObservation({
      engine: "codex",
      threadId: "thread-1",
      source: "history",
      rawType: "request_user_input",
      requestUserInputState: "submitted",
    });

    expect(pending.requestUserInputState).toBe("pending");
    expect(pending.controlReason).toBe("request-user-input-pending");
    expect(isRequestUserInputSettled(pending.requestUserInputState)).toBe(false);
    expect(submitted.requestUserInputState).toBe("submitted");
    expect(submitted.controlReason).toBe("request-user-input-settled");
    expect(isRequestUserInputSettled(submitted.requestUserInputState)).toBe(true);
  });

  it("treats every settled request_user_input state as non-blocking", () => {
    expect(isRequestUserInputSettled("submitted")).toBe(true);
    expect(isRequestUserInputSettled("timeout")).toBe(true);
    expect(isRequestUserInputSettled("dismissed")).toBe(true);
    expect(isRequestUserInputSettled("cancelled")).toBe(true);
    expect(isRequestUserInputSettled("stale")).toBe(true);
    expect(isRequestUserInputSettled("pending")).toBe(false);
  });

  it("keeps unknown Gemini payload legacy-safe visible instead of dropping it", () => {
    const fact = classifyConversationObservation({
      engine: "gemini",
      threadId: "thread-1",
      source: "history",
      rawType: "unknown-gemini-payload",
      rawText: "opaque payload",
    });

    expect(fact.visibility).toBe("visible");
    expect(fact.confidence).toBe("legacy-safe");
  });
});
