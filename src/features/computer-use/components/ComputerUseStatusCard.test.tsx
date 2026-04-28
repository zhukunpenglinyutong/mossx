// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ComputerUseAuthorizationContinuityStatus,
  ComputerUseBridgeStatus,
  ComputerUseOfficialParentHandoffDiscovery,
} from "../../../types";
import { ComputerUseStatusCard } from "./ComputerUseStatusCard";

const useComputerUseBridgeStatusMock = vi.fn();
const useComputerUseActivationMock = vi.fn();
const useComputerUseBrokerMock = vi.fn();
const useComputerUseHostContractDiagnosticsMock = vi.fn();
const listWorkspacesMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../hooks/useComputerUseBridgeStatus", () => ({
  useComputerUseBridgeStatus: (...args: unknown[]) =>
    useComputerUseBridgeStatusMock(...args),
}));

vi.mock("../hooks/useComputerUseActivation", () => ({
  useComputerUseActivation: (...args: unknown[]) =>
    useComputerUseActivationMock(...args),
}));

vi.mock("../hooks/useComputerUseBroker", () => ({
  useComputerUseBroker: (...args: unknown[]) => useComputerUseBrokerMock(...args),
}));

vi.mock("../hooks/useComputerUseHostContractDiagnostics", () => ({
  useComputerUseHostContractDiagnostics: (...args: unknown[]) =>
    useComputerUseHostContractDiagnosticsMock(...args),
}));

vi.mock("../../../services/tauri", () => ({
  listWorkspaces: (...args: unknown[]) => listWorkspacesMock(...args),
}));

function authorizationContinuityStatus(
  overrides: Partial<ComputerUseAuthorizationContinuityStatus> = {},
): ComputerUseAuthorizationContinuityStatus {
  const base: ComputerUseAuthorizationContinuityStatus = {
    kind: "matching_host",
    diagnosticMessage: "current host matches the last successful authorization host",
    currentHost: {
      displayName: "ccgui.app",
      executablePath: "/Applications/ccgui.app/Contents/MacOS/cc-gui",
      identifier: "com.codex.ccgui",
      teamIdentifier: "TEAM123",
      backendMode: "local",
      hostRole: "foreground_app",
      launchMode: "packaged_app",
      signingSummary: "Authority=Developer ID Application: Demo",
    },
    lastSuccessfulHost: {
      displayName: "ccgui.app",
      executablePath: "/Applications/ccgui.app/Contents/MacOS/cc-gui",
      identifier: "com.codex.ccgui",
      teamIdentifier: "TEAM123",
      backendMode: "local",
      hostRole: "foreground_app",
      launchMode: "packaged_app",
      signingSummary: "Authority=Developer ID Application: Demo",
    },
    driftFields: [],
  };

  return {
    ...base,
    ...overrides,
  };
}

function blockedMacStatus(
  overrides: Partial<ComputerUseBridgeStatus> = {},
): ComputerUseBridgeStatus {
  const base: ComputerUseBridgeStatus = {
    featureEnabled: true,
    activationEnabled: true,
    status: "blocked",
    platform: "macos",
    codexAppDetected: true,
    pluginDetected: true,
    pluginEnabled: true,
    blockedReasons: [
      "helper_bridge_unverified",
      "permission_required",
      "approval_required",
    ],
    guidanceCodes: [
      "verify_helper_bridge",
      "grant_system_permissions",
      "review_allowed_apps",
    ],
    codexConfigPath: "/Users/demo/.codex/config.toml",
    pluginManifestPath:
      "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/.codex-plugin/plugin.json",
    helperPath:
      "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
    helperDescriptorPath:
      "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/.mcp.json",
    marketplacePath:
      "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/.agents/plugins/marketplace.json",
    diagnosticMessage: "bridge verification pending",
    authorizationContinuity: authorizationContinuityStatus(),
  };

  return {
    ...base,
    ...overrides,
    authorizationContinuity:
      overrides.authorizationContinuity ?? base.authorizationContinuity,
  };
}

type OfficialParentHandoffOverrides = Omit<
  Partial<ComputerUseOfficialParentHandoffDiscovery>,
  "evidence"
