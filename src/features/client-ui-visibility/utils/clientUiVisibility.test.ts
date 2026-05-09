import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIENT_UI_VISIBILITY_PREFERENCE,
  isClientUiControlPreferenceVisible,
  isClientUiControlVisible,
  isClientUiPanelVisible,
  normalizeClientUiVisibilityPreference,
  setClientUiControlVisibility,
  setClientUiPanelVisibility,
} from "./clientUiVisibility";

describe("clientUiVisibility", () => {
  it("treats missing and malformed preferences as default visibility", () => {
    expect(normalizeClientUiVisibilityPreference(null)).toEqual(
      DEFAULT_CLIENT_UI_VISIBILITY_PREFERENCE,
    );
    expect(
      normalizeClientUiVisibilityPreference({
        panels: { topSessionTabs: "nope", unknown: false },
        controls: { "topTool.terminal": 0, "future.control": false },
      }),
    ).toEqual(DEFAULT_CLIENT_UI_VISIBILITY_PREFERENCE);
  });

  it("keeps the client documentation entry hidden by default", () => {
    expect(
      isClientUiControlVisible(
        DEFAULT_CLIENT_UI_VISIBILITY_PREFERENCE,
        "topTool.clientDocumentation",
      ),
    ).toBe(false);

    const visiblePreference = setClientUiControlVisibility(
      DEFAULT_CLIENT_UI_VISIBILITY_PREFERENCE,
      "topTool.clientDocumentation",
      true,
    );
    expect(isClientUiControlVisible(visiblePreference, "topTool.clientDocumentation")).toBe(true);
  });

  it("ignores unknown keys while applying known booleans", () => {
    const preference = normalizeClientUiVisibilityPreference({
      panels: {
        topSessionTabs: false,
        globalRuntimeNoticeDock: false,
        futurePanel: false,
      },
      controls: {
        "topTool.terminal": false,
        "topTool.clientDocumentation": true,
        "curtain.stickyUserBubble": false,
        "curtain.contextLedger": false,
        "future.control": false,
      },
    });

    expect(preference).toEqual({
      panels: { topSessionTabs: false, globalRuntimeNoticeDock: false },
      controls: {
        "topTool.terminal": false,
        "topTool.clientDocumentation": true,
        "curtain.stickyUserBubble": false,
        "curtain.contextLedger": false,
      },
    });
    expect(isClientUiPanelVisible(preference, "topSessionTabs")).toBe(false);
    expect(isClientUiPanelVisible(preference, "globalRuntimeNoticeDock")).toBe(false);
    expect(isClientUiControlVisible(preference, "topTool.terminal")).toBe(false);
    expect(isClientUiControlVisible(preference, "curtain.stickyUserBubble")).toBe(false);
    expect(isClientUiControlVisible(preference, "curtain.contextLedger")).toBe(false);
  });

  it("applies default hidden controls to legacy preferences that do not mention them", () => {
    const preference = normalizeClientUiVisibilityPreference({
      panels: {},
      controls: { "topTool.terminal": false },
    });

    expect(preference.controls).toEqual({
      "topTool.clientDocumentation": false,
      "topTool.terminal": false,
    });
    expect(isClientUiControlVisible(preference, "topTool.clientDocumentation")).toBe(false);
  });

  it("migrates legacy edits preferences into checkpoint visibility", () => {
    const preference = normalizeClientUiVisibilityPreference({
      panels: {},
      controls: {
        "bottomActivity.edits": false,
      },
    });

    expect(preference.controls).toEqual({
      "topTool.clientDocumentation": false,
      "bottomActivity.checkpoint": false,
    });
    expect(isClientUiControlVisible(preference, "bottomActivity.checkpoint")).toBe(false);
  });

  it("lets parent panel hiding override child visibility without erasing child preference", () => {
    const preference = setClientUiControlVisibility(
      setClientUiPanelVisibility(
        DEFAULT_CLIENT_UI_VISIBILITY_PREFERENCE,
        "rightActivityToolbar",
        false,
      ),
      "rightToolbar.files",
      true,
    );

    expect(isClientUiPanelVisible(preference, "rightActivityToolbar")).toBe(false);
    expect(
      isClientUiControlPreferenceVisible(preference, "rightToolbar.files"),
    ).toBe(true);
    expect(isClientUiControlVisible(preference, "rightToolbar.files")).toBe(false);

    const restored = setClientUiPanelVisibility(
      preference,
      "rightActivityToolbar",
      true,
    );
    expect(isClientUiControlVisible(restored, "rightToolbar.files")).toBe(true);
  });
});
