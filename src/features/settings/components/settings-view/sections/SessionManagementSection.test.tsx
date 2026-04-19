// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionManagementSection } from "./SessionManagementSection";
import type { WorkspaceInfo } from "../../../../../types";
import {
  archiveWorkspaceSessions,
  listWorkspaceSessions,
} from "../../../../../services/tauri";

vi.mock("../../../../../services/tauri", () => ({
  listWorkspaceSessions: vi.fn(),
  archiveWorkspaceSessions: vi.fn(),
  unarchiveWorkspaceSessions: vi.fn(),
  deleteWorkspaceSessions: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("SessionManagementSection", () => {
  it("keeps failed sessions selected after partial archive failure", async () => {
    vi.mocked(listWorkspaceSessions)
      .mockResolvedValueOnce({
        data: [
          {
            sessionId: "codex:ok",
            workspaceId: "ws-1",
            title: "Ok session",
            updatedAt: 1710000000000,
            engine: "codex",
            archivedAt: null,
            threadKind: "native",
            sourceLabel: "cli/codex",
          },
          {
            sessionId: "codex:failed",
            workspaceId: "ws-1",
            title: "Failed session",
            updatedAt: 1710000000001,
            engine: "codex",
            archivedAt: null,
            threadKind: "native",
            sourceLabel: "cli/codex",
          },
        ],
        nextCursor: null,
        partialSource: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            sessionId: "codex:failed",
            workspaceId: "ws-1",
            title: "Failed session",
            updatedAt: 1710000000001,
            engine: "codex",
            archivedAt: null,
            threadKind: "native",
            sourceLabel: "cli/codex",
          },
        ],
        nextCursor: null,
        partialSource: null,
      });
    vi.mocked(archiveWorkspaceSessions).mockResolvedValue({
      results: [
        { sessionId: "codex:ok", ok: true, archivedAt: 1710000000999 },
        {
          sessionId: "codex:failed",
          ok: false,
          error: "archive failed",
          code: "DELETE_FAILED",
        },
      ],
    });

    render(
      <SessionManagementSection
        title="Session Management"
        description="Manage sessions"
        workspaces={[workspace]}
        groupedWorkspaces={[{ id: null, name: "Ungrouped", workspaces: [workspace] }]}
        initialWorkspaceId="ws-1"
      />,
    );

    fireEvent.click(await screen.findByRole("checkbox", { name: "Ok session" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Failed session" }));
    fireEvent.click(
      screen.getByRole("button", { name: "settings.sessionManagementArchiveSelected" }),
    );

    await waitFor(() => {
      expect(archiveWorkspaceSessions).toHaveBeenCalledWith("ws-1", [
        "codex:ok",
        "codex:failed",
      ]);
    });

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "Ok session" })).toBeNull();
    });

    expect(
      (screen.getByRole("checkbox", { name: "Failed session" }) as HTMLInputElement).checked,
    ).toBe(true);
  });
});
