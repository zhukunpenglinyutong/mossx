/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  emitToMock,
  writeClientStoreValueMock,
  getClientStoreSyncMock,
  getByLabelMock,
  webviewWindowCtorMock,
  nextLifecycleEventRef,
  nextLifecyclePayloadRef,
} = vi.hoisted(() => ({
  emitToMock: vi.fn(async () => undefined),
  writeClientStoreValueMock: vi.fn(),
  getClientStoreSyncMock: vi.fn(() => undefined),
  getByLabelMock: vi.fn(),
  webviewWindowCtorMock: vi.fn(),
  nextLifecycleEventRef: { current: "tauri://created" as "tauri://created" | "tauri://error" },
  nextLifecyclePayloadRef: { current: undefined as unknown },
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: (...args: any[]) => (emitToMock as any)(...args),
}));

vi.mock("../../services/clientStorage", () => ({
  writeClientStoreValue: (...args: any[]) => (writeClientStoreValueMock as any)(...args),
  getClientStoreSync: (...args: any[]) => (getClientStoreSyncMock as any)(...args),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => {
  class MockWebviewWindow {
    label: string;
    options: Record<string, unknown>;
    once = vi.fn((event: string, handler: (event: { payload?: unknown }) => void) => {
      if (event !== nextLifecycleEventRef.current) {
        return;
      }
      queueMicrotask(() => {
        handler({ payload: nextLifecyclePayloadRef.current });
      });
    });
    setFocus = vi.fn(async () => undefined);

    constructor(label: string, options: Record<string, unknown>) {
      this.label = label;
      this.options = options;
      webviewWindowCtorMock(label, options, this);
    }

    static getByLabel = getByLabelMock;
  }

  return {
    WebviewWindow: MockWebviewWindow,
  };
});

import {
  DETACHED_FILE_EXPLORER_SESSION_EVENT,
  DETACHED_FILE_EXPLORER_SESSION_STORAGE_KEY,
  DETACHED_FILE_EXPLORER_WINDOW_LABEL,
  buildDetachedFileExplorerSession,
  openOrFocusDetachedFileExplorer,
  readDetachedFileExplorerSessionSnapshot,
} from "./detachedFileExplorer";

describe("detachedFileExplorer", () => {
  beforeEach(() => {
    emitToMock.mockClear();
    writeClientStoreValueMock.mockClear();
    getClientStoreSyncMock.mockReset();
    getClientStoreSyncMock.mockReturnValue(undefined);
    getByLabelMock.mockReset();
    webviewWindowCtorMock.mockClear();
    nextLifecycleEventRef.current = "tauri://created";
    nextLifecyclePayloadRef.current = undefined;
  });

  it("creates a detached window when none exists", async () => {
    getByLabelMock.mockResolvedValueOnce(null);
    const session = buildDetachedFileExplorerSession({
      workspaceId: "ws-1",
      workspacePath: "/tmp/workspace",
      workspaceName: "workspace",
    });

    const result = await openOrFocusDetachedFileExplorer(session);

    expect(result).toBe("created");
    expect(writeClientStoreValueMock).toHaveBeenCalledWith(
      "app",
      DETACHED_FILE_EXPLORER_SESSION_STORAGE_KEY,
      session,
      { immediate: true },
    );
    expect(webviewWindowCtorMock).toHaveBeenCalledTimes(1);
    expect(webviewWindowCtorMock.mock.calls[0]?.[0]).toBe(DETACHED_FILE_EXPLORER_WINDOW_LABEL);
    expect(emitToMock).toHaveBeenCalledWith(
      DETACHED_FILE_EXPLORER_WINDOW_LABEL,
      DETACHED_FILE_EXPLORER_SESSION_EVENT,
      session,
    );
  });

  it("focuses and retargets the existing detached window", async () => {
    const existing = {
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
    };
    getByLabelMock.mockResolvedValueOnce(existing);
    const session = buildDetachedFileExplorerSession({
      workspaceId: "ws-2",
      workspacePath: "/tmp/other",
      workspaceName: "other",
      initialFilePath: "src/index.ts",
    });

    const result = await openOrFocusDetachedFileExplorer(session);

    expect(result).toBe("focused");
    expect(existing.show).toHaveBeenCalledTimes(1);
    expect(existing.setFocus).toHaveBeenCalledTimes(1);
    expect(existing.setTitle).toHaveBeenCalledWith("other · File Explorer");
    expect(emitToMock).toHaveBeenCalledWith(
      DETACHED_FILE_EXPLORER_WINDOW_LABEL,
      DETACHED_FILE_EXPLORER_SESSION_EVENT,
      session,
    );
    expect(webviewWindowCtorMock).not.toHaveBeenCalled();
  });

  it("rejects when detached window creation fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getByLabelMock.mockResolvedValueOnce(null);
    nextLifecycleEventRef.current = "tauri://error";
    nextLifecyclePayloadRef.current = "blocked by runtime";
    const session = buildDetachedFileExplorerSession({
      workspaceId: "ws-4",
      workspacePath: "/tmp/failure",
      workspaceName: "failure",
    });

    await expect(openOrFocusDetachedFileExplorer(session)).rejects.toThrow(
      "blocked by runtime",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[detached-file-explorer] create window failed",
      "blocked by runtime",
    );
    consoleErrorSpy.mockRestore();
  });

  it("restores a valid session snapshot from client storage", () => {
    (getClientStoreSyncMock as any).mockReturnValueOnce({
      workspaceId: "ws-3",
      workspacePath: "/tmp/project",
      workspaceName: "project",
      updatedAt: 123,
    });

    expect(readDetachedFileExplorerSessionSnapshot()).toEqual({
      workspaceId: "ws-3",
      workspacePath: "/tmp/project",
      workspaceName: "project",
      gitRoot: null,
      initialFilePath: null,
      updatedAt: 123,
    });
  });
});
