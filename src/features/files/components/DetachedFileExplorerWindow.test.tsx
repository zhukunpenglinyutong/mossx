/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let focusState = false;
const setTitleMock = vi.fn(async () => undefined);
const closeMock = vi.fn(async () => undefined);
const refreshFilesMock = vi.fn(async () => undefined);
const refreshGitStatusMock = vi.fn(async () => undefined);
const useCodeCssVarsMock = vi.fn();
const configureDetachedExternalChangeMonitorMock = vi.fn(async () => ({ mode: "watcher" as const }));
const clearDetachedExternalChangeMonitorMock = vi.fn(async () => undefined);
const useWorkspaceFilesMock = vi.fn(() => ({
  files: ["src/index.ts"],
  directories: ["src"],
  gitignoredFiles: new Set<string>(),
  gitignoredDirectories: new Set<string>(),
  isLoading: false,
  refreshFiles: refreshFilesMock,
}));
const useGitStatusMock = vi.fn(() => ({
  status: {
    files: [{ path: "src/index.ts", status: "M", additions: 2, deletions: 1 }],
  },
  refresh: refreshGitStatusMock,
}));
const fileExplorerWorkspaceMock = vi.fn(() => <div data-testid="detached-workspace" />);

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
    close: closeMock,
  })),
}));

vi.mock("../../workspaces/hooks/useWorkspaceFiles", () => ({
  useWorkspaceFiles: (...args: any[]) => (useWorkspaceFilesMock as any)(...args),
}));
vi.mock("../../git/hooks/useGitStatus", () => ({
  useGitStatus: (...args: any[]) => (useGitStatusMock as any)(...args),
}));

vi.mock("../../layout/hooks/useWindowFocusState", () => ({
  useWindowFocusState: () => focusState,
}));

vi.mock("../../app/hooks/useOpenAppIcons", () => ({
  useOpenAppIcons: () => ({}),
}));

vi.mock("../../../utils/platform", () => ({
  isWindowsPlatform: () => false,
  isMacPlatform: () => true,
}));

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: vi.fn(() => "vscode"),
}));

vi.mock("../../../services/tauri", () => ({
  configureDetachedExternalChangeMonitor: (...args: any[]) =>
    (configureDetachedExternalChangeMonitorMock as any)(...args),
  clearDetachedExternalChangeMonitor: (...args: any[]) =>
    (clearDetachedExternalChangeMonitorMock as any)(...args),
}));

vi.mock("../hooks/useDetachedFileExplorerSession", () => ({
  useDetachedFileExplorerSession: () => ({
    workspaceId: "ws-1",
    workspacePath: "/tmp/workspace",
    workspaceName: "workspace",
    initialFilePath: null,
    updatedAt: 1,
  }),
}));

vi.mock("./FileExplorerWorkspace", () => ({
  FileExplorerWorkspace: (props: any) => (fileExplorerWorkspaceMock as any)(props),
}));

import { DetachedFileExplorerWindow } from "./DetachedFileExplorerWindow";

describe("DetachedFileExplorerWindow", () => {
  beforeEach(() => {
    focusState = false;
    setTitleMock.mockClear();
    closeMock.mockClear();
    refreshFilesMock.mockClear();
    refreshGitStatusMock.mockClear();
    useCodeCssVarsMock.mockClear();
    useWorkspaceFilesMock.mockClear();
    useGitStatusMock.mockClear();
    fileExplorerWorkspaceMock.mockClear();
    configureDetachedExternalChangeMonitorMock.mockClear();
    clearDetachedExternalChangeMonitorMock.mockClear();
  });

  it("uses detached focus state to drive polling and refresh", () => {
    const { container, rerender } = render(<DetachedFileExplorerWindow />);

    expect(screen.getByTestId("detached-workspace")).not.toBeNull();
    expect(useWorkspaceFilesMock).toHaveBeenCalledWith({
      activeWorkspace: expect.objectContaining({
        id: "ws-1",
        path: "/tmp/workspace",
      }),
      pollingEnabled: false,
    });
    expect(useGitStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ws-1",
        path: "/tmp/workspace",
      }),
      { pollingEnabled: false },
    );
    expect(fileExplorerWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        gitStatusFiles: [{ path: "src/index.ts", status: "M", additions: 2, deletions: 1 }],
        fileViewHeaderLayout: "single-row",
      }),
    );
    expect(useCodeCssVarsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uiFontFamily: "Test UI Font",
        codeFontFamily: "Test Code Font",
      }),
    );
    expect(container.firstElementChild?.className).toContain("app");
    expect(container.firstElementChild?.className).toContain("layout-desktop");
    expect(container.firstElementChild?.className).toContain("macos-desktop");
    expect(container.firstElementChild?.className).toContain("reduced-transparency");
    const detachedStyle = container.firstElementChild?.getAttribute("style") ?? "";
    expect(detachedStyle).toContain("--ui-font-family: Test UI Font");
    expect(detachedStyle).toContain("--code-font-family: Test Code Font");
    expect(detachedStyle).toContain("--code-font-size: 15px");

    focusState = true;
    rerender(<DetachedFileExplorerWindow />);

    expect(refreshFilesMock).toHaveBeenCalled();
    expect(refreshGitStatusMock).toHaveBeenCalled();
    expect(setTitleMock).toHaveBeenCalledWith("workspace · File Explorer");
    expect(clearDetachedExternalChangeMonitorMock).toHaveBeenCalledWith("ws-1");
  });
});
