import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import en from "../../i18n/locales/en";
import zh from "../../i18n/locales/zh";

describe("specHub i18n language switch", () => {
  it("switches key texts between en-US and zh-CN without exposing raw keys", async () => {
    const i18n = createInstance();
    await i18n.init({
      resources: {
        en: { translation: en },
        zh: { translation: zh },
      },
      lng: "en",
      fallbackLng: "en",
      interpolation: {
        escapeValue: false,
      },
    });

    const keys = [
      "specHub.applyExecution.title",
      "specHub.filter.archived",
      "specHub.placeholder.notAvailable",
    ] as const;

    const enValues = keys.map((key) => i18n.t(key));
    await i18n.changeLanguage("zh");
    const zhValues = keys.map((key) => i18n.t(key));

    keys.forEach((key, index) => {
      expect(enValues[index]).not.toBe(key);
      expect(zhValues[index]).not.toBe(key);
      expect(enValues[index]).not.toBe("");
      expect(zhValues[index]).not.toBe("");
    });
    expect(enValues).not.toEqual(zhValues);
  });
});
