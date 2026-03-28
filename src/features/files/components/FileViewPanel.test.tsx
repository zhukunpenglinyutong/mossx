/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileViewPanel } from "./FileViewPanel";
import {
  getCodeIntelDefinition,
  getCodeIntelReferences,
  getGitFileFullDiff,
  readExternalAbsoluteFile,
  readExternalSpecFile,
  readWorkspaceFile,
  writeExternalSpecFile,
  writeWorkspaceFile,
} from "../../../services/tauri";
import { subscribeDetachedExternalFileChanges } from "../../../services/events";

const mockCodeMirrorDispatch = vi.fn();
let detachedExternalFileChangeListener: ((event: any) => void) | null = null;

function createDoc(text: string) {
  const lines = text.split("\n");
  const starts: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    starts.push(cursor);
    cursor += line.length + 1;
  }
  const lineFor = (lineNumber: number) => {
    const safeLine = Math.min(Math.max(lineNumber, 1), lines.length);
    const lineText = lines[safeLine - 1] ?? "";
    const from = starts[safeLine - 1] ?? 0;
    return {
      number: safeLine,
      from,
      to: from + lineText.length,
      length: lineText.length,
      text: lineText,
    };
  };
  const lineAt = (offset: number) => {
    const safeOffset = Math.min(Math.max(offset, 0), text.length);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (safeOffset >= (starts[index] ?? 0)) {
        return lineFor(index + 1);
      }
    }
    return lineFor(1);
  };
  return {
    length: text.length,
    lines: lines.length,
    line: lineFor,
    lineAt,
  };
}

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  const MockCodeMirror = React.forwardRef<
    { view: any },
    {
      value?: string;
      onChange?: (value: string) => void;
      onCreateEditor?: (view: any, state: any) => void;
      theme?: string;
    }
  >((props, ref) => {
    const viewRef = React.useRef<any>({
      state: {
        doc: createDoc(props.value ?? ""),
        selection: { main: { head: 0 } },
      },
      dispatch: mockCodeMirrorDispatch.mockImplementation((transaction: any) => {
        const anchor = transaction?.selection?.anchor;
        if (typeof anchor === "number") {
          viewRef.current.state.selection.main.head = anchor;
        }
      }),
      focus: vi.fn(),
      posAtCoords: vi.fn(() => 0),
    });

    React.useEffect(() => {
      viewRef.current.state.doc = createDoc(props.value ?? "");
    }, [props.value]);

    React.useEffect(() => {
      props.onCreateEditor?.(viewRef.current, viewRef.current.state);
    }, [props]);

    React.useImperativeHandle(ref, () => ({ view: viewRef.current }), []);

    return (
      <textarea
        data-testid="mock-codemirror"
        data-editor-theme={props.theme ?? ""}
        value={props.value ?? ""}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    );
  });

  return {
    __esModule: true,
    default: MockCodeMirror,
  };
});

vi.mock("../../app/components/OpenAppMenu", () => ({
  OpenAppMenu: () => <div data-testid="open-app-menu" />,
}));

vi.mock("../../../components/FileIcon", () => ({
  default: () => <span data-testid="file-icon" />,
}));

vi.mock("../../../services/tauri", () => ({
  readWorkspaceFile: vi.fn(),
  readExternalSpecFile: vi.fn(),
  readExternalAbsoluteFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
  writeExternalSpecFile: vi.fn(),
  getGitFileFullDiff: vi.fn(),
  getCodeIntelDefinition: vi.fn(),
  getCodeIntelReferences: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeDetachedExternalFileChanges: vi.fn((onEvent: (event: any) => void) => {
    detachedExternalFileChangeListener = onEvent;
    return () => {
      detachedExternalFileChangeListener = null;
    };
  }),
}));

const mermaidInitialize = vi.fn();
const mermaidRender = vi.fn(async (_id: string, source: string) => ({
  svg: `<svg data-mermaid-source="${source.replace(/"/g, "&quot;")}"></svg>`,
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitialize,
    render: mermaidRender,
  },
}));

function buildLocation(path: string, line: number, character: number) {
  return {
    uri: `file:///repo/${path}`,
    path,
    range: {
      start: { line, character },
      end: { line, character: character + 1 },
    },
  };
}

