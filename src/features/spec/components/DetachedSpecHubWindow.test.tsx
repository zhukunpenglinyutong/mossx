/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let focusState = false;
const setTitleMock = vi.fn(async () => undefined);
const startDraggingMock = vi.fn(async () => undefined);
const isFullscreenMock = vi.fn(async () => false);
const getWorkspaceFilesMock = vi.fn(async () => ({
  files: ["openspec/changes/change-1/proposal.md"],
  directories: ["openspec"],
  gitignored_files: [],
  gitignored_directories: [],
}));
const useCodeCssVarsMock = vi.fn();
let detachedSession: any = {
  workspaceId: "ws-1",
  workspaceName: "workspace",
  files: ["openspec/changes/change-1/proposal.md"],
  directories: ["openspec"],
  changeId: "change-1",
  artifactType: "proposal",
  updatedAt: 1,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../app/hooks/useAppSettingsController", () => ({
  useAppSettingsController: () => ({
    appSettings: {
      uiFontFamily: "Test UI Font",
      codeFontFamily: "Test Code Font",
      codeFontSize: 15,
      theme: "light",
    },
    reduceTransparency: true,
  }),
}));

vi.mock("../../app/hooks/useCodeCssVars", () => ({
  useCodeCssVars: (...args: any[]) => (useCodeCssVarsMock as any)(...args),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: setTitleMock,
    startDragging: startDraggingMock,
    isFullscreen: isFullscreenMock,
  })),
}));

vi.mock("../../layout/hooks/useWindowFocusState", () => ({
  useWindowFocusState: () => focusState,
}));

vi.mock("../../../utils/platform", () => ({
  isWindowsPlatform: () => false,
  isMacPlatform: () => true,
}));

vi.mock("../../../services/tauri", () => ({
  getWorkspaceFiles: (...args: any[]) => (getWorkspaceFilesMock as any)(...args),
}));

vi.mock("../hooks/useDetachedSpecHubSession", () => ({
  useDetachedSpecHubSession: () => detachedSession,
}));

const specHubMock = vi.fn(() => <div data-testid="detached-spec-hub">spec-hub</div>);

vi.mock("./SpecHub", () => ({
  SpecHub: (props: any) => (specHubMock as any)(props),
}));

import { DetachedSpecHubWindow } from "./DetachedSpecHubWindow";

describe("DetachedSpecHubWindow", () => {
  beforeEach(() => {
    focusState = false;
    detachedSession = {
      workspaceId: "ws-1",
      workspaceName: "workspace",
      files: ["openspec/changes/change-1/proposal.md"],
      directories: ["openspec"],
      changeId: "change-1",
      artifactType: "proposal",
      updatedAt: 1,
    };
    setTitleMock.mockClear();
    startDraggingMock.mockClear();
    isFullscreenMock.mockClear();
    getWorkspaceFilesMock.mockClear();
    useCodeCssVarsMock.mockClear();
    specHubMock.mockClear();
  });

  it("renders the detached Spec Hub with detached reader props", async () => {
    const { container } = render(<DetachedSpecHubWindow />);

    expect(screen.getByTestId("detached-spec-hub")).not.toBeNull();
    expect(screen.getByText("specHub.title")).not.toBeNull();
    expect(screen.getByText("workspace")).not.toBeNull();
    expect(container.querySelector(".detached-spec-hub-menubar")?.getAttribute("data-tauri-drag-region")).toBe(
      "true",
    );
    expect(specHubMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        workspaceName: "workspace",
        files: ["openspec/changes/change-1/proposal.md"],
        directories: ["openspec"],
        surfaceMode: "detached",
        detachedReaderSession: expect.objectContaining({
          changeId: "change-1",
          artifactType: "proposal",
        }),
      }),
    );
    expect(useCodeCssVarsMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(setTitleMock).toHaveBeenCalledWith("workspace · Spec Hub");
    });
  });

  it("refreshes detached workspace files when the window regains focus", async () => {
    const { rerender } = render(<DetachedSpecHubWindow />);

    focusState = true;
    rerender(<DetachedSpecHubWindow />);

    await waitFor(() => {
      expect(getWorkspaceFilesMock).toHaveBeenCalledWith("ws-1");
    });
    expect(specHubMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        files: ["openspec/changes/change-1/proposal.md"],
        directories: ["openspec"],
      }),
    );
  });

  it("starts dragging from the detached menubar on macOS", async () => {
    const { container } = render(<DetachedSpecHubWindow />);

    const menubar = container.querySelector(".detached-spec-hub-menubar");
    expect(menubar).not.toBeNull();

    fireEvent.mouseDown(menubar as HTMLElement, { button: 0, detail: 1 });

    await waitFor(() => {
      expect(isFullscreenMock).toHaveBeenCalledTimes(1);
      expect(startDraggingMock).toHaveBeenCalledTimes(1);
    });
  });

  it("starts dragging when the event originates from a menubar text node on macOS", async () => {
    const { container } = render(<DetachedSpecHubWindow />);

    const title = container.querySelector(".detached-spec-hub-menubar-title");
    const textNode = title?.firstChild;
    expect(textNode).not.toBeNull();

    expect(() => {
      textNode?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
    }).not.toThrow();

    await waitFor(() => {
      expect(isFullscreenMock).toHaveBeenCalledTimes(1);
      expect(startDraggingMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a recoverable unavailable state when session is missing", () => {
    detachedSession = null;

    render(<DetachedSpecHubWindow />);

    expect(screen.getByText("specHub.detached.unavailableTitle")).not.toBeNull();
    expect(screen.getByText("specHub.detached.unavailableBody")).not.toBeNull();
    expect(specHubMock).not.toHaveBeenCalled();
  });
});
