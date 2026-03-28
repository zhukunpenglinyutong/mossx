// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import { WebServiceSettings } from "./WebServiceSettings";

const getWebServerStatusMock = vi.fn();
const startWebServerMock = vi.fn();
const stopWebServerMock = vi.fn();
const getDaemonStatusMock = vi.fn();
const startDaemonMock = vi.fn();
const stopDaemonMock = vi.fn();

vi.mock("@/services/tauri", () => ({
  getWebServerStatus: (...args: unknown[]) => getWebServerStatusMock(...args),
  startWebServer: (...args: unknown[]) => startWebServerMock(...args),
  stopWebServer: (...args: unknown[]) => stopWebServerMock(...args),
  getDaemonStatus: (...args: unknown[]) => getDaemonStatusMock(...args),
  startDaemon: (...args: unknown[]) => startDaemonMock(...args),
  stopDaemon: (...args: unknown[]) => stopDaemonMock(...args),
}));

const baseSettings = {
  remoteBackendHost: "127.0.0.1:4732",
  webServicePort: 3080,
} as AppSettings;

function identityTranslator(key: string): string {
  return key;
}

describe("WebServiceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDaemonStatusMock.mockResolvedValue({
      running: false,
      host: "127.0.0.1:4732",
      lastError: null,
    });
    startDaemonMock.mockResolvedValue({
      running: true,
      host: "127.0.0.1:4732",
      lastError: null,
    });
    stopDaemonMock.mockResolvedValue({
      running: false,
      host: "127.0.0.1:4732",
      lastError: null,
    });
  });
  afterEach(() => {
    cleanup();
  });

  it("renders running status and masked token", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: true,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: ["http://127.0.0.1:3080"],
      webAccessToken: "abcd1234efgh5678",
      lastError: null,
    });

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={baseSettings}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await screen.findByText("settings.webServiceRunning");
    expect(screen.getByRole("button", { name: "settings.webServiceStop" })).toBeTruthy();
    expect(screen.getByDisplayValue("http://127.0.0.1:3080")).toBeTruthy();
    expect(screen.getByDisplayValue(/••••/)).toBeTruthy();
  });

  it("blocks invalid port on blur", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={baseSettings}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const portInput = await screen.findByLabelText("settings.webServicePortAriaLabel");
    fireEvent.change(portInput, { target: { value: "80" } });
    fireEvent.blur(portInput);

    await waitFor(() => {
      expect(screen.getByText("settings.webServicePortInvalid")).toBeTruthy();
    });
    expect(startWebServerMock).not.toHaveBeenCalled();
    expect(stopWebServerMock).not.toHaveBeenCalled();
  });

  it("starts daemon from daemon controls", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={baseSettings}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const startDaemonButton = await screen.findByRole("button", {
      name: "settings.webServiceDaemonStart",
    });
    fireEvent.click(startDaemonButton);

    await waitFor(() => {
      expect(startDaemonMock).toHaveBeenCalledTimes(1);
    });
  });
});
