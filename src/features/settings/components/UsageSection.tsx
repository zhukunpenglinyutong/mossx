import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import type { LocalUsageSnapshot, WorkspaceInfo } from "../../../types";
import { localUsageSnapshot } from "../../../services/tauri";
import { Button } from "@/components/ui/button";

type UsageSectionProps = {
  activeWorkspace: WorkspaceInfo | null;
};

type UsageScope = "current" | "all";

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)));
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${value.toFixed(1)}%`;
}

export function UsageSection({ activeWorkspace }: UsageSectionProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<UsageScope>("current");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LocalUsageSnapshot | null>(null);

  const loadSnapshot = useCallback(async () => {
    const needWorkspace = scope === "current";
    if (needWorkspace && !activeWorkspace?.path) {
      setSnapshot(null);
      setError(t("settings.usagePanel.workspaceRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await localUsageSnapshot(
        30,
        needWorkspace ? activeWorkspace?.path ?? null : null,
      );
      setSnapshot(next);
    } catch (loadError) {
      setSnapshot(null);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.path, scope, t]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const recentDays = useMemo(
    () => (snapshot?.days ?? []).slice(-14),
    [snapshot?.days],
  );
  const maxDayTokens = useMemo(
    () => Math.max(1, ...recentDays.map((item) => item.totalTokens)),
    [recentDays],
  );
  const updatedAtLabel = useMemo(() => {
    if (!snapshot?.updatedAt) {
      return null;
    }
    return new Date(snapshot.updatedAt).toLocaleString();
  }, [snapshot?.updatedAt]);

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.usagePanel.title")}</div>
      <div className="settings-section-subtitle">{t("settings.usagePanel.description")}</div>

      <div className="settings-usage-toolbar">
        <div className="settings-segmented">
          <button
            type="button"
            className={`settings-segmented-btn ${scope === "current" ? "active" : ""}`}
            onClick={() => setScope("current")}
          >
            {t("settings.usagePanel.scopeCurrent")}
          </button>
          <button
            type="button"
            className={`settings-segmented-btn ${scope === "all" ? "active" : ""}`}
            onClick={() => setScope("all")}
          >
            {t("settings.usagePanel.scopeAll")}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadSnapshot()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "is-spin" : ""} />
          {t("settings.usagePanel.refresh")}
        </Button>
      </div>

      {updatedAtLabel && (
        <div className="settings-help">
          {t("settings.usagePanel.updatedAt", { time: updatedAtLabel })}
        </div>
      )}

      {error && <div className="settings-inline-error">{error}</div>}

      {loading && (
        <div className="settings-inline-muted">{t("settings.loading")}</div>
      )}

      {!loading && !error && snapshot && (
        <>
          <div className="settings-usage-cards">
            <div className="settings-usage-card">
              <div className="settings-usage-card-label">
                {t("settings.usagePanel.last7DaysTokens")}
              </div>
              <div className="settings-usage-card-value">
                {formatTokenCount(snapshot.totals.last7DaysTokens)}
              </div>
            </div>
            <div className="settings-usage-card">
              <div className="settings-usage-card-label">
                {t("settings.usagePanel.last30DaysTokens")}
              </div>
              <div className="settings-usage-card-value">
                {formatTokenCount(snapshot.totals.last30DaysTokens)}
              </div>
            </div>
            <div className="settings-usage-card">
              <div className="settings-usage-card-label">
                {t("settings.usagePanel.averageDailyTokens")}
              </div>
              <div className="settings-usage-card-value">
                {formatTokenCount(snapshot.totals.averageDailyTokens)}
              </div>
            </div>
            <div className="settings-usage-card">
              <div className="settings-usage-card-label">
                {t("settings.usagePanel.cacheHitRate")}
              </div>
              <div className="settings-usage-card-value">
                {formatPercent(snapshot.totals.cacheHitRatePercent)}
              </div>
            </div>
            <div className="settings-usage-card">
              <div className="settings-usage-card-label">
                {t("settings.usagePanel.peakDay")}
              </div>
              <div className="settings-usage-card-value settings-usage-card-value--small">
                {snapshot.totals.peakDay
                  ? `${snapshot.totals.peakDay} · ${formatTokenCount(snapshot.totals.peakDayTokens)}`
                  : "-"}
              </div>
            </div>
          </div>

          <div className="settings-subsection-title">{t("settings.usagePanel.dailyTrend")}</div>
          {recentDays.length === 0 ? (
            <div className="settings-inline-muted">
              {t("settings.usagePanel.noData")}
            </div>
          ) : (
            <div className="settings-usage-chart">
              {recentDays.map((item) => {
                const height = Math.max(
                  4,
                  Math.round((item.totalTokens / maxDayTokens) * 100),
                );
                return (
                  <div key={item.day} className="settings-usage-bar-item" title={`${item.day}: ${item.totalTokens}`}>
                    <div className="settings-usage-bar-track">
                      <div className="settings-usage-bar-fill" style={{ height: `${height}%` }} />
                    </div>
                    <div className="settings-usage-bar-label">{item.day.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="settings-subsection-title">{t("settings.usagePanel.topModels")}</div>
          {snapshot.topModels.length === 0 ? (
            <div className="settings-inline-muted">
              {t("settings.usagePanel.noData")}
            </div>
          ) : (
            <div className="settings-usage-models">
              {snapshot.topModels.map((item) => (
                <div key={item.model} className="settings-usage-model-row">
                  <span className="settings-usage-model-name">{item.model}</span>
                  <span className="settings-usage-model-meta">
                    {formatTokenCount(item.tokens)} · {formatPercent(item.sharePercent)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
