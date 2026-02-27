import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSpecActions,
  buildSpecGateState,
  buildSpecWorkspaceSnapshot,
  evaluateOpenSpecChangePreflight,
  initializeOpenSpecWorkspace,
  loadSpecProjectInfo,
  loadSpecArtifacts,
  runSpecAction,
  saveSpecProjectInfo,
  updateSpecTaskChecklist,
} from "./runtime";

vi.mock("../../services/tauri", () => ({
  listExternalSpecTree: vi.fn(),
  readExternalSpecFile: vi.fn(),
  readWorkspaceFile: vi.fn(),
  runSpecCommand: vi.fn(),
  runWorkspaceCommand: vi.fn(),
  writeExternalSpecFile: vi.fn(),
  writeWorkspaceFile: vi.fn(),
}));

import {
  listExternalSpecTree,
  readExternalSpecFile,
  readWorkspaceFile,
  runSpecCommand,
  runWorkspaceCommand,
  writeExternalSpecFile,
  writeWorkspaceFile,
} from "../../services/tauri";

const mockListExternalSpecTree = vi.mocked(listExternalSpecTree);
const mockReadExternalSpecFile = vi.mocked(readExternalSpecFile);
const mockReadWorkspaceFile = vi.mocked(readWorkspaceFile);
const mockRunSpecCommand = vi.mocked(runSpecCommand);
const mockRunWorkspaceCommand = vi.mocked(runWorkspaceCommand);
const mockWriteExternalSpecFile = vi.mocked(writeExternalSpecFile);
const mockWriteWorkspaceFile = vi.mocked(writeWorkspaceFile);

function mockDoctorHealthy() {
  mockRunWorkspaceCommand.mockImplementation(async (_workspaceId, command) => {
    const program = command[0] ?? "";
    if (program === "node") {
      return {
        command,
        exitCode: 0,
        success: true,
        stdout: "v20.11.0",
        stderr: "",
      };
    }
    if (program === "openspec") {
      return {
        command,
        exitCode: 0,
        success: true,
        stdout: "0.6.0",
        stderr: "",
      };
    }
    if (program === "specify" || program === "spec-kit") {
      return {
        command,
        exitCode: 1,
        success: false,
        stdout: "",
        stderr: "not found",
      };
    }
    return {
      command,
      exitCode: 0,
      success: true,
      stdout: "",
      stderr: "",
    };
  });
}

