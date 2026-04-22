// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComputerUseStatusCard } from "./ComputerUseStatusCard";

const useComputerUseBridgeStatusMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../hooks/useComputerUseBridgeStatus", () => ({
  useComputerUseBridgeStatus: (...args: unknown[]) =>
    useComputerUseBridgeStatusMock(...args),
}));

describe("ComputerUseStatusCard", () => {
  beforeEach(() => {
    useComputerUseBridgeStatusMock.mockReset();
  });

  it("renders blocked reasons and guidance from bridge status", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: {
        featureEnabled: true,
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
        pluginManifestPath: "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/.codex-plugin/plugin.json",
        helperPath: null,
        helperDescriptorPath:
          "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/.mcp.json",
        marketplacePath:
          "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/.agents/plugins/marketplace.json",
        diagnosticMessage: "bridge verification pending",
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
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
      screen.getByText("settings.computerUse.reason.approval_required"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.guidance.verify_helper_bridge"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/.agents/plugins/marketplace.json",
      ),
    ).toBeTruthy();
    expect(screen.getByText("bridge verification pending")).toBeTruthy();
  });

  it("renders error state when bridge loading fails", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: null,
      isLoading: false,
      error: "ipc unavailable",
      refresh: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText("settings.computerUse.loadFailed: ipc unavailable"),
    ).toBeTruthy();
  });

  it("renders unsupported guidance for windows hosts", () => {
    useComputerUseBridgeStatusMock.mockReturnValue({
      status: {
        featureEnabled: true,
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
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<ComputerUseStatusCard />);

    expect(
      screen.getByText("settings.computerUse.status.unsupported"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.reason.platform_unsupported"),
    ).toBeTruthy();
    expect(
      screen.getByText("settings.computerUse.guidance.unsupported_platform"),
    ).toBeTruthy();
    expect(screen.getByText("windows")).toBeTruthy();
    expect(screen.getAllByText("settings.computerUse.value.no")).toHaveLength(3);
  });
});
