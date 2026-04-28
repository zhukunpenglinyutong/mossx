// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadSummary, WorkspaceInfo } from "../../../types";
import {
  SESSION_RADAR_HISTORY_UPDATED_EVENT,
  SESSION_RADAR_RECENT_STORAGE_KEY,
} from "../utils/sessionRadarPersistence";
import { useSessionRadarFeed } from "./useSessionRadarFeed";

const clientStoreCache = new Map<string, unknown>();

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: vi.fn((store: string, key: string) => clientStoreCache.get(`${store}:${key}`)),
  writeClientStoreValue: vi.fn((store: string, key: string, value: unknown) => {
    clientStoreCache.set(`${store}:${key}`, value);
  }),
}));

function createWorkspace(id: string, name: string): WorkspaceInfo {
  return {
    id,
    name,
    path: `/tmp/${id}`,
    settings: { sidebarCollapsed: true },
    connected: true,
    kind: "main",
  } as unknown as WorkspaceInfo;
}

function createThread(id: string, name: string, updatedAt: number): ThreadSummary {
  return {
    id,
    name,
    updatedAt,
    engineSource: "codex",
  };
}

describe("useSessionRadarFeed parity", () => {
  beforeEach(() => {
    clientStoreCache.clear();
  });

  it("prefers current thread summary names over persisted recent titles", () => {
    const workspace = createWorkspace("ws-main", "Workspace Main");
    clientStoreCache.set(`leida:${SESSION_RADAR_RECENT_STORAGE_KEY}`, [
      {
        id: "ws-main:thread-archived",
        workspaceId: "ws-main",
        workspaceName: "Workspace Main",
        threadId: "thread-archived",
        threadName: "Agent 19",
        preview: "persisted preview",
        completedAt: 50_000,
        updatedAt: 50_000,
        startedAt: 48_000,
        durationMs: 2_000,
      },
    ]);

    const { result } = renderHook(() =>
      useSessionRadarFeed({
        workspaces: [workspace],
        threadsByWorkspace: {
          "ws-main": [createThread("thread-archived", "项目分析", 60_000)],
        },
        threadStatusById: {},
        threadItemsByThread: {},
        lastAgentMessageByThread: {},
      }),
    );

    act(() => {
      window.dispatchEvent(new Event(SESSION_RADAR_HISTORY_UPDATED_EVENT));
    });

    expect(result.current.recentCompletedSessions[0]).toEqual(
      expect.objectContaining({
        threadId: "thread-archived",
        threadName: "项目分析",
      }),
    );
  });
});
