import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

import { getClientStoreSync } from "../../../services/clientStorage";
import { loadKanbanData } from "./kanbanStorage";

describe("kanbanStorage compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads legacy tasks without schedule metadata", () => {
    vi.mocked(getClientStoreSync).mockReturnValue({
      panels: [
        {
          id: "panel-1",
          workspaceId: "/workspace",
          name: "Default",
          sortOrder: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tasks: [
        {
          id: "task-1",
          workspaceId: "/workspace",
          panelId: "panel-1",
          title: "Legacy",
          description: "",
          status: "todo",
          engineType: "claude",
          modelId: null,
          branchName: "main",
          images: [],
          autoStart: false,
          sortOrder: 1,
          threadId: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    } as any);

    const data = loadKanbanData();
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]?.schedule).toBeUndefined();
    expect(data.tasks[0]?.chain).toBeUndefined();
    expect(data.tasks[0]?.execution).toBeUndefined();
  });

  it("normalizes execution startedAt/finishedAt from persisted tasks", () => {
    vi.mocked(getClientStoreSync).mockReturnValue({
      panels: [
        {
          id: "panel-1",
          workspaceId: "/workspace",
          name: "Default",
          sortOrder: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tasks: [
        {
          id: "task-1",
          workspaceId: "/workspace",
          panelId: "panel-1",
          title: "Task",
          description: "",
          status: "testing",
          engineType: "claude",
          modelId: null,
          branchName: "main",
          images: [],
          autoStart: false,
          sortOrder: 1,
          threadId: "thread-1",
          chain: {
            groupId: "chain-1",
            previousTaskId: "task-0",
            groupCode: "128",
          },
          execution: {
            lastSource: "scheduled",
            startedAt: 1000,
            finishedAt: 2000,
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    } as any);

    const data = loadKanbanData();
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]?.execution?.startedAt).toBe(1000);
    expect(data.tasks[0]?.execution?.finishedAt).toBe(2000);
    expect(data.tasks[0]?.chain?.groupCode).toBe("128");
  });

  it("normalizes bounded latest run summary without loading full run history into task data", () => {
    vi.mocked(getClientStoreSync).mockReturnValue({
      panels: [
        {
          id: "panel-1",
          workspaceId: "/workspace",
          name: "Default",
          sortOrder: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tasks: [
        {
          id: "task-1",
          workspaceId: "/workspace",
          panelId: "panel-1",
          title: "Task",
          description: "",
          status: "testing",
          engineType: "codex",
          modelId: null,
          branchName: "main",
          images: [],
          autoStart: false,
          sortOrder: 1,
          threadId: "thread-1",
          latestRunSummary: {
            runId: "run-1",
            status: "completed",
            trigger: "scheduled",
            engine: "codex",
            linkedThreadId: "thread-1",
            latestOutputSummary: "Done",
            artifactCount: 2,
            updatedAt: 2000,
            finishedAt: 2000,
          },
          taskRuns: [{ runId: "should-not-survive" }],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    } as any);

    const data = loadKanbanData();

    expect(data.tasks[0]?.latestRunSummary).toMatchObject({
      runId: "run-1",
      status: "completed",
      trigger: "scheduled",
      artifactCount: 2,
    });
    expect(data.tasks[0]).not.toHaveProperty("taskRuns");
  });
});
