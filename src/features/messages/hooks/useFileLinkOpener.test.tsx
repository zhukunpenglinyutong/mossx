// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileLinkOpener } from "./useFileLinkOpener";

const mockOpenPath = vi.fn();
const mockRevealItemInDir = vi.fn();
const mockOpenWorkspaceIn = vi.fn();
const mockClipboardWriteText = vi.fn();

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: (...args: unknown[]) => mockOpenPath(...args),
  revealItemInDir: (...args: unknown[]) => mockRevealItemInDir(...args),
}));

vi.mock("../../../services/tauri", () => ({
  openWorkspaceIn: (...args: unknown[]) => mockOpenWorkspaceIn(...args),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

describe("useFileLinkOpener", () => {
  beforeEach(() => {
    mockOpenPath.mockReset();
    mockRevealItemInDir.mockReset();
    mockOpenWorkspaceIn.mockReset();
    mockClipboardWriteText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: mockClipboardWriteText,
      },
    });
  });

  it("builds a renderer-owned file link menu with the expected actions", async () => {
    const { result } = renderHook(() =>
      useFileLinkOpener(
        "/repo",
        [
          {
            id: "cursor",
            label: "Cursor",
            appName: "Cursor",
            kind: "app",
            command: null,
            args: ["--reuse-window"],
          },
        ],
        "cursor",
        null,
      ),
    );

    const event = {
      clientX: 12,
      clientY: 24,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    act(() => {
      result.current.showFileLinkMenu(
        event as unknown as React.MouseEvent,
        "src/main.ts#L7",
      );
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.fileLinkMenu?.label).toBe("File link actions");

    const items = result.current.fileLinkMenu?.items ?? [];
    expect(items.map((item) => (item.type === "item" ? item.label : item.type))).toEqual([
      "Open File",
      "Open in Cursor",
      "Reveal in File Manager",
      "Download Linked File",
      "Copy Link",
    ]);

    const [openFile, openConfiguredTarget, reveal, download, copyLink] = items;
    expect(download.type).toBe("item");
    if (download.type === "item") {
      expect(download.disabled).toBe(true);
    }

    if (openFile.type === "item") {
      await act(async () => {
        await openFile.onSelect();
      });
    }
    expect(mockOpenPath).toHaveBeenCalledWith("/repo/src/main.ts");

    if (openConfiguredTarget.type === "item") {
      await act(async () => {
        await openConfiguredTarget.onSelect();
      });
    }
    expect(mockOpenWorkspaceIn).toHaveBeenCalledWith("/repo/src/main.ts", {
      appName: "Cursor",
      args: ["--reuse-window"],
    });

    if (reveal.type === "item") {
      await act(async () => {
        await reveal.onSelect();
      });
    }
    expect(mockRevealItemInDir).toHaveBeenCalledWith("/repo/src/main.ts");

    if (copyLink.type === "item") {
      await act(async () => {
        await copyLink.onSelect();
      });
    }
    expect(mockClipboardWriteText).toHaveBeenCalledWith("file:///repo/src/main.ts");
  });
});
