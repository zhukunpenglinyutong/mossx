import { describe, expect, it } from "vitest";
import { buildRuntimeSessionSchedulingDiagnostic } from "./runtimeSessionSchedulingDiagnostics";

describe("buildRuntimeSessionSchedulingDiagnostic", () => {
  it("normalizes visibility-aware performance evidence", () => {
    expect(
      buildRuntimeSessionSchedulingDiagnostic(
        {
          workspaceId: " workspace-1 ",
          threadId: "thread-1",
          engine: "codex",
          turnId: "turn-1",
          visibility: "background",
          ingressCadenceMs: 12.5,
          bufferDepth: 3.7,
          flushDurationMs: -1,
          renderCostMs: Number.NaN,
          longTaskCount: 2.9,
          rollbackFlags: {
            backgroundRenderGating: true,
            backgroundBufferedFlush: false,
            stagedHydration: true,
          },
        },
        123.9,
      ),
    ).toEqual({
      workspaceId: "workspace-1",
      threadId: "thread-1",
      engine: "codex",
      turnId: "turn-1",
      visibility: "background",
      ingressCadenceMs: 12.5,
      bufferDepth: 3,
      flushDurationMs: 0,
      renderCostMs: null,
      longTaskCount: 2,
      rollbackFlags: {
        backgroundRenderGating: true,
        backgroundBufferedFlush: false,
        stagedHydration: true,
      },
      emittedAtMs: 123,
    });
  });
});
