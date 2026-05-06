// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { beforeEach, describe, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import {
  deleteCodexSession,
  deleteClaudeSession,
  deleteGeminiSession,
  deleteOpenCodeSession,
  connectWorkspace,
  createWorkspaceDirectory,
  getOpenCodeSessionList,
  listWorkspaceSessions,
  listGeminiSessions,
  loadGeminiSession,
  listThreadTitles,
  renameThreadTitleKey,
  setThreadTitle,
  listThreads,
  readWorkspaceFile,
  trashWorkspaceItem,
  writeWorkspaceFile,
} from "../../../services/tauri";
import { getThreadTimestamp, previewThreadName } from "../../../utils/threadItems";
import { loadSidebarSnapshot } from "../utils/sidebarSnapshot";
import {
  expectSetThreadsDispatched,
  renderActions,
  workspace,
} from "./useThreadActions.test-utils";

vi.mock("../../../services/tauri", () => ({
  startThread: vi.fn(),
  connectWorkspace: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  forkClaudeSession: vi.fn(),
  forkClaudeSessionFromMessage: vi.fn(),
  forkThread: vi.fn(),
  rewindCodexThread: vi.fn(),
  listClaudeSessions: vi.fn(),
  listGeminiSessions: vi.fn(),
  getOpenCodeSessionList: vi.fn(),
  listWorkspaceSessions: vi.fn(),
  loadClaudeSession: vi.fn(),
  loadGeminiSession: vi.fn(),
  loadCodexSession: vi.fn(),
  listThreadTitles: vi.fn(),
  readWorkspaceFile: vi.fn(),
  renameThreadTitleKey: vi.fn(),
  setThreadTitle: vi.fn(),
  resumeThread: vi.fn(),
  listThreads: vi.fn(),
  archiveThread: vi.fn(),
  deleteCodexSession: vi.fn(),
  deleteClaudeSession: vi.fn(),
  deleteGeminiSession: vi.fn(),
  deleteOpenCodeSession: vi.fn(),
  trashWorkspaceItem: vi.fn(),
  writeWorkspaceFile: vi.fn(),
}));

vi.mock("../../../utils/threadItems", () => ({
  buildItemsFromThread: vi.fn(),
  extractClaudeApprovalResumeEntries: vi.fn(() => []),
  getThreadTimestamp: vi.fn(),
  isReviewingFromThread: vi.fn(),
  mergeThreadItems: vi.fn(),
  normalizeItem: vi.fn(),
  previewThreadName: vi.fn(),
  stripClaudeApprovalResumeArtifacts: vi.fn((text: string) => text),
}));

vi.mock("../utils/threadStorage", () => ({
  makeCustomNameKey: (workspaceId: string, threadId: string) =>
    `${workspaceId}:${threadId}`,
  saveThreadActivity: vi.fn(),
}));

vi.mock("../utils/sidebarSnapshot", () => ({
  loadSidebarSnapshot: vi.fn(() => null),
}));

function mockThreadTimestampsFromUpdatedAt() {
  vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
    const value = (thread as Record<string, unknown>).updated_at as number;
    return value ?? 0;
  });
}

function mockListThreadsSingleEntry(entry: {
  id: string;
  cwd: string;
  preview: string;
  updated_at: number;
}) {
  vi.mocked(listThreads).mockResolvedValue({
    result: {
      data: [entry],
      nextCursor: null,
    },
  });
  mockThreadTimestampsFromUpdatedAt();
}

async function listWorkspaceThreads(workspaceInfo: WorkspaceInfo) {
  const { result, dispatch } = renderActions();

  await act(async () => {
    await result.current.listThreadsForWorkspace(workspaceInfo);
  });

  return { dispatch };
}