describe("FileViewPanel navigation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockCodeMirrorDispatch.mockReset();
    detachedExternalFileChangeListener = null;
  });

  it("navigates directly when definition has a single target", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}",
      truncated: false,
    });
    vi.mocked(getCodeIntelDefinition).mockResolvedValue({
      result: [buildLocation("src/Foo.java", 9, 2)],
    } as any);
    const onNavigateToLocation = vi.fn();

    render(
      <FileViewPanel
        workspaceId="ws-1"
        workspacePath="/repo"
        filePath="src/Main.java"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onNavigateToLocation={onNavigateToLocation}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    fireEvent.click(screen.getByTitle(/gotoDefinition/i));

    await waitFor(() => {
      expect(getCodeIntelDefinition).toHaveBeenCalled();
      expect(onNavigateToLocation).toHaveBeenCalledWith("src/Foo.java", {
        line: 10,
        column: 3,
      });
    });
  });

  it("shows definition candidates when multiple targets are returned", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}",
      truncated: false,
    });
    vi.mocked(getCodeIntelDefinition).mockResolvedValue({
      result: [
        buildLocation("src/Foo.java", 3, 1),
        buildLocation("src/Bar.java", 12, 6),
      ],
    } as any);
    const onNavigateToLocation = vi.fn();

    render(
      <FileViewPanel
        workspaceId="ws-2"
        workspacePath="/repo"
        filePath="src/Main.java"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onNavigateToLocation={onNavigateToLocation}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    fireEvent.click(screen.getByTitle(/gotoDefinition/i));

    await waitFor(() => {
      expect(screen.getByText("src/Foo.java")).toBeTruthy();
      expect(screen.getByText("src/Bar.java")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("src/Bar.java"));

    expect(onNavigateToLocation).toHaveBeenCalledWith("src/Bar.java", {
      line: 13,
      column: 7,
    });
  });

  it("renders reference list and allows click-through navigation", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}",
      truncated: false,
    });
    vi.mocked(getCodeIntelReferences).mockResolvedValue({
      result: [
        buildLocation("src/Foo.java", 5, 4),
        buildLocation("src/Baz.java", 17, 8),
      ],
    } as any);
    const onNavigateToLocation = vi.fn();

    render(
      <FileViewPanel
        workspaceId="ws-3"
        workspacePath="/repo"
        filePath="src/Main.java"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onNavigateToLocation={onNavigateToLocation}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    fireEvent.click(screen.getByTitle(/findReferences/i));

    await waitFor(() => {
      expect(getCodeIntelReferences).toHaveBeenCalled();
      expect(screen.getByText("src/Foo.java")).toBeTruthy();
      expect(screen.getByText("src/Baz.java")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("src/Baz.java"));

    expect(onNavigateToLocation).toHaveBeenCalledWith("src/Baz.java", {
      line: 18,
      column: 9,
    });
  });

  it("renders maximize toggle and triggers callback", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}",
      truncated: false,
    });
    const onToggleEditorFileMaximized = vi.fn();

    render(
      <FileViewPanel
        workspaceId="ws-4"
        workspacePath="/repo"
        filePath="src/Main.java"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onToggleEditorFileMaximized={onToggleEditorFileMaximized}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    const maximizeButton = screen.getByRole("button", {
      name: /Maximize|menu\.maximize/i,
    });
    fireEvent.click(maximizeButton);
    expect(onToggleEditorFileMaximized).toHaveBeenCalledTimes(1);
  });

  it("double-clicking a file tab toggles maximize callback", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}",
      truncated: false,
    });
    const onToggleEditorFileMaximized = vi.fn();

    render(
      <FileViewPanel
        workspaceId="ws-tab-max"
        workspacePath="/repo"
        filePath="src/Main.java"
        openTabs={["src/Main.java"]}
        activeTabPath="src/Main.java"
        onToggleEditorFileMaximized={onToggleEditorFileMaximized}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    const fileTab = screen.getByRole("tab", { name: "Main.java" });
    fireEvent.doubleClick(fileTab);
    expect(onToggleEditorFileMaximized).toHaveBeenCalledTimes(1);
  });

  it("renders tabs and action buttons in a single header row when requested", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}",
      truncated: false,
    });

    const { container } = render(
      <FileViewPanel
        workspaceId="ws-single-row-header"
        workspacePath="/repo"
        filePath="src/Main.java"
        openTabs={["src/Main.java", "src/Foo.java"]}
        activeTabPath="src/Main.java"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        headerLayout="single-row"
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(container.querySelector(".fvp-header-row")).toBeTruthy();
    expect(container.querySelector(".fvp-topbar")).toBeNull();
    expect(screen.getByRole("tablist", { name: "Open files" })).toBeTruthy();
    expect(screen.getByTitle(/gotoDefinition/i)).toBeTruthy();
  });

  it("prefers provided highlight markers over workspace git diff fetch", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "line 1\nline 2\nline 3",
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-highlight"
        workspacePath="/repo"
        filePath="src/Main.java"
        gitStatusFiles={[
          { path: "src/Main.java", status: "M", additions: 1, deletions: 1 },
        ]}
        highlightMarkers={{ added: [2], modified: [3] }}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    await waitFor(() => {
      expect(getGitFileFullDiff).not.toHaveBeenCalled();
      expect(mockCodeMirrorDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          effects: expect.anything(),
        }),
      );
    });
  });

  it("falls back to workspace git diff fetch when provided highlight markers are empty", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "line 1\nline 2\nline 3",
      truncated: false,
    });
    vi.mocked(getGitFileFullDiff).mockResolvedValue("@@ -1,0 +1,3 @@\n+line 1\n+line 2\n+line 3");

    render(
      <FileViewPanel
        workspaceId="ws-highlight-empty"
        workspacePath="/repo"
        filePath="src/Main.java"
        gitStatusFiles={[
          { path: "src/Main.java", status: "M", additions: 3, deletions: 0 },
        ]}
        highlightMarkers={{ added: [], modified: [] }}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(getGitFileFullDiff).toHaveBeenCalledWith("ws-highlight-empty", "src/Main.java");
  });

  it("normalizes absolute file paths before reading and fetching git diff", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}\n",
      truncated: false,
    });
    vi.mocked(getGitFileFullDiff).mockResolvedValue("@@ -1,1 +1,2 @@\n class Main {}\n+// changed");

    render(
      <FileViewPanel
        workspaceId="ws-absolute-path"
        workspacePath="/repo"
        filePath="/repo/src/Main.java"
        gitStatusFiles={[
          { path: "src/Main.java", status: "M", additions: 1, deletions: 0 },
        ]}
        highlightMarkers={{ added: [], modified: [] }}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(readWorkspaceFile).toHaveBeenCalledWith("ws-absolute-path", "src/Main.java");
    expect(getGitFileFullDiff).toHaveBeenCalledWith("ws-absolute-path", "src/Main.java");
  });

  it("normalizes Windows absolute file paths case-insensitively before reading and fetching git diff", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "class Main {}\n",
      truncated: false,
    });
    vi.mocked(getGitFileFullDiff).mockResolvedValue("@@ -1,1 +1,2 @@\n class Main {}\n+// changed");

    render(
      <FileViewPanel
        workspaceId="ws-windows-absolute-path"
        workspacePath="C:/Users/Chen/Project"
        filePath="c:/users/chen/project/src/Main.java"
        gitStatusFiles={[
          { path: "src/Main.java", status: "M", additions: 1, deletions: 0 },
        ]}
        highlightMarkers={{ added: [], modified: [] }}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(readWorkspaceFile).toHaveBeenCalledWith(
      "ws-windows-absolute-path",
      "src/Main.java",
    );
    expect(getGitFileFullDiff).toHaveBeenCalledWith(
      "ws-windows-absolute-path",
      "src/Main.java",
    );
  });

  it("reads file content via external spec route when path is under custom spec root", async () => {
    vi.mocked(readExternalSpecFile).mockResolvedValue({
      exists: true,
      content: "# External tasks",
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-external-read"
        workspacePath="/repo"
        customSpecRoot="/spec-root"
        filePath="/spec-root/changes/fix/tasks.md"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("file-markdown-preview");
    expect(readExternalSpecFile).toHaveBeenCalledWith(
      "ws-external-read",
      "/spec-root",
      "openspec/changes/fix/tasks.md",
    );
    expect(readWorkspaceFile).not.toHaveBeenCalled();
  });

  it("writes file content via external spec route when editing file under custom spec root", async () => {
    vi.mocked(readExternalSpecFile).mockResolvedValue({
      exists: true,
      content: "line 1",
      truncated: false,
    });
    vi.mocked(writeExternalSpecFile).mockResolvedValue();

    render(
      <FileViewPanel
        workspaceId="ws-external-write"
        workspacePath="/repo"
        customSpecRoot="/spec-root"
        filePath="/spec-root/changes/fix/tasks.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const editor = (await screen.findByTestId("mock-codemirror")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "line 2" } });
    fireEvent.click(screen.getByRole("button", { name: /save|files\.save/i }));

    await waitFor(() => {
      expect(writeExternalSpecFile).toHaveBeenCalledWith(
        "ws-external-write",
        "/spec-root",
        "openspec/changes/fix/tasks.ts",
        "line 2",
      );
    });
    expect(writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("reads file content via external absolute route when path is outside workspace and spec root", async () => {
    vi.mocked(readExternalAbsoluteFile).mockResolvedValue({
      content: "export const external = true;",
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-external-absolute"
        workspacePath="/repo"
        customSpecRoot="/spec-root"
        filePath="/another-project/src/App.tsx"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(readExternalAbsoluteFile).toHaveBeenCalledWith(
      "ws-external-absolute",
      "/another-project/src/App.tsx",
    );
    expect(readWorkspaceFile).not.toHaveBeenCalled();
    expect(readExternalSpecFile).not.toHaveBeenCalled();
  });

  it("keeps external absolute files read-only on save", async () => {
    vi.mocked(readExternalAbsoluteFile).mockResolvedValue({
      content: "const a = 1;",
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-external-absolute-save"
        workspacePath="/repo"
        customSpecRoot="/spec-root"
        filePath="/another-project/src/App.tsx"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const editor = (await screen.findByTestId("mock-codemirror")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "const a = 2;" } });
    fireEvent.click(screen.getByRole("button", { name: /save|files\.save/i }));

    await waitFor(() => {
      expect(writeWorkspaceFile).not.toHaveBeenCalled();
      expect(writeExternalSpecFile).not.toHaveBeenCalled();
    });
  });
});

describe("FileViewPanel markdown modes", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens markdown in preview mode by default", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "# Hello",
      truncated: false,
    });

    const { container } = render(
      <FileViewPanel
        workspaceId="ws-md-1"
        workspacePath="/repo"
        filePath="README.md"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".fvp-preview-scroll")).toBeTruthy();
      expect(screen.getByTestId("file-markdown-preview")).toBeTruthy();
      expect(screen.queryByTestId("mock-codemirror")).toBeNull();
    });
  });

  it("toggles markdown preview and preserves edits", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "# Start",
      truncated: false,
    });

    const { container } = render(
      <FileViewPanel
        workspaceId="ws-md-2"
        workspacePath="/repo"
        filePath="README.md"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const editor = (await screen.findByTestId("mock-codemirror")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# Updated" } });

    fireEvent.click(screen.getByRole("button", { name: /preview/i }));

    await waitFor(() => {
      expect(container.querySelector(".fvp-preview-scroll")).toBeTruthy();
      expect(screen.getByTestId("file-markdown-preview")).toBeTruthy();
      expect(screen.getByText("Updated")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const updatedEditor = (await screen.findByTestId("mock-codemirror")) as HTMLTextAreaElement;
    expect(updatedEditor.value).toBe("# Updated");
  });

  it("renders mermaid blocks lazily with per-block tabs", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "```mermaid\ngraph TD\nA-->B\n```",
      truncated: false,
    });
    mermaidInitialize.mockClear();
    mermaidRender.mockClear();

    render(
      <FileViewPanel
        workspaceId="ws-md-4"
        workspacePath="/repo"
        filePath="README.md"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("file-markdown-preview");
    expect(screen.getByRole("tab", { name: "Source" }).getAttribute("aria-selected")).toBe("true");
    expect(mermaidRender).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Render" }));

    await waitFor(() => {
      expect(screen.getByTestId("file-markdown-mermaid-preview")).toBeTruthy();
      expect(mermaidRender).toHaveBeenCalledTimes(1);
    });
  });

  it("renders frontmatter metadata separately from markdown body", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: [
        "---",
        'name: "OpenSpec: New"',
        "calls_skill: openspec-new-change",
        "tags: [workflow, artifacts, experimental]",
        "---",
        "",
        "# Title",
        "",
        "正文内容",
      ].join("\n"),
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-md-5"
        workspacePath="/repo"
        filePath="new.md"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("file-markdown-preview");
    expect(screen.getByTestId("file-markdown-frontmatter")).toBeTruthy();
    expect(screen.getByText("OpenSpec: New")).toBeTruthy();
    expect(screen.getByText("openspec-new-change")).toBeTruthy();
    expect(screen.getByText("workflow · artifacts · experimental")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
    expect(screen.queryByText(/^name: "OpenSpec: New"/)).toBeNull();
  });

  it("keeps non-markdown preview on the existing code preview path", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "export const value = 1;",
      truncated: false,
    });

    const { container } = render(
      <FileViewPanel
        workspaceId="ws-md-3"
        workspacePath="/repo"
        filePath="src/value.ts"
        initialMode="preview"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".fvp-code-preview")).toBeTruthy();
    });
    expect(screen.queryByTestId("file-markdown-preview")).toBeNull();
  });

  it("opens shell files in edit mode by default", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: [
        "#!/usr/bin/env bash",
        "",
        "# build app",
        "# with cached dependencies",
        "pnpm install --frozen-lockfile",
        "pnpm build",
      ].join("\n"),
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-shell-1"
        workspacePath="/repo"
        filePath="scripts/build.sh"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByTestId("mock-codemirror");
    expect(editor).toBeTruthy();
    expect(screen.queryByTestId("file-structured-preview")).toBeNull();
  });

  it("keeps shell-group compatibility for zsh and dotfile scripts", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: [
        "#!/usr/bin/env zsh",
        "",
        "# setup env",
        "export APP_ENV=dev",
      ].join("\n"),
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-shell-2"
        workspacePath="/repo"
        filePath=".envrc"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    fireEvent.click(screen.getByRole("button", { name: /preview/i }));
    await screen.findByTestId("file-structured-preview");
    expect(screen.getByText("setup env")).toBeTruthy();
    expect(screen.getByText("Commands")).toBeTruthy();
  });

  it("opens Dockerfile in edit mode by default", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: [
        "# production image",
        "FROM node:20-alpine",
        "WORKDIR /app",
        "COPY package.json pnpm-lock.yaml ./",
        "RUN pnpm install --frozen-lockfile \\",
        "  && pnpm store prune",
      ].join("\n"),
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-docker-1"
        workspacePath="/repo"
        filePath="Dockerfile"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(screen.queryByTestId("file-structured-preview")).toBeNull();
  });

  it("keeps structured preview only on the top-level preview path", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: [
        "# production image",
        "FROM node:20-alpine",
        "RUN pnpm install",
      ].join("\n"),
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-docker-2"
        workspacePath="/repo"
        filePath="Dockerfile"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    fireEvent.click(screen.getByRole("button", { name: /preview/i }));

    await screen.findByTestId("file-structured-preview");
    expect(screen.getByText("FROM")).toBeTruthy();
    expect(screen.getByText("node:20-alpine")).toBeTruthy();
  });

  it("does not add structured edit tabs for regular code files", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "export const value = 1;",
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-code-1"
        workspacePath="/repo"
        filePath="src/value.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(screen.queryByRole("tab", { name: "Code" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Render" })).toBeNull();
  });

  it("opens log-like files on the existing text preview path", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "[INFO] started\n[ERROR] failed",
      truncated: false,
    });

    const { container, rerender } = render(
      <FileViewPanel
        workspaceId="ws-log-1"
        workspacePath="/repo"
        filePath="logs/app.log"
        initialMode="preview"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".fvp-code-preview")).toBeTruthy();
    });
    expect(screen.queryByText(/unsupportedFormat/i)).toBeNull();
    expect(screen.queryByTestId("file-markdown-preview")).toBeNull();

    rerender(
      <FileViewPanel
        workspaceId="ws-log-1"
        workspacePath="/repo"
        filePath="logs/worker.trace"
        initialMode="preview"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".fvp-code-preview")).toBeTruthy();
    });

    rerender(
      <FileViewPanel
        workspaceId="ws-log-1"
        workspacePath="/repo"
        filePath="logs/stderr.err"
        initialMode="preview"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".fvp-code-preview")).toBeTruthy();
    });

    rerender(
      <FileViewPanel
        workspaceId="ws-log-1"
        workspacePath="/repo"
        filePath="logs/server.out"
        initialMode="preview"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".fvp-code-preview")).toBeTruthy();
    });
  });
});

