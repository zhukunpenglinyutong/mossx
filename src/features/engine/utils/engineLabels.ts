import type { EngineDisplayInfo } from "../hooks/useEngineController";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatEngineVersionLabel(engine: EngineDisplayInfo): string | null {
  const rawVersion = engine.version?.trim();
  if (!rawVersion) {
    return null;
  }

  let normalized = rawVersion.replace(/\s+/g, " ").trim();

  const engineNameInParenPattern = new RegExp(
    `\\(\\s*${escapeRegex(engine.displayName)}\\s*\\)`,
    "ig",
  );
  normalized = normalized.replace(engineNameInParenPattern, "").trim();

  if (engine.type === "codex" && /^codex(?:-cli)?\s+/i.test(normalized)) {
    const codexVersionMatch = normalized.match(
      /(?:^|\s)(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)(?:\s|$)/,
    );
    if (codexVersionMatch?.[1]) {
      normalized = codexVersionMatch[1];
    }
  }

  return normalized || null;
}
