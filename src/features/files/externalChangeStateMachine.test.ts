import { describe, expect, it } from "vitest";
import {
  reduceExternalChangeSyncState,
  type ExternalChangeSyncState,
} from "./externalChangeStateMachine";

describe("externalChangeStateMachine", () => {
  it("supports clean auto-sync transition", () => {
    let state: ExternalChangeSyncState = "in-sync";
    state = reduceExternalChangeSyncState(state, { type: "external-change-detected-clean" });
    expect(state).toBe("refreshing");
    state = reduceExternalChangeSyncState(state, { type: "refresh-applied" });
    expect(state).toBe("external-changed-clean");
    state = reduceExternalChangeSyncState(state, { type: "notice-cleared" });
    expect(state).toBe("in-sync");
  });

  it("supports dirty conflict flow", () => {
    let state: ExternalChangeSyncState = "in-sync";
    state = reduceExternalChangeSyncState(state, { type: "external-change-detected-dirty" });
    expect(state).toBe("external-changed-dirty");
    state = reduceExternalChangeSyncState(state, { type: "conflict-reload" });
    expect(state).toBe("external-changed-clean");
  });

  it("keeps state stable for invalid transitions", () => {
    const state = reduceExternalChangeSyncState("in-sync", { type: "notice-cleared" });
    expect(state).toBe("in-sync");
  });
});
