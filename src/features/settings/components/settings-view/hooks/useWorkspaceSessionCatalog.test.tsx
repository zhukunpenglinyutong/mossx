// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { listWorkspaceSessions } from "../../../../../services/tauri";
import {
  useWorkspaceSessionCatalog,
  type WorkspaceSessionCatalogFilters,
} from "./useWorkspaceSessionCatalog";

vi.mock("../../../../../services/tauri", () => ({
  listWorkspaceSessions: vi.fn(),
  archiveWorkspaceSessions: vi.fn(),
  unarchiveWorkspaceSessions: vi.fn(),
  deleteWorkspaceSessions: vi.fn(),
}));

const DEFAULT_FILTERS: WorkspaceSessionCatalogFilters = {
  keyword: "",
  engine: "",
  status: "active",
};

describe("useWorkspaceSessionCatalog", () => {
  it("ignores stale responses after workspace selection is cleared", async () => {
    let resolveList:
      | ((value: {
          data: Array<{
            sessionId: string;
            workspaceId: string;
            engine: string;
            title: string;
            updatedAt: number;
            threadKind: string;
          }>;
            nextCursor: string | null;
            partialSource: string | null;
        }) => void)
      | null = null;

    vi.mocked(listWorkspaceSessions).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ workspaceId }) =>
        useWorkspaceSessionCatalog({
          workspaceId,
          filters: DEFAULT_FILTERS,
        }),
      {
        initialProps: { workspaceId: "ws-1" as string | null },
      },
    );

    await waitFor(() => {
      expect(vi.mocked(listWorkspaceSessions)).toHaveBeenCalledWith("ws-1", {
        query: { keyword: null, engine: null, status: "active" },
        cursor: null,
        limit: 100,
      });
    });

    rerender({ workspaceId: null });

    await act(async () => {
      resolveList?.({
        data: [
          {
            sessionId: "session-a",
            workspaceId: "ws-1",
            engine: "codex",
            title: "Leaked stale entry",
            updatedAt: 1,
            threadKind: "native",
          },
        ],
        nextCursor: null,
        partialSource: null,
      });
      await Promise.resolve();
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
