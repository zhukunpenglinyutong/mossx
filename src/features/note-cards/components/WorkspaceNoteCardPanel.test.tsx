/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceNoteCardPanel } from "./WorkspaceNoteCardPanel";
import { noteCardsFacade } from "../services/noteCardsFacade";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === "noteCards.storageHint") {
        return `storage:${String(params?.path ?? "")}`;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
}));

vi.mock("../../../services/tauri", () => ({
  pickImageFiles: vi.fn(async () => []),
}));

vi.mock("../../../components/common/ImagePreviewOverlay", () => ({
  ImagePreviewOverlay: () => null,
}));

vi.mock("../../../components/common/LocalImage", () => ({
  LocalImage: () => null,
}));

vi.mock("../../messages/components/Markdown", () => ({
  Markdown: ({ value }: { value: string }) => <div data-testid="note-card-markdown">{value}</div>,
}));

vi.mock("../../../components/common/RichTextInput/RichTextInput", () => ({
  RichTextInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      data-testid="workspace-note-card-rich-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("../services/noteCardsFacade", () => ({
  noteCardsFacade: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("WorkspaceNoteCardPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(noteCardsFacade.list).mockResolvedValue({
      items: [
        {
          id: "note-1",
          title: "发布清单",
          plainTextExcerpt: "先构建再发布",
          bodyMarkdown: "先构建再发布",
          updatedAt: 1,
          createdAt: 1,
          archived: false,
          imageCount: 0,
          previewAttachments: [],
        },
      ],
      total: 1,
    } as never);
    vi.mocked(noteCardsFacade.get).mockResolvedValue({
      id: "note-1",
      workspaceId: "ws-1",
      workspaceName: "demo",
      workspacePath: "/tmp/demo",
      projectName: "demo",
      title: "发布清单",
      bodyMarkdown: "先构建再发布",
      plainTextExcerpt: "先构建再发布",
      attachments: [],
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
    } as never);
  });

  async function flushListLoad() {
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });
  }

  it("starts with capture editor collapsed and expands on plus", async () => {
    render(
      <WorkspaceNoteCardPanel
        workspaceId="ws-1"
        workspaceName="demo"
        workspacePath="/tmp/demo"
      />,
    );

    await flushListLoad();
    vi.useRealTimers();

    expect(screen.queryByTestId("workspace-note-card-rich-input")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "noteCards.new" }));

    await waitFor(() => {
      expect(screen.queryByTestId("workspace-note-card-rich-input")).not.toBeNull();
    });
  });

  it("expands the editor when selecting a note card", async () => {
    render(
      <WorkspaceNoteCardPanel
        workspaceId="ws-1"
        workspaceName="demo"
        workspacePath="/tmp/demo"
      />,
    );

    await flushListLoad();
    vi.useRealTimers();

    expect(screen.queryByTestId("workspace-note-card-rich-input")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /发布清单/ }));

    await waitFor(() => {
      expect(screen.queryByTestId("workspace-note-card-rich-input")).not.toBeNull();
    });
    expect(noteCardsFacade.get).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "note-1",
        workspaceId: "ws-1",
      }),
    );
  });

  it("clears stale draft state when the workspace scope changes", async () => {
    const view = render(
      <WorkspaceNoteCardPanel
        workspaceId="ws-1"
        workspaceName="demo"
        workspacePath="/tmp/demo"
      />,
    );

    await flushListLoad();
    vi.useRealTimers();

    fireEvent.click(screen.getByRole("button", { name: /发布清单/ }));

    await waitFor(() => {
      expect(
        (screen.getByTestId("workspace-note-card-rich-input") as HTMLTextAreaElement).value,
      ).toBe("先构建再发布");
    });

    view.rerender(
      <WorkspaceNoteCardPanel
        workspaceId={null}
        workspaceName={null}
        workspacePath={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "noteCards.new" }));

    await waitFor(() => {
      expect(
        (screen.getByTestId("workspace-note-card-rich-input") as HTMLTextAreaElement).value,
      ).toBe("");
    });
  });
});