> & {
  evidence?: Partial<ComputerUseOfficialParentHandoffDiscovery["evidence"]>;
};

function officialParentHandoff(
  overrides: OfficialParentHandoffOverrides = {},
): ComputerUseOfficialParentHandoffDiscovery {
  const base: ComputerUseOfficialParentHandoffDiscovery = {
    kind: "requires_official_parent" as const,
    methods: [],
    durationMs: 3,
    diagnosticMessage:
      "Readable metadata points to an official OpenAI parent/team contract.",
    evidence: {
      codexInfoPlistPath: "/Applications/Codex.app/Contents/Info.plist",
      serviceInfoPlistPath:
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/Info.plist",
      helperInfoPlistPath:
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/Info.plist",
      parentCodeRequirementPath:
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/Resources/SkyComputerUseClient_Parent.coderequirement",
      pluginManifestPath: blockedMacStatus().pluginManifestPath,
      mcpDescriptorPath: blockedMacStatus().helperDescriptorPath,
      codexUrlSchemes: ["codex"],
      serviceBundleIdentifier: "com.openai.sky.CUAService",
      helperBundleIdentifier: "com.openai.sky.CUAService.cli",
      parentTeamIdentifier: "2DC432GLL2",
      applicationGroups: ["2DC432GLL2.com.openai.sky.CUAService"],
      xpcServiceIdentifiers: [],
      durationMs: 3,
      stdoutSnippet: null,
      stderrSnippet: null,
    },
  };

  return {
    ...base,
    ...overrides,
    evidence: {
      ...base.evidence,
      ...overrides.evidence,
    },
  };
}

