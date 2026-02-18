import { useTranslation } from "react-i18next";
import type { EngineType } from "../../../types";
import type { EngineDisplayInfo } from "../hooks/useEngineController";
import { EngineIcon } from "./EngineIcon";
import {
  getEngineAvailabilityStatusKey,
  isEngineSelectable,
} from "../utils/engineAvailability";

type EngineSelectorProps = {
  engines: EngineDisplayInfo[];
  selectedEngine: EngineType;
  onSelectEngine: (engine: EngineType) => void;
  disabled?: boolean;
  showOnlyIfMultiple?: boolean;
  showAllEngines?: boolean;
  opencodeStatusTone?: "is-ok" | "is-runtime" | "is-fail";
};

/** All supported engine types in display order */
const ALL_ENGINE_TYPES: EngineType[] = ["claude", "codex", "gemini", "opencode"];

/** Default display info for engines not detected */
const DEFAULT_ENGINE_INFO: Record<EngineType, { displayName: string; shortName: string }> = {
  claude: { displayName: "Claude Code", shortName: "Claude Code" },
  codex: { displayName: "Codex CLI", shortName: "Codex" },
  gemini: { displayName: "Gemini CLI", shortName: "Gemini" },
  opencode: { displayName: "OpenCode", shortName: "OpenCode" },
};

/**
 * Engine selector dropdown component
 */
export function EngineSelector({
  engines,
  selectedEngine,
  onSelectEngine,
  disabled = false,
  showOnlyIfMultiple = true,
  showLabel = false,
  showAllEngines = true,
  opencodeStatusTone,
}: EngineSelectorProps & { showLabel?: boolean }) {
  const { t } = useTranslation();

  // Build the list of engines to show
  const engineList = showAllEngines
    ? ALL_ENGINE_TYPES.map((type) => {
        const detected = engines.find((e) => e.type === type);
        if (detected) {
          return detected;
        }
        // Create a placeholder for undetected engines
        return {
          type,
          displayName: DEFAULT_ENGINE_INFO[type].displayName,
          shortName: DEFAULT_ENGINE_INFO[type].shortName,
          installed: false,
          version: null,
          error: null,
        } as EngineDisplayInfo;
      })
    : engines.filter((e) => e.installed);

  // Hide if only one engine is installed and showOnlyIfMultiple is true (only when not showing all)
  if (!showAllEngines && showOnlyIfMultiple) {
    const installedCount = engines.filter((e) => e.installed).length;
    if (installedCount <= 1) {
      return null;
    }
  }

  const selectedEngineInfo = engineList.find((e) => e.type === selectedEngine);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newEngine = e.target.value as EngineType;
    if (isEngineSelectable(engineList, newEngine)) {
      onSelectEngine(newEngine);
    }
  };

  return (
    <div className="composer-select-wrap" title={selectedEngineInfo?.shortName || selectedEngine}>
      <span className="composer-icon" aria-hidden>
        <EngineIcon engine={selectedEngine} size={16} />
      </span>
      {showLabel && selectedEngineInfo && (
        <span className="composer-select-value">
          {selectedEngineInfo.shortName}
        </span>
      )}
      {selectedEngine === "opencode" && opencodeStatusTone && (
        <span
          className={`composer-engine-status-dot ${opencodeStatusTone}`}
          aria-hidden
          title={
            opencodeStatusTone === "is-ok"
              ? "Provider connected"
              : opencodeStatusTone === "is-runtime"
                ? "Session active"
                : "Provider disconnected"
          }
        />
      )}
      <select
        className="composer-select composer-select--engine"
        aria-label={t("composer.engine")}
        value={selectedEngine}
        onChange={handleChange}
        disabled={disabled}
      >
        {engineList.map((engine) => {
          const statusKey = getEngineAvailabilityStatusKey(engineList, engine.type);
          const statusText = statusKey ? t(statusKey) : "";

          return (
            <option
              key={engine.type}
              value={engine.type}
              disabled={!isEngineSelectable(engineList, engine.type)}
            >
              {engine.shortName}
              {engine.version ? ` (${engine.version})` : ""}
              {statusText ? ` - ${statusText}` : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}
