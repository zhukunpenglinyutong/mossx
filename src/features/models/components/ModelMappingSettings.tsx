import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import X from "lucide-react/dist/esm/icons/x";
import type { ModelMapping } from "../../models/constants";
import {
  getModelMapping,
  saveModelMapping,
} from "../../models/constants";

interface ModelMappingSettingsProps {
  reduceTransparency: boolean;
}

export function ModelMappingSettings({
  // reduceTransparency - reserved for future use
  reduceTransparency: _reduceTransparency,
}: ModelMappingSettingsProps) {
  const { t } = useTranslation();
  const [mapping, setMapping] = useState<ModelMapping>({});
  const [draftValues, setDraftValues] = useState<ModelMapping>({});

  // Load initial mapping
  useEffect(() => {
    setMapping(getModelMapping());
    setDraftValues(getModelMapping());
  }, []);

  const handleSave = useCallback(() => {
    const filtered: ModelMapping = {};
    if (draftValues.sonnet?.trim()) {
      filtered.sonnet = draftValues.sonnet.trim();
    }
    if (draftValues.opus?.trim()) {
      filtered.opus = draftValues.opus.trim();
    }
    if (draftValues.haiku?.trim()) {
      filtered.haiku = draftValues.haiku.trim();
    }
    saveModelMapping(filtered);
    setMapping(filtered);
  }, [draftValues]);

  const handleReset = useCallback(() => {
    const current = getModelMapping();
    setDraftValues(current);
  }, []);

  const handleClear = useCallback(() => {
    const empty: ModelMapping = {};
    saveModelMapping(empty);
    setMapping(empty);
    setDraftValues(empty);
  }, []);

  const hasChanges =
    (draftValues.sonnet ?? "") !== (mapping.sonnet ?? "") ||
    (draftValues.opus ?? "") !== (mapping.opus ?? "") ||
    (draftValues.haiku ?? "") !== (mapping.haiku ?? "");

  const hasAnyMapping =
    (mapping.sonnet ?? "") !== "" ||
    (mapping.opus ?? "") !== "" ||
    (mapping.haiku ?? "") !== "";

  return (
    <div className="settings-card model-mapping-card">
      <div className="settings-card-header">
        <div className="settings-card-title-row">
          <h3 className="settings-card-title">
            {t("settings.modelMappingTitle")}
          </h3>
          {hasAnyMapping && (
            <button
              type="button"
              className="settings-card-badge model-mapping-badge"
              onClick={handleClear}
              title={t("settings.modelMappingClear")}
            >
              <X size={14} />
              {t("settings.clear")}
            </button>
          )}
        </div>
        <p className="settings-card-description">
          {t("settings.modelMappingDescription")}
        </p>
      </div>

      <div className="model-mapping-fields">
        <div className="model-mapping-field">
          <label htmlFor="model-mapping-sonnet" className="model-mapping-label">
            {t("settings.modelMappingSonnet")}
            <span className="model-mapping-default">
              {t("settings.modelMappingDefault", { model: "claude-sonnet-4-5-20250929" })}
            </span>
          </label>
          <input
            id="model-mapping-sonnet"
            type="text"
            className="model-mapping-input"
            placeholder={t("settings.modelMappingPlaceholder")}
            value={draftValues.sonnet ?? ""}
            onChange={(e) =>
              setDraftValues((prev) => ({ ...prev, sonnet: e.target.value }))
            }
          />
        </div>

        <div className="model-mapping-field">
          <label htmlFor="model-mapping-opus" className="model-mapping-label">
            {t("settings.modelMappingOpus")}
            <span className="model-mapping-default">
              {t("settings.modelMappingDefault", { model: "claude-opus-4-5-20251101" })}
            </span>
          </label>
          <input
            id="model-mapping-opus"
            type="text"
            className="model-mapping-input"
            placeholder={t("settings.modelMappingPlaceholder")}
            value={draftValues.opus ?? ""}
            onChange={(e) =>
              setDraftValues((prev) => ({ ...prev, opus: e.target.value }))
            }
          />
        </div>

        <div className="model-mapping-field">
          <label htmlFor="model-mapping-haiku" className="model-mapping-label">
            {t("settings.modelMappingHaiku")}
            <span className="model-mapping-default">
              {t("settings.modelMappingDefault", { model: "claude-haiku-4-5" })}
            </span>
          </label>
          <input
            id="model-mapping-haiku"
            type="text"
            className="model-mapping-input"
            placeholder={t("settings.modelMappingPlaceholder")}
            value={draftValues.haiku ?? ""}
            onChange={(e) =>
              setDraftValues((prev) => ({ ...prev, haiku: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="model-mapping-actions">
        {hasChanges && (
          <>
            <button
              type="button"
              className="model-mapping-button model-mapping-button-secondary"
              onClick={handleReset}
            >
              {t("settings.modelMappingReset")}
            </button>
            <button
              type="button"
              className="model-mapping-button model-mapping-button-primary"
              onClick={handleSave}
            >
              {t("settings.modelMappingSave")}
            </button>
          </>
        )}
      </div>

      <div className="model-mapping-note">
        {t("settings.modelMappingNote")}
      </div>
    </div>
  );
}
