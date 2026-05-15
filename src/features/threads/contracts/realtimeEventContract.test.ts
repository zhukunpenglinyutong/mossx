import { describe, expect, it } from "vitest";
import { codexRealtimeAdapter } from "../adapters/codexRealtimeAdapter";
import { claudeRealtimeAdapter } from "../adapters/claudeRealtimeAdapter";
import { getRealtimeAdapterByEngine } from "../adapters/realtimeAdapterRegistry";
import {
  CANONICAL_REALTIME_FIXTURES,
  LEGACY_REALTIME_ALIAS_FIXTURES,
  REALTIME_CONTRACT_MATRIX,
} from "./realtimeEventContract";

describe("realtime event contract", () => {
  it("documents every P0 visible streaming semantic in the canonical matrix", () => {
    expect(REALTIME_CONTRACT_MATRIX.map((entry) => entry.semantic)).toEqual([
      "turnStarted",
      "assistantTextDelta",
      "assistantItemCompleted",
      "turnCompleted",
      "reasoningDelta",
      "toolOutputDelta",
      "processingHeartbeat",
      "usageUpdate",
      "turnError",
    ]);
    expect(
      REALTIME_CONTRACT_MATRIX.filter((entry) => entry.route === "normalizedThreadEvent")
        .map((entry) => [entry.semantic, entry.normalizedOperation]),
    ).toEqual([
      ["assistantTextDelta", "appendAgentMessageDelta"],
      ["assistantItemCompleted", "completeAgentMessage"],
      ["reasoningDelta", "appendReasoningContentDelta"],
      ["toolOutputDelta", "appendToolOutputDelta"],
    ]);
  });

  it("keeps turn completion separate from assistant item completion", () => {
    const assistantItemCompleted = REALTIME_CONTRACT_MATRIX.find(
      (entry) => entry.semantic === "assistantItemCompleted",
    );
    const turnCompleted = REALTIME_CONTRACT_MATRIX.find(
      (entry) => entry.semantic === "turnCompleted",
    );

    expect(assistantItemCompleted).toEqual(
      expect.objectContaining({
        appServerMethod: "item/completed",
        route: "normalizedThreadEvent",
        normalizedOperation: "completeAgentMessage",
      }),
    );
    expect(turnCompleted).toEqual(
      expect.objectContaining({
        appServerMethod: "turn/completed",
        route: "appServerHandler",
      }),
    );
    expect(turnCompleted).not.toHaveProperty("normalizedOperation");
  });

  it("maps canonical app-server payloads that enter normalized adapters", () => {
    for (const fixture of CANONICAL_REALTIME_FIXTURES) {
      const matrixEntry = REALTIME_CONTRACT_MATRIX.find(
        (entry) => entry.semantic === fixture.semantic,
      );
      if (matrixEntry?.route !== "normalizedThreadEvent") {
        continue;
      }

      const normalized = getRealtimeAdapterByEngine(fixture.engine).mapEvent({
        workspaceId: fixture.event.workspace_id,
        message: fixture.event.message,
      });

      expect(normalized, fixture.semantic).toBeTruthy();
      expect(normalized?.sourceMethod).toBe(matrixEntry.appServerMethod);
      expect(normalized?.operation).toBe(matrixEntry.normalizedOperation);
      expect(normalized?.workspaceId).toBe(fixture.event.workspace_id);
      expect(normalized?.threadId).toBe("codex:contract-thread");
      expect(normalized?.turnId).toBe("turn-contract-1");
    }
  });

  it("keeps legacy aliases as compatibility input instead of canonical names", () => {
    const textAlias = LEGACY_REALTIME_ALIAS_FIXTURES.find(
      (fixture) => fixture.semantic === "assistantTextDelta",
    );
    const reasoningAlias = LEGACY_REALTIME_ALIAS_FIXTURES.find(
      (fixture) => fixture.semantic === "reasoningDelta",
    );
    if (!textAlias || !reasoningAlias) {
      throw new Error("Missing legacy realtime alias fixture");
    }

    const textAliasEvent = claudeRealtimeAdapter.mapEvent({
      workspaceId: textAlias.event.workspace_id,
      message: textAlias.event.message,
    });
    expect(textAliasEvent?.operation).toBe("appendAgentMessageDelta");
    expect(textAliasEvent?.sourceMethod).toBe("text:delta");
    expect(textAliasEvent?.item.id).toBe("claude:contract-thread:text-delta");
    expect(textAliasEvent?.delta).toBe("legacy text alias delta");

    const canonicalCodexTextAlias = codexRealtimeAdapter.mapEvent({
      workspaceId: textAlias.event.workspace_id,
      message: {
        ...textAlias.event.message,
        params: {
          ...(textAlias.event.message.params as Record<string, unknown>),
          threadId: "codex:contract-thread",
        },
      },
    });
    expect(canonicalCodexTextAlias).toBeNull();

    const reasoningAliasEvent = codexRealtimeAdapter.mapEvent({
      workspaceId: reasoningAlias.event.workspace_id,
      message: reasoningAlias.event.message,
    });
    expect(reasoningAliasEvent?.operation).toBe("appendReasoningContentDelta");
    expect(reasoningAliasEvent?.sourceMethod).toBe("response.reasoning_text.delta");
    expect(reasoningAliasEvent?.delta).toBe("legacy reasoning alias delta");
  });
});
