import { describe, expect, it } from "vitest";
import { formatShortcutForPlatform } from "./shortcuts";

describe("formatShortcutForPlatform", () => {
  it("formats shortcuts with symbols on mac", () => {
    expect(formatShortcutForPlatform("cmd+o", true)).toBe("⌘O");
    expect(formatShortcutForPlatform("cmd+shift+arrowdown", true)).toBe("⌘⇧↓");
  });

  it("formats shortcuts with text labels on non-mac platforms", () => {
    expect(formatShortcutForPlatform("cmd+o", false)).toBe("Ctrl+O");
    expect(formatShortcutForPlatform("cmd+shift+arrowdown", false)).toBe("Ctrl+Shift+Down");
  });
});