describe("ComputerUseStatusCard", () => {
  beforeEach(() => {
    useComputerUseBridgeStatusMock.mockReset();
    useComputerUseActivationMock.mockReset();
    useComputerUseBrokerMock.mockReset();
    useComputerUseHostContractDiagnosticsMock.mockReset();
    listWorkspacesMock.mockReset();
    listWorkspacesMock.mockReturnValue(new Promise(() => {}));
    useComputerUseBrokerMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      run: vi.fn(),
      reset: vi.fn(),
    });
    useComputerUseHostContractDiagnosticsMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      diagnose: vi.fn(),
      reset: vi.fn(),
    });
  });

  it("renders blocked reasons and activation action for eligible macos state", () => {
    const activateMock = vi.fn();

    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: activateMock,
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(screen.getByText("settings.computerUse.title")).toBeTruthy();
    expect(screen.getByText("settings.computerUse.status.blocked")).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.reason.helper_bridge_unverified"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.reason.permission_required"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.guidance.verify_helper_bridge"),
    ).toBeTruthy();
    expect(screen.getByText("bridge verification pending")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings.computerUse.activation.verify",
      }),
    );
    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", {
        name: "settings.computerUse.hostContract.run",
      }),
    ).toBeNull();
  });

  it("renders error state when bridge loading fails", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: null,
      isLoading: false,
      error: "ipc unavailable",
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText("settings.computerUse.loadFailed: ipc unavailable"),
    ).toBeTruthy();
  });

  it("tolerates a null workspace list from the runtime boundary", async () => {
    listWorkspacesMock.mockResolvedValue(null);
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    await waitFor(() => {
      expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("settings.computerUse.title")).toBeTruthy();
  });

  it("falls back to status-only surface when activation is disabled", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: {
        ...blockedMacStatus(),
        activationEnabled: false,
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.queryByRole("button", {
        name: "settings.computerUse.activation.verify",
      }),
    ).toBeNull();
    expect(
      screen.getByText("settings.computerUse.phaseOneNotice"),
    ).toBeTruthy();
    expect(useComputerUseActivationMock).toHaveBeenCalledWith({
      enabled: false,
    });
    expect(useComputerUseHostContractDiagnosticsMock).toHaveBeenCalledWith({
      enabled: false,
    });
  });

  it("renders activation probe result and hides stale helper bridge blocker", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: {
        outcome: "blocked",
        failureKind: "remaining_blockers",
        bridgeStatus: {
          ...blockedMacStatus(),
          blockedReasons: ["permission_required", "approval_required"],
          guidanceCodes: ["grant_system_permissions", "review_allowed_apps"],
          diagnosticMessage: null,
        },
        durationMs: 412,
        diagnosticMessage: "helper bridge verified",
        stderrSnippet: null,
        exitCode: 0,
      },
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText("settings.computerUse.activation.resultTitle"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.activation.outcome.blocked"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.activation.failure.remaining_blockers"),
    ).toBeTruthy();
    expect(screen.getByText("helper bridge verified")).toBeTruthy();
    expect(
      screen.queryByText("settings.computerUse.reason.helper_bridge_unverified"),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "settings.computerUse.activation.verify",
      }),
    ).toBeNull();
  });

  it("shows host-contract diagnostics only after host incompatible activation result", () => {
    const diagnoseMock = vi.fn();

    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: {
        outcome: "failed",
        failureKind: "host_incompatible",
        bridgeStatus: blockedMacStatus(),
        durationMs: 1,
        diagnosticMessage: "direct exec skipped",
        stderrSnippet: "skipped direct helper launch",
        exitCode: null,
      },
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });
    useComputerUseHostContractDiagnosticsMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      diagnose: diagnoseMock,
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.queryByRole("button", {
        name: "settings.computerUse.activation.verify",
      }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings.computerUse.hostContract.run",
      }),
    );
    expect(diagnoseMock).toHaveBeenCalledTimes(1);
  });

  it("renders host-contract diagnostics evidence as diagnostic-only result", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: {
        outcome: "failed",
        failureKind: "host_incompatible",
        bridgeStatus: blockedMacStatus(),
        durationMs: 1,
        diagnosticMessage: "direct exec skipped",
        stderrSnippet: "skipped direct helper launch",
        exitCode: null,
      },
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });
    useComputerUseHostContractDiagnosticsMock.mockReturnValue({
      result: {
        kind: "requires_official_parent",
        bridgeStatus: blockedMacStatus(),
        durationMs: 4,
        diagnosticMessage:
          "Computer Use helper appears to require the official Codex parent contract.",
        evidence: {
          helperPath: blockedMacStatus().helperPath,
          helperDescriptorPath: blockedMacStatus().helperDescriptorPath,
          currentHostPath:
            "/Applications/ThirdPartyHost.app/Contents/MacOS/third-party-host",
          handoffMethod: "direct_exec_skipped_nested_app_bundle",
          codesignSummary: "codesign exited with status 0",
          spctlSummary: "spctl exited with status 0",
          durationMs: 4,
          stdoutSnippet: null,
          stderrSnippet: "Authority=Developer ID Application",
          officialParentHandoff: officialParentHandoff(),
        },
      },
      isRunning: false,
      error: null,
      diagnose: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText("settings.computerUse.hostContract.resultTitle"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "settings.computerUse.hostContract.kind.requires_official_parent",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("direct_exec_skipped_nested_app_bundle"),
    ).toBeTruthy();
    expect(screen.getByText("codesign exited with status 0")).toBeTruthy();
    expect(
      screen.getByText(
        "settings.computerUse.hostContract.officialParent.kind.requires_official_parent",
      ),
    ).toBeTruthy();
    expect(screen.getByText("2DC432GLL2")).toBeTruthy();
    expect(
      screen.getByText("2DC432GLL2.com.openai.sky.CUAService"),
    ).toBeTruthy();
    expect(screen.getByText("com.openai.sky.CUAService.cli")).toBeTruthy();
    expect(
      screen.getByText(
        "settings.computerUse.hostContract.diagnosticOnlyNotice",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.parentContractVerdict.title"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "settings.computerUse.parentContractVerdict.kind.requires_official_parent",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.parentContractVerdict.notPermission"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "settings.computerUse.hostContract.run",
      }),
    ).toBeNull();
  });

  it("keeps candidate handoff methods as evidence only", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: {
        outcome: "failed",
        failureKind: "host_incompatible",
        bridgeStatus: blockedMacStatus(),
        durationMs: 1,
        diagnosticMessage: "direct exec skipped",
        stderrSnippet: null,
        exitCode: null,
      },
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });
    useComputerUseHostContractDiagnosticsMock.mockReturnValue({
      result: {
        kind: "unknown",
        bridgeStatus: blockedMacStatus(),
        durationMs: 4,
        diagnosticMessage: "Candidate handoff needs separate validation.",
        evidence: {
          helperPath: blockedMacStatus().helperPath,
          helperDescriptorPath: blockedMacStatus().helperDescriptorPath,
          currentHostPath:
            "/Applications/ThirdPartyHost.app/Contents/MacOS/third-party-host",
          handoffMethod: "metadata_candidate",
          codesignSummary: null,
          spctlSummary: null,
          durationMs: 4,
          stdoutSnippet: null,
          stderrSnippet: null,
          officialParentHandoff: officialParentHandoff({
            kind: "handoff_candidate_found",
            methods: [
              {
                method: "launch_services_url_scheme",
                sourcePath: "/Applications/Codex.app/Contents/Info.plist",
                identifier: "codex",
                confidence: "low",
                notes: "Generic Codex URL scheme, not Computer Use runtime.",
              },
            ],
            diagnosticMessage: "Candidate metadata found.",
          }),
        },
      },
      isRunning: false,
      error: null,
      diagnose: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText(
        "settings.computerUse.hostContract.officialParent.kind.handoff_candidate_found",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "settings.computerUse.hostContract.officialParent.candidateEvidenceOnly",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("launch_services_url_scheme / codex / low"),
    ).toBeTruthy();
    expect(
      screen.queryByText("settings.computerUse.parentContractVerdict.title"),
    ).toBeNull();
  });

  it("clears stale activation result before manual status refresh", () => {
    const refreshMock = vi.fn();
    const resetMock = vi.fn();
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus(),
      isLoading: false,
      error: null,
      refresh: refreshMock,
    });
    useComputerUseActivationMock.mockReturnValue({
      result: {
        outcome: "failed",
        failureKind: "host_incompatible",
        bridgeStatus: blockedMacStatus(),
        durationMs: 0,
        diagnosticMessage: "stale probe result",
        stderrSnippet: null,
        exitCode: null,
      },
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: resetMock,
    });

    render(<ComputerUseStatusCard />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings.computerUse.refresh",
      }),
    );

    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("renders authorization continuity evidence and blocks broker CTA on host drift", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        id: "ws-1",
        name: "Demo Workspace",
        path: "/tmp/demo",
        connected: true,
        settings: {
          sidebarCollapsed: false,
        },
      },
    ]);
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus({
        blockedReasons: ["permission_required", "approval_required"],
        guidanceCodes: ["grant_system_permissions", "review_allowed_apps"],
        diagnosticMessage: "sender host drift detected",
        authorizationContinuity: authorizationContinuityStatus({
          kind: "host_drift_detected",
          diagnosticMessage: "Current sender does not match the last successful host.",
          currentHost: {
            displayName: "target/debug/cc-gui",
            executablePath: "/tmp/mossx/target/debug/cc-gui",
            identifier: null,
            teamIdentifier: null,
            backendMode: "local",
            hostRole: "debug_binary",
            launchMode: "debug",
            signingSummary: "adhoc",
          },
          lastSuccessfulHost: {
            displayName: "ccgui.app",
            executablePath: "/Applications/ccgui.app/Contents/MacOS/cc-gui",
            identifier: "com.codex.ccgui",
            teamIdentifier: "TEAM123",
            backendMode: "local",
            hostRole: "foreground_app",
            launchMode: "packaged_app",
            signingSummary: "Authority=Developer ID Application: Demo",
          },
          driftFields: ["executable_path", "host_role", "launch_mode"],
        }),
      }),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    await waitFor(() => {
      expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByText("settings.computerUse.authorizationContinuity.title"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "settings.computerUse.authorizationContinuity.kind.host_drift_detected",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "settings.computerUse.authorizationContinuity.exactHostRemediation",
      ),
    ).toBeTruthy();
    expect(screen.getByText("target/debug/cc-gui")).toBeTruthy();
    expect(screen.getAllByText("ccgui.app")[0]).toBeTruthy();
    expect(
      screen.getByText("executable_path, host_role, launch_mode"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.broker.continuityBlockedNotice"),
    ).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText("settings.computerUse.broker.instruction"),
      {
        target: {
          value: "Open the current Chrome page and summarize it.",
        },
      },
    );

    expect(
      (
        screen.getByRole("button", {
          name: "settings.computerUse.broker.run",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("renders unsupported continuity for an unsigned packaged app host", async () => {
    listWorkspacesMock.mockResolvedValue([
      {
        id: "ws-1",
        name: "Demo Workspace",
        path: "/tmp/demo",
        connected: true,
        settings: {
          sidebarCollapsed: false,
        },
      },
    ]);
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus({
        blockedReasons: ["permission_required", "approval_required"],
        guidanceCodes: ["grant_system_permissions", "review_allowed_apps"],
        diagnosticMessage: "unsigned packaged app sender detected",
        authorizationContinuity: authorizationContinuityStatus({
          kind: "unsupported_context",
          diagnosticMessage:
            "Computer Use authorization continuity is blocked because the current packaged app sender is not signed with a stable Developer ID identity. Rebuild and relaunch a signed packaged app before retrying.",
          currentHost: {
            displayName: "cc-gui",
            executablePath: "/Applications/ccgui.app/Contents/MacOS/cc-gui",
            identifier: "cc_gui-f691d086c63a0067",
            teamIdentifier: null,
            backendMode: "local",
            hostRole: "foreground_app",
            launchMode: "packaged_app",
            signingSummary: "flags=0x20002(adhoc,linker-signed)",
          },
          lastSuccessfulHost: null,
          driftFields: [],
        }),
      }),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    await waitFor(() => {
      expect(listWorkspacesMock).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByText(
        "settings.computerUse.authorizationContinuity.kind.unsupported_context",
      ),
    ).toBeTruthy();
    expect(screen.getByText("cc-gui")).toBeTruthy();
    expect(
      screen.getByText(
        "Computer Use authorization continuity is blocked because the current packaged app sender is not signed with a stable Developer ID identity. Rebuild and relaunch a signed packaged app before retrying.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.broker.continuityBlockedNotice"),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "settings.computerUse.broker.run",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("keeps same-host permission failures on the generic permission branch", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus({
        blockedReasons: ["permission_required", "approval_required"],
        guidanceCodes: ["grant_system_permissions", "review_allowed_apps"],
      }),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });
    useComputerUseBrokerMock.mockReturnValue({
      result: {
        outcome: "failed",
        failureKind: "permission_required",
        bridgeStatus: blockedMacStatus({
          blockedReasons: ["permission_required", "approval_required"],
          guidanceCodes: ["grant_system_permissions", "review_allowed_apps"],
        }),
        text: null,
        diagnosticMessage: "Apple event error -10000",
        durationMs: 27,
      },
      isRunning: false,
      error: null,
      run: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText("settings.computerUse.broker.failure.permission_required"),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "settings.computerUse.broker.failure.authorization_continuity_blocked",
      ),
    ).toBeNull();
    expect(
      screen.getByText(
        "settings.computerUse.authorizationContinuity.kind.matching_host",
      ),
    ).toBeTruthy();
  });

  it("does not render activation action for unsupported windows hosts", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: blockedMacStatus({
        status: "unsupported",
        platform: "windows",
        codexAppDetected: false,
        pluginDetected: false,
        pluginEnabled: false,
        blockedReasons: ["platform_unsupported"],
        guidanceCodes: ["unsupported_platform"],
        codexConfigPath: null,
        pluginManifestPath: null,
        helperPath: null,
        helperDescriptorPath: null,
        marketplacePath: null,
        diagnosticMessage: null,
      }),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    useComputerUseActivationMock.mockReturnValue({
      result: null,
      isRunning: false,
      error: null,
      activate: vi.fn(),
      reset: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText("settings.computerUse.status.unsupported"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.reason.platform_unsupported"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "settings.computerUse.activation.verify",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "settings.computerUse.hostContract.run",
      }),
    ).toBeNull();
    expect(
      screen.queryByText("settings.computerUse.authorizationContinuity.title"),
    ).toBeNull();
    expect(
      screen.getByText("settings.computerUse.broker.unsupportedPlatformNotice"),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("settings.computerUse.broker.instruction"),
    ).toBeNull();
  });
});
