// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUserInputRequest } from "../../../types";
import { Messages } from "./Messages";

describe("Messages history loading", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
    if (!HTMLElement.prototype.scrollTo) {
      HTMLElement.prototype.scrollTo = vi.fn();
    }
  });

  beforeEach(() => {
    window.localStorage.setItem("ccgui.claude.hideReasoningModule", "0");
    window.localStorage.removeItem("ccgui.messages.live.autoFollow");
    window.localStorage.removeItem("ccgui.messages.live.collapseMiddleSteps");
  });

  afterEach(() => {
    cleanup();
  });

  it("shows history loading state instead of the empty thread placeholder", () => {
    render(
      <Messages
        items={[]}
        threadId="thread-codex-history-loading"
        workspaceId="ws-1"
        isThinking={false}
        isHistoryLoading
        activeEngine="codex"
        onUserInputSubmit={vi.fn()}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("messages.restoringHistory")).toBeTruthy();
    expect(screen.getByText("messages.restoringHistoryHint")).toBeTruthy();
    expect(screen.queryByText("messages.emptyThread")).toBeNull();
  });

  it("shows the same restoring surface for Claude history loading", () => {
    render(
      <Messages
        items={[]}
        threadId="claude:session-history-loading"
        workspaceId="ws-1"
        isThinking={false}
        isHistoryLoading
        activeEngine="claude"
        onUserInputSubmit={vi.fn()}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("messages.restoringHistory")).toBeTruthy();
    expect(screen.queryByText("messages.emptyThread")).toBeNull();
  });

  it("keeps the empty thread placeholder when history is not loading", () => {
    render(
      <Messages
        items={[]}
        threadId="thread-empty"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="codex"
        onUserInputSubmit={vi.fn()}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("messages.emptyThread")).toBeTruthy();
    expect(screen.queryByText("messages.restoringHistory")).toBeNull();
  });

  it("keeps Claude transcript-heavy history readable when assistant text is sparse", () => {
    render(
      <Messages
        items={[
          {
            id: "tool-1",
            kind: "tool",
            toolType: "bash",
            title: "Bash",
            detail: "{\"command\":\"ls -la\"}",
            status: "completed",
            output: "README.md\nsrc\n",
          },
          {
            id: "tool-2",
            kind: "tool",
            toolType: "bash",
            title: "Bash",
            detail: "{\"command\":\"find src -maxdepth 2\"}",
            status: "completed",
            output: "src/index.ts\nsrc/app.tsx\n",
          },
          {
            id: "tool-3",
            kind: "tool",
            toolType: "bash",
            title: "Bash",
            detail: "{\"command\":\"cat package.json\"}",
            status: "completed",
            output: "{\"name\":\"demo\"}\n",
          },
        ]}
        threadId="claude:history-transcript-heavy"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="claude"
        conversationState={{
          items: [
            {
              id: "tool-1",
              kind: "tool",
              toolType: "bash",
              title: "Bash",
              detail: "{\"command\":\"ls -la\"}",
              status: "completed",
              output: "README.md\nsrc\n",
            },
            {
              id: "tool-2",
              kind: "tool",
              toolType: "bash",
              title: "Bash",
              detail: "{\"command\":\"find src -maxdepth 2\"}",
              status: "completed",
              output: "src/index.ts\nsrc/app.tsx\n",
            },
            {
              id: "tool-3",
              kind: "tool",
              toolType: "bash",
              title: "Bash",
              detail: "{\"command\":\"cat package.json\"}",
              status: "completed",
              output: "{\"name\":\"demo\"}\n",
            },
          ],
          plan: null,
          userInputQueue: [],
          meta: {
            workspaceId: "ws-1",
            threadId: "claude:history-transcript-heavy",
            engine: "claude",
            activeTurnId: null,
            isThinking: false,
            heartbeatPulse: null,
            historyRestoredAtMs: Date.now(),
          },
        }}
        onUserInputSubmit={vi.fn()}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.queryByText("messages.emptyThread")).toBeNull();
    expect(screen.getByText(/tools\.bashGroupBatchRun/)).toBeTruthy();
  });

  it("does not enable Claude transcript fallback outside history restore", () => {
    render(
      <Messages
        items={[
          {
            id: "tool-idle-1",
            kind: "tool",
            toolType: "bash",
            title: "Bash",
            detail: "{\"command\":\"ls -la\"}",
            status: "completed",
            output: "README.md\nsrc\n",
          },
          {
            id: "tool-idle-2",
            kind: "tool",
            toolType: "bash",
            title: "Bash",
            detail: "{\"command\":\"find src -maxdepth 2\"}",
            status: "completed",
            output: "src/index.ts\nsrc/app.tsx\n",
          },
          {
            id: "tool-idle-3",
            kind: "tool",
            toolType: "bash",
            title: "Bash",
            detail: "{\"command\":\"cat package.json\"}",
            status: "completed",
            output: "{\"name\":\"demo\"}\n",
          },
        ]}
        threadId="claude:idle-transcript-heavy"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="claude"
        onUserInputSubmit={vi.fn()}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.queryByText(/tools\.bashGroupBatchRun/)).toBeNull();
  });

  it("prefers request_user_input UI over history loading when the active thread has a pending request", () => {
    const request: RequestUserInputRequest = {
      request_id: "request-1",
      workspace_id: "ws-1",
      params: {
        thread_id: "thread-with-request",
        turn_id: "turn-1",
        item_id: "item-1",
        questions: [
          {
            id: "mode",
            question: "Choose one",
            header: "Mode",
            options: [
              { label: "Quick", description: "Fast path" },
            ],
          },
        ],
      },
    };

    render(
      <Messages
        items={[]}
        threadId="thread-with-request"
        workspaceId="ws-1"
        isThinking={false}
        isHistoryLoading
        activeEngine="codex"
        userInputRequests={[request]}
        onUserInputSubmit={vi.fn()}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(screen.getByText("Choose one")).toBeTruthy();
    expect(screen.queryByText("messages.restoringHistory")).toBeNull();
    expect(screen.queryByText("messages.emptyThread")).toBeNull();
  });
});