describe("FileViewPanel editor theme selection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    delete document.documentElement.dataset.theme;
  });

  it("uses light theme when data-theme is light", async () => {
    document.documentElement.dataset.theme = "light";
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "console.log('hello');",
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-theme-1"
        workspacePath="/repo"
        filePath="src/App.tsx"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByTestId("mock-codemirror");
    expect(editor.getAttribute("data-editor-theme")).toBe("light");
  });

  it("uses dark theme when data-theme is dark", async () => {
    document.documentElement.dataset.theme = "dark";
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "console.log('hello');",
      truncated: false,
    });

    render(
      <FileViewPanel
        workspaceId="ws-theme-2"
        workspacePath="/repo"
        filePath="src/App.tsx"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const editor = await screen.findByTestId("mock-codemirror");
    expect(editor.getAttribute("data-editor-theme")).toBe("dark");
  });
});

describe("FileViewPanel external change awareness in detached mode", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("auto-syncs clean buffer when disk content changes", async () => {
    vi.mocked(readWorkspaceFile)
      .mockResolvedValueOnce({ content: "const value = 1;", truncated: false })
      .mockResolvedValue({ content: "const value = 2;", truncated: false });

    render(
      <FileViewPanel
        workspaceId="ws-ext-clean"
        workspacePath="/repo"
        filePath="src/value.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        externalChangeMonitoringEnabled
        externalChangePollIntervalMs={20}
      />,
    );

    const editor = await screen.findByTestId("mock-codemirror");
    expect((editor as HTMLTextAreaElement).value).toBe("const value = 1;");

    await waitFor(() => {
      expect(screen.getByText("files.externalChangeAutoSynced")).toBeTruthy();
    });
    expect((screen.getByTestId("mock-codemirror") as HTMLTextAreaElement).value)
      .toBe("const value = 2;");
  });

  it("continues polling after the first tick", async () => {
    vi.mocked(readWorkspaceFile)
      .mockResolvedValueOnce({ content: "const value = 1;", truncated: false })
      .mockResolvedValueOnce({ content: "const value = 2;", truncated: false })
      .mockResolvedValue({ content: "const value = 3;", truncated: false });

    render(
      <FileViewPanel
        workspaceId="ws-ext-poll-loop"
        workspacePath="/repo"
        filePath="src/value-loop.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        externalChangeMonitoringEnabled
        externalChangePollIntervalMs={20}
      />,
    );

    await screen.findByTestId("mock-codemirror");

    await waitFor(() => {
      expect((screen.getByTestId("mock-codemirror") as HTMLTextAreaElement).value)
        .toBe("const value = 3;");
      expect(vi.mocked(readWorkspaceFile).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("keeps polling after a read error and recovers on later tick", async () => {
    vi.mocked(readWorkspaceFile)
      .mockResolvedValueOnce({ content: "const value = 1;", truncated: false })
      .mockRejectedValueOnce(new Error("disk temporary failure"))
      .mockResolvedValue({ content: "const value = 2;", truncated: false });

    render(
      <FileViewPanel
        workspaceId="ws-ext-poll-error-recover"
        workspacePath="/repo"
        filePath="src/value-recover.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        externalChangeMonitoringEnabled
        externalChangePollIntervalMs={20}
      />,
    );

    await screen.findByTestId("mock-codemirror");
    await waitFor(() => {
      expect((screen.getByTestId("mock-codemirror") as HTMLTextAreaElement).value)
        .toBe("const value = 2;");
      expect(vi.mocked(readWorkspaceFile).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("shows conflict actions for dirty buffer and can keep local edits", async () => {
    vi.mocked(readWorkspaceFile)
      .mockResolvedValueOnce({ content: "console.log('v1');", truncated: false })
      .mockResolvedValue({ content: "console.log('v2');", truncated: false });

    render(
      <FileViewPanel
        workspaceId="ws-ext-dirty"
        workspacePath="/repo"
        filePath="src/app.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        externalChangeMonitoringEnabled
        externalChangePollIntervalMs={20}
      />,
    );

    const editor = await screen.findByTestId("mock-codemirror");
    fireEvent.change(editor, { target: { value: "console.log('local');" } });

    await waitFor(() => {
      expect(screen.getByText("files.externalChangeConflictTitle")).toBeTruthy();
      expect(screen.getByText("files.externalChangeKeepLocal")).toBeTruthy();
    });
    expect((screen.getByTestId("mock-codemirror") as HTMLTextAreaElement).value)
      .toBe("console.log('local');");

    fireEvent.click(screen.getByText("files.externalChangeKeepLocal"));
    await waitFor(() => {
      expect(screen.queryByText("files.externalChangeConflictTitle")).toBeNull();
    });
  });

  it("reloads disk content when user chooses reload action", async () => {
    vi.mocked(readWorkspaceFile)
      .mockResolvedValueOnce({ content: "line-a", truncated: false })
      .mockResolvedValue({ content: "line-b", truncated: false });

    render(
      <FileViewPanel
        workspaceId="ws-ext-reload"
        workspacePath="/repo"
        filePath="src/reload.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        externalChangeMonitoringEnabled
        externalChangePollIntervalMs={20}
      />,
    );

    const editor = await screen.findByTestId("mock-codemirror");
    fireEvent.change(editor, { target: { value: "line-local" } });

    await waitFor(() => {
      expect(screen.getByText("files.externalChangeReload")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("files.externalChangeReload"));

    await waitFor(() => {
      expect((screen.getByTestId("mock-codemirror") as HTMLTextAreaElement).value).toBe("line-b");
    });
  });

  it("applies watcher-driven external change events when watcher mode is enabled", async () => {
    vi.mocked(readWorkspaceFile)
      .mockResolvedValueOnce({ content: "const watcher = 1;", truncated: false })
      .mockResolvedValue({ content: "const watcher = 2;", truncated: false });

    render(
      <FileViewPanel
        workspaceId="ws-ext-watcher"
        workspacePath="/repo"
        filePath="src/watcher.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        externalChangeMonitoringEnabled
        externalChangeTransportMode="watcher"
      />,
    );

    await screen.findByTestId("mock-codemirror");
    expect(vi.mocked(subscribeDetachedExternalFileChanges)).toHaveBeenCalled();
    detachedExternalFileChangeListener?.({
      workspaceId: "ws-ext-watcher",
      normalizedPath: "src/watcher.ts",
      detectedAtMs: Date.now(),
      source: "watcher",
      eventKind: "modify(data)",
      platform: "macos",
    });

    await waitFor(() => {
      expect((screen.getByTestId("mock-codemirror") as HTMLTextAreaElement).value)
        .toBe("const watcher = 2;");
    });
  });

  it("reconciles watcher mode on startup even without incoming events", async () => {
    vi.mocked(readWorkspaceFile)
      .mockResolvedValueOnce({ content: "const startup = 1;", truncated: false })
      .mockResolvedValue({ content: "const startup = 2;", truncated: false });

    render(
      <FileViewPanel
        workspaceId="ws-ext-watcher-startup"
        workspacePath="/repo"
        filePath="src/startup.ts"
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        onClose={vi.fn()}
        externalChangeMonitoringEnabled
        externalChangeTransportMode="watcher"
      />,
    );

    await screen.findByTestId("mock-codemirror");
    await waitFor(() => {
      expect(vi.mocked(readWorkspaceFile).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect((screen.getByTestId("mock-codemirror") as HTMLTextAreaElement).value)
        .toBe("const startup = 2;");
    });
  });
});
