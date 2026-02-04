import { useTranslation } from "react-i18next";
import type { EngineType } from "../../../types";
import type { EngineDisplayInfo } from "../hooks/useEngineController";
import { EngineIcon } from "./EngineIcon";

type EngineSelectorProps = {
  engines: EngineDisplayInfo[];
  selectedEngine: EngineType;
  onSelectEngine: (engine: EngineType) => void;
  disabled?: boolean;
  showOnlyIfMultiple?: boolean;
  showAllEngines?: boolean;
};

/** All supported engine types in display order */
const ALL_ENGINE_TYPES: EngineType[] = ["claude", "codex", "gemini", "opencode"];

/** Engines that are fully implemented (not installed just means CLI not found) */
const IMPLEMENTED_ENGINES: EngineType[] = ["claude", "codex"];

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
    const engineInfo = engineList.find((eng) => eng.type === newEngine);
    // Only allow selection if engine is installed
    if (engineInfo?.installed) {
      onSelectEngine(newEngine);
    }
  };

  return (
    <div className="composer-select-wrap">
      <span className="composer-icon" aria-hidden>
        <EngineIcon engine={selectedEngine} size={16} />
      </span>
      {showLabel && selectedEngineInfo && (
        <span className="composer-select-value">
          {selectedEngineInfo.shortName}
        </span>
      )}
      <select
        className="composer-select composer-select--engine"
        aria-label={t("composer.engine")}
        value={selectedEngine}
        onChange={handleChange}
        disabled={disabled}
      >
        {engineList.map((engine) => {
          // Determine the status text for uninstalled engines
          const isImplemented = IMPLEMENTED_ENGINES.includes(engine.type);
          const statusText = !engine.installed
            ? isImplemented
              ? t("sidebar.cliNotInstalled")  // "未安装" for Claude/Codex
              : t("sidebar.cliComingSoon")    // "即将推出" for Gemini/OpenCode
            : "";

          return (
            <option
              key={engine.type}
              value={engine.type}
              disabled={!engine.installed}
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
