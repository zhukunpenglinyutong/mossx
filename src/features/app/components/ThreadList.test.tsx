// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadSummary } from "../../../types";
import { DEFAULT_VISIBLE_THREAD_ROOT_COUNT } from "../constants";
import { ThreadList } from "./ThreadList";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  // This mock returns the key as-is for testing
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "threads.showLess": "Show less",
        "threads.more": "More...",
        "threads.loading": "Loading...",
        "threads.searchOlder": "Search older...",
        "threads.loadOlder": "Load older...",
        "threads.degradedThreadListBadge": "Incomplete",
        "threads.degradedThreadListTooltip":
          "These thread results are not fully refreshed yet and may be missing some conversations.",
        "threads.autoNaming": "Auto naming...",
        "threads.pin": "Pin",
        "threads.unpin": "Unpin",
        "threads.hideExitedSessions": "Hide exited sessions",
        "threads.showExitedSessions": "Show exited sessions",
        "threads.exitedSessionsHidden": "{{count}} exited hidden",
        "threads.subagentTreeExpanded": "Subagent tree expanded",
        "threads.subagentTreeExpand": "Expand subagent tree",
        "threads.subagentTreeCollapse": "Collapse subagent tree",
        "threads.deleteThreadTitle": "Delete conversation",
        "threads.deleteThreadMessage": "Are you sure you want to delete this thread?",
        "threads.deleteThreadHint": "This cannot be undone.",
        "threads.delete": "Delete",
        "common.cancel": "Cancel",
        "common.deleting": "Deleting",
      };
      const template = translations[key] || key;
      return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => String(options?.[token] ?? ""));
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const nestedThread: ThreadSummary = {
  id: "thread-2",
  name: "Nested Agent",
  updatedAt: 900,
};

const thread: ThreadSummary = {
  id: "thread-1",
  name: "Alpha",
  updatedAt: 1000,
  sizeBytes: 1536,
};

const statusMap = {
  "thread-1": { isProcessing: false, hasUnread: true, isReviewing: false },
  "thread-2": { isProcessing: false, hasUnread: false, isReviewing: false },
};

const baseProps = {
  workspaceId: "ws-1",
  workspacePath: "/tmp/ws-1",
  pinnedRows: [],
  unpinnedRows: [{ thread, depth: 0 }],
  totalThreadRoots: 1,
  visibleThreadRootCount: DEFAULT_VISIBLE_THREAD_ROOT_COUNT,
  isExpanded: false,
  nextCursor: null,
  isPaging: false,
  nested: false,
  activeWorkspaceId: "ws-1",
  activeThreadId: "thread-1",
  threadStatusById: statusMap,
  getThreadTime: () => "2m",
  isThreadPinned: () => false,
  isThreadAutoNaming: () => false,
  onToggleExpanded: vi.fn(),
  onLoadOlderThreads: vi.fn(),
  onSelectThread: vi.fn(),
  onShowThreadMenu: vi.fn(),
};