describe("useThreadActions workspace path compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(listThreadTitles).mockResolvedValue({});
    vi.mocked(listGeminiSessions).mockResolvedValue([]);
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);
    vi.mocked(listWorkspaceSessions).mockResolvedValue({
      data: [],
      nextCursor: null,
      partialSource: null,
    });
    vi.mocked(renameThreadTitleKey).mockResolvedValue(undefined);
    vi.mocked(setThreadTitle).mockResolvedValue("title");
    vi.mocked(connectWorkspace).mockResolvedValue(undefined);
    vi.mocked(createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(previewThreadName).mockImplementation((text: string, fallback: string) => {
      const trimmed = text.trim();
      return trimmed || fallback;
    });
    vi.mocked(deleteClaudeSession).mockResolvedValue(undefined);
    vi.mocked(deleteGeminiSession).mockResolvedValue(undefined);
    vi.mocked(deleteOpenCodeSession).mockResolvedValue({
      deleted: true,
      method: "filesystem",
    });
    vi.mocked(deleteCodexSession).mockResolvedValue({
      deleted: true,
      deletedCount: 1,
      method: "filesystem",
      archivedBeforeDelete: true,
    });
    vi.mocked(loadGeminiSession).mockResolvedValue({ messages: [] });
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "",
      truncated: false,
    });
    vi.mocked(trashWorkspaceItem).mockResolvedValue(undefined);
    vi.mocked(writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(loadSidebarSnapshot).mockReturnValue(null);
  });

  it("matches workspace path when thread cwd contains /private prefix", async () => {
    mockListThreadsSingleEntry({
      id: "thread-private-1",
      cwd: "/private/tmp/codex",
      preview: "Private prefix path",
      updated_at: 6100,
    });

    const { dispatch } = await listWorkspaceThreads(workspace);

    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "thread-private-1",
        name: "Private prefix path",
        updatedAt: 6100,
        engineSource: "codex",
      },
    ]);
  });

  it("matches Windows workspace path when thread cwd uses extended-length prefix", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-win",
      path: "C:\\Users\\Chen\\project",
    };
    mockListThreadsSingleEntry({
      id: "thread-win-1",
      cwd: "\\\\?\\C:\\Users\\Chen\\project\\src",
      preview: "Windows extended path",
      updated_at: 6200,
    });

    const { dispatch } = await listWorkspaceThreads(windowsWorkspace);

    expectSetThreadsDispatched(dispatch, "ws-win", [
      {
        id: "thread-win-1",
        name: "Windows extended path",
        updatedAt: 6200,
        engineSource: "codex",
      },
    ]);
  });

  it("matches Windows UNC workspace path when thread cwd uses \\?\\UNC prefix", async () => {
    const uncWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-unc",
      path: "\\\\SERVER\\Share\\project",
    };
    mockListThreadsSingleEntry({
      id: "thread-unc-1",
      cwd: "\\\\?\\UNC\\server\\share\\project\\src",
      preview: "UNC extended path",
      updated_at: 6300,
    });

    const { dispatch } = await listWorkspaceThreads(uncWorkspace);

    expectSetThreadsDispatched(dispatch, "ws-unc", [
      {
        id: "thread-unc-1",
        name: "UNC extended path",
        updatedAt: 6300,
        engineSource: "codex",
      },
    ]);
  });

  it("matches mac workspace path when thread cwd includes /System/Volumes/Data prefix", async () => {
    const macWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-mac",
      path: "/Users/chen/project",
    };
    mockListThreadsSingleEntry({
      id: "thread-mac-1",
      cwd: "/System/Volumes/Data/Users/chen/project/src",
      preview: "Mac data volume path",
      updated_at: 6400,
    });

    const { dispatch } = await listWorkspaceThreads(macWorkspace);

    expectSetThreadsDispatched(dispatch, "ws-mac", [
      {
        id: "thread-mac-1",
        name: "Mac data volume path",
        updatedAt: 6400,
        engineSource: "codex",
      },
    ]);
  });

  it("matches file:// cwd URI on Windows workspace", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-win-uri",
      path: "C:\\Users\\Chen\\project",
    };
    mockListThreadsSingleEntry({
      id: "thread-win-uri-1",
      cwd: "file:///C:/Users/Chen/project/src",
      preview: "Windows file URI path",
      updated_at: 6500,
    });

    const { dispatch } = await listWorkspaceThreads(windowsWorkspace);

    expectSetThreadsDispatched(dispatch, "ws-win-uri", [
      {
        id: "thread-win-uri-1",
        name: "Windows file URI path",
        updatedAt: 6500,
        engineSource: "codex",
      },
    ]);
  });

  it("matches file://C:/ cwd URI on Windows workspace", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-win-uri-host-drive",
      path: "C:\\Users\\Chen\\project",
    };
    mockListThreadsSingleEntry({
      id: "thread-win-uri-host-drive-1",
      cwd: "file://C:/Users/Chen/project/src",
      preview: "Windows file URI host drive path",
      updated_at: 6510,
    });

    const { dispatch } = await listWorkspaceThreads(windowsWorkspace);

    expectSetThreadsDispatched(dispatch, "ws-win-uri-host-drive", [
      {
        id: "thread-win-uri-host-drive-1",
        name: "Windows file URI host drive path",
        updatedAt: 6510,
        engineSource: "codex",
      },
    ]);
  });

  it("matches Windows workspace path when thread cwd uses /mnt/c style path", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-win-mnt",
      path: "C:\\Users\\Chen\\project",
    };
    mockListThreadsSingleEntry({
      id: "thread-win-mnt-1",
      cwd: "/mnt/c/Users/Chen/project/src",
      preview: "Windows mnt path",
      updated_at: 6600,
    });

    const { dispatch } = await listWorkspaceThreads(windowsWorkspace);

    expectSetThreadsDispatched(dispatch, "ws-win-mnt", [
      {
        id: "thread-win-mnt-1",
        name: "Windows mnt path",
        updatedAt: 6600,
        engineSource: "codex",
      },
    ]);
  });
});
