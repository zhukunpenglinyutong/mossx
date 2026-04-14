// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRootMock = vi.hoisted(() => vi.fn());
const renderMock = vi.hoisted(() => vi.fn());
const preloadClientStoresMock = vi.hoisted(() => vi.fn());
const migrateLocalStorageToFileStoreMock = vi.hoisted(() => vi.fn());
const initInputHistoryStoreMock = vi.hoisted(() => vi.fn());
const appendRendererDiagnosticMock = vi.hoisted(() => vi.fn());
const flushRendererDiagnosticsBufferMock = vi.hoisted(() => vi.fn());

vi.mock("react-dom/client", () => ({
  default: {
    createRoot: createRootMock,
  },
}));

vi.mock("./services/clientStorage", () => ({
  preloadClientStores: preloadClientStoresMock,
}));

vi.mock("./services/migrateLocalStorage", () => ({
  migrateLocalStorageToFileStore: migrateLocalStorageToFileStoreMock,
}));

vi.mock("./features/composer/hooks/useInputHistoryStore", () => ({
  initInputHistoryStore: initInputHistoryStoreMock,
}));

vi.mock("./services/rendererDiagnostics", () => ({
  appendRendererDiagnostic: appendRendererDiagnosticMock,
  flushRendererDiagnosticsBuffer: flushRendererDiagnosticsBufferMock,
}));

vi.mock("./components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));

describe("startApp", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    createRootMock.mockReset();
    renderMock.mockReset();
    preloadClientStoresMock.mockReset();
    migrateLocalStorageToFileStoreMock.mockReset();
    initInputHistoryStoreMock.mockReset();
    appendRendererDiagnosticMock.mockReset();
    flushRendererDiagnosticsBufferMock.mockReset();
    createRootMock.mockReturnValue({ render: renderMock });
  });

  it("renders the bootstrap fallback and flushes diagnostics when preload fails early", async () => {
    const preloadError = new Error("preload failed");
    preloadClientStoresMock.mockRejectedValue(preloadError);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { startApp } = await import("./bootstrapApp");

    await startApp();

    expect(appendRendererDiagnosticMock).toHaveBeenNthCalledWith(1, "bootstrap/start");
    expect(appendRendererDiagnosticMock).toHaveBeenNthCalledWith(2, "bootstrap/failed", {
      error: "Error: preload failed",
    });
    expect(flushRendererDiagnosticsBufferMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[bootstrap] Startup failed:", preloadError);

    consoleErrorSpy.mockRestore();
  });
});
