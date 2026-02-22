// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorktreeCreateResultDialog } from "./WorktreeCreateResultDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "workspace.worktreeCreateResultTitle": "Worktree Creation Result",
        "workspace.worktreeResultWarningSubtitle":
          "Local creation succeeded, but remote publish needs manual follow-up.",
        "workspace.worktreeResultSuccessSubtitle":
          "Local and remote status are summarized for quick confirmation.",
        "workspace.worktreeResultErrorTitle": "Critical Warning",
        "workspace.worktreePublishRetryCommandLabel": "Retry command",
        "workspace.copyCommand": "Copy command",
        "messages.copied": "Copied!",
        "common.ok": "OK",
      };
      return dict[key] ?? key;
    },
  }),
}));

describe("WorktreeCreateResultDialog", () => {
  it("renders warning state with retry command and close action", () => {
    const onClose = vi.fn();

    render(
      <WorktreeCreateResultDialog
        result={{
          kind: "warning",
          createdMessage: "Worktree created locally: feat/demo",
          statusMessage: null,
          errorMessage: "Local worktree was created, but remote publish failed.",
          retryCommand: "git -C /tmp/repo push -u origin feat/demo",
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Worktree Creation Result")).toBeTruthy();
    expect(screen.getByText("Critical Warning")).toBeTruthy();
    expect(screen.getByText("Retry command")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