describe("ThreadList", () => {
  it("renders active row and handles click/context menu", () => {
    const onSelectThread = vi.fn();
    const onShowThreadMenu = vi.fn();

    render(
      <ThreadList
        {...baseProps}
        onSelectThread={onSelectThread}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const row = screen.getByText("Alpha").closest(".thread-row");
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error("Missing thread row");
    }
    expect(row.classList.contains("active")).toBe(true);
    expect(row.querySelector(".thread-status")?.className).toContain("unread");

    fireEvent.click(row);
    expect(onSelectThread).toHaveBeenCalledWith("ws-1", "thread-1");

    fireEvent.contextMenu(row);
    expect(onShowThreadMenu).toHaveBeenCalledWith(
      expect.anything(),
      "ws-1",
      "thread-1",
      true,
      1536,
      undefined,
      null,
      true,
      "/tmp/ws-1",
    );
  });

  it("marks shared threads as not archivable for the context menu", () => {
    const onShowThreadMenu = vi.fn();

    render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          {
            thread: {
              ...thread,
              id: "shared:thread-1",
              threadKind: "shared",
            },
            depth: 0,
          },
        ]}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const row = screen.getByText("Alpha").closest(".thread-row");
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error("Missing shared thread row");
    }

    fireEvent.contextMenu(row);
    expect(onShowThreadMenu).toHaveBeenCalledWith(
      expect.anything(),
      "ws-1",
      "shared:thread-1",
      true,
      1536,
      undefined,
      null,
      false,
      "/tmp/ws-1",
    );
  });

  it("shows pin toggle and allows pinning without selecting the row", () => {
    const onToggleThreadPin = vi.fn();
    const onSelectThread = vi.fn();

    const { container } = render(
      <ThreadList
        {...baseProps}
        onToggleThreadPin={onToggleThreadPin}
        onSelectThread={onSelectThread}
      />,
    );

    const row = container.querySelector(".thread-row");
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error("Missing thread row");
    }
    const pinButton = row.querySelector(".thread-pin-toggle") as HTMLButtonElement | null;
    expect(pinButton).toBeTruthy();
    if (!pinButton) {
      throw new Error("Missing pin toggle");
    }

    fireEvent.click(pinButton);
    expect(onToggleThreadPin).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(onSelectThread).not.toHaveBeenCalled();
  });

  it("shows the more button and toggles expanded", () => {
    const onToggleExpanded = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        totalThreadRoots={DEFAULT_VISIBLE_THREAD_ROOT_COUNT + 1}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    const moreButton = screen.getByRole("button", { name: "More..." });
    fireEvent.click(moreButton);
    expect(onToggleExpanded).toHaveBeenCalledWith("ws-1");
  });

  it("loads older threads when a cursor is available", () => {
    const onLoadOlderThreads = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        nextCursor="cursor"
        onLoadOlderThreads={onLoadOlderThreads}
      />,
    );

    const loadButton = screen.getByRole("button", { name: "Load older..." });
    fireEvent.click(loadButton);
    expect(onLoadOlderThreads).toHaveBeenCalledWith("ws-1");
  });

  it("keeps load older hidden in collapsed mode when more roots remain behind the threshold", () => {
    render(
      <ThreadList
        {...baseProps}
        totalThreadRoots={DEFAULT_VISIBLE_THREAD_ROOT_COUNT + 1}
        nextCursor="cursor"
      />,
    );

    expect(screen.queryByRole("button", { name: "Load older..." })).toBeNull();
    expect(screen.getByRole("button", { name: "More..." })).toBeTruthy();
  });

  it("renders nested rows with indentation and disables pinning", () => {
    const onShowThreadMenu = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        nested
        unpinnedRows={[
          { thread, depth: 0 },
          { thread: nestedThread, depth: 1 },
        ]}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const nestedRow = screen.getByText("Nested Agent").closest(".thread-row");
    expect(nestedRow).toBeTruthy();
    if (!nestedRow) {
      throw new Error("Missing nested thread row");
    }
    expect(nestedRow.getAttribute("style")).toContain("--thread-indent");

    fireEvent.contextMenu(nestedRow);
    expect(onShowThreadMenu).toHaveBeenCalledWith(
      expect.anything(),
      "ws-1",
      "thread-2",
      false,
      undefined,
      undefined,
      null,
      true,
      "/tmp/ws-1",
    );
  });

  it("renders subagent child rows with status and opens the child session", () => {
    const onSelectThread = vi.fn();
    const childThread: ThreadSummary = {
      ...nestedThread,
      id: "claude:agent-parent-agent",
      parentThreadId: "claude:parent",
      engineSource: "claude",
    };

    render(
      <ThreadList
        {...baseProps}
        activeThreadId="claude:agent-parent-agent"
        unpinnedRows={[
          {
            thread: {
              ...thread,
              id: "claude:parent",
              engineSource: "claude",
            },
            depth: 0,
            hasChildren: true,
          },
          { thread: childThread, depth: 1 },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    const childRow = screen.getByText("Nested Agent").closest(".thread-row");
    const parentRow = screen.getByText("Alpha").closest(".thread-row");
    expect(parentRow?.classList.contains("is-subagent-parent")).toBe(true);
    expect(parentRow?.classList.contains("is-active-subagent-parent")).toBe(true);
    expect(parentRow?.getAttribute("aria-expanded")).toBe("true");
    expect(parentRow?.querySelector(".thread-tree-expander")?.getAttribute("aria-label")).toBe(
      "Collapse subagent tree",
    );
    expect(childRow).toBeTruthy();
    if (!childRow) {
      throw new Error("Missing subagent child row");
    }
    expect(childRow.classList.contains("is-subagent")).toBe(true);
    expect(childRow.classList.contains("is-active-subagent-group")).toBe(true);
    expect(childRow.querySelector(".thread-subagent-branch")).toBeNull();
    expect(childRow.querySelector(".thread-subagent-badge")).toBeNull();

    fireEvent.click(childRow);
    expect(onSelectThread).toHaveBeenCalledWith("ws-1", "claude:agent-parent-agent");
  });

  it("routes pending subagent child row clicks back to the parent session", () => {
    const onSelectThread = vi.fn();
    const pendingChildThread: ThreadSummary = {
      ...nestedThread,
      id: "claude-pending-subagent:claude:parent:toolu_agent_1",
      parentThreadId: "claude:parent",
      engineSource: "claude",
      isDegraded: true,
      degradedReason: "Subagent is running; transcript is not available yet.",
    };

    render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          {
            thread: {
              ...thread,
              id: "claude:parent",
              engineSource: "claude",
            },
            depth: 0,
            hasChildren: true,
          },
          { thread: pendingChildThread, depth: 1 },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    const childRow = screen.getByText("Nested Agent").closest(".thread-row");
    expect(childRow?.classList.contains("is-pending-subagent")).toBe(true);
    expect(childRow?.querySelector(".thread-subagent-badge")).toBeNull();
    if (!childRow) {
      throw new Error("Missing pending subagent child row");
    }
    fireEvent.click(childRow);
    expect(onSelectThread).toHaveBeenCalledWith("ws-1", "claude:parent");
  });

  it("collapses and expands subagent child rows from the right-side expander", () => {
    const onSelectThread = vi.fn();
    const childThread: ThreadSummary = {
      ...nestedThread,
      id: "claude:agent-parent-agent",
      parentThreadId: "claude:parent",
      engineSource: "claude",
    };

    render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          {
            thread: {
              ...thread,
              id: "claude:parent",
              engineSource: "claude",
            },
            depth: 0,
            hasChildren: true,
          },
          { thread: childThread, depth: 1 },
        ]}
        onSelectThread={onSelectThread}
      />,
    );

    const parentRow = screen.getByText("Alpha").closest(".thread-row");
    const expander = parentRow?.querySelector(".thread-tree-expander");
    expect(expander).toBeTruthy();
    if (!parentRow) {
      throw new Error("Missing subagent parent row");
    }
    if (!expander) {
      throw new Error("Missing subagent tree expander");
    }

    fireEvent.click(expander);
    expect(onSelectThread).not.toHaveBeenCalled();
    expect(parentRow?.getAttribute("aria-expanded")).toBe("false");
    expect(expander.getAttribute("aria-label")).toBe("Expand subagent tree");
    expect(screen.queryByText("Nested Agent")).toBeNull();

    fireEvent.click(parentRow);
    expect(onSelectThread).toHaveBeenCalledWith("ws-1", "claude:parent");
    fireEvent.keyDown(expander, { key: "Enter" });
    expect(parentRow?.getAttribute("aria-expanded")).toBe("true");
    expect(expander.getAttribute("aria-label")).toBe("Collapse subagent tree");
    expect(screen.getByText("Nested Agent")).toBeTruthy();
  });

  it("shows inline delete confirmation bubble beside the row", () => {
    const onCancelDeleteConfirm = vi.fn();
    const onConfirmDeleteConfirm = vi.fn();

    render(
      <ThreadList
        {...baseProps}
        deleteConfirmWorkspaceId="ws-1"
        deleteConfirmThreadId="thread-1"
        onCancelDeleteConfirm={onCancelDeleteConfirm}
        onConfirmDeleteConfirm={onConfirmDeleteConfirm}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Delete conversation" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirmDeleteConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelDeleteConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows auto naming loading badge when thread is auto naming", () => {
    render(
      <ThreadList
        {...baseProps}
        isThreadAutoNaming={(workspaceId, threadId) =>
          workspaceId === "ws-1" && threadId === "thread-1"
        }
      />,
    );

    expect(screen.getByText("Auto naming...")).toBeTruthy();
  });

  it("can hide exited sessions from the workspace thread list", () => {
    render(
      <ThreadList
        {...baseProps}
        hideExitedSessions
        unpinnedRows={[
          { thread: { id: "thread-running", name: "Running", updatedAt: 2 }, depth: 0 },
          { thread: { id: "thread-exited", name: "Exited", updatedAt: 1 }, depth: 0 },
        ]}
        threadStatusById={{
          "thread-running": { isProcessing: true, hasUnread: false, isReviewing: false },
          "thread-exited": { isProcessing: false, hasUnread: false, isReviewing: false },
        }}
      />,
    );

    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.queryByText("Exited")).toBeNull();
    expect(screen.queryByText("1 exited hidden")).toBeNull();
  });

  it("keeps exited parent rows visible when a running child remains visible", () => {
    render(
      <ThreadList
        {...baseProps}
        hideExitedSessions
        unpinnedRows={[
          { thread: { id: "thread-parent", name: "Parent", updatedAt: 3 }, depth: 0 },
          { thread: { id: "thread-child", name: "Running child", updatedAt: 2 }, depth: 1 },
          { thread: { id: "thread-exited", name: "Exited sibling", updatedAt: 1 }, depth: 0 },
        ]}
        threadStatusById={{
          "thread-parent": { isProcessing: false, hasUnread: false, isReviewing: false },
          "thread-child": { isProcessing: true, hasUnread: false, isReviewing: false },
          "thread-exited": { isProcessing: false, hasUnread: false, isReviewing: false },
        }}
      />,
    );

    expect(screen.getByText("Parent")).toBeTruthy();
    expect(screen.getByText("Running child")).toBeTruthy();
    expect(screen.queryByText("Exited sibling")).toBeNull();
    expect(screen.queryByText("1 exited hidden")).toBeNull();
  });

  it("shows a muted hidden summary when all visible rows are filtered out", () => {
    render(
      <ThreadList
        {...baseProps}
        hideExitedSessions
        unpinnedRows={[
          { thread: { id: "thread-exited", name: "Exited", updatedAt: 1 }, depth: 0 },
        ]}
        threadStatusById={{
          "thread-exited": { isProcessing: false, hasUnread: false, isReviewing: false },
        }}
      />,
    );

    expect(screen.queryByText("Exited")).toBeNull();
    expect(screen.getByText("1 exited hidden")).toBeTruthy();
  });

  it("renders only relative time inline when size is available", () => {
    const { container } = render(
      <ThreadList
        {...baseProps}
      />,
    );

    const meta = container.querySelector(".thread-meta");
    expect(meta).toBeTruthy();
    if (!meta) {
      throw new Error("Missing thread meta");
    }
    const size = meta.querySelector(".thread-size");
    const time = meta.querySelector(".thread-time");
    expect(size).toBeNull();
    expect(time?.textContent).toBe("2m");
  });

  it("marks engine badge as processing when thread is running", () => {
    const { container } = render(
      <ThreadList
        {...baseProps}
        threadStatusById={{
          "thread-1": { isProcessing: true, hasUnread: false, isReviewing: false },
        }}
      />,
    );

    const row = container.querySelector(".thread-row");
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error("Missing thread row");
    }
    const engineBadge = row.querySelector(".thread-engine-badge");
    expect(engineBadge?.classList.contains("is-processing")).toBe(true);
  });

  it("shows a compact proxy badge on a processing row even when workspace is inactive", () => {
    const { container } = render(
      <ThreadList
        {...baseProps}
        workspaceId="ws-2"
        activeWorkspaceId="ws-1"
        activeThreadId={null}
        systemProxyEnabled
        systemProxyUrl="http://127.0.0.1:7890"
        threadStatusById={{
          "thread-1": { isProcessing: true, hasUnread: false, isReviewing: false },
        }}
      />,
    );

    const row = container.querySelector(".thread-row");
    const badge = row?.querySelector(".thread-proxy-badge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent ?? "").toBe("");
    expect(badge?.classList.contains("proxy-status-badge--animated")).toBe(false);
  });

  it("does not render codex source badge when source metadata exists", () => {
    render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          {
            thread: {
              ...thread,
              sourceLabel: "custom/openai",
            },
            depth: 0,
          },
        ]}
      />,
    );

    expect(screen.queryByText("custom/openai")).toBeNull();
  });
});
