import type { EngineType } from "../../../types";
import type { EngineDisplayInfo } from "../hooks/useEngineController";

const IMPLEMENTED_ENGINE_SET = new Set<EngineType>([
  "claude",
  "codex",
  "opencode",
]);

export function isEngineImplemented(engine: EngineType): boolean {
  return IMPLEMENTED_ENGINE_SET.has(engine);
}

export function isEngineInstalled(
  engines: EngineDisplayInfo[],
  engine: EngineType,
): boolean {
  return engines.some((item) => item.type === engine && item.installed);
}

export function isEngineSelectable(
  engines: EngineDisplayInfo[],
  engine: EngineType,
): boolean {
  return isEngineImplemented(engine) && isEngineInstalled(engines, engine);
}

export function getEngineAvailabilityStatusKey(
  engines: EngineDisplayInfo[],
  engine: EngineType,
): string | null {
  if (!isEngineImplemented(engine)) {
    return "workspace.engineComingSoon";
  }
  if (!isEngineInstalled(engines, engine)) {
    return "sidebar.cliNotInstalled";
  }
  return null;
}
