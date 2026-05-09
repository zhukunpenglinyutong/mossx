// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  webServiceToken: null,
} as AppSettings;

function identityTranslator(key: string): string {
  return key;
}

describe("WebServiceSettings", () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: vi.fn((bytes: Uint8Array) => {
          bytes.fill(10);
          return bytes;
        }),
      },
    });
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
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
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
    expect(
      screen.getByRole("button", { name: "settings.webServiceStop" }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("http://127.0.0.1:3080")).toBeTruthy();
    expect(screen.getByDisplayValue(/••••/)).toBeTruthy();
    expect(
      screen.getByText("settings.webServiceFixedTokenRunningHint"),
    ).toBeTruthy();
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

    const portInput = await screen.findByLabelText(
      "settings.webServicePortAriaLabel",
    );
    fireEvent.change(portInput, { target: { value: "80" } });
    fireEvent.blur(portInput);

    await waitFor(() => {
      expect(screen.getByText("settings.webServicePortInvalid")).toBeTruthy();
    });
    expect(startWebServerMock).not.toHaveBeenCalled();
    expect(stopWebServerMock).not.toHaveBeenCalled();
  });

  it("renders fixed token controls and saves a trimmed fixed token", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={baseSettings}
        onUpdateAppSettings={onUpdateAppSettings}
      />,
    );

    const fixedTokenInput = await screen.findByLabelText(
      "settings.webServiceFixedTokenAriaLabel",
    );
    expect(screen.getByText("settings.webServiceFixedToken")).toBeTruthy();
    expect(
      screen.getByText("settings.webServiceFixedTokenStoppedHint"),
    ).toBeTruthy();

    fireEvent.change(fixedTokenInput, {
      target: { value: "  durable-token  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "settings.webServiceSaveToken" }),
    );

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          webServiceToken: "durable-token",
        }),
      );
    });
  });

  it("clears fixed token back to auto-generate mode", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={{ ...baseSettings, webServiceToken: "durable-token" }}
        onUpdateAppSettings={onUpdateAppSettings}
      />,
    );

    const clearButton = await screen.findByRole("button", {
      name: "settings.webServiceClearToken",
    });
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          webServiceToken: null,
        }),
      );
    });
  });

  it("generates fixed token with Web Crypto and persists it", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={baseSettings}
        onUpdateAppSettings={onUpdateAppSettings}
      />,
    );

    const generateButton = await screen.findByRole("button", {
      name: "settings.webServiceGenerateToken",
    });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(globalThis.crypto.getRandomValues).toHaveBeenCalledTimes(1);
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          webServiceToken: "0a".repeat(24),
        }),
      );
    });
  });

  it("starts without fixed token using explicit auto-generate null", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });
    startWebServerMock.mockResolvedValue({
      running: true,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: ["http://127.0.0.1:3080"],
      webAccessToken: "runtime-generated-token",
      lastError: null,
    });
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={baseSettings}
        onUpdateAppSettings={onUpdateAppSettings}
      />,
    );

    const startButton = await screen.findByRole("button", {
      name: "settings.webServiceStart",
    });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(startWebServerMock).toHaveBeenCalledWith({
        port: 3080,
        token: null,
      });
    });
    expect(onUpdateAppSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        webServiceToken: "runtime-generated-token",
      }),
    );
  });

  it("passes a trimmed fixed token when starting", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });
    startWebServerMock.mockResolvedValue({
      running: true,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: ["http://127.0.0.1:3080"],
      webAccessToken: "durable-token",
      lastError: null,
    });

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={{ ...baseSettings, webServiceToken: "  durable-token  " }}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const startButton = await screen.findByRole("button", {
      name: "settings.webServiceStart",
    });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(startWebServerMock).toHaveBeenCalledWith({
        port: 3080,
        token: "durable-token",
      });
    });
  });

  it("starts with the current fixed token draft before parent settings rerender", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: false,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: [],
      webAccessToken: null,
      lastError: null,
    });
    startWebServerMock.mockResolvedValue({
      running: true,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: ["http://127.0.0.1:3080"],
      webAccessToken: "draft-token",
      lastError: null,
    });
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={{ ...baseSettings, webServiceToken: "old-token" }}
        onUpdateAppSettings={onUpdateAppSettings}
      />,
    );

    const fixedTokenInput = await screen.findByLabelText(
      "settings.webServiceFixedTokenAriaLabel",
    );
    fireEvent.change(fixedTokenInput, { target: { value: "  draft-token  " } });
    fireEvent.click(screen.getByRole("button", { name: "settings.webServiceStart" }));

    await waitFor(() => {
      expect(startWebServerMock).toHaveBeenCalledWith({
        port: 3080,
        token: "draft-token",
      });
    });
  });

  it("does not mutate current runtime token when fixed token changes while running", async () => {
    getWebServerStatusMock.mockResolvedValue({
      running: true,
      rpcEndpoint: "127.0.0.1:4732",
      webPort: 3080,
      addresses: ["http://127.0.0.1:3080"],
      webAccessToken: "current-runtime-token",
      lastError: null,
    });
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);

    render(
      <WebServiceSettings
        t={identityTranslator}
        appSettings={{ ...baseSettings, webServiceToken: "old-fixed-token" }}
        onUpdateAppSettings={onUpdateAppSettings}
      />,
    );

    await screen.findByText("settings.webServiceRunning");
    const fixedTokenInput = screen.getByLabelText(
      "settings.webServiceFixedTokenAriaLabel",
    );
    fireEvent.change(fixedTokenInput, { target: { value: "new-fixed-token" } });
    fireEvent.click(
      screen.getByRole("button", { name: "settings.webServiceSaveToken" }),
    );

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          webServiceToken: "new-fixed-token",
        }),
      );
    });
    expect(
      screen.getByText("settings.webServiceFixedTokenRunningHint"),
    ).toBeTruthy();
    expect(startWebServerMock).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(/••••/)).toBeTruthy();
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
