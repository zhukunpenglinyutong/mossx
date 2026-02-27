// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ConversationItem, RequestUserInputRequest } from "../../../types";
import { hydrateHistory } from "../../threads/contracts/conversationAssembler";
import { normalizeHistorySnapshot } from "../../threads/contracts/conversationCurtainContracts";
import { Messages } from "./Messages";

function createEditTool(id: string, path: string): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id,
    kind: "tool",
    toolType: "edit",
    title: "Tool: edit",
    detail: JSON.stringify({
      file_path: path,
      old_string: "before",
      new_string: "after",
    }),
    status: "completed",
  };
}

describe("chat canvas smoke", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("covers message + tool group + plan quick view + request user input", async () => {
    const request: RequestUserInputRequest = {
      workspace_id: "ws-1",
      request_id: "req-1",
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "item-1",
        questions: [
          {
            id: "q1",
            header: "Confirm",
            question: "Proceed with apply?",
          },
        ],
      },
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <Messages
        items={[]}
        threadId="thread-legacy"
        workspaceId="ws-legacy"
        isThinking={false}
        onUserInputSubmit={onSubmit}
        conversationState={{
          items: [
            {
              id: "msg-1",
              kind: "message",
              role: "user",
              text: "请继续",
            },
            createEditTool("edit-1", "src/a.ts"),
            createEditTool("edit-2", "src/b.ts"),
          ],
          plan: {
            turnId: "turn-1",
            explanation: "Smoke plan",
            steps: [{ step: "Apply patch", status: "inProgress" }],
          },
          userInputQueue: [request],
          meta: {
            workspaceId: "ws-1",
            threadId: "thread-1",
            engine: "codex",
            activeTurnId: null,
            isThinking: false,
            heartbeatPulse: null,
            historyRestoredAtMs: null,
          },
        }}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("请继续")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Plan" })[0]);
    expect(screen.getByText("Apply patch")).toBeTruthy();
    expect(screen.getByText("Proceed with apply?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "approval.submit" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(request, {
        answers: {
          q1: {
            answers: [],
          },
        },
      });
    });
  });

  it("renders hydrated history snapshot with plan and queued question", () => {
    const snapshot = normalizeHistorySnapshot({
      engine: "codex",
      workspaceId: "ws-history",
      threadId: "thread-history",
      items: [
        {
          id: "msg-h-1",
          kind: "message",
          role: "assistant",
          text: "History restored",
        },
        createEditTool("edit-h-1", "src/history-a.ts"),
        createEditTool("edit-h-2", "src/history-b.ts"),
      ],
      plan: {
        turnId: "turn-history",
        explanation: "History plan",
        steps: [{ step: "Compare parity", status: "completed" }],
      },
      userInputQueue: [
        {
          workspace_id: "ws-history",
          request_id: "req-history",
          params: {
            thread_id: "thread-history",
            turn_id: "turn-history",
            item_id: "ask-history",
            questions: [
              {
                id: "history-confirm",
                header: "History",
                question: "Replay this step?",
              },
            ],
          },
        },
      ],
      meta: {
        workspaceId: "ws-history",
        threadId: "thread-history",
        engine: "codex",
        activeTurnId: null,
        isThinking: false,
        heartbeatPulse: null,
        historyRestoredAtMs: Date.now(),
      },
    });
    const state = hydrateHistory(snapshot);

    render(
      <Messages
        items={[]}
        threadId={null}
        workspaceId={null}
        isThinking={false}
        onUserInputSubmit={vi.fn()}
        conversationState={state}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("History restored")).toBeTruthy();
    expect(screen.getByText("Replay this step?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Plan" })[0]);
    expect(screen.getByText("Compare parity")).toBeTruthy();
  });
});
