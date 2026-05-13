// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetRealtimePerfFlagCacheForTests,
  isBackgroundBufferedFlushEnabled,
  isBackgroundRenderGatingEnabled,
  isStagedHydrationEnabled,
} from "./realtimePerfFlags";

describe("realtimePerfFlags background scheduling rollback flags", () => {
  afterEach(() => {
    window.localStorage.clear();
    __resetRealtimePerfFlagCacheForTests();
  });

  it("enables background scheduling layers by default", () => {
    expect(isBackgroundRenderGatingEnabled()).toBe(true);
    expect(isBackgroundBufferedFlushEnabled()).toBe(true);
    expect(isStagedHydrationEnabled()).toBe(true);
  });

  it("allows each background scheduling layer to be disabled independently", () => {
    window.localStorage.setItem("ccgui.perf.backgroundRenderGating", "off");
    window.localStorage.setItem("ccgui.perf.backgroundBufferedFlush", "false");
    window.localStorage.setItem("ccgui.perf.stagedHydration", "0");

    expect(isBackgroundRenderGatingEnabled()).toBe(false);
    expect(isBackgroundBufferedFlushEnabled()).toBe(false);
    expect(isStagedHydrationEnabled()).toBe(false);
  });
});
