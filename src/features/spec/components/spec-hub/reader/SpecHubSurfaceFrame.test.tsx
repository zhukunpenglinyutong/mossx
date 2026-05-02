/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpecHubSurfaceFrame } from "./SpecHubSurfaceFrame";

const layoutStore = new Map<string, unknown>();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "specHub.changePane.collapse": "Collapse changes pane",
          "specHub.changePane.expand": "Expand changes pane",
          "specHub.readerOutline.title": "Reader Outline",
          "specHub.readerOutline.empty": "No structure",
          "specHub.readerOutline.expand": "Expand reader outline",
          "specHub.readerOutline.collapse": "Collapse reader outline",
          "specHub.readerOutline.linkedSpecs": "Linked Specs",
          "specHub.openInWindow": "Open in Window",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("../../../../../services/clientStorage", () => ({
  getClientStoreSync: (_store: string, key: string) => layoutStore.get(key),
  writeClientStoreValue: (_store: string, key: string, value: unknown) => {
    layoutStore.set(key, value);
  },
}));

vi.mock("../../../detachedSpecHub", () => ({
  buildDetachedSpecHubSession: vi.fn((session) => ({
    ...session,
    updatedAt: 1,
  })),
  openOrFocusDetachedSpecHub: vi.fn(async () => "created"),
  writeDetachedSpecHubSessionSnapshot: vi.fn(),
}));

function ReaderScaffold() {
  return (
    <section className="spec-hub">
      <div className="spec-hub-grid">
        <section className="spec-hub-changes">
          <header className="spec-hub-panel-header">
            <div className="spec-hub-panel-title">Changes</div>
          </header>
        </section>
        <section className="spec-hub-artifacts">
          <header className="spec-hub-panel-header">
            <div className="spec-hub-panel-title">Artifacts</div>
          </header>
          <div className="spec-hub-tabs">
            <button type="button" role="tab" aria-selected="false">
              Proposal
            </button>
            <button type="button" role="tab" aria-selected="false">
              Design
            </button>
            <button type="button" role="tab" aria-selected="false">
              Specs
            </button>
            <button type="button" role="tab" aria-selected="true">
              Tasks
            </button>
            <button type="button" role="tab" aria-selected="false">
              Verification
            </button>
          </div>
          <div className="spec-hub-artifact-path">openspec/changes/change-1/tasks.md</div>
          <div className="spec-hub-artifact-content">
            <div className="spec-hub-artifact-body">
              <div className="spec-hub-task-heading level-2">4. 前端菜单接线与提示语义 (P0)</div>
              <label className="spec-hub-task-row">
                <input className="spec-hub-task-checkbox" type="checkbox" checked readOnly />
                <span className="spec-hub-task-text">4.1 已完成</span>
              </label>
              <div className="spec-hub-task-heading level-2">5. 自动化回归测试 (P0)</div>
              <label className="spec-hub-task-row">
                <input className="spec-hub-task-checkbox" type="checkbox" readOnly />
                <span className="spec-hub-task-text">5.2 未完成</span>
              </label>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

describe("SpecHubSurfaceFrame", () => {
  beforeEach(() => {
    layoutStore.clear();
    vi.clearAllMocks();
  });

  it("marks task outline sections that still contain unchecked checklist items", async () => {
    render(
      <SpecHubSurfaceFrame
        workspaceId="ws-1"
        workspaceName="Workspace One"
        files={["openspec/changes/change-1/tasks.md"]}
        directories={["openspec"]}
        onBackToChat={() => {}}
      >
        <ReaderScaffold />
      </SpecHubSurfaceFrame>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Expand reader outline" }));

    await waitFor(() => {
      expect(screen.getByText("Reader Outline")).not.toBeNull();
    });

    const pendingSectionButton = screen.getByRole("button", {
      name: "5. 自动化回归测试 (P0)",
    });
    expect(pendingSectionButton.classList.contains("is-pending")).toBe(true);
    expect(pendingSectionButton.querySelector(".spec-hub-reader-outline-pending-dot")).not.toBeNull();

    const completedSectionButton = screen.getByRole("button", {
      name: "4. 前端菜单接线与提示语义 (P0)",
    });
    expect(completedSectionButton.classList.contains("is-pending")).toBe(false);
  });
});
