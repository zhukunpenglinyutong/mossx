// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorktreePrompt } from "./WorktreePrompt";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      if (key === "workspace.createWorktreeUnder") {
        return `Create a worktree under "${vars?.name ?? ""}".`;
      }
      const dict: Record<string, string> = {
        "workspace.newWorktreeAgent": "New worktree agent",
        "workspace.noviceGuideTitle": "Beginner quick guide (with examples)",
        "workspace.noviceGuideSubtitle":
          "No need to memorize commands. Follow the examples on the left.",
        "workspace.noviceGuideBranch":
          "Branch name: the new branch you are creating. Example: feat/login-page.",
        "workspace.noviceGuideBaseBranch":
          "Base branch: where your new branch starts from. Choose from dropdown only. Example: upstream/main.",
        "workspace.noviceGuideBasePreview":
          "Base preview: confirms the exact start point commit. Example: upstream/main @ 0c098bb3.",
        "workspace.noviceGuidePublish":
          "Publish switch: if enabled, it pushes your new branch to origin automatically.",
        "workspace.noviceGuideSetupScript":
          "Worktree setup script: runs once after creation, e.g. pnpm install.",
        "workspace.noviceGuideCancel": "Cancel: closes this dialog and creates nothing.",
        "workspace.noviceGuideCreate":
          "Create: creates the worktree using your selected base branch.",
        "workspace.branchName": "Branch name",
        "workspace.branchNameHint":
          "Example: feat/login-page or fix/token-refresh-timeout",
        "workspace.baseBranch": "Base branch",
        "workspace.baseBranchHint":
          "Pick one base branch from the dropdown. Example: upstream/main",
        "workspace.baseBranchPlaceholder": "Please select",
        "workspace.baseBranchPlaceholderError":
          "Please choose a base branch from the dropdown first.",
        "workspace.baseBranchLoading": "Loading base branches...",
        "workspace.basePreview": "Base preview",
        "workspace.basePreviewUnavailable": "No base branch selected",
        "workspace.basePreviewHint":
          "This shows the exact commit your worktree will start from.",
        "workspace.nonGitRepositoryError":
          "This project is not a Git repository yet. Initialize Git first (`git init`) before creating a worktree.",
        "workspace.nonGitRepositoryGuideTitle": "Initialize Git First",
        "workspace.nonGitRepositoryGuideDescription":
          "Run the 3 commands below in your project root, then return to this dialog to continue.",
        "workspace.nonGitRepositoryAlertTitle":
          "Cannot create worktree: current folder is not a Git repository",
        "workspace.nonGitRepositoryAlertDescription":
          "Detected that `/tmp/repo` does not have Git metadata (.git). Please initialize Git and create at least one initial commit.",
        "workspace.nonGitRepositoryAlertHint":
          "Suggested flow: `git init` -> `git add . && git commit -m \"chore: init repository\"` -> return and create worktree.",
        "workspace.nonGitRepositoryTechnicalDetail":
          "Technical detail (for troubleshooting)",
        "workspace.basePreviewSourceUnknown": "source pending",
        "workspace.basePreviewCommitUnavailable": "commit unknown",
        "workspace.baseBranchGroup.local": "local",
        "workspace.baseBranchGroup.origin": "origin",
        "workspace.baseBranchGroup.upstream": "upstream",
        "workspace.baseBranchGroup.remote": "remote",
        "workspace.publishToOrigin": "Push to origin and set tracking after create",
        "workspace.publishToOriginHint":
          "When enabled, runs: git push -u origin <branch>",
        "workspace.worktreeSetupScript": "Worktree setup script",
        "workspace.worktreeSetupScriptHint":
          "Runs once in a dedicated terminal after each new worktree is created.",
        "workspace.worktreePublishRetryCommandLabel": "Retry command",
        "workspace.actionsHint":
          "Tip: Cancel makes no changes. Create runs with your selected branch and base branch.",
        "common.cancel": "Cancel",
        "common.create": "Create",
      };
      return dict[key] ?? key;
    },
  }),
}));

describe("WorktreePrompt", () => {
  it("renders dropdown-only base branch with placeholder and beginner guide", () => {
    render(
      <WorktreePrompt
        workspaceName="codemoss"
        branch="feat/demo"
        baseRef=""
        baseRefOptions={[
          { name: "upstream/main", group: "upstream", shortSha: "0c098bb3" },
          { name: "origin/main", group: "origin", shortSha: "1a2b3c4d" },
        ]}
        publishToOrigin
        setupScript="pnpm install"
        onChange={() => {}}
        onBaseRefChange={() => {}}
        onPublishToOriginChange={() => {}}
        onSetupScriptChange={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    const baseSelect = screen.getByLabelText("Base branch") as HTMLSelectElement;
    expect(baseSelect).toBeTruthy();
    expect(baseSelect.value).toBe("");
    expect(screen.getByRole("option", { name: "Please select" })).toBeTruthy();
    expect(
      screen.getByText("Beginner quick guide (with examples)"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Branch name: the new branch you are creating. Example: feat/login-page.",
      ),
    ).toBeTruthy();
  });

  it("shows non-git repository guidance when workspace is not a git repo", () => {
    render(
      <WorktreePrompt
        workspaceName="codemoss"
        workspacePath="/tmp/repo"
        branch="feat/demo"
        baseRef=""
        baseRefOptions={[]}
        isNonGitRepository
        nonGitRepositoryRawError="could not find repository at '/tmp/repo'; class=Repository (6); code=NotFound (-3)"
        publishToOrigin
        setupScript="pnpm install"
        onChange={() => {}}
        onBaseRefChange={() => {}}
        onPublishToOriginChange={() => {}}
        onSetupScriptChange={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(
      screen.getByText("Cannot create worktree: current folder is not a Git repository"),
    ).toBeTruthy();
    expect(screen.getByText("Initialize Git First")).toBeTruthy();
    expect(screen.getByText("Technical detail (for troubleshooting)")).toBeTruthy();
    expect(screen.getByText(/class=Repository/)).toBeTruthy();
  });

  it("shows retry command for recoverable publish failure", () => {
    render(
      <WorktreePrompt
        workspaceName="codemoss"
        branch="feat/demo"
        baseRef="upstream/main"
        baseRefOptions={[{ name: "upstream/main", group: "upstream", shortSha: "0c098bb3" }]}
        publishToOrigin
        setupScript=""
        error="Local worktree created, but publish failed."
        errorRetryCommand="git -C /tmp/repo push -u origin feat/demo"
        onChange={() => {}}
        onBaseRefChange={() => {}}
        onPublishToOriginChange={() => {}}
        onSetupScriptChange={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText("Retry command")).toBeTruthy();
    expect(
      screen.getByText("git -C /tmp/repo push -u origin feat/demo"),
    ).toBeTruthy();
  });
});
