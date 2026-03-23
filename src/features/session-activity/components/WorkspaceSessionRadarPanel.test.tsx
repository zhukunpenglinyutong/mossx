// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSessionRadarPanel } from "./WorkspaceSessionRadarPanel";

describe("WorkspaceSessionRadarPanel", () => {
  it("renders radar entries and toggles preview by click", () => {
    const onSelectThread = vi.fn();

    const view = render(
      <WorkspaceSessionRadarPanel
        runningSessions={[
          {
            id: "w1:t1",
            workspaceId: "w1",
            workspaceName: "Workspace 1",
            threadId: "t1",
            threadName: "Running Thread",
            engine: "CODEX",
            preview: "running preview",
            updatedAt: 10,
            isProcessing: true,
            startedAt: 5,
            completedAt: null,
            durationMs: 5000,
          },
        ]}
        recentCompletedSessions={[
          {
            id: "w2:t2",
            workspaceId: "w2",
            workspaceName: "Workspace 2",
            threadId: "t2",
            threadName: "Recent Thread",
            engine: "CLAUDE",
            preview: "recent preview",
            updatedAt: 5,
            isProcessing: false,
            startedAt: 1,
            completedAt: 5,
            durationMs: 4000,
          },
          {
            id: "w2:t3",
            workspaceId: "w2",
            workspaceName: "Workspace 2",
            threadId: "t3",
            threadName: "Recent Thread 2",
            engine: "CLAUDE",
            preview: "recent preview 2",
            updatedAt: 6,
            isProcessing: false,
            startedAt: 2,
            completedAt: 6,
            durationMs: 4000,
          },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    const dateGroupToggle = screen.getByRole("button", { name: /1970-01-01/i });
    expect(dateGroupToggle).toBeTruthy();
    expect(within(dateGroupToggle).getByText("2")).toBeTruthy();
    expect(screen.queryByText("Recent Thread")).toBeNull();
    const runningRow = screen.getByRole("button", { name: /Running Thread/i });
    expect(runningRow.classList.contains("is-preview-expanded")).toBe(false);
    fireEvent.click(runningRow);
    expect(runningRow.classList.contains("is-preview-expanded")).toBe(true);
    expect(onSelectThread).toHaveBeenCalledWith("w1", "t1");
    fireEvent.click(runningRow);
    expect(runningRow.classList.contains("is-preview-expanded")).toBe(false);
    fireEvent.click(dateGroupToggle);
    expect(screen.getByRole("button", { name: /^Recent Thread$/i })).toBeTruthy();
    expect(screen.getAllByLabelText("activityPanel.radar.unreadMark")).toHaveLength(2);
    expect(screen.queryByText("activityPanel.radar.openSession")).toBeNull();
    expect(view.container.querySelectorAll(".session-activity-radar-delete-button")).toHaveLength(0);

    const recentRow = screen.getByRole("button", { name: /^Recent Thread$/i });
    expect(recentRow.classList.contains("is-preview-expanded")).toBe(false);
    fireEvent.click(recentRow);
    expect(recentRow.classList.contains("is-preview-expanded")).toBe(true);
    expect(onSelectThread).toHaveBeenCalledWith("w2", "t2");
    expect(screen.getAllByLabelText("activityPanel.radar.unreadMark")).toHaveLength(1);
    expect(screen.getByLabelText("activityPanel.radar.readMark")).toBeTruthy();
    expect(view.container.querySelectorAll(".session-activity-radar-delete-button")).toHaveLength(1);
    fireEvent.click(recentRow);
    expect(recentRow.classList.contains("is-preview-expanded")).toBe(false);

    fireEvent.click(dateGroupToggle);
    expect(screen.queryByRole("button", { name: /Recent Thread 2/i })).toBeNull();
  });

  it("keeps thread navigation while toggling preview expansion", () => {
    const onSelectThread = vi.fn();

    const view = render(
      <WorkspaceSessionRadarPanel
        runningSessions={[]}
        recentCompletedSessions={[
          {
            id: "w2:t2",
            workspaceId: "w2",
            workspaceName: "Workspace 2",
            threadId: "t2",
            threadName: "Recent Thread",
            engine: "CLAUDE",
            preview: "recent preview",
            updatedAt: 5,
            isProcessing: false,
            startedAt: 1,
            completedAt: 5,
            durationMs: 4000,
          },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    const dateGroupToggle = within(view.container).getByRole("button", { name: /1970-01-01/i });
    if (!within(view.container).queryByRole("button", { name: /^Recent Thread$/i })) {
      fireEvent.click(dateGroupToggle);
    }
    const recentRow = within(view.container).getByRole("button", { name: /^Recent Thread$/i });

    expect(recentRow.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(recentRow);
    expect(recentRow.getAttribute("aria-expanded")).toBe("true");
    expect(onSelectThread).toHaveBeenNthCalledWith(1, "w2", "t2");

    fireEvent.click(recentRow);
    expect(recentRow.getAttribute("aria-expanded")).toBe("false");
    expect(onSelectThread).toHaveBeenNthCalledWith(2, "w2", "t2");
    expect(onSelectThread).toHaveBeenCalledTimes(2);
  });

  it("opens session when clicking unread marker badge", () => {
    const onSelectThread = vi.fn();

    const view = render(
      <WorkspaceSessionRadarPanel
        runningSessions={[]}
        recentCompletedSessions={[
          {
            id: "w8:t8",
            workspaceId: "w8",
            workspaceName: "Workspace 8",
            threadId: "t8",
            threadName: "Badge Thread",
            engine: "CLAUDE",
            preview: "recent preview",
            updatedAt: 5,
            isProcessing: false,
            startedAt: 1,
            completedAt: 5,
            durationMs: 4000,
          },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    const dateGroupToggle = within(view.container).getByRole("button", { name: /1970-01-01/i });
    if (!within(view.container).queryByRole("button", { name: /^Badge Thread$/i })) {
      fireEvent.click(dateGroupToggle);
    }
    const unreadBadge = within(view.container).getByLabelText("activityPanel.radar.unreadMark");
    fireEvent.click(unreadBadge);

    expect(onSelectThread).toHaveBeenCalledWith("w8", "t8");
    expect(within(view.container).queryByLabelText("activityPanel.radar.readMark")).toBeTruthy();
    expect(view.container.querySelector(".session-activity-radar-delete-button")).toBeTruthy();
  });

  it("does not trigger thread selection when deleting a recent item", () => {
    const onSelectThread = vi.fn();

    const view = render(
      <WorkspaceSessionRadarPanel
        runningSessions={[]}
        recentCompletedSessions={[
          {
            id: "w9:t9",
            workspaceId: "w9",
            workspaceName: "Workspace 9",
            threadId: "t9",
            threadName: "Unread Thread",
            engine: "CLAUDE",
            preview: "recent preview",
            updatedAt: 5,
            isProcessing: false,
            startedAt: 1,
            completedAt: 5,
            durationMs: 4000,
          },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    const dateGroupToggle = within(view.container).getByRole("button", { name: /1970-01-01/i });
    if (!within(view.container).queryByRole("button", { name: /^Unread Thread$/i })) {
      fireEvent.click(dateGroupToggle);
    }
    expect(view.container.querySelector(".session-activity-radar-delete-button")).toBeNull();
    const recentRow = within(view.container).getByRole("button", { name: /^Unread Thread$/i });
    fireEvent.click(recentRow);
    onSelectThread.mockClear();
    const deleteButton = view.container.querySelector(".session-activity-radar-delete-button");
    expect(deleteButton).toBeTruthy();
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }
    expect(onSelectThread).not.toHaveBeenCalled();
  });
});
