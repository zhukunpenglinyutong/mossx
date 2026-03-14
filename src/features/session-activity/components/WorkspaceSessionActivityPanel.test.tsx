// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach as afterEachTest, describe, expect, it, vi } from "vitest";
import type { WorkspaceSessionActivityViewModel } from "../types";
import { WorkspaceSessionActivityPanel } from "./WorkspaceSessionActivityPanel";

function getEventNode(container: HTMLElement, kind: string) {
  return container.querySelector(`.session-activity-event-${kind}`) as HTMLElement | null;
}

function getPreviewTextForKind(container: HTMLElement, kind: string) {
  return getEventNode(container, kind)?.querySelector(".session-activity-preview-text");
}

function getPreviewToggleForKind(container: HTMLElement, kind: string) {
  return getEventNode(container, kind)?.querySelector(".session-activity-preview-toggle");
}

function getTurnGroup(container: HTMLElement, index: number) {
  return container.querySelectorAll(".session-activity-turn-group")[index] as HTMLElement | undefined;
}

function createViewModel(): WorkspaceSessionActivityViewModel {
  return {
    rootThreadId: "root-thread",
    rootThreadName: "Root session",
    relevantThreadIds: ["root-thread", "child-thread"],
    isProcessing: true,
    emptyState: "running",
    sessionSummaries: [
      {
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        eventCount: 2,
        isProcessing: true,
      },
      {
        threadId: "child-thread",
        threadName: "Child session",
        sessionRole: "child",
        relationshipSource: "fallbackLinking",
        eventCount: 1,
        isProcessing: false,
      },
    ],
    timeline: [
      {
        eventId: "file:file-1",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "child-thread",
        threadName: "Child session",
        sessionRole: "child",
        relationshipSource: "fallbackLinking",
        kind: "fileChange",
        occurredAt: 30,
        summary: "File change · src/App.tsx",
        status: "completed",
        jumpTarget: {
          type: "file",
          path: "src/App.tsx",
          line: 9,
          markers: { added: [9], modified: [10] },
        },
        additions: 3,
        deletions: 1,
      },
      {
        eventId: "task:task-1",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "child-thread",
        threadName: "Child session",
        sessionRole: "child",
        relationshipSource: "directParent",
        kind: "task",
        occurredAt: 20,
        summary: "Task · Audit current panel",
        status: "running",
        jumpTarget: { type: "thread", threadId: "child-thread" },
      },
      {
        eventId: "command:cmd-1",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "command",
        occurredAt: 10,
        summary: "pnpm vitest",
        status: "running",
        commandText: "pnpm vitest --runInBand",
        commandDescription: "Run focused test suite",
        commandWorkingDirectory: "/workspace/project",
        commandPreview: "stderr line\nstdout tail",
      },
      {
        eventId: "explore:explore-1",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "explore",
        occurredAt: 5,
        summary: "Search · activity panel",
        status: "completed",
      },
      {
        eventId: "reasoning:reason-1",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "reasoning",
        occurredAt: 4,
        summary: "Thinking · compare recent panel states",
        status: "running",
        jumpTarget: { type: "thread", threadId: "root-thread" },
        reasoningPreview:
          "用户想要在备忘录中添加分类功能。\n我需要：1. 修改 Memo 实体；2. 修改 MemoRequest；3. 调整 controller。",
      },
    ],
  };
}

