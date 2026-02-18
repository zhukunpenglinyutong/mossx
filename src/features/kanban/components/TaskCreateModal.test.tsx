/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineStatus } from "../../../types";
import { generateThreadTitle } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { TaskCreateModal } from "./TaskCreateModal";

vi.mock("../../../services/tauri", async () => {
  const actual = await vi.importActual<typeof import("../../../services/tauri")>(
    "../../../services/tauri",
  );
  return {
    ...actual,
    pickImageFiles: vi.fn().mockResolvedValue([]),
    generateThreadTitle: vi.fn(),
  };
});

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

const engineStatuses: EngineStatus[] = [
  {
    engineType: "claude",
    installed: true,
    version: "1.0.0",
    binPath: "/usr/local/bin/claude",
    features: {
      streaming: true,
      reasoning: true,
      toolUse: true,
      imageInput: true,
      sessionContinuation: true,
    },
    models: [
      {
        id: "claude-sonnet",
        displayName: "Claude Sonnet",
        description: "Default model",
        isDefault: true,
      },
    ],
    error: null,
  },
];

describe("TaskCreateModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens correctly after an initial closed render", () => {
    const props = {
      workspaceId: "ws-1",
      workspaceBackendId: "ws-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { container, rerender } = render(
      <TaskCreateModal {...props} isOpen={false} />,
    );

    expect(container.querySelector(".kanban-task-modal")).toBeNull();

    expect(() => {
      rerender(<TaskCreateModal {...props} isOpen />);
    }).not.toThrow();

    expect(container.querySelector(".kanban-task-modal")).not.toBeNull();
  });

  it("uses backend workspace id for title generation", async () => {
    vi.mocked(generateThreadTitle).mockResolvedValue("Generated Title");

    const props = {
      workspaceId: "/tmp/workspace",
      workspaceBackendId: "workspace-uuid-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { getByPlaceholderText, getByTitle, getByDisplayValue } = render(
      <TaskCreateModal {...props} isOpen />,
    );

    fireEvent.change(
      getByPlaceholderText("kanban.task.descPlaceholder"),
      { target: { value: "fix login bug" } },
    );

    fireEvent.click(getByTitle("kanban.task.generateTitle"));

    await waitFor(() => {
      expect(generateThreadTitle).toHaveBeenCalledWith(
        "workspace-uuid-1",
        "temp-title-gen",
        "fix login bug",
        "en",
      );
    });

    expect(getByDisplayValue("Generated Title")).toBeTruthy();
    expect(pushErrorToast).not.toHaveBeenCalled();
  });

  it("shows timeout toast when title generation exceeds 15s", async () => {
    vi.useFakeTimers();
    vi.mocked(generateThreadTitle).mockImplementation(
      () => new Promise(() => {}),
    );

    const props = {
      workspaceId: "/tmp/workspace",
      workspaceBackendId: "workspace-uuid-1",
      panelId: "panel-1",
      defaultStatus: "todo" as const,
      engineStatuses,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    };

    const { getByPlaceholderText, getByTitle } = render(
      <TaskCreateModal {...props} isOpen />,
    );

    fireEvent.change(
      getByPlaceholderText("kanban.task.descPlaceholder"),
      { target: { value: "fix login bug" } },
    );

    fireEvent.click(getByTitle("kanban.task.generateTitle"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001);
    });

    expect(pushErrorToast).toHaveBeenCalledWith({
      title: "kanban.task.generateTitleFailed",
      message: "kanban.task.generateTitleTimeout",
    });
  });
});
