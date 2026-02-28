import { describe, expect, it } from "vitest";
import type { EngineDisplayInfo } from "../hooks/useEngineController";
import { formatEngineVersionLabel } from "./engineLabels";

function makeEngine(
  overrides: Partial<EngineDisplayInfo> = {},
): EngineDisplayInfo {
  return {
    type: "claude",
    displayName: "Claude Code",
    shortName: "Claude Code",
    installed: true,
    version: null,
    error: null,
    ...overrides,
  };
}

describe("formatEngineVersionLabel", () => {
  it("returns null when version is empty", () => {
    const label = formatEngineVersionLabel(makeEngine({ version: null }));
    expect(label).toBeNull();
  });

  it("removes duplicated engine name suffix for Claude", () => {
    const label = formatEngineVersionLabel(
      makeEngine({ version: "2.1.33 (Claude Code)" }),
    );
    expect(label).toBe("2.1.33");
  });

  it("extracts semantic version from codex-cli output", () => {
    const label = formatEngineVersionLabel(
      makeEngine({
        type: "codex",
        displayName: "Codex CLI",
        shortName: "Codex",
        version: "codex-cli 0.98.0",
      }),
    );
    expect(label).toBe("0.98.0");
  });

  it("keeps opencode version as-is", () => {
    const label = formatEngineVersionLabel(
      makeEngine({
        type: "opencode",
        displayName: "OpenCode",
        shortName: "OpenCode",
        version: "1.1.16",
      }),
    );
    expect(label).toBe("1.1.16");
  });
});
