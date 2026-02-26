import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en";
import zh from "../../i18n/locales/zh";
import { SPEC_HUB_VISIBLE_COPY_KEYS } from "./specHubVisibleCopyKeys";

function resolveLocaleValue(locale: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, locale);
}

describe("specHub visible copy i18n coverage", () => {
  it("has zh-CN entries for all visible copy keys", () => {
    const missing = SPEC_HUB_VISIBLE_COPY_KEYS.filter((key) => {
      const value = resolveLocaleValue(zh as Record<string, unknown>, key);
      return typeof value !== "string" || value.trim().length === 0;
    });
    expect(missing).toEqual([]);
  });

  it("has en-US entries for all visible copy keys", () => {
    const missing = SPEC_HUB_VISIBLE_COPY_KEYS.filter((key) => {
      const value = resolveLocaleValue(en as Record<string, unknown>, key);
      return typeof value !== "string" || value.trim().length === 0;
    });
    expect(missing).toEqual([]);
  });
});