describe("WorkspaceSessionActivityPanel", () => {
  afterEachTest(() => {
    cleanup();
  });

  it("routes file cards to the correct jump target", () => {
    const onOpenDiffPath = vi.fn();

    render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={onOpenDiffPath}
        onSelectThread={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /File change · src\/App\.tsx/i }));

    expect(onOpenDiffPath).toHaveBeenCalledWith(
      "src/App.tsx",
      { line: 9, column: 1 },
      { highlightMarkers: { added: [9], modified: [10] } },
    );
  });

  it("routes read activity cards to file opening when jumpTarget is file", () => {
    const onOpenDiffPath = vi.fn();
    const viewModel = createViewModel();
    viewModel.timeline = [
      {
        eventId: "task:read-1",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "task",
        occurredAt: 40,
        summary: "Read · /workspace/README.md",
        status: "completed",
        jumpTarget: { type: "file", path: "/workspace/README.md" },
      },
    ];

    render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={viewModel}
        onOpenDiffPath={onOpenDiffPath}
        onSelectThread={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Read · \/workspace\/README\.md/i }));

    expect(onOpenDiffPath).toHaveBeenCalledWith("/workspace/README.md", undefined, undefined);
  });

  it("collapses older turn groups and only expands the latest one by default", () => {
    const viewModel = createViewModel();
    viewModel.timeline = [
      ...viewModel.timeline,
      {
        eventId: "command:cmd-older",
        turnId: "turn-1",
        turnIndex: 1,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "command",
        occurredAt: 1,
        summary: "Older command",
        status: "completed",
        commandDescription: "Older command",
        commandPreview: "older output",
      },
    ];

    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={viewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    const latestGroup = getTurnGroup(view.container, 0);
    const olderGroup = getTurnGroup(view.container, 1);
    expect(latestGroup?.querySelector(".session-activity-turn-group-events")).toBeTruthy();
    expect(olderGroup?.querySelector(".session-activity-turn-group-events")).toBeNull();
    expect(screen.queryByRole("button", { name: /Older command/i })).toBeNull();
  });

  it("allows expanding a collapsed older turn group", () => {
    const viewModel = createViewModel();
    viewModel.timeline = [
      ...viewModel.timeline,
      {
        eventId: "command:cmd-older",
        turnId: "turn-1",
        turnIndex: 1,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "command",
        occurredAt: 1,
        summary: "Older command",
        status: "completed",
        commandDescription: "Older command",
        commandPreview: "older output",
      },
    ];

    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={viewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    const olderGroup = getTurnGroup(view.container, 1);
    const olderToggle = olderGroup?.querySelector(
      ".session-activity-turn-group-header",
    ) as HTMLButtonElement | null;
    expect(olderToggle?.getAttribute("aria-expanded")).toBe("false");
    if (!olderToggle) {
      return;
    }
    fireEvent.click(olderToggle);
    expect(screen.getByRole("button", { name: /Older command/i })).toBeTruthy();
    expect(getTurnGroup(view.container, 1)?.querySelector(".session-activity-turn-group-events")).toBeTruthy();
  });

  it("auto-expands a newly arrived latest turn group while older groups stay collapsed", () => {
    const baseViewModel = createViewModel();
    baseViewModel.timeline = [
      {
        eventId: "command:cmd-initial",
        turnId: "turn-1",
        turnIndex: 1,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "command",
        occurredAt: 1,
        summary: "Initial command",
        status: "completed",
        commandDescription: "Initial command",
        commandPreview: "done",
      },
    ];
    baseViewModel.isProcessing = false;
    baseViewModel.emptyState = "completed";
    baseViewModel.sessionSummaries = [
      {
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        eventCount: 1,
        isProcessing: false,
      },
    ];

    const { container, rerender } = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={baseViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(getTurnGroup(container, 0)?.querySelector(".session-activity-turn-group-events")).toBeTruthy();

    const updatedViewModel = createViewModel();
    updatedViewModel.timeline = [
      ...baseViewModel.timeline,
      {
        eventId: "command:cmd-latest",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "command",
        occurredAt: 20,
        summary: "Latest command",
        status: "running",
        commandDescription: "Latest command",
        commandPreview: "running",
      },
    ];
    updatedViewModel.isProcessing = true;
    updatedViewModel.emptyState = "running";
    updatedViewModel.sessionSummaries = [
      {
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        eventCount: 2,
        isProcessing: true,
      },
    ];

    rerender(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={updatedViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(getTurnGroup(container, 0)?.querySelector(".session-activity-turn-group-events")).toBeTruthy();
    expect(getTurnGroup(container, 1)?.querySelector(".session-activity-turn-group-events")).toBeNull();
    expect(screen.getByRole("button", { name: /Latest command/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Initial command/i })).toBeNull();
  });

  it("collapses the previous turn when a new running reasoning turn arrives", () => {
    const initialViewModel = createViewModel();
    initialViewModel.timeline = [
      {
        eventId: "reasoning:reason-initial",
        turnId: "turn-1",
        turnIndex: 1,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "reasoning",
        occurredAt: 1,
        summary: "Thinking · initial reasoning",
        status: "running",
        reasoningPreview: "initial reasoning preview",
      },
    ];
    initialViewModel.sessionSummaries = [
      {
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        eventCount: 1,
        isProcessing: true,
      },
    ];

    const { container, rerender } = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={initialViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(getTurnGroup(container, 0)?.querySelector(".session-activity-turn-group-events")).toBeTruthy();

    const updatedViewModel = createViewModel();
    updatedViewModel.timeline = [
      {
        eventId: "reasoning:reason-latest",
        turnId: "turn-2",
        turnIndex: 2,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "reasoning",
        occurredAt: 20,
        summary: "Thinking · latest reasoning",
        status: "running",
        reasoningPreview: "latest reasoning preview",
      },
      {
        eventId: "reasoning:reason-initial",
        turnId: "turn-1",
        turnIndex: 1,
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "reasoning",
        occurredAt: 1,
        summary: "Thinking · initial reasoning",
        status: "completed",
        reasoningPreview: "initial reasoning preview",
      },
    ];
    updatedViewModel.sessionSummaries = [
      {
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        eventCount: 2,
        isProcessing: true,
      },
    ];

    rerender(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={updatedViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(getTurnGroup(container, 0)?.querySelector(".session-activity-turn-group-events")).toBeTruthy();
    expect(getTurnGroup(container, 1)?.querySelector(".session-activity-turn-group-events")).toBeNull();
    expect(screen.getByRole("button", { name: /Thinking · latest reasoning/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Thinking · initial reasoning/i })).toBeNull();
  });

  it("does not pass empty highlight markers when a file card has no parsed line ranges", () => {
    const onOpenDiffPath = vi.fn();
    const viewModel = createViewModel();
    viewModel.timeline = viewModel.timeline.map((event) =>
      event.kind === "fileChange"
        ? {
            ...event,
            jumpTarget:
              event.jumpTarget?.type === "file"
                ? {
                    ...event.jumpTarget,
                    line: undefined,
                    markers: { added: [], modified: [] },
                  }
                : event.jumpTarget,
          }
        : event,
    );

    render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={viewModel}
        onOpenDiffPath={onOpenDiffPath}
        onSelectThread={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /File change · src\/App\.tsx/i }));

    expect(onOpenDiffPath).toHaveBeenCalledWith("src/App.tsx", undefined, undefined);
  });

  it("shows and filters the explore category independently", () => {
    render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: /activityPanel\.tabs\.explore1/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /activityPanel\.tabs\.explore1/i }));

    expect(screen.getByRole("button", { name: /Search · activity panel/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Run focused test suite/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Task · Audit current panel/i })).toBeNull();
  });

  it("keeps completed explore run entries collapsed even when they carry command metadata", () => {
    const viewModel = createViewModel();
    viewModel.timeline = [
      {
        eventId: "explore:run:collapsed",
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        kind: "explore",
        occurredAt: 40,
        summary: "List · NO .codex",
        status: "completed",
        commandText: "List · NO .codex",
        commandDescription: "/Users/demo/.codex not found",
        jumpTarget: { type: "thread", threadId: "root-thread" },
      },
    ];
    viewModel.isProcessing = false;
    viewModel.emptyState = "completed";
    viewModel.sessionSummaries = [
      {
        threadId: "root-thread",
        threadName: "Root session",
        sessionRole: "root",
        relationshipSource: "directParent",
        eventCount: 1,
        isProcessing: false,
      },
    ];

    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={viewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    const eventNode = view.container.querySelector(".session-activity-event-explore");
    expect(eventNode?.classList.contains("is-expanded")).toBe(false);
    expect(view.container.querySelector(".session-activity-preview-toggle")).toBeNull();
    expect(view.container.querySelector(".session-activity-preview-text")).toBeNull();
  });

  it("shows and filters the reasoning category independently", () => {
    render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: /activityPanel\.tabs\.reasoning1/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /activityPanel\.tabs\.reasoning1/i }));

    expect(
      screen.getByRole("button", { name: /Thinking · compare recent panel states/i }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Search · activity panel/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Run focused test suite/i })).toBeNull();
  });

  it("auto-expands reasoning while running and allows manual collapse/expand", () => {
    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /activityPanel\.tabs\.reasoning1/i }));
    expect(view.container.querySelector(".session-activity-event-reasoning.is-expanded")).toBeTruthy();
    expect(view.container.querySelector(".session-activity-preview-text")?.textContent).toContain(
      "Memo 实体",
    );

    const previewToggle = getPreviewToggleForKind(view.container, "reasoning");
    expect(previewToggle).toBeTruthy();
    if (!previewToggle) {
      return;
    }
    fireEvent.click(previewToggle);
    expect(view.container.querySelector(".session-activity-event-reasoning.is-expanded")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Thinking · compare recent panel states/i }));
    expect(view.container.querySelector(".session-activity-event-reasoning.is-expanded")).toBeTruthy();
  });

  it("only auto-expands the latest running reasoning item", () => {
    const viewModel = createViewModel();
    viewModel.timeline.push({
      eventId: "reasoning:reason-older",
      turnId: "turn-2",
      turnIndex: 2,
      threadId: "root-thread",
      threadName: "Root session",
      sessionRole: "root",
      relationshipSource: "directParent",
      kind: "reasoning",
      occurredAt: 3,
      summary: "Thinking · older reasoning should stay collapsed",
      status: "running",
      reasoningPreview: "older reasoning",
    });

    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={viewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /activityPanel\.tabs\.reasoning2/i }));

    const reasoningEvents = view.container.querySelectorAll(".session-activity-event-reasoning");
    expect(reasoningEvents).toHaveLength(2);
    expect(reasoningEvents[0]?.classList.contains("is-expanded")).toBe(true);
    expect(reasoningEvents[1]?.classList.contains("is-expanded")).toBe(false);
  });

  it("auto-collapses reasoning 1s after completion", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(container.querySelector(".session-activity-event-reasoning.is-expanded")).toBeTruthy();

    const completedViewModel = createViewModel();
    completedViewModel.isProcessing = false;
    completedViewModel.emptyState = "completed";
    completedViewModel.timeline = completedViewModel.timeline.map((event) =>
      event.kind === "reasoning"
        ? {
            ...event,
            status: "completed" as const,
            reasoningPreview: `${event.reasoningPreview}\nDone`,
          }
        : event,
    );

    rerender(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={completedViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(container.querySelector(".session-activity-event-reasoning.is-expanded")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(container.querySelector(".session-activity-event-reasoning.is-expanded")).toBeNull();
    vi.useRealTimers();
  });

  it("uses command card click to expand and collapse inline output", () => {
    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(getPreviewTextForKind(view.container, "command")?.textContent).toBe(
      "stderr line\nstdout tail",
    );
    expect(
      view.container.querySelectorAll(".session-activity-card-title")[2]?.textContent,
    ).toBe(
      "Run focused test suite",
    );
    expect(view.container.querySelector(".session-activity-command-value")?.textContent).toContain(
      "pnpm vitest --runInBand",
    );
    expect(view.container.querySelector(".session-activity-command-copy")).toBeNull();
    const expandedHeaderCopy = view.container.querySelector(
      ".session-activity-event-command.is-expanded .session-activity-card-copy",
    );
    expect(expandedHeaderCopy).toBeTruthy();
    expect(expandedHeaderCopy?.textContent).toContain("Run focused test suite");
    expect(expandedHeaderCopy?.textContent).toContain("activityPanel.status.running");
    expect(screen.queryByText("activityPanel.hideOutput")).toBeNull();
    expect(screen.queryByText("activityPanel.showOutput")).toBeNull();

    const previewToggle = getPreviewToggleForKind(view.container, "command");
    expect(previewToggle).toBeTruthy();
    if (!previewToggle) {
      return;
    }
    fireEvent.click(previewToggle);
    expect(getPreviewTextForKind(view.container, "command")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Run focused test suite/i }));
    const previewText = getPreviewTextForKind(view.container, "command");
    expect(previewText?.textContent).toBe("stderr line\nstdout tail");

    fireEvent.click(screen.getByRole("button", { name: /Run focused test suite/i }));
    expect(getPreviewTextForKind(view.container, "command")).toBeNull();
  });

  it("auto-collapses running commands 1s after completion", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(container.querySelector(".session-activity-event-command.is-expanded")).toBeTruthy();

    const completedViewModel = createViewModel();
    completedViewModel.isProcessing = false;
    completedViewModel.emptyState = "completed";
    completedViewModel.timeline = completedViewModel.timeline.map((event) =>
      event.kind === "command"
        ? {
            ...event,
            status: "completed" as const,
            commandPreview: "stderr line\nstdout tail\nDone",
          }
        : event,
    );

    rerender(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={completedViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(container.querySelector(".session-activity-event-command.is-expanded")).toBeTruthy();
    expect(getPreviewTextForKind(container, "command")?.textContent).toBe(
      "stderr line\nstdout tail\nDone",
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(container.querySelector(".session-activity-event-command.is-expanded")).toBeNull();
    expect(getPreviewTextForKind(container, "command")).toBeNull();
    vi.useRealTimers();
  });

  it("allows manually expanding a completed command after auto-collapse", () => {
    const completedViewModel = createViewModel();
    completedViewModel.isProcessing = false;
    completedViewModel.emptyState = "completed";
    completedViewModel.timeline = completedViewModel.timeline.map((event) =>
      event.kind === "command"
        ? {
            ...event,
            status: "completed" as const,
            commandPreview: "stderr line\nstdout tail\nDone",
          }
        : event,
    );

    const { container } = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={completedViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(container.querySelector(".session-activity-event-command.is-expanded")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Run focused test suite/i }));

    expect(container.querySelector(".session-activity-event-command.is-expanded")).toBeTruthy();
    expect(getPreviewTextForKind(container, "command")?.textContent).toBe(
      "stderr line\nstdout tail\nDone",
    );
  });

  it("keeps expanded running commands live even before output arrives", () => {
    const waitingViewModel = createViewModel();
    waitingViewModel.timeline = waitingViewModel.timeline.map((event) =>
      event.kind === "command"
        ? {
            ...event,
            commandPreview: "",
            commandText: "",
            commandDescription: "",
            commandWorkingDirectory: "",
          }
        : event,
    );

    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={waitingViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(getPreviewTextForKind(view.container, "command")?.textContent).toContain(
      "activityPanel.waitingForOutput",
    );
    expect(
      view.container.querySelectorAll(".session-activity-card-title")[2]?.textContent,
    ).toBe(
      "activityPanel.commandPendingSummary",
    );

    const updatedViewModel = createViewModel();
    updatedViewModel.timeline = updatedViewModel.timeline.map((event) =>
      event.kind === "command"
        ? {
            ...event,
            commandPreview: "line 1\nline 2",
            commandText: "",
            commandDescription: "",
            commandWorkingDirectory: "",
          }
        : event,
    );

    view.rerender(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={updatedViewModel}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(getPreviewTextForKind(view.container, "command")?.textContent).toBe(
      "line 1\nline 2",
    );
  });

  it("uses session pills to jump directly to a related thread", () => {
    const onSelectThread = vi.fn();

    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={onSelectThread}
      />,
    );

    const sessionPills = view.container.querySelectorAll(".session-activity-session-pill");
    expect(sessionPills).toHaveLength(1);
    expect(sessionPills[0]?.textContent).toContain("Child session");
    expect(sessionPills[0]?.textContent).toContain("activityPanel.fallbackLinking");
    fireEvent.click(sessionPills[0] as HTMLButtonElement);
    expect(onSelectThread).toHaveBeenCalledWith("workspace-1", "child-thread");
  });

  it("renders a time label for each activity item", () => {
    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    const timeLabels = view.container.querySelectorAll(".session-activity-card-time");
    expect(timeLabels).toHaveLength(5);
    for (const label of timeLabels) {
      expect(label.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    }
  });

  it("filters activity list by tab kind", () => {
    const view = render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(view.container.querySelectorAll(".session-activity-event")).toHaveLength(5);
    fireEvent.click(screen.getByRole("tab", { name: /activityPanel\.tabs\.file/i }));
    expect(view.container.querySelectorAll(".session-activity-event")).toHaveLength(1);
    expect(view.container.querySelector(".session-activity-event-fileChange")).toBeTruthy();
    expect(view.container.querySelector(".session-activity-event-command")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /activityPanel\.tabs\.explore/i }));
    expect(view.container.querySelectorAll(".session-activity-event")).toHaveLength(1);
    expect(view.container.querySelector(".session-activity-event-explore")).toBeTruthy();
    expect(view.container.querySelector(".session-activity-event-task")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /activityPanel\.tabs\.reasoning/i }));
    expect(view.container.querySelectorAll(".session-activity-event")).toHaveLength(1);
    expect(view.container.querySelector(".session-activity-event-reasoning")).toBeTruthy();
  });

  it("renders an explicit live edit preview toggle when provided", () => {
    const onToggleLiveEditPreview = vi.fn();

    render(
      <WorkspaceSessionActivityPanel
        workspaceId="workspace-1"
        viewModel={createViewModel()}
        onOpenDiffPath={vi.fn()}
        onSelectThread={vi.fn()}
        liveEditPreviewEnabled
        onToggleLiveEditPreview={onToggleLiveEditPreview}
      />,
    );

    const toggle = screen.getByRole("button", { name: "activityPanel.liveEditPreview" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(onToggleLiveEditPreview).toHaveBeenCalledTimes(1);
  });
});
