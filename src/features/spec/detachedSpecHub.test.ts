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
  getClientStoreSyncMock: vi.fn((): unknown => undefined),
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
  DETACHED_SPEC_HUB_SESSION_EVENT,
  DETACHED_SPEC_HUB_SESSION_STORAGE_KEY,
  DETACHED_SPEC_HUB_WINDOW_LABEL,
  buildDetachedSpecHubSession,
  openOrFocusDetachedSpecHub,
  readDetachedSpecHubSessionSnapshot,
} from "./detachedSpecHub";

describe("detachedSpecHub", () => {
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

  it("creates a detached Spec Hub window when none exists", async () => {
    getByLabelMock.mockResolvedValueOnce(null);
    const session = buildDetachedSpecHubSession({
      workspaceId: "ws-1",
      workspaceName: "workspace",
      files: ["openspec/changes/change-1/proposal.md"],
      directories: ["openspec"],
      changeId: "change-1",
      artifactType: "proposal",
    });

    const result = await openOrFocusDetachedSpecHub(session);

    expect(result).toBe("created");
    expect(writeClientStoreValueMock).toHaveBeenCalledWith(
      "app",
      DETACHED_SPEC_HUB_SESSION_STORAGE_KEY,
      session,
      { immediate: true },
    );
    expect(webviewWindowCtorMock).toHaveBeenCalledTimes(1);
    expect(webviewWindowCtorMock.mock.calls[0]?.[0]).toBe(DETACHED_SPEC_HUB_WINDOW_LABEL);
    expect(webviewWindowCtorMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        title: "workspace · Spec Hub",
        width: 1360,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        center: true,
        resizable: true,
        focus: true,
      }),
    );
    expect(emitToMock).toHaveBeenCalledWith(
      DETACHED_SPEC_HUB_WINDOW_LABEL,
      DETACHED_SPEC_HUB_SESSION_EVENT,
      session,
    );
  });

  it("focuses and retargets the existing detached Spec Hub window", async () => {
    const existing = {
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
    };
    getByLabelMock.mockResolvedValueOnce(existing);
    const session = buildDetachedSpecHubSession({
      workspaceId: "ws-2",
      workspaceName: "other",
      files: ["openspec/changes/change-2/specs/foo/spec.md"],
      directories: ["openspec"],
      changeId: "change-2",
      artifactType: "specs",
      specSourcePath: "openspec/changes/change-2/specs/foo/spec.md",
    });

    const result = await openOrFocusDetachedSpecHub(session);

    expect(result).toBe("focused");
    expect(existing.show).toHaveBeenCalledTimes(1);
    expect(existing.setFocus).toHaveBeenCalledTimes(1);
    expect(existing.setTitle).toHaveBeenCalledWith("other · Spec Hub");
    expect(emitToMock).toHaveBeenCalledWith(
      DETACHED_SPEC_HUB_WINDOW_LABEL,
      DETACHED_SPEC_HUB_SESSION_EVENT,
      session,
    );
    expect(webviewWindowCtorMock).not.toHaveBeenCalled();
  });

  it("rejects when detached Spec Hub window creation fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getByLabelMock.mockResolvedValueOnce(null);
    nextLifecycleEventRef.current = "tauri://error";
    nextLifecyclePayloadRef.current = "blocked by runtime";
    const session = buildDetachedSpecHubSession({
      workspaceId: "ws-4",
      workspaceName: "failure",
      files: ["openspec/changes/change-4/proposal.md"],
      directories: ["openspec"],
    });

    await expect(openOrFocusDetachedSpecHub(session)).rejects.toThrow("blocked by runtime");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[detached-spec-hub] create window failed",
      "blocked by runtime",
    );
    consoleErrorSpy.mockRestore();
  });

  it("restores a valid detached Spec Hub session snapshot from client storage", () => {
    getClientStoreSyncMock.mockReturnValueOnce({
      workspaceId: "ws-3",
      workspaceName: "project",
      files: ["openspec/changes/change-3/proposal.md"],
      directories: ["openspec"],
      changeId: "change-3",
      artifactType: "proposal",
      updatedAt: 123,
    });

    expect(readDetachedSpecHubSessionSnapshot()).toEqual({
      workspaceId: "ws-3",
      workspaceName: "project",
      files: ["openspec/changes/change-3/proposal.md"],
      directories: ["openspec"],
      changeId: "change-3",
      artifactType: "proposal",
      specSourcePath: null,
      updatedAt: 123,
    });
  });
});
