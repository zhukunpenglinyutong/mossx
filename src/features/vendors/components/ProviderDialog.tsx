import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConfig } from "../types";

interface ProviderDialogProps {
  isOpen: boolean;
  provider: ProviderConfig | null;
  onClose: () => void;
  onSave: (data: {
    providerName: string;
    remark: string;
    apiKey: string;
    apiUrl: string;
    jsonConfig: string;
  }) => void;
}

export function ProviderDialog({
  isOpen,
  provider,
  onClose,
  onSave,
}: ProviderDialogProps) {
  const { t } = useTranslation();
  const isAdding = !provider;

  const [providerName, setProviderName] = useState("");
  const [remark, setRemark] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [haikuModel, setHaikuModel] = useState("");
  const [sonnetModel, setSonnetModel] = useState("");
  const [opusModel, setOpusModel] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [jsonConfig, setJsonConfig] = useState("");
  const [jsonError, setJsonError] = useState("");

  const updateEnvField = (key: string, value: string) => {
    try {
      const config = jsonConfig ? JSON.parse(jsonConfig) : {};
      if (!config.env) config.env = {};
      const env = config.env as Record<string, any>;
      const trimmed = typeof value === "string" ? value.trim() : value;
      if (!trimmed) {
        if (Object.prototype.hasOwnProperty.call(env, key)) {
          delete env[key];
        }
        if (Object.keys(env).length === 0) {
          delete config.env;
        }
      } else {
        env[key] = value;
      }
      setJsonConfig(JSON.stringify(config, null, 2));
      setJsonError("");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (provider) {
        setProviderName(provider.name || "");
        setRemark(provider.remark || "");
        setApiKey(
          provider.settingsConfig?.env?.ANTHROPIC_AUTH_TOKEN ||
            provider.settingsConfig?.env?.ANTHROPIC_API_KEY ||
            "",
        );
        setApiUrl(provider.settingsConfig?.env?.ANTHROPIC_BASE_URL || "");
        const env = provider.settingsConfig?.env || {};
        setHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "");
        setSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL || "");
        setOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL || "");
        setJsonConfig(
          JSON.stringify(provider.settingsConfig || { env: {} }, null, 2),
        );
      } else {
        setProviderName("");
        setRemark("");
        setApiKey("");
        setApiUrl("");
        setHaikuModel("");
        setSonnetModel("");
        setOpusModel("");
        setJsonConfig(
          JSON.stringify(
            {
              env: {
                ANTHROPIC_AUTH_TOKEN: "",
                ANTHROPIC_BASE_URL: "",
                ANTHROPIC_MODEL: "",
                ANTHROPIC_DEFAULT_SONNET_MODEL: "",
                ANTHROPIC_DEFAULT_OPUS_MODEL: "",
                ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
              },
            },
            null,
            2,
          ),
        );
      }
      setShowApiKey(false);
      setJsonError("");
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

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJson = e.target.value;
    setJsonConfig(newJson);
    try {
      const config = JSON.parse(newJson);
      const env = config.env || {};
      setApiKey(
        env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || "",
      );
      setApiUrl(env.ANTHROPIC_BASE_URL || "");
      setHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "");
      setSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL || "");
      setOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL || "");
      setJsonError("");
    } catch {
      setJsonError(t("settings.vendor.dialog.jsonError"));
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonConfig);
      setJsonConfig(JSON.stringify(parsed, null, 2));
      setJsonError("");
    } catch {
      setJsonError(t("settings.vendor.dialog.jsonError"));
    }
  };

  const handleSave = () => {
    onSave({ providerName, remark, apiKey, apiUrl, jsonConfig });
  };

  if (!isOpen) return null;

  return (
    <div className="vendor-dialog-overlay" onClick={onClose}>
      <div
        className="vendor-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vendor-dialog-header">
          <h3>
            {isAdding
              ? t("settings.vendor.dialog.addTitle")
              : t("settings.vendor.dialog.editTitle")}
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
              placeholder={t("settings.vendor.dialog.providerNamePlaceholder")}
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          </div>

          <div className="vendor-form-group">
            <label>{t("settings.vendor.dialog.remark")}</label>
            <input
              type="text"
              className="vendor-input"
              placeholder={t("settings.vendor.dialog.remarkPlaceholder")}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          <div className="vendor-form-group">
            <label>{t("settings.vendor.dialog.apiKey")} *</label>
            <div className="vendor-input-row">
              <input
                type={showApiKey ? "text" : "password"}
                className="vendor-input"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  updateEnvField("ANTHROPIC_AUTH_TOKEN", e.target.value);
                }}
              />
              <button
                type="button"
                className="vendor-btn-icon"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div className="vendor-form-group">
            <label>{t("settings.vendor.dialog.apiUrl")} *</label>
            <input
              type="text"
              className="vendor-input"
              placeholder="https://api.anthropic.com"
              value={apiUrl}
              onChange={(e) => {
                setApiUrl(e.target.value);
                updateEnvField("ANTHROPIC_BASE_URL", e.target.value);
              }}
            />
          </div>

          <div className="vendor-form-group">
            <label>{t("settings.vendor.dialog.modelMapping")}</label>
            <div className="vendor-model-grid">
              <div>
                <label>Sonnet</label>
                <input
                  type="text"
                  className="vendor-input"
                  placeholder="claude-sonnet-4-20250514"
                  value={sonnetModel}
                  onChange={(e) => {
                    setSonnetModel(e.target.value);
                    updateEnvField(
                      "ANTHROPIC_DEFAULT_SONNET_MODEL",
                      e.target.value,
                    );
                  }}
                />
              </div>
              <div>
                <label>Opus</label>
                <input
                  type="text"
                  className="vendor-input"
                  placeholder="claude-opus-4-20250514"
                  value={opusModel}
                  onChange={(e) => {
                    setOpusModel(e.target.value);
                    updateEnvField(
                      "ANTHROPIC_DEFAULT_OPUS_MODEL",
                      e.target.value,
                    );
                  }}
                />
              </div>
              <div>
                <label>Haiku</label>
                <input
                  type="text"
                  className="vendor-input"
                  placeholder="claude-haiku-4-5"
                  value={haikuModel}
                  onChange={(e) => {
                    setHaikuModel(e.target.value);
                    updateEnvField(
                      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
                      e.target.value,
                    );
                  }}
                />
              </div>
            </div>
          </div>

          <details className="vendor-advanced" open>
            <summary>{t("settings.vendor.dialog.jsonConfig")}</summary>
            <div className="vendor-json-section">
              <div className="vendor-json-toolbar">
                <button type="button" onClick={handleFormatJson}>
                  {t("settings.vendor.dialog.formatJson")}
                </button>
              </div>
              <textarea
                className="vendor-json-editor"
                value={jsonConfig}
                onChange={handleJsonChange}
                rows={12}
              />
              {jsonError && (
                <div className="vendor-json-error">{jsonError}</div>
              )}
            </div>
          </details>
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
