export type ManagedInstructionAttributionKind =
  | "workspace_context"
  | "engine_injected"
  | "system_injected"
  | "degraded";

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePath(value: unknown) {
  return String(value ?? "").trim().replace(/\\/g, "/").toLowerCase();
}

export function normalizeManagedInstructionSource(source?: string | null) {
  const normalized = normalizeText(source);
  if (!normalized) {
    return "";
  }
  if (normalized === "global_code") {
    return "global_codex";
  }
  return normalized;
}

export function isGlobalManagedInstructionSource(source?: string | null) {
  return normalizeManagedInstructionSource(source).startsWith("global_");
}

export function classifyManagedInstructionAttribution(
  source?: string | null,
  path?: string | null,
): ManagedInstructionAttributionKind {
  const normalizedSource = normalizeManagedInstructionSource(source);
  if (normalizedSource === "workspace_managed") {
    return "workspace_context";
  }
  if (
    normalizedSource === "project_claude"
    || normalizedSource === "project_codex"
    || normalizedSource === "global_claude"
    || normalizedSource === "global_codex"
    || normalizedSource === "global_gemini"
  ) {
    return "engine_injected";
  }
  if (
    normalizedSource === "project_agents"
    || normalizedSource === "global_agents"
    || normalizedSource === "global_claude_plugin"
  ) {
    return "system_injected";
  }

  const normalizedPath = normalizePath(path);
  if (!normalizedPath) {
    return "degraded";
  }
  if (
    normalizedPath.includes("/.claude/skills")
    || normalizedPath.includes("/.claude/commands")
    || normalizedPath.includes("/.codex/skills")
    || normalizedPath.includes("/.codex/commands")
    || normalizedPath.includes("/.gemini/skills")
    || normalizedPath.includes("/.gemini/commands")
  ) {
    return "engine_injected";
  }
  if (
    normalizedPath.includes("/.agents/skills")
    || normalizedPath.includes("/.agents/commands")
    || normalizedPath.includes("/.claude/plugins/cache")
  ) {
    return "system_injected";
  }
  return "degraded";
}
