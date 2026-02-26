import { describe, expect, it } from "vitest";
import { isAbsoluteSpecRootInput, normalizeSpecRootInput } from "./pathUtils";

describe("pathUtils", () => {
  describe("normalizeSpecRootInput", () => {
    it("normalizes mac file uri", () => {
      expect(normalizeSpecRootInput("file:///Users/demo/openspec")).toBe("/Users/demo/openspec");
    });

    it("normalizes windows file uri", () => {
      expect(normalizeSpecRootInput("file:///C:/work/openspec")).toBe("C:/work/openspec");
    });

    it("normalizes localhost windows file uri", () => {
      expect(normalizeSpecRootInput("file://localhost/C:/work/openspec")).toBe("C:/work/openspec");
    });

    it("normalizes unc file uri", () => {
      expect(normalizeSpecRootInput("file://server/share/openspec")).toBe("//server/share/openspec");
    });

    it("keeps plain input unchanged except trim", () => {
      expect(normalizeSpecRootInput("  C:\\work\\openspec  ")).toBe("C:\\work\\openspec");
      expect(normalizeSpecRootInput("  /Users/demo/openspec  ")).toBe("/Users/demo/openspec");
    });

    it("returns null for empty values", () => {
      expect(normalizeSpecRootInput("")).toBeNull();
      expect(normalizeSpecRootInput("  ")).toBeNull();
      expect(normalizeSpecRootInput(null)).toBeNull();
      expect(normalizeSpecRootInput(undefined)).toBeNull();
    });
  });

  describe("isAbsoluteSpecRootInput", () => {
    it("accepts unix and windows absolute paths", () => {
      expect(isAbsoluteSpecRootInput("/Users/demo/openspec")).toBe(true);
      expect(isAbsoluteSpecRootInput("C:\\work\\openspec")).toBe(true);
      expect(isAbsoluteSpecRootInput("C:/work/openspec")).toBe(true);
      expect(isAbsoluteSpecRootInput("\\\\?\\C:\\work\\openspec")).toBe(true);
    });

    it("accepts unc paths", () => {
      expect(isAbsoluteSpecRootInput("\\\\server\\share\\openspec")).toBe(true);
      expect(isAbsoluteSpecRootInput("//server/share/openspec")).toBe(true);
      expect(isAbsoluteSpecRootInput("\\\\?\\UNC\\server\\share\\openspec")).toBe(true);
    });

    it("rejects relative paths", () => {
      expect(isAbsoluteSpecRootInput("openspec")).toBe(false);
      expect(isAbsoluteSpecRootInput("./openspec")).toBe(false);
      expect(isAbsoluteSpecRootInput("C:work\\openspec")).toBe(false);
    });
  });
});
