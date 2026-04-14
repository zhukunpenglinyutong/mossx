import { beforeEach, describe, expect, it, vi } from "vitest";

const clientStorageMocks = vi.hoisted(() => ({
  getClientStoreSync: vi.fn(),
  isPreloaded: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

vi.mock("./clientStorage", () => clientStorageMocks);

const EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY = "ccgui.bootstrapRendererDiagnostics";
const testLocalStorage = globalThis.localStorage;

describe("rendererDiagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    testLocalStorage.clear();
    clientStorageMocks.getClientStoreSync.mockReset();
    clientStorageMocks.isPreloaded.mockReset();
    clientStorageMocks.writeClientStoreValue.mockReset();
  });

  it("buffers diagnostics until client stores are preloaded", async () => {
    clientStorageMocks.isPreloaded.mockReturnValue(false);
    const diagnostics = await import("./rendererDiagnostics");

    diagnostics.appendRendererDiagnostic("window/focus", { hasFocus: true });
    expect(clientStorageMocks.writeClientStoreValue).not.toHaveBeenCalled();

    clientStorageMocks.isPreloaded.mockReturnValue(true);
    clientStorageMocks.getClientStoreSync.mockReturnValue([]);

    diagnostics.flushRendererDiagnosticsBuffer();

    expect(clientStorageMocks.writeClientStoreValue).toHaveBeenCalledWith(
      "app",
      "diagnostics.rendererLifecycleLog",
      [
        expect.objectContaining({
          label: "window/focus",
          payload: { hasFocus: true },
        }),
      ],
      { immediate: true },
    );
  });

  it("persists buffered diagnostics to localStorage before preload completes", async () => {
    clientStorageMocks.isPreloaded.mockReturnValue(false);
    const diagnostics = await import("./rendererDiagnostics");

    diagnostics.appendRendererDiagnostic("bootstrap/start");
    diagnostics.flushRendererDiagnosticsBuffer();

    expect(clientStorageMocks.writeClientStoreValue).not.toHaveBeenCalled();
    expect(JSON.parse(testLocalStorage.getItem(EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY) ?? "[]")).toEqual([
      expect.objectContaining({
        label: "bootstrap/start",
      }),
    ]);
  });

  it("merges early persisted diagnostics into the client store after preload", async () => {
    testLocalStorage.setItem(
      EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify([
        {
          timestamp: 1,
          label: "bootstrap/failed",
          payload: { error: "Error: preload failed" },
        },
      ]),
    );
    clientStorageMocks.isPreloaded.mockReturnValue(true);
    clientStorageMocks.getClientStoreSync.mockReturnValue([]);
    const diagnostics = await import("./rendererDiagnostics");

    diagnostics.flushRendererDiagnosticsBuffer();

    expect(clientStorageMocks.writeClientStoreValue).toHaveBeenCalledWith(
      "app",
      "diagnostics.rendererLifecycleLog",
      [
        expect.objectContaining({
          label: "bootstrap/failed",
          payload: { error: "Error: preload failed" },
        }),
      ],
      { immediate: true },
    );
    expect(testLocalStorage.getItem(EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY)).toBeNull();
  });

  it("trims persisted diagnostics to the newest 200 entries", async () => {
    clientStorageMocks.isPreloaded.mockReturnValue(true);
    clientStorageMocks.getClientStoreSync.mockReturnValue(
      Array.from({ length: 200 }, (_, index) => ({
        timestamp: index,
        label: `old-${index}`,
        payload: { index },
      })),
    );
    const diagnostics = await import("./rendererDiagnostics");

    diagnostics.appendRendererDiagnostic("window/pageshow", { persisted: false });

    const [, , persistedEntries] = clientStorageMocks.writeClientStoreValue.mock.calls[0] ?? [];
    expect(Array.isArray(persistedEntries)).toBe(true);
    expect(persistedEntries).toHaveLength(200);
    expect(persistedEntries[0]).toMatchObject({ label: "old-1" });
    expect(persistedEntries[199]).toMatchObject({ label: "window/pageshow" });
  });

  it("falls back to an empty diagnostics list when persisted cache is malformed", async () => {
    clientStorageMocks.isPreloaded.mockReturnValue(true);
    clientStorageMocks.getClientStoreSync.mockReturnValue({ broken: true });
    const diagnostics = await import("./rendererDiagnostics");

    diagnostics.appendRendererDiagnostic("bootstrap/start");

    expect(clientStorageMocks.writeClientStoreValue).toHaveBeenCalledWith(
      "app",
      "diagnostics.rendererLifecycleLog",
      [
        expect.objectContaining({
          label: "bootstrap/start",
        }),
      ],
      { immediate: true },
    );
  });

  it("installs lifecycle listeners only once", async () => {
    clientStorageMocks.isPreloaded.mockReturnValue(false);
    const windowMock = {
      addEventListener: vi.fn(),
      location: { href: "https://example.test/renderer" },
    };
    const documentMock = {
      addEventListener: vi.fn(),
      visibilityState: "visible",
      readyState: "complete",
      hidden: false,
      hasFocus: () => true,
    };
    vi.stubGlobal("window", windowMock);
    vi.stubGlobal("document", documentMock);
    const diagnostics = await import("./rendererDiagnostics");

    diagnostics.installRendererLifecycleDiagnostics();
    const windowListenerCallsAfterFirstInstall = windowMock.addEventListener.mock.calls.length;
    const documentListenerCallsAfterFirstInstall = documentMock.addEventListener.mock.calls.length;

    diagnostics.installRendererLifecycleDiagnostics();

    expect(windowListenerCallsAfterFirstInstall).toBeGreaterThan(0);
    expect(documentListenerCallsAfterFirstInstall).toBeGreaterThan(0);
    expect(windowMock.addEventListener).toHaveBeenCalledTimes(windowListenerCallsAfterFirstInstall);
    expect(documentMock.addEventListener).toHaveBeenCalledTimes(documentListenerCallsAfterFirstInstall);
  });
});
