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
}: EngineSelectorProps & { showLabel?: boolean }) {
  const { t } = useTranslation();

  // Hide if only one engine is installed and showOnlyIfMultiple is true
  const installedEngines = engines.filter((e) => e.installed);
  if (showOnlyIfMultiple && installedEngines.length <= 1) {
    return null;
  }

  const selectedEngineInfo = engines.find((e) => e.type === selectedEngine);

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
        onChange={(e) => onSelectEngine(e.target.value as EngineType)}
        disabled={disabled}
      >
        {installedEngines.map((engine) => (
          <option key={engine.type} value={engine.type}>
            {engine.shortName}
            {engine.version ? ` (${engine.version})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
