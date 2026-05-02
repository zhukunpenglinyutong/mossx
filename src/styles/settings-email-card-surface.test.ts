import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const settingsCss = readFileSync(
  fileURLToPath(new URL("./settings.part2.css", import.meta.url)),
  "utf8",
);

function getCssRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("settings email card surface", () => {
  it("keeps email sender card surfaces theme-driven outside the basic settings section", () => {
    const cardRule = getCssRuleBlock(settingsCss, ".settings-email-card");
    const cardBeforeRule = getCssRuleBlock(settingsCss, '.settings-email-card[data-slot="card"]::before');
    const headerRule = getCssRuleBlock(
      settingsCss,
      ".settings-email-card .settings-card-switch-header",
    );
    const contentRule = getCssRuleBlock(
      settingsCss,
      ".settings-email-card .settings-basic-sounds-card-content",
    );

    expect(cardRule).toContain("background: var(--surface-card);");
    expect(cardRule).toContain("border: 1px solid var(--border-muted);");
    expect(cardBeforeRule).toContain("box-shadow: none;");
    expect(headerRule).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(contentRule).toContain("display: flex;");
    expect(settingsCss).not.toMatch(
      /\.settings-email-card\s*\{[^}]*background:\s*(?:#000|black|rgba\(\s*0,\s*0,\s*0)/is,
    );
  });
});
