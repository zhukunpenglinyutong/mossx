import { expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import type { WorkspaceInfo } from "../../../types";

import { useThreadActions } from "./useThreadActions";

export const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "ccgui",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

export function renderActions(
  overrides?: Partial<Parameters<typeof useThreadActions>[0]>,
) {
  const dispatch = vi.fn();
  const loadedThreadsRef = { current: {} as Record<string, boolean> };
  const replaceOnResumeRef = { current: {} as Record<string, boolean> };
  const threadActivityRef = {
    current: {} as Record<string, Record<string, number>>,
  };
  const applyCollabThreadLinksFromThread = vi.fn();
  const updateThreadParent = vi.fn();

  const args: Parameters<typeof useThreadActions>[0] = {
    dispatch,
    itemsByThread: {},
    userInputRequests: [],
    threadsByWorkspace: {},
    activeThreadIdByWorkspace: {},
    threadListCursorByWorkspace: {},
    threadStatusById: {},
    getCustomName: () => undefined,
    threadActivityRef,
    loadedThreadsRef,
    replaceOnResumeRef,
    applyCollabThreadLinksFromThread,
    updateThreadParent,
    onThreadTitleMappingsLoaded: vi.fn(),
    onRenameThreadTitleMapping: vi.fn(),
    ...overrides,
  };

  const utils = renderHook(() => useThreadActions(args));

  return {
    dispatch,
    loadedThreadsRef: args.loadedThreadsRef,
    replaceOnResumeRef: args.replaceOnResumeRef,
    threadActivityRef: args.threadActivityRef,
    applyCollabThreadLinksFromThread: args.applyCollabThreadLinksFromThread,
    updateThreadParent: args.updateThreadParent,
    ...utils,
  };
}

export function expectSetThreadsDispatched(
  dispatch: ReturnType<typeof vi.fn>,
  workspaceId: string,
  threads: Array<Record<string, unknown>>,
) {
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "setThreads",
      workspaceId,
      threads: threads.map((thread) => expect.objectContaining(thread)),
    }),
  );
}