describe("spec runtime", () => {
  beforeEach(() => {
    mockListExternalSpecTree.mockReset();
    mockReadExternalSpecFile.mockReset();
    mockReadWorkspaceFile.mockReset();
    mockRunSpecCommand.mockReset();
    mockRunWorkspaceCommand.mockReset();
    mockWriteExternalSpecFile.mockReset();
    mockWriteWorkspaceFile.mockReset();
  });

  it("builds openspec snapshot with implementing status", async () => {
    mockDoctorHealthy();
    mockReadWorkspaceFile.mockResolvedValue({
      content: "## Tasks\n- [x] 1\n- [ ] 2\n",
      truncated: false,
    });

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-1",
      mode: "managed",
      directories: [
        "openspec",
        "openspec/changes",
        "openspec/changes/add-spec-hub",
        "openspec/changes/add-spec-hub/specs",
      ],
      files: [
        "openspec/changes/add-spec-hub/proposal.md",
        "openspec/changes/add-spec-hub/design.md",
        "openspec/changes/add-spec-hub/tasks.md",
        "openspec/changes/add-spec-hub/specs/spec-platform/spec.md",
      ],
    });

    expect(snapshot.provider).toBe("openspec");
    expect(snapshot.supportLevel).toBe("full");
    expect(snapshot.environment.status).toBe("degraded");
    expect(snapshot.changes).toHaveLength(1);
    expect(snapshot.changes[0]?.status).toBe("implementing");
  });

  it("skips archived tasks reads when building snapshot", async () => {
    mockDoctorHealthy();
    mockReadWorkspaceFile.mockResolvedValue({
      content: "## Tasks\n- [x] 1\n- [ ] 2\n",
      truncated: false,
    });

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-archive-skip-tasks",
      mode: "managed",
      directories: [
        "openspec",
        "openspec/changes",
        "openspec/changes/add-spec-hub",
        "openspec/changes/add-spec-hub/specs",
        "openspec/changes/archive",
        "openspec/changes/archive/2026-02-01-old-change",
        "openspec/changes/archive/2026-02-01-old-change/specs",
      ],
      files: [
        "openspec/changes/add-spec-hub/proposal.md",
        "openspec/changes/add-spec-hub/design.md",
        "openspec/changes/add-spec-hub/tasks.md",
        "openspec/changes/add-spec-hub/specs/spec-platform/spec.md",
        "openspec/changes/archive/2026-02-01-old-change/proposal.md",
        "openspec/changes/archive/2026-02-01-old-change/design.md",
        "openspec/changes/archive/2026-02-01-old-change/tasks.md",
        "openspec/changes/archive/2026-02-01-old-change/specs/spec-platform/spec.md",
      ],
    });

    const archived = snapshot.changes.find((entry) => entry.id === "2026-02-01-old-change");
    expect(archived?.status).toBe("archived");
    expect(mockReadWorkspaceFile).toHaveBeenCalledWith(
      "ws-archive-skip-tasks",
      "openspec/changes/add-spec-hub/tasks.md",
    );
    expect(mockReadWorkspaceFile).not.toHaveBeenCalledWith(
      "ws-archive-skip-tasks",
      "openspec/changes/archive/2026-02-01-old-change/tasks.md",
    );
  });

  it("sorts changes by date hints found anywhere in change id", async () => {
    mockDoctorHealthy();
    mockReadWorkspaceFile.mockResolvedValue({
      content: "## Tasks\n- [x] done\n",
      truncated: false,
    });

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-sort-anywhere",
      mode: "managed",
      directories: [
        "openspec",
        "openspec/changes",
        "openspec/changes/fix-gate-2026-02-10",
        "openspec/changes/fix-gate-2026-02-10/specs",
        "openspec/changes/2026-02-09-legacy-order",
        "openspec/changes/2026-02-09-legacy-order/specs",
      ],
      files: [
        "openspec/changes/fix-gate-2026-02-10/proposal.md",
        "openspec/changes/fix-gate-2026-02-10/design.md",
        "openspec/changes/fix-gate-2026-02-10/tasks.md",
        "openspec/changes/fix-gate-2026-02-10/specs/spec-platform/spec.md",
        "openspec/changes/2026-02-09-legacy-order/proposal.md",
        "openspec/changes/2026-02-09-legacy-order/design.md",
        "openspec/changes/2026-02-09-legacy-order/tasks.md",
        "openspec/changes/2026-02-09-legacy-order/specs/spec-platform/spec.md",
      ],
    });

    expect(snapshot.changes).toHaveLength(2);
    expect(snapshot.changes[0]?.id).toBe("fix-gate-2026-02-10");
    expect(snapshot.changes[1]?.id).toBe("2026-02-09-legacy-order");
  });

  it("adds archive preflight blocker when delta modifies a missing target spec", async () => {
    mockDoctorHealthy();
    mockReadWorkspaceFile.mockImplementation(async (_workspaceId, path) => {
      if (path.endsWith("/tasks.md")) {
        return { content: "## Tasks\n- [x] 1\n", truncated: false };
      }
      if (path.endsWith("/specs/composer-manual-memory-reference/spec.md")) {
        return {
          content: "# delta\n\n## MODIFIED Requirements\n\n### Requirement: x",
          truncated: false,
        };
      }
      return { content: "", truncated: false };
    });

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-archive-preflight",
      mode: "managed",
      directories: [
        "openspec",
        "openspec/changes",
        "openspec/changes/add-spec-hub",
        "openspec/changes/add-spec-hub/specs",
        "openspec/changes/add-spec-hub/specs/composer-manual-memory-reference",
      ],
      files: [
        "openspec/changes/add-spec-hub/proposal.md",
        "openspec/changes/add-spec-hub/design.md",
        "openspec/changes/add-spec-hub/tasks.md",
        "openspec/changes/add-spec-hub/specs/composer-manual-memory-reference/spec.md",
      ],
    });

    expect(snapshot.changes).toHaveLength(1);
    expect(snapshot.changes[0]?.archiveBlockers).toEqual([
      "Archive preflight failed: delta MODIFIED requires existing openspec/specs/composer-manual-memory-reference/spec.md",
    ]);
  });

  it("adds archive preflight blocker when MODIFIED requirement header is missing in target spec", async () => {
    mockDoctorHealthy();
    mockReadWorkspaceFile.mockImplementation(async (_workspaceId, path) => {
      if (path.endsWith("/tasks.md")) {
        return { content: "## Tasks\n- [x] 1\n", truncated: false };
      }
      if (path.endsWith("/changes/add-spec-hub/specs/project-memory-consumption/spec.md")) {
        return {
          content:
            "# delta\n\n## MODIFIED Requirements\n\n### Requirement: 记忆写入去重与摘要-正文分离\n",
          truncated: false,
        };
      }
      if (path.endsWith("/specs/project-memory-consumption/spec.md")) {
        return {
          content: "# target\n\n## Requirements\n\n### Requirement: 前端消息注入\n",
          truncated: false,
        };
      }
      return { content: "", truncated: false };
    });

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-archive-preflight-missing-requirement",
      mode: "managed",
      directories: [
        "openspec",
        "openspec/changes",
        "openspec/changes/add-spec-hub",
        "openspec/changes/add-spec-hub/specs",
        "openspec/changes/add-spec-hub/specs/project-memory-consumption",
        "openspec/specs",
        "openspec/specs/project-memory-consumption",
      ],
      files: [
        "openspec/changes/add-spec-hub/proposal.md",
        "openspec/changes/add-spec-hub/design.md",
        "openspec/changes/add-spec-hub/tasks.md",
        "openspec/changes/add-spec-hub/specs/project-memory-consumption/spec.md",
        "openspec/specs/project-memory-consumption/spec.md",
      ],
    });

    expect(snapshot.changes[0]?.archiveBlockers).toEqual([
      "Archive preflight failed: delta MODIFIED requirement missing in openspec/specs/project-memory-consumption/spec.md -> 记忆写入去重与摘要-正文分离",
    ]);
  });

  it("evaluates openspec change preflight with blockers, hints, and affected specs", async () => {
    mockReadWorkspaceFile.mockImplementation(async (_workspaceId, path) => {
      if (path.endsWith("/changes/add-spec-hub/specs/project-memory-consumption/spec.md")) {
        return {
          content:
            "# delta\n\n## MODIFIED Requirements\n\n### Requirement: 记忆写入去重与摘要-正文分离\n",
          truncated: false,
        };
      }
      if (path.endsWith("/specs/project-memory-consumption/spec.md")) {
        return {
          content: "# target\n\n## Requirements\n\n### Requirement: 前端消息注入\n",
          truncated: false,
        };
      }
      return { content: "", truncated: false };
    });

    const result = await evaluateOpenSpecChangePreflight({
      workspaceId: "ws-preflight",
      changeId: "add-spec-hub",
      files: [
        "openspec/changes/add-spec-hub/specs/project-memory-consumption/spec.md",
        "openspec/specs/project-memory-consumption/spec.md",
      ],
    });

    expect(result.blockers).toEqual([
      "Archive preflight failed: delta MODIFIED requirement missing in openspec/specs/project-memory-consumption/spec.md -> 记忆写入去重与摘要-正文分离",
    ]);
    expect(result.hints).toContain("If target requirement does not exist, change operation to ADDED.");
    expect(result.affectedSpecs).toEqual(["openspec/specs/project-memory-consumption/spec.md"]);
  });

  it("evaluates preflight from custom spec root when provided", async () => {
    mockReadExternalSpecFile.mockImplementation(async (_workspaceId, customRoot, path) => {
      if (customRoot !== "/tmp/external-openspec") {
        throw new Error("unexpected custom root");
      }
      if (path.endsWith("/changes/add-spec-hub/specs/project-memory-consumption/spec.md")) {
        return {
          path,
          content:
            "# delta\n\n## MODIFIED Requirements\n\n### Requirement: 记忆写入去重与摘要-正文分离\n",
          truncated: false,
          exists: true,
        };
      }
      if (path.endsWith("/specs/project-memory-consumption/spec.md")) {
        return {
          path,
          content: "# target\n\n## Requirements\n\n### Requirement: 前端消息注入\n",
          truncated: false,
          exists: true,
        };
      }
      throw new Error(`missing file: ${path}`);
    });

    const result = await evaluateOpenSpecChangePreflight({
      workspaceId: "ws-preflight-custom-root",
      changeId: "add-spec-hub",
      files: [
        "openspec/changes/add-spec-hub/specs/project-memory-consumption/spec.md",
        "openspec/specs/project-memory-consumption/spec.md",
      ],
      customSpecRoot: "/tmp/external-openspec",
    });

    expect(result.blockers).toHaveLength(1);
    expect(mockReadExternalSpecFile).toHaveBeenCalled();
    expect(mockReadWorkspaceFile).not.toHaveBeenCalled();
  });

  it("returns onboarding-ready unknown snapshot when no spec workspace is detected", async () => {
    mockDoctorHealthy();

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-unknown",
      mode: "managed",
      directories: ["src", "docs"],
      files: ["README.md", "package.json"],
    });

    expect(snapshot.provider).toBe("unknown");
    expect(snapshot.supportLevel).toBe("none");
    expect(snapshot.changes).toHaveLength(0);
    expect(snapshot.blockers[0]).toContain("No supported spec workspace detected");
  });

  it("returns degraded snapshot with actionable blockers when custom spec root is unavailable", async () => {
    mockListExternalSpecTree.mockRejectedValue(
      new Error("Custom spec root not found: /Volumes/missing-spec-root"),
    );

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-missing-custom-root",
      mode: "managed",
      directories: [],
      files: [],
      customSpecRoot: "/Volumes/missing-spec-root",
    });

    expect(snapshot.provider).toBe("unknown");
    expect(snapshot.specRoot?.source).toBe("custom");
    expect(snapshot.specRoot?.path).toBe("/Volumes/missing-spec-root");
    expect(snapshot.environment.status).toBe("degraded");
    expect(snapshot.environment.blockers[0]).toContain("Custom spec root is unavailable");
    expect(snapshot.environment.hints[0]).toContain("valid absolute spec root path");
  });

  it("builds spec-kit snapshot in minimal mode", async () => {
    mockDoctorHealthy();

    const snapshot = await buildSpecWorkspaceSnapshot({
      workspaceId: "ws-2",
      mode: "byo",
      directories: [".specify"],
      files: [".specify/spec.md", ".specify/tasks.md"],
    });

    expect(snapshot.provider).toBe("speckit");
    expect(snapshot.supportLevel).toBe("minimal");
    expect(snapshot.changes[0]?.id).toBe("spec-kit-workspace");
    expect(snapshot.blockers[0]).toContain("minimal compatibility mode");
  });

  it("returns passthrough actions for minimal provider", () => {
    const actions = buildSpecActions({
      change: {
        id: "spec-kit-workspace",
        status: "blocked",
        updatedAt: 0,
        artifacts: {
          proposalPath: ".specify/spec.md",
          designPath: null,
          tasksPath: ".specify/tasks.md",
          verificationPath: null,
          specPaths: [],
        },
        blockers: [],
      },
      supportLevel: "minimal",
      provider: "speckit",
      environment: {
        mode: "byo",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
    });

    expect(actions.every((entry) => entry.kind === "passthrough")).toBe(true);
    expect(actions.every((entry) => !entry.available)).toBe(true);
  });

  it("does not block apply when the only change blocker is unreadable tasks", () => {
    const actions = buildSpecActions({
      change: {
        id: "add-spec-hub",
        status: "blocked",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/add-spec-hub/proposal.md",
          designPath: "openspec/changes/add-spec-hub/design.md",
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: ["openspec/changes/add-spec-hub/specs/spec-platform/spec.md"],
        },
        blockers: ["Unable to read tasks.md"],
      },
      supportLevel: "full",
      provider: "openspec",
      environment: {
        mode: "managed",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
    });

    const apply = actions.find((entry) => entry.key === "apply");
    const verify = actions.find((entry) => entry.key === "verify");
    expect(apply?.available).toBe(true);
    expect(apply?.blockers).not.toContain("Unable to read tasks.md");
    expect(verify?.blockers).toContain("Unable to read tasks.md");
  });

  it("keeps continue available in proposal-only stage and blocks apply with continue-first hint", () => {
    const actions = buildSpecActions({
      change: {
        id: "proposal-only-change",
        status: "ready",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/proposal-only-change/proposal.md",
          designPath: null,
          tasksPath: null,
          verificationPath: null,
          specPaths: [],
        },
        blockers: ["Missing design.md", "Missing tasks.md", "Missing specs delta"],
      },
      supportLevel: "full",
      provider: "openspec",
      environment: {
        mode: "managed",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
    });

    const continueAction = actions.find((entry) => entry.key === "continue");
    const applyAction = actions.find((entry) => entry.key === "apply");
    expect(continueAction?.available).toBe(true);
    expect(continueAction?.blockers).not.toContain("Missing design.md");
    expect(continueAction?.blockers).not.toContain("Missing tasks.md");
    expect(continueAction?.blockers).not.toContain("Missing specs delta");
    expect(applyAction?.available).toBe(false);
    expect(applyAction?.blockers).toContain("Run continue first to generate specs delta");
    expect(applyAction?.blockers).not.toContain("Missing design.md");
    expect(applyAction?.blockers).not.toContain("Missing tasks.md");
  });

  it("parses verify output into structured validation issues", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "validate", "add-spec-hub", "--strict"],
      exitCode: 1,
      success: false,
      stdout: "",
      stderr: "ERROR openspec/changes/add-spec-hub/specs/a/spec.md:12 missing SHALL clause",
    });

    const result = await runSpecAction({
      workspaceId: "ws-1",
      changeId: "add-spec-hub",
      action: "verify",
      provider: "openspec",
    });

    expect(result.kind).toBe("validate");
    expect(result.success).toBe(false);
    expect(result.validationIssues.length).toBe(1);
    expect(result.validationIssues[0]?.path).toContain("spec.md");
  });

  it("always invokes strict validate command for verify action", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "validate", "add-spec-hub", "--strict"],
      exitCode: 0,
      success: true,
      stdout: "strict validation passed",
      stderr: "",
    });

    const result = await runSpecAction({
      workspaceId: "ws-verify-strict",
      changeId: "add-spec-hub",
      action: "verify",
      provider: "openspec",
    });

    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-verify-strict",
      ["openspec", "validate", "add-spec-hub", "--strict"],
      {
        customSpecRoot: null,
        timeoutMs: 180_000,
      },
    );
    expect(result.command).toBe("openspec validate 'add-spec-hub' --strict");
  });

  it("keeps verify event semantics when strict validate fails", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "validate", "add-spec-hub", "--strict"],
      exitCode: 1,
      success: false,
      stdout: "",
      stderr: "verification generation failed; strict validate skipped",
    });

    const result = await runSpecAction({
      workspaceId: "ws-verify-skipped",
      changeId: "add-spec-hub",
      action: "verify",
      provider: "openspec",
    });

    expect(result.kind).toBe("validate");
    expect(result.action).toBe("verify");
    expect(result.success).toBe(false);
    expect(result.command).toBe("openspec validate 'add-spec-hub' --strict");
    expect(result.output).toContain("strict validate skipped");
  });

  it("does not attach validation issues for non-verify actions", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "instructions", "tasks", "--change", "add-spec-hub"],
      exitCode: 1,
      success: false,
      stdout: "",
      stderr: "ERROR openspec/changes/add-spec-hub/specs/a/spec.md:12 missing SHALL clause",
    });

    const result = await runSpecAction({
      workspaceId: "ws-apply-non-verify",
      changeId: "add-spec-hub",
      action: "apply",
      provider: "openspec",
    });

    expect(result.validationIssues).toEqual([]);
    expect(result.kind).toBe("action");
    expect(result.success).toBe(false);
  });

  it("marks archive as failed when CLI output indicates semantic abort", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "archive", "add-spec-hub", "--yes"],
      exitCode: 0,
      success: true,
      stdout:
        "Task status: ✓ Complete\nMODIFIED failed for header \"### Requirement: xx\" - not found\nAborted. No files were changed.",
      stderr: "",
    });

    const result = await runSpecAction({
      workspaceId: "ws-archive-semantic-fail",
      changeId: "add-spec-hub",
      action: "archive",
      provider: "openspec",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("Aborted. No files were changed.");
  });

  it("wraps openspec action command with temp openspec symlink for custom root", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "instructions", "specs", "--change", "add-spec-hub"],
      exitCode: 0,
      success: true,
      stdout: "ok",
      stderr: "",
    });

    await runSpecAction({
      workspaceId: "ws-custom-root",
      changeId: "add-spec-hub",
      action: "continue",
      provider: "openspec",
      customSpecRoot: "/Volumes/spec-disk/external-spec-home",
    });

    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-custom-root",
      ["openspec", "instructions", "specs", "--change", "add-spec-hub"],
      {
        customSpecRoot: "/Volumes/spec-disk/external-spec-home",
        timeoutMs: 180_000,
      },
    );
  });

  it("runs openspec action from parent directory when custom root is named openspec", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "validate", "add-spec-hub", "--strict"],
      exitCode: 0,
      success: true,
      stdout: "ok",
      stderr: "",
    });

    await runSpecAction({
      workspaceId: "ws-custom-openspec",
      changeId: "add-spec-hub",
      action: "verify",
      provider: "openspec",
      customSpecRoot: "/Volumes/spec-disk/openspec",
    });

    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-custom-openspec",
      ["openspec", "validate", "add-spec-hub", "--strict"],
      {
        customSpecRoot: "/Volumes/spec-disk/openspec",
        timeoutMs: 180_000,
      },
    );
  });

  it("keeps Windows custom spec root unchanged when running openspec action", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "validate", "add-spec-hub", "--strict"],
      exitCode: 0,
      success: true,
      stdout: "ok",
      stderr: "",
    });

    await runSpecAction({
      workspaceId: "ws-custom-win-path",
      changeId: "add-spec-hub",
      action: "verify",
      provider: "openspec",
      customSpecRoot: "C:\\spec-disk\\external-openspec\\",
    });

    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-custom-win-path",
      ["openspec", "validate", "add-spec-hub", "--strict"],
      {
        customSpecRoot: "C:\\spec-disk\\external-openspec\\",
        timeoutMs: 180_000,
      },
    );
  });

  it("normalizes file URI custom spec root before running openspec action", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "validate", "add-spec-hub", "--strict"],
      exitCode: 0,
      success: true,
      stdout: "ok",
      stderr: "",
    });

    await runSpecAction({
      workspaceId: "ws-custom-file-uri",
      changeId: "add-spec-hub",
      action: "verify",
      provider: "openspec",
      customSpecRoot: "file:///Users/test/spec-disk/external-openspec",
    });

    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-custom-file-uri",
      ["openspec", "validate", "add-spec-hub", "--strict"],
      {
        customSpecRoot: "/Users/test/spec-disk/external-openspec",
        timeoutMs: 180_000,
      },
    );
  });

  it("ignores custom spec root when provider is speckit", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["specify", "tasks", "--help"],
      exitCode: 0,
      success: true,
      stdout: "ok",
      stderr: "",
    });

    await runSpecAction({
      workspaceId: "ws-speckit",
      changeId: "spec-kit-workspace",
      action: "apply",
      provider: "speckit",
      customSpecRoot: "/Volumes/spec-disk/external-spec-home",
    });

    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-speckit",
      ["specify", "tasks", "--help"],
      {
        customSpecRoot: null,
        timeoutMs: 180_000,
      },
    );
  });

  it("builds gate state with warn when verify has not run", () => {
    const gate = buildSpecGateState({
      snapshot: {
        provider: "openspec",
        supportLevel: "full",
        environment: {
          mode: "managed",
          status: "healthy",
          checks: [],
          blockers: [],
          hints: [],
        },
        blockers: [],
        changes: [],
      },
      selectedChange: null,
      lastVerifyEvent: null,
    });

    expect(gate.status).toBe("warn");
    expect(gate.checks.some((entry) => entry.key === "validation" && entry.status === "warn")).toBe(
      true,
    );
  });

  it("loads specs artifact as per-file sources", async () => {
    mockReadWorkspaceFile.mockImplementation(async (_workspaceId, path) => {
      if (path.endsWith("/spec-a/spec.md")) {
        return { content: "# A\n", truncated: false };
      }
      if (path.endsWith("/spec-b/spec.md")) {
        return { content: "# B\n", truncated: true };
      }
      return { content: "", truncated: false };
    });

    const artifacts = await loadSpecArtifacts({
      workspaceId: "ws-3",
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        blockers: [],
        artifacts: {
          proposalPath: null,
          designPath: null,
          tasksPath: null,
          verificationPath: null,
          specPaths: [
            "openspec/changes/add-spec-hub/specs/spec-a/spec.md",
            "openspec/changes/add-spec-hub/specs/spec-b/spec.md",
          ],
        },
      },
    });

    expect(artifacts.specs.path).toContain("spec-a/spec.md");
    expect(artifacts.specs.content).toContain("# A");
    expect(artifacts.specs.truncated).toBe(true);
    expect(artifacts.specs.sources).toHaveLength(2);
    expect(artifacts.specs.sources?.[1]?.path).toContain("spec-b/spec.md");
    expect(artifacts.specs.sources?.[1]?.content).toContain("# B");
  });

  it("parses task progress for tasks artifact", async () => {
    mockReadWorkspaceFile.mockImplementation(async () => ({
      content: "## Tasks\n- [x] done\n- [ ] todo\n- [X] done2\n",
      truncated: false,
    }));

    const artifacts = await loadSpecArtifacts({
      workspaceId: "ws-3",
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        blockers: [],
        artifacts: {
          proposalPath: null,
          designPath: null,
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: [],
        },
      },
    });

    expect(artifacts.tasks.taskProgress).toEqual({
      total: 3,
      checked: 2,
      requiredTotal: 3,
      requiredChecked: 2,
    });
  });

  it("parses task checklist with priorities for tasks artifact", async () => {
    mockReadWorkspaceFile.mockResolvedValue({
      content: [
        "## Tasks",
        "- [x] 1 [P0] done",
        "- [ ] 2 [P1] todo",
        "- [ ] 3 [P2] optional",
        "",
      ].join("\n"),
      truncated: false,
    });

    const artifacts = await loadSpecArtifacts({
      workspaceId: "ws-task-priority",
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        blockers: [],
        artifacts: {
          proposalPath: null,
          designPath: null,
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: [],
        },
      },
    });

    expect(artifacts.tasks.taskChecklist).toHaveLength(3);
    expect(artifacts.tasks.taskChecklist?.[0]?.priority).toBe("p0");
    expect(artifacts.tasks.taskChecklist?.[2]?.priority).toBe("p2");
    expect(artifacts.tasks.taskProgress).toEqual({
      total: 3,
      checked: 1,
      requiredTotal: 2,
      requiredChecked: 1,
    });
  });

  it("updates task checkbox in workspace tasks.md", async () => {
    mockReadWorkspaceFile.mockResolvedValue({
      content: "## Tasks\n- [ ] first\n- [x] second\n",
      truncated: false,
    });
    mockWriteWorkspaceFile.mockResolvedValue();

    const updated = await updateSpecTaskChecklist({
      workspaceId: "ws-update-task",
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        blockers: [],
        artifacts: {
          proposalPath: null,
          designPath: null,
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: [],
        },
      },
      taskIndex: 0,
      checked: true,
    });

    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith(
      "ws-update-task",
      "openspec/changes/add-spec-hub/tasks.md",
      "## Tasks\n- [x] first\n- [x] second\n",
    );
    expect(updated.taskChecklist?.[0]?.checked).toBe(true);
    expect(updated.taskProgress).toEqual({
      total: 2,
      checked: 2,
      requiredTotal: 2,
      requiredChecked: 2,
    });
  });

  it("updates task checkbox in external spec root tasks.md", async () => {
    mockReadExternalSpecFile.mockResolvedValue({
      exists: true,
      content: "## Tasks\n- [ ] first\n",
      truncated: false,
    });
    mockWriteExternalSpecFile.mockResolvedValue();

    await updateSpecTaskChecklist({
      workspaceId: "ws-update-task-external",
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        blockers: [],
        artifacts: {
          proposalPath: null,
          designPath: null,
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: [],
        },
      },
      taskIndex: 0,
      checked: true,
      customSpecRoot: "/Volumes/spec-disk/external-spec-home",
    });

    expect(mockWriteExternalSpecFile).toHaveBeenCalledWith(
      "ws-update-task-external",
      "/Volumes/spec-disk/external-spec-home",
      "openspec/changes/add-spec-hub/tasks.md",
      "## Tasks\n- [x] first\n",
    );
  });

  it("blocks archive when required tasks are incomplete even after verify passed", () => {
    const actions = buildSpecActions({
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/add-spec-hub/proposal.md",
          designPath: "openspec/changes/add-spec-hub/design.md",
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: ["openspec/changes/add-spec-hub/specs/spec-platform/spec.md"],
        },
        blockers: [],
      },
      supportLevel: "full",
      provider: "openspec",
      environment: {
        mode: "managed",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
      verifyState: { ran: true, success: true },
      taskProgress: {
        total: 10,
        checked: 8,
        requiredTotal: 9,
        requiredChecked: 8,
      },
    });

    const archive = actions.find((entry) => entry.key === "archive");
    expect(archive?.available).toBe(false);
    expect(archive?.blockers).toContain("Required tasks are incomplete");
    expect(archive?.blockers).not.toContain("Strict verify must pass before archive");
  });

  it("blocks archive when strict verify has not passed", () => {
    const actions = buildSpecActions({
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/add-spec-hub/proposal.md",
          designPath: "openspec/changes/add-spec-hub/design.md",
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: ["openspec/changes/add-spec-hub/specs/spec-platform/spec.md"],
        },
        blockers: [],
      },
      supportLevel: "full",
      provider: "openspec",
      environment: {
        mode: "managed",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
      verifyState: { ran: false, success: false },
      taskProgress: {
        total: 2,
        checked: 2,
        requiredTotal: 2,
        requiredChecked: 2,
      },
    });

    const archive = actions.find((entry) => entry.key === "archive");
    expect(archive?.available).toBe(false);
    expect(archive?.blockers).toContain("Strict verify must pass before archive");
  });

  it("allows archive when strict verify passed and required tasks are complete", () => {
    const actions = buildSpecActions({
      change: {
        id: "add-spec-hub",
        status: "implementing",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/add-spec-hub/proposal.md",
          designPath: "openspec/changes/add-spec-hub/design.md",
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: ["openspec/changes/add-spec-hub/specs/spec-platform/spec.md"],
        },
        blockers: [],
      },
      supportLevel: "full",
      provider: "openspec",
      environment: {
        mode: "managed",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
      verifyState: { ran: true, success: true },
      taskProgress: {
        total: 3,
        checked: 2,
        requiredTotal: 2,
        requiredChecked: 2,
      },
    });

    const archive = actions.find((entry) => entry.key === "archive");
    expect(archive?.available).toBe(true);
    expect(archive?.blockers).toHaveLength(0);
  });

  it("keeps verify and archive available when only preflight blockers exist", () => {
    const actions = buildSpecActions({
      change: {
        id: "add-spec-hub",
        status: "ready",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/add-spec-hub/proposal.md",
          designPath: "openspec/changes/add-spec-hub/design.md",
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: ["openspec/changes/add-spec-hub/specs/spec-platform/spec.md"],
        },
        blockers: [],
        archiveBlockers: [
          "Archive preflight failed: delta MODIFIED requires existing openspec/specs/spec-platform/spec.md",
        ],
      },
      supportLevel: "full",
      provider: "openspec",
      environment: {
        mode: "managed",
        status: "healthy",
        checks: [],
        blockers: [],
        hints: [],
      },
      verifyState: { ran: true, success: true },
      taskProgress: {
        total: 3,
        checked: 3,
        requiredTotal: 3,
        requiredChecked: 3,
      },
    });

    const apply = actions.find((entry) => entry.key === "apply");
    const verify = actions.find((entry) => entry.key === "verify");
    const archive = actions.find((entry) => entry.key === "archive");
    expect(apply?.available).toBe(true);
    expect(verify?.available).toBe(true);
    expect(verify?.blockers).toHaveLength(0);
    expect(archive?.available).toBe(true);
    expect(archive?.blockers).toHaveLength(0);
  });

  it("marks artifact gate failed when change has blockers", () => {
    const gate = buildSpecGateState({
      snapshot: {
        provider: "openspec",
        supportLevel: "full",
        environment: {
          mode: "managed",
          status: "healthy",
          checks: [],
          blockers: [],
          hints: [],
        },
        blockers: [],
        changes: [],
      },
      selectedChange: {
        id: "add-spec-hub",
        status: "blocked",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/add-spec-hub/proposal.md",
          designPath: "openspec/changes/add-spec-hub/design.md",
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: ["openspec/changes/add-spec-hub/specs/spec-platform/spec.md"],
        },
        blockers: ["Unable to read tasks.md"],
      },
      lastVerifyEvent: null,
    });

    const artifactsCheck = gate.checks.find((entry) => entry.key === "artifacts");
    expect(artifactsCheck?.status).toBe("fail");
    expect(artifactsCheck?.message).toBe("Unable to read tasks.md");
  });

  it("marks artifact gate as warn when tasks or specs are truncated", () => {
    const gate = buildSpecGateState({
      snapshot: {
        provider: "openspec",
        supportLevel: "full",
        environment: {
          mode: "managed",
          status: "healthy",
          checks: [],
          blockers: [],
          hints: [],
        },
        blockers: [],
        changes: [],
      },
      selectedChange: {
        id: "add-spec-hub",
        status: "ready",
        updatedAt: 0,
        artifacts: {
          proposalPath: "openspec/changes/add-spec-hub/proposal.md",
          designPath: "openspec/changes/add-spec-hub/design.md",
          tasksPath: "openspec/changes/add-spec-hub/tasks.md",
          verificationPath: null,
          specPaths: ["openspec/changes/add-spec-hub/specs/spec-platform/spec.md"],
        },
        blockers: [],
      },
      lastVerifyEvent: null,
      verifyState: { ran: true, success: true },
      artifacts: {
        proposal: {
          type: "proposal",
          path: "openspec/changes/add-spec-hub/proposal.md",
          exists: true,
          content: "# proposal",
          truncated: false,
        },
        design: {
          type: "design",
          path: "openspec/changes/add-spec-hub/design.md",
          exists: true,
          content: "# design",
          truncated: false,
        },
        tasks: {
          type: "tasks",
          path: "openspec/changes/add-spec-hub/tasks.md",
          exists: true,
          content: "## Tasks",
          truncated: true,
        },
        verification: {
          type: "verification",
          path: null,
          exists: false,
          content: "",
          truncated: false,
        },
        specs: {
          type: "specs",
          path: "openspec/changes/add-spec-hub/specs/spec-platform/spec.md",
          exists: true,
          content: "# spec",
          truncated: false,
          sources: [],
        },
      },
    });

    const artifactsCheck = gate.checks.find((entry) => entry.key === "artifacts");
    expect(gate.status).toBe("warn");
    expect(artifactsCheck?.status).toBe("warn");
    expect(artifactsCheck?.message.toLowerCase()).toContain("truncated");
  });

  it("saves project context markdown to openspec/project.md", async () => {
    mockReadWorkspaceFile.mockResolvedValue({
      content: "# Project Context\n\n## Update History\n- 2026-02-01T10:00:00.000Z seed\n",
      truncated: false,
    });
    mockWriteWorkspaceFile.mockResolvedValue();

    const result = await saveSpecProjectInfo({
      workspaceId: "ws-4",
      projectInfo: {
        projectType: "legacy",
        domain: "Messaging",
        architecture: "React + Tauri",
        constraints: "No backend changes",
        keyCommands: "pnpm test\npnpm typecheck",
        owners: "Spec Team",
        summary: "Project context refreshed",
      },
    });

    expect(result.path).toBe("openspec/project.md");
    expect(mockWriteWorkspaceFile).toHaveBeenCalledTimes(1);
    const [, path, markdown] = mockWriteWorkspaceFile.mock.calls[0] ?? [];
    expect(path).toBe("openspec/project.md");
    expect(markdown).toContain("# Project Context");
    expect(markdown).toContain("## Domain");
    expect(markdown).toContain("Messaging");
    expect(markdown).toContain("- pnpm test");
    expect(markdown).toContain("## Update History");
  });

  it("initializes openspec with --force for legacy projects", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "init", "--tools", "none", "--force"],
      exitCode: 0,
      success: true,
      stdout: "initialized",
      stderr: "",
    });
    mockReadWorkspaceFile.mockRejectedValue(new Error("missing"));
    mockWriteWorkspaceFile.mockResolvedValue();

    const event = await initializeOpenSpecWorkspace({
      workspaceId: "ws-5",
      projectInfo: {
        projectType: "legacy",
        domain: "Domain",
        architecture: "Arch",
        constraints: "None",
        keyCommands: "pnpm test",
        owners: "Owner",
      },
    });

    expect(event.action).toBe("bootstrap");
    expect(event.success).toBe(true);
    expect(event.command).toContain("openspec init --tools none --force");
    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-5",
      ["openspec", "init", "--tools", "none", "--force"],
      {
        customSpecRoot: null,
        timeoutMs: 180_000,
      },
    );
    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith(
      "ws-5",
      "openspec/project.md",
      expect.stringContaining("# Project Context"),
    );
  });

  it("returns failure event when openspec init command fails", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "init", "--tools", "none"],
      exitCode: 1,
      success: false,
      stdout: "",
      stderr: "command failed",
    });

    const event = await initializeOpenSpecWorkspace({
      workspaceId: "ws-6",
      projectInfo: {
        projectType: "new",
        domain: "",
        architecture: "",
        constraints: "",
        keyCommands: "",
        owners: "",
      },
    });

    expect(event.success).toBe(false);
    expect(event.output).toContain("command failed");
    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-6",
      ["openspec", "init", "--tools", "none"],
      {
        customSpecRoot: null,
        timeoutMs: 180_000,
      },
    );
    expect(mockWriteWorkspaceFile).not.toHaveBeenCalled();
  });

  it("wraps openspec bootstrap command with temp openspec symlink for custom root", async () => {
    mockRunSpecCommand.mockResolvedValue({
      command: ["openspec", "init", "--tools", "none"],
      exitCode: 1,
      success: false,
      stdout: "",
      stderr: "bootstrap failed",
    });

    const event = await initializeOpenSpecWorkspace({
      workspaceId: "ws-init-custom-root",
      projectInfo: {
        projectType: "new",
        domain: "",
        architecture: "",
        constraints: "",
        keyCommands: "",
        owners: "",
      },
      customSpecRoot: "/Volumes/spec-disk/external-spec-home",
    });

    expect(event.success).toBe(false);
    expect(mockRunSpecCommand).toHaveBeenCalledWith(
      "ws-init-custom-root",
      ["openspec", "init", "--tools", "none"],
      {
        customSpecRoot: "/Volumes/spec-disk/external-spec-home",
        timeoutMs: 180_000,
      },
    );
  });

  it("loads project context from openspec/project.md", async () => {
    mockReadWorkspaceFile.mockResolvedValue({
      content: `# Project Context

- Type: New Project
- Updated At: 2026-02-23T10:00:00.000Z

## Domain
Spec Hub

## Architecture
Tauri + React

## Constraints
No backend changes

## Key Commands
- pnpm test
- pnpm typecheck

## Owners
Codemoss Team
`,
      truncated: false,
    });

    const info = await loadSpecProjectInfo({ workspaceId: "ws-7" });

    expect(info).toEqual({
      projectType: "new",
      domain: "Spec Hub",
      architecture: "Tauri + React",
      constraints: "No backend changes",
      keyCommands: "pnpm test\npnpm typecheck",
      owners: "Codemoss Team",
      summary: "",
    });
  });
});
