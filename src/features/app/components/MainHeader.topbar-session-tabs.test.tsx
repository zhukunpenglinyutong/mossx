// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MainHeader } from "./MainHeader";
import { TopbarSessionTabs } from "./TopbarSessionTabs";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

const workspace = {
  id: "w1",
  name: "Workspace 1",
  path: "/tmp/w1",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

function renderHeaderWithWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
  const onExtraAction = vi.fn();
  const onSelectThread = vi.fn();

  render(
    <MainHeader
      workspace={workspace}
      openTargets={[]}
      openAppIconById={{}}
      selectedOpenAppId=""
      onSelectOpenAppId={() => {}}
      branchName="main"
      branches={[{ name: "main", lastCommit: Date.now() }]}
      onCheckoutBranch={() => {}}
      onCreateBranch={() => {}}
      sessionTabsNode={
        <TopbarSessionTabs
          ariaLabel="topbar tabs"
          onSelectThread={onSelectThread}
          onCloseThread={vi.fn()}
          onShowTabMenu={vi.fn()}
          tabs={[
            {
              workspaceId: "w2",
              threadId: "t1",
              label: "Session A",
              displayLabel: "Sess...",
              engineType: "codex",
              engineLabel: "Codex",
              isActive: false,
            },
            {
              workspaceId: "w1",
              threadId: "t2",
              label: "Session B",
              displayLabel: "Sess...",
              engineType: "claude",
              engineLabel: "Claude",
              isActive: true,
            },
          ]}
        />
      }
      extraActionsNode={
        <button type="button" onClick={onExtraAction} data-testid="extra-action">
          extra action
        </button>
      }
    />,
  );

  return { onExtraAction, onSelectThread };
}

describe("MainHeader topbar session tabs integration", () => {
  afterEach(() => {
    cleanup();
  });

  it.each([1280, 1024, 800])(
    "keeps active tab visible and actions clickable at width %d",
    (width) => {
      const { onExtraAction, onSelectThread } = renderHeaderWithWidth(width);
      expect(screen.getByRole("tab", { name: "Claude · Session B" })).toBeTruthy();
      fireEvent.click(screen.getByTestId("extra-action"));
      expect(onExtraAction).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("tab", { name: "Codex · Session A" }));
      expect(onSelectThread).toHaveBeenCalledWith("w2", "t1");
    },
  );
});
