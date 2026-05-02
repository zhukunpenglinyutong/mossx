/** @vitest-environment jsdom */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileExplorerWorkspace } from "./FileExplorerWorkspace";

const fileTreePanelSpy = vi.fn();
const fileViewPanelSpy = vi.fn();
const openOrFocusDetachedSpecHubMock = vi.fn(async () => "created");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("./FileTreePanel", () => ({
  FileTreePanel: (props: any) => {
    fileTreePanelSpy(props);
    return (
      <div data-testid="file-tree-panel">
        <button type="button" onClick={() => props.onOpenSpecHub?.()}>
          open-spec-hub
        </button>
        <button type="button" onClick={() => props.onOpenFile?.("src/index.ts")}>
          open-file
        </button>
        <span>{props.isSpecHubActive ? "spec-active" : "spec-inactive"}</span>
      </div>
    );
  },
}));

vi.mock("./FileViewPanel", () => ({
  FileViewPanel: (props: any) => {
    fileViewPanelSpy(props);
    return (
      <div data-testid="file-view-panel">
        <span data-testid="file-view-panel-direction">{props.singleRowLeadingDirection ?? "none"}</span>
        <button type="button" onClick={() => props.onSingleRowLeadingAction?.()}>
          toggle-detached-sidebar
        </button>
        <button type="button" onClick={() => props.onClose?.()}>
          close-tabs
        </button>
        {props.filePath}
      </div>
    );
  },
}));

vi.mock("../../spec/detachedSpecHub", () => ({
  buildDetachedSpecHubSession: (payload: any) => ({
    ...payload,
    updatedAt: 1,
  }),
  openOrFocusDetachedSpecHub: (...args: any[]) => (openOrFocusDetachedSpecHubMock as any)(...args),
}));

function WorkspaceHarness() {
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  return (
    <FileExplorerWorkspace
      workspaceId="workspace-1"
      workspaceName="workspace"
      workspacePath="/tmp/workspace"
      gitRoot="nested/repo"
      files={["src/index.ts"]}
      directories={["src"]}
      isLoading={false}
      gitStatusFiles={[{ path: "src/index.ts", status: "M", additions: 1, deletions: 0 }]}
      gitignoredFiles={new Set<string>()}
      gitignoredDirectories={new Set<string>()}
      openTargets={[]}
      openAppIconById={{}}
      selectedOpenAppId=""
      onSelectOpenAppId={() => undefined}
      openTabs={activeFilePath ? [activeFilePath] : []}
      activeFilePath={activeFilePath}
      navigationTarget={null}
      onOpenFile={(path) => setActiveFilePath(path)}
      onActivateTab={() => undefined}
      onCloseTab={() => undefined}
      onCloseAllTabs={() => setActiveFilePath(null)}
      onRefreshFiles={() => undefined}
      fileViewHeaderLayout="single-row"
    />
  );
}

describe("FileExplorerWorkspace", () => {
  beforeEach(() => {
    openOrFocusDetachedSpecHubMock.mockClear();
  });

  it("opens Spec Hub in a detached window instead of replacing the right viewer", async () => {
    render(<WorkspaceHarness />);

    fireEvent.click(screen.getByText("open-spec-hub"));
    expect(openOrFocusDetachedSpecHubMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        workspaceName: "workspace",
        files: ["src/index.ts"],
        directories: ["src"],
      }),
    );
    expect(screen.queryByTestId("spec-hub-panel")).toBeNull();

    fireEvent.click(screen.getByText("open-file"));
    expect(screen.getByTestId("file-view-panel").textContent).toContain("src/index.ts");
    expect(screen.getByTestId("file-view-panel-direction").textContent).toBe("left");
    fireEvent.click(screen.getByText("toggle-detached-sidebar"));
    expect(screen.getByTestId("file-view-panel-direction").textContent).toBe("right");
    fireEvent.click(screen.getByText("close-tabs"));
    expect(
      screen.getByRole("button", { name: "sidebar.sidebarExpand" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "sidebar.sidebarExpand" }));
    fireEvent.click(screen.getByText("open-file"));
    expect(screen.getByTestId("file-view-panel-direction").textContent).toBe("left");
    expect(fileTreePanelSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        gitRoot: "nested/repo",
        gitStatusFiles: [{ path: "src/index.ts", status: "M", additions: 1, deletions: 0 }],
      }),
    );
    expect(fileViewPanelSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        gitRoot: "nested/repo",
        gitStatusFiles: [{ path: "src/index.ts", status: "M", additions: 1, deletions: 0 }],
      }),
    );
  });

  it("passes the fixed sample matrix through to FileViewPanel without rewriting paths", () => {
    const openTabs = [
      "README.md",
      "Dockerfile",
      "docker-compose.yml",
      ".env.local",
      "build.gradle.kts",
    ];
    const baseProps = {
      workspaceId: "workspace-1",
      workspaceName: "workspace",
      workspacePath: "/tmp/workspace",
      gitRoot: "nested/repo",
      files: ["README.md", "Dockerfile", "docker-compose.yml", ".env.local", "build.gradle.kts"],
      directories: [] as string[],
      isLoading: false,
      gitStatusFiles: [{ path: "README.md", status: "M", additions: 1, deletions: 0 }],
      gitignoredFiles: new Set<string>(),
      gitignoredDirectories: new Set<string>(),
      openTargets: [] as Parameters<typeof FileExplorerWorkspace>[0]["openTargets"],
      openAppIconById: {},
      selectedOpenAppId: "",
      onSelectOpenAppId: () => undefined,
      onOpenFile: () => undefined,
      onActivateTab: () => undefined,
      onCloseTab: () => undefined,
      onCloseAllTabs: () => undefined,
      navigationTarget: null,
    };

    const { rerender } = render(
      <FileExplorerWorkspace
        {...baseProps}
        openTabs={openTabs}
        activeFilePath="README.md"
      />,
    );

    for (const path of openTabs) {
      rerender(
        <FileExplorerWorkspace
          {...baseProps}
          openTabs={openTabs}
          activeFilePath={path}
        />,
      );

      expect(fileViewPanelSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filePath: path,
          activeTabPath: path,
          openTabs,
        }),
      );
    }
  });
});
