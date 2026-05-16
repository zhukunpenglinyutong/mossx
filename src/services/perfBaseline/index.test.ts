import { beforeEach, describe, expect, it, vi } from "vitest";

const rendererDiagnosticsMocks = vi.hoisted(() => ({
  appendRendererPerfDiagnostic: vi.fn(),
}));

vi.mock("../rendererDiagnostics", () => rendererDiagnosticsMocks);

describe("perfBaseline", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    rendererDiagnosticsMocks.appendRendererPerfDiagnostic.mockReset();
  });

  it("stays disabled by default", async () => {
    const perfBaseline = await import("./index");

    expect(perfBaseline.isPerfBaselineEnabled()).toBe(false);
    perfBaseline.reportWebVital({
      name: "LCP",
      value: 42,
      rating: "good",
      delta: 42,
      id: "metric-1",
      entries: [],
      navigationType: "navigate",
    });

    expect(rendererDiagnosticsMocks.appendRendererPerfDiagnostic).not.toHaveBeenCalled();
  });

  it("routes web-vitals through renderer diagnostics when explicitly enabled", async () => {
    vi.stubEnv("VITE_ENABLE_PERF_BASELINE", "1");
    vi.stubEnv("NODE_ENV", "development");
    const perfBaseline = await import("./index");

    perfBaseline.reportWebVital({
      name: "INP",
      value: 18,
      rating: "good",
      delta: 18,
      id: "metric-2",
      entries: [],
      navigationType: "reload",
    });

    expect(rendererDiagnosticsMocks.appendRendererPerfDiagnostic).toHaveBeenCalledWith(
      "perf.web-vital",
      expect.objectContaining({
        schemaVersion: "1.0",
        name: "INP",
        value: 18,
        rating: "good",
        navigationType: "reload",
      }),
    );
  });

  it("rejects accidental production collection", async () => {
    const perfBaseline = await import("./index");

    expect(
      perfBaseline.isPerfBaselineEnabled({
        VITE_ENABLE_PERF_BASELINE: "1",
        PROD: true,
      }),
    ).toBe(false);
  });

  it("caps buffered profiler samples to the perf entry limit", async () => {
    vi.stubEnv("VITE_ENABLE_PERF_BASELINE", "1");
    vi.stubEnv("NODE_ENV", "development");
    const perfBaseline = await import("./index");

    for (let index = 0; index < perfBaseline.MAX_PERF_ENTRIES + 2; index += 1) {
      perfBaseline.reportProfilerSample({
        id: `sample-${index}`,
        phase: "mount",
        actualDuration: index,
        baseDuration: index,
        startTime: index,
        commitTime: index,
      });
    }

    const samples = perfBaseline.consumeProfilerSamples();
    expect(samples).toHaveLength(perfBaseline.MAX_PERF_ENTRIES);
    expect(samples[0]?.id).toBe("sample-2");
  });
});
