import { useTranslation } from "react-i18next";
import type { CodexProviderConfig } from "../types";

interface CodexProviderListProps {
  providers: CodexProviderConfig[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (provider: CodexProviderConfig) => void;
  onDelete: (provider: CodexProviderConfig) => void;
  onSwitch: (id: string) => void;
}

export function CodexProviderList({
  providers,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onSwitch,
}: CodexProviderListProps) {
  const { t } = useTranslation();

  return (
    <div className="vendor-provider-list">
      <div className="vendor-list-header">
        <span className="vendor-list-title">
          {t("settings.vendor.allCodexProviders")}
        </span>
        <button type="button" className="vendor-btn-add" onClick={onAdd}>
          + {t("settings.vendor.add")}
        </button>
      </div>

      {loading && (
        <div className="vendor-loading">{t("settings.loading")}</div>
      )}

      <div className="vendor-cards">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`vendor-card ${provider.isActive ? "active" : ""}`}
          >
            <div className="vendor-card-info">
              <div className="vendor-card-name">{provider.name}</div>
              {provider.remark && (
                <div className="vendor-card-remark" title={provider.remark}>
                  {provider.remark}
                </div>
              )}
              {provider.customModels && provider.customModels.length > 0 && (
                <span className="vendor-badge">
                  {provider.customModels.length}{" "}
                  {t("settings.vendor.customModels")}
                </span>
              )}
            </div>
            <div className="vendor-card-actions">
              {provider.isActive ? (
                <span className="vendor-active-badge">
                  {t("settings.vendor.inUse")}
                </span>
              ) : (
                <button
                  type="button"
                  className="vendor-btn-enable"
                  onClick={() => onSwitch(provider.id)}
                >
                  {t("settings.vendor.enable")}
                </button>
              )}
              <button
                type="button"
                className="vendor-btn-icon"
                onClick={() => onEdit(provider)}
                title={t("settings.vendor.edit")}
              >
                &#9998;
              </button>
              <button
                type="button"
                className="vendor-btn-icon vendor-btn-danger"
                onClick={() => onDelete(provider)}
                title={t("settings.vendor.delete")}
              >
                &#128465;
              </button>
            </div>
          </div>
        ))}

        {!loading && providers.length === 0 && (
          <div className="vendor-empty">
            {t("settings.vendor.emptyCodexState")}
          </div>
        )}
      </div>
    </div>
  );
}
