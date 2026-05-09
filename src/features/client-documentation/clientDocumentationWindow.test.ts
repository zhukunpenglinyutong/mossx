/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getByLabelMock,
  webviewWindowCtorMock,
  nextLifecycleEventRef,
  nextLifecyclePayloadRef,
} = vi.hoisted(() => ({
  getByLabelMock: vi.fn(),
  webviewWindowCtorMock: vi.fn(),
  nextLifecycleEventRef: { current: "tauri://created" as "tauri://created" | "tauri://error" },
  nextLifecyclePayloadRef: { current: undefined as unknown },
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

vi.mock("../../utils/platform", () => ({
  isMacPlatform: () => true,
}));

import {
  CLIENT_DOCUMENTATION_WINDOW_LABEL,
  CLIENT_DOCUMENTATION_WINDOW_TITLE,
} from "./clientDocumentationData";
import {
  hasClientDocumentationWindow,
  openOrFocusClientDocumentationWindow,
} from "./clientDocumentationWindow";

describe("clientDocumentationWindow", () => {
  beforeEach(() => {
    getByLabelMock.mockReset();
    webviewWindowCtorMock.mockClear();
    nextLifecycleEventRef.current = "tauri://created";
    nextLifecyclePayloadRef.current = undefined;
  });

  it("creates a Tauri client documentation window when none exists", async () => {
    getByLabelMock.mockResolvedValueOnce(null);

    const result = await openOrFocusClientDocumentationWindow();

    expect(result).toBe("created");
    expect(webviewWindowCtorMock).toHaveBeenCalledWith(
      CLIENT_DOCUMENTATION_WINDOW_LABEL,
      expect.objectContaining({
        title: CLIENT_DOCUMENTATION_WINDOW_TITLE,
        width: 1180,
        height: 760,
        minWidth: 860,
        minHeight: 560,
        center: true,
        resizable: true,
        focus: true,
        titleBarStyle: "overlay",
      }),
      expect.anything(),
    );
  });

  it("focuses an existing window without creating another one", async () => {
    const existing = {
      show: vi.fn(async () => undefined),
      setFocus: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
    };
    getByLabelMock.mockResolvedValueOnce(existing);

    const result = await openOrFocusClientDocumentationWindow();

    expect(result).toBe("focused");
    expect(existing.show).toHaveBeenCalledTimes(1);
    expect(existing.setFocus).toHaveBeenCalledTimes(1);
    expect(existing.setTitle).toHaveBeenCalledWith(CLIENT_DOCUMENTATION_WINDOW_TITLE);
    expect(webviewWindowCtorMock).not.toHaveBeenCalled();
  });

  it("coalesces concurrent open requests into one window creation", async () => {
    getByLabelMock.mockResolvedValueOnce(null);

    const firstOpen = openOrFocusClientDocumentationWindow();
    const secondOpen = openOrFocusClientDocumentationWindow();

    await expect(Promise.all([firstOpen, secondOpen])).resolves.toEqual([
      "created",
      "created",
    ]);
    expect(getByLabelMock).toHaveBeenCalledTimes(1);
    expect(webviewWindowCtorMock).toHaveBeenCalledTimes(1);
  });

  it("reports existing window presence", async () => {
    getByLabelMock.mockResolvedValueOnce({ label: CLIENT_DOCUMENTATION_WINDOW_LABEL });

    await expect(hasClientDocumentationWindow()).resolves.toBe(true);
  });

  it("rejects failed window creation with normalized message", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getByLabelMock.mockResolvedValueOnce(null);
    nextLifecycleEventRef.current = "tauri://error";
    nextLifecyclePayloadRef.current = { message: "blocked by runtime" };

    await expect(openOrFocusClientDocumentationWindow()).rejects.toThrow("blocked by runtime");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[client-documentation] create window failed",
      "blocked by runtime",
    );
    consoleErrorSpy.mockRestore();
  });
});
