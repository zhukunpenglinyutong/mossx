import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { CodexProviderConfig, CodexCustomModel } from "../types";

interface CodexProviderDialogProps {
  isOpen: boolean;
  provider: CodexProviderConfig | null;
  onClose: () => void;
  onSave: (provider: CodexProviderConfig) => void;
}

export function CodexProviderDialog({
  isOpen,
  provider,
  onClose,
  onSave,
}: CodexProviderDialogProps) {
  const { t } = useTranslation();
  const isAdding = !provider;

  const [providerName, setProviderName] = useState("");
  const [configToml, setConfigToml] = useState("");
  const [authJson, setAuthJson] = useState("");
  const [customModels, setCustomModels] = useState<CodexCustomModel[]>([]);
  const [newModelId, setNewModelId] = useState("");
  const [newModelLabel, setNewModelLabel] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (provider) {
        setProviderName(provider.name || "");
        setConfigToml(provider.configToml || "");
        setAuthJson(provider.authJson || "");
        setCustomModels(provider.customModels || []);
      } else {
        setProviderName("");
        setConfigToml(`disable_response_storage = true
model = "gpt-5.1-codex"
model_reasoning_effort = "high"
model_provider = "crs"

[model_providers.crs]
base_url = "https://api.example.com/v1"
name = "crs"
requires_openai_auth = true
wire_api = "responses"`);
        setAuthJson(`{
  "OPENAI_API_KEY": ""
}`);
        setCustomModels([]);
      }
      setNewModelId("");
      setNewModelLabel("");
    }
  }, [isOpen, provider]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  const handleAddModel = () => {
    if (!newModelId.trim() || !newModelLabel.trim()) return;
    if (customModels.some((m) => m.id === newModelId.trim())) return;
    setCustomModels([
      ...customModels,
      { id: newModelId.trim(), label: newModelLabel.trim() },
    ]);
    setNewModelId("");
    setNewModelLabel("");
  };

  const handleRemoveModel = (id: string) => {
    setCustomModels(customModels.filter((m) => m.id !== id));
  };

  const handleSave = () => {
    if (!providerName.trim()) return;

    if (authJson.trim()) {
      try {
        JSON.parse(authJson);
      } catch {
        return;
      }
    }

    const providerData: CodexProviderConfig = {
      id: provider?.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
      name: providerName.trim(),
      createdAt: provider?.createdAt,
      configToml: configToml.trim(),
      authJson: authJson.trim(),
      customModels: customModels.length > 0 ? customModels : undefined,
    };

    onSave(providerData);
  };

  if (!isOpen) return null;

  return (
    <div className="vendor-dialog-overlay" onClick={onClose}>
      <div
        className="vendor-dialog vendor-dialog-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vendor-dialog-header">
          <h3>
            {isAdding
              ? t("settings.vendor.codexDialog.addTitle")
              : t("settings.vendor.codexDialog.editTitle")}
          </h3>
          <button type="button" className="vendor-dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="vendor-dialog-body">
          <div className="vendor-form-group">
            <label>{t("settings.vendor.dialog.providerName")} *</label>
            <input
              type="text"
              className="vendor-input"
              placeholder={t("settings.vendor.codexDialog.namePlaceholder")}
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          </div>

          <div className="vendor-form-group">
            <label>config.toml *</label>
            <textarea
              className="vendor-code-editor"
              value={configToml}
              onChange={(e) => setConfigToml(e.target.value)}
              rows={12}
            />
            <small className="vendor-hint">
              {t("settings.vendor.codexDialog.configHint")}
            </small>
          </div>

          <div className="vendor-form-group">
            <label>auth.json</label>
            <textarea
              className="vendor-code-editor"
              value={authJson}
              onChange={(e) => setAuthJson(e.target.value)}
              rows={5}
            />
            <small className="vendor-hint">
              {t("settings.vendor.codexDialog.authHint")}
            </small>
          </div>

          <div className="vendor-form-group">
            <label>
              {t("settings.vendor.codexDialog.customModels")}{" "}
              <span className="vendor-optional">
                ({t("settings.vendor.optional")})
              </span>
            </label>
            <div className="vendor-custom-models">
              {customModels.map((model) => (
                <div key={model.id} className="vendor-model-item">
                  <span className="vendor-model-id">{model.id}</span>
                  <span className="vendor-model-label">{model.label}</span>
                  <button
                    type="button"
                    className="vendor-btn-icon vendor-btn-danger"
                    onClick={() => handleRemoveModel(model.id)}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <div className="vendor-model-add">
                <input
                  type="text"
                  className="vendor-input vendor-input-sm"
                  placeholder="Model ID"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                />
                <input
                  type="text"
                  className="vendor-input vendor-input-sm"
                  placeholder="Label"
                  value={newModelLabel}
                  onChange={(e) => setNewModelLabel(e.target.value)}
                />
                <button
                  type="button"
                  className="vendor-btn-add-sm"
                  onClick={handleAddModel}
                  disabled={!newModelId.trim() || !newModelLabel.trim()}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="vendor-dialog-footer">
          <button type="button" className="vendor-btn-cancel" onClick={onClose}>
            {t("settings.vendor.cancel")}
          </button>
          <button
            type="button"
            className="vendor-btn-save"
            onClick={handleSave}
            disabled={!providerName.trim()}
          >
            {isAdding
              ? t("settings.vendor.dialog.confirmAdd")
              : t("settings.vendor.dialog.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}
