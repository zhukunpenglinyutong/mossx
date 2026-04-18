import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Clock3,
  Flame,
  Pin,
  RefreshCw,
  Snowflake,
  Sparkles,
  SquareTerminal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { AppSettings, RuntimePoolSnapshot } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  getRuntimePoolSnapshot,
  mutateRuntimePool,
} from "../../../../../services/tauri";
import { normalizeBoundedIntegerInput } from "./runtimePoolSection.utils";

type RuntimePoolSectionProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

function formatTimestamp(value?: number | null) {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function getRuntimeTone(state: string) {
  switch (state.toLowerCase()) {
    case "streaming":
      return {
        icon: Activity,
        chip:
          "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-200",
      };
    case "acquired":
      return {
        icon: Flame,
        chip:
          "border-orange-300/60 bg-orange-500/10 text-orange-700 dark:border-orange-400/20 dark:bg-orange-500/12 dark:text-orange-200",
      };
    case "graceful-idle":
      return {
        icon: Snowflake,
        chip:
          "border-sky-300/60 bg-sky-500/10 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/12 dark:text-sky-200",
      };
    case "evictable":
      return {
        icon: Clock3,
        chip:
          "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/12 dark:text-amber-200",
      };
    case "failed":
    case "zombie-suspected":
    case "zombiesuspected":
      return {
        icon: TriangleAlert,
        chip:
          "border-red-300/60 bg-red-500/10 text-red-700 dark:border-red-400/20 dark:bg-red-500/12 dark:text-red-200",
      };
    default:
      return {
        icon: SquareTerminal,
        chip:
          "border-slate-300/60 bg-slate-500/10 text-slate-700 dark:border-slate-400/20 dark:bg-slate-500/12 dark:text-slate-200",
      };
  }
}

function getRuntimeStateLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  state: string,
) {
  switch (state.toLowerCase()) {
    case "starting":
      return t("settings.runtimeStateStarting");
    case "acquired":
      return t("settings.runtimeStateAcquired");
    case "streaming":
      return t("settings.runtimeStateStreaming");
    case "graceful-idle":
      return t("settings.runtimeStateGracefulIdle");
    case "evictable":
      return t("settings.runtimeStateEvictable");
    case "stopping":
      return t("settings.runtimeStateStopping");
    case "failed":
      return t("settings.runtimeStateFailed");
    case "zombie-suspected":
      return t("settings.runtimeStateZombieSuspected");
    default:
      return state;
  }
}

export function RuntimePoolSection({
  t,
  appSettings,
  onUpdateAppSettings,
}: RuntimePoolSectionProps) {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimePoolSnapshot | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [hotDraft, setHotDraft] = useState(String(appSettings.codexMaxHotRuntimes ?? 1));
  const [warmDraft, setWarmDraft] = useState(String(appSettings.codexMaxWarmRuntimes ?? 1));
  const [ttlDraft, setTtlDraft] = useState(String(appSettings.codexWarmTtlSeconds ?? 90));

  useEffect(() => {
    setHotDraft(String(appSettings.codexMaxHotRuntimes ?? 1));
    setWarmDraft(String(appSettings.codexMaxWarmRuntimes ?? 1));
    setTtlDraft(String(appSettings.codexWarmTtlSeconds ?? 90));
  }, [
    appSettings.codexMaxHotRuntimes,
    appSettings.codexMaxWarmRuntimes,
    appSettings.codexWarmTtlSeconds,
  ]);

  const loadSnapshot = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);
    try {
      setRuntimeSnapshot(await getRuntimePoolSnapshot());
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const summaryCards = useMemo(() => {
    const summary = runtimeSnapshot?.summary;
    return [
      {
        key: "total",
        icon: SquareTerminal,
        value: summary?.totalRuntimes ?? 0,
        label: t("settings.runtimeMetricTotal"),
        accent: "from-slate-500/15 to-slate-400/5",
      },
      {
        key: "acquired",
        icon: Flame,
        value: summary?.acquiredRuntimes ?? 0,
        label: t("settings.runtimeMetricAcquired"),
        accent: "from-orange-500/15 to-orange-400/5",
      },
      {
        key: "streaming",
        icon: Activity,
        value: summary?.streamingRuntimes ?? 0,
        label: t("settings.runtimeMetricStreaming"),
        accent: "from-emerald-500/15 to-emerald-400/5",
      },
      {
        key: "idle",
        icon: Snowflake,
        value: summary?.gracefulIdleRuntimes ?? 0,
        label: t("settings.runtimeMetricIdle"),
        accent: "from-sky-500/15 to-sky-400/5",
      },
      {
        key: "evictable",
        icon: Clock3,
        value: summary?.evictableRuntimes ?? 0,
        label: t("settings.runtimeMetricEvictable"),
        accent: "from-amber-500/15 to-amber-400/5",
      },
      {
        key: "pinned",
        icon: Pin,
        value: summary?.pinnedRuntimes ?? 0,
        label: t("settings.runtimeMetricPinned"),
        accent: "from-violet-500/15 to-violet-400/5",
      },
    ];
  }, [runtimeSnapshot?.summary, t]);

  const engineObservabilityCards = useMemo(() => {
    const backendCards = runtimeSnapshot?.engineObservability;
    if (backendCards?.length) {
      return backendCards.map((item) => ({
        ...item,
        label:
          item.engine.trim().toLowerCase() === "claude"
            ? t("settings.runtimeEngineClaude")
            : t("settings.runtimeEngineCodex"),
      }));
    }
    const rows = runtimeSnapshot?.rows ?? [];
    return [
      { engine: "codex", label: t("settings.runtimeEngineCodex") },
      { engine: "claude", label: t("settings.runtimeEngineClaude") },
    ].map((item) => {
      const engineRows = rows.filter(
        (row) => row.engine.trim().toLowerCase() === item.engine,
      );
      const sessionCount = engineRows.length;
      const rootProcessCount = engineRows.reduce(
        (sum, row) =>
          sum +
          (row.processDiagnostics?.rootProcesses ??
            (row.pid !== null ? 1 : 0)),
        0,
      );
      const totalProcessCount = engineRows.reduce((sum, row) => {
        if (row.processDiagnostics?.totalProcesses) {
          return sum + row.processDiagnostics.totalProcesses;
        }
        return sum + (row.pid ? 1 : 0);
      }, 0);
      const nodeProcessCount = engineRows.reduce(
        (sum, row) => sum + (row.processDiagnostics?.nodeProcesses ?? 0),
        0,
      );
      return {
        ...item,
        sessionCount,
        trackedRootProcesses: rootProcessCount,
        trackedTotalProcesses: totalProcessCount,
        trackedNodeProcesses: nodeProcessCount,
        hostManagedRootProcesses: rootProcessCount,
        hostUnmanagedRootProcesses: 0,
        externalRootProcesses: 0,
        hostUnmanagedTotalProcesses: 0,
        externalTotalProcesses: 0,
      };
    });
  }, [runtimeSnapshot?.engineObservability, runtimeSnapshot?.rows, t]);

  const handleRuntimeMutation = async (
    action: "close" | "releaseToCold" | "pin",
    workspaceId: string,
    engine?: string,
    pinned?: boolean,
  ) => {
    setRuntimeSaving(true);
    setRuntimeError(null);
    try {
      const snapshot = await mutateRuntimePool({ action, workspaceId, engine, pinned });
      setRuntimeSnapshot(snapshot);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeSaving(false);
    }
  };

  const handleSaveRuntimeSettings = async () => {
    const nextHot = normalizeBoundedIntegerInput(hotDraft, 1, 0, 8);
    const nextWarm = normalizeBoundedIntegerInput(warmDraft, 1, 0, 16);
    const nextTtl = normalizeBoundedIntegerInput(ttlDraft, 90, 15, 3600);
    setRuntimeSaving(true);
    setRuntimeError(null);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        codexMaxHotRuntimes: nextHot,
        codexMaxWarmRuntimes: nextWarm,
        codexWarmTtlSeconds: nextTtl,
      });
      setHotDraft(String(nextHot));
      setWarmDraft(String(nextWarm));
      setTtlDraft(String(nextTtl));
      await loadSnapshot();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeSaving(false);
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.runtimePanelTitle")}</div>
      <div className="settings-section-subtitle">
        {t("settings.runtimePanelDescription")}
      </div>

      <Card className="border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/70 shadow-sm dark:border-slate-700/80 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.94))] dark:shadow-[0_24px_80px_rgba(2,6,23,0.36)]">
        <CardHeader className="gap-3 px-5 py-5 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm dark:border dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
                <SquareTerminal size={18} />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-[1.15rem] leading-none dark:text-slate-50">
                  {t("settings.runtimePoolTitle")}
                </CardTitle>
                <CardDescription className="max-w-3xl text-sm leading-5 text-slate-600 dark:text-slate-300/90">
                  {t("settings.runtimePoolDescription")}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge className="h-6 px-2.5 text-[11px] dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200" variant="outline">
                {t("settings.runtimeBudgetHotBadge", {
                  count: appSettings.codexMaxHotRuntimes,
                })}
              </Badge>
              <Badge className="h-6 px-2.5 text-[11px] dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200" variant="outline">
                {t("settings.runtimeBudgetWarmBadge", {
                  count: appSettings.codexMaxWarmRuntimes,
                })}
              </Badge>
              <Badge className="h-6 px-2.5 text-[11px] dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200" variant="outline">
                {t("settings.runtimeBudgetTtlBadge", {
                  count: appSettings.codexWarmTtlSeconds,
                })}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2 self-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void loadSnapshot();
              }}
              disabled={runtimeLoading}
              className="h-9 px-3"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("settings.refresh")}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.key}
              className={`overflow-hidden border-slate-200/70 bg-gradient-to-br ${item.accent} dark:border-white/10 dark:from-white/[0.03] dark:to-white/[0.01] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]`}
            >
              <CardContent className="flex items-start justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-1.5 text-2xl font-semibold leading-none text-slate-900 dark:text-slate-50">
                    {item.value}
                  </div>
                </div>
                <div className="rounded-xl border border-white/60 bg-white/80 p-1.5 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:shadow-none">
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-3 border-slate-200/70 dark:border-slate-700/80 dark:bg-slate-900/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-base dark:text-slate-50">
            {t("settings.runtimeEngineObservationTitle")}
          </CardTitle>
          <CardDescription className="text-sm leading-5 dark:text-slate-300/85">
            {t("settings.runtimeEngineObservationDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2.5 px-5 pb-5 pt-0 md:grid-cols-2">
          {engineObservabilityCards.map((item) => (
            <div
              key={item.engine}
              className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</div>
              <div className="mt-2 grid gap-x-4 gap-y-1 text-[13px] leading-5 text-slate-600 dark:text-slate-300/85 sm:grid-cols-2">
                <div>
                  {t("settings.runtimeSessionCountLabel")} {item.sessionCount}
                </div>
                <div>
                  {t("settings.runtimeTrackedRootProcessCountLabel")}{" "}
                  {item.trackedRootProcesses}
                </div>
                <div>
                  {t("settings.runtimeTrackedProcessTreeCountLabel")}{" "}
                  {item.trackedTotalProcesses}
                </div>
                <div>
                  {t("settings.runtimeTrackedNodeProcessCountLabel")}{" "}
                  {item.trackedNodeProcesses}
                </div>
                <div>
                  {t("settings.runtimeHostManagedRootProcessCountLabel")}{" "}
                  {item.hostManagedRootProcesses}
                </div>
                <div>
                  {t("settings.runtimeHostUnmanagedRootProcessCountLabel")}{" "}
                  {item.hostUnmanagedRootProcesses}
                  {` · ${t("settings.runtimeProcessTreeCountLabel", {
                    count: item.hostUnmanagedTotalProcesses,
                  })}`}
                </div>
                <div>
                  {t("settings.runtimeExternalRootProcessCountLabel")}{" "}
                  {item.externalRootProcesses}
                  {` · ${t("settings.runtimeProcessTreeCountLabel", {
                    count: item.externalTotalProcesses,
                  })}`}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.12fr_0.88fr]">
        <Card className="border-slate-200/70 dark:border-slate-700/80 dark:bg-slate-900/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="px-5 py-4">
            <CardTitle className="flex items-center gap-2 text-base dark:text-slate-50">
              <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              {t("settings.runtimePolicyTitle")}
            </CardTitle>
            <CardDescription className="text-sm leading-5 dark:text-slate-300/85">
              {t("settings.runtimePolicyDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2.5 px-5 pb-5 pt-0">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.runtimeRestoreThreadsOnlyOnLaunch")}
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-slate-500 dark:text-slate-400/90">
                    {t("settings.runtimeRestoreThreadsOnlyOnLaunchDesc")}
                  </div>
                </div>
                <Switch
                  checked={appSettings.runtimeRestoreThreadsOnlyOnLaunch !== false}
                  onCheckedChange={(checked) =>
                    void onUpdateAppSettings({
                      ...appSettings,
                      runtimeRestoreThreadsOnlyOnLaunch: checked,
                    })
                  }
                />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.runtimeForceCleanupOnExit")}
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-slate-500 dark:text-slate-400/90">
                    {t("settings.runtimeForceCleanupOnExitDesc")}
                  </div>
                </div>
                <Switch
                  checked={appSettings.runtimeForceCleanupOnExit !== false}
                  onCheckedChange={(checked) =>
                    void onUpdateAppSettings({
                      ...appSettings,
                      runtimeForceCleanupOnExit: checked,
                    })
                  }
                />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("settings.runtimeOrphanSweepOnLaunch")}
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-slate-500 dark:text-slate-400/90">
                    {t("settings.runtimeOrphanSweepOnLaunchDesc")}
                  </div>
                </div>
                <Switch
                  checked={appSettings.runtimeOrphanSweepOnLaunch !== false}
                  onCheckedChange={(checked) =>
                    void onUpdateAppSettings({
                      ...appSettings,
                      runtimeOrphanSweepOnLaunch: checked,
                    })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 dark:border-slate-700/80 dark:bg-slate-900/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="space-y-2 px-5 py-4">
            <CardTitle className="flex items-center gap-2 text-[15px] dark:text-slate-50">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              {t("settings.runtimeBudgetTitle")}
            </CardTitle>
            <CardDescription className="max-w-[44rem] text-[13px] leading-5 dark:text-slate-300/85">
              {t("settings.runtimeBudgetDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 px-5 pb-4 pt-0">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[12px] leading-4 dark:text-slate-200" htmlFor="runtime-hot">
                  {t("settings.runtimeMaxHot")}
                </Label>
                <Input
                  id="runtime-hot"
                  value={hotDraft}
                  onChange={(event) => setHotDraft(event.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-8.5"
                />
                <div className="text-[11px] leading-4 text-slate-500 dark:text-slate-400/90">
                  {t("settings.runtimeMaxHotHelp")}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px] leading-4 dark:text-slate-200" htmlFor="runtime-warm">
                  {t("settings.runtimeMaxWarm")}
                </Label>
                <Input
                  id="runtime-warm"
                  value={warmDraft}
                  onChange={(event) => setWarmDraft(event.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-8.5"
                />
                <div className="text-[11px] leading-4 text-slate-500 dark:text-slate-400/90">
                  {t("settings.runtimeMaxWarmHelp")}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px] leading-4 dark:text-slate-200" htmlFor="runtime-ttl">
                  {t("settings.runtimeWarmTtl")}
                </Label>
                <Input
                  id="runtime-ttl"
                  value={ttlDraft}
                  onChange={(event) => setTtlDraft(event.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-8.5"
                />
                <div className="text-[11px] leading-4 text-slate-500 dark:text-slate-400/90">
                  {t("settings.runtimeWarmTtlHelp")}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-0.5">
              <Button
                type="button"
                onClick={() => {
                  void handleSaveRuntimeSettings();
                }}
                disabled={runtimeSaving}
                className="h-8.5 px-3.5"
              >
                {runtimeSaving ? t("settings.running") : t("common.save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void loadSnapshot();
                }}
                disabled={runtimeLoading}
                className="h-8.5 px-3.5"
              >
                {t("settings.refresh")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {runtimeError ? (
        <Card className="mt-3 border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10">
          <CardContent className="flex items-start gap-3 px-4 py-3 text-red-700 dark:text-red-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-sm">{runtimeError}</div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-3 border-slate-200/70 dark:border-slate-700/80 dark:bg-slate-900/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="space-y-3 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base dark:text-slate-50">{t("settings.runtimeRowsTitle")}</CardTitle>
              <CardDescription className="text-sm leading-5 dark:text-slate-300/85">
                {t("settings.runtimeRowsDescription")}
              </CardDescription>
            </div>
            {runtimeSnapshot ? (
              <Badge className="max-w-full whitespace-normal text-[11px] leading-4 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200" variant="secondary">
                {t("settings.runtimeDiagnosticsLine", {
                  cleaned: runtimeSnapshot.diagnostics.orphanEntriesCleaned,
                  failed: runtimeSnapshot.diagnostics.orphanEntriesFailed,
                  forced: runtimeSnapshot.diagnostics.forceKillCount,
                  blocked: runtimeSnapshot.diagnostics.leaseBlockedEvictionCount,
                  aborted: runtimeSnapshot.diagnostics.coordinatorAbortCount,
                })}
              </Badge>
            ) : null}
          </div>
          <Separator />
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 pt-0">
          {runtimeSnapshot?.rows.length ? (
            runtimeSnapshot.rows.map((row) => {
              const tone = getRuntimeTone(row.state);
              const StatusIcon = tone.icon;
              return (
                <div
                  key={`${row.engine}:${row.workspaceId}`}
                  className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-[0_12px_40px_rgba(2,6,23,0.28)]"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:border dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
                          <StatusIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {row.workspaceName}
                          </div>
                          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            {row.engine}
                          </div>
                        </div>
                        <Badge className={`${tone.chip} h-6 px-2.5 text-[11px]`}>
                          {getRuntimeStateLabel(t, row.state)}
                        </Badge>
                        {row.evictCandidate ? (
                          <Badge className="h-6 px-2.5 text-[11px] dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200" variant="outline">
                            {row.evictionReason ?? t("settings.runtimeStateEvictable")}
                          </Badge>
                        ) : null}
                        {row.pinned ? (
                          <Badge className="h-6 px-2.5 text-[11px] dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-100" variant="secondary">
                            {t("settings.runtimePin")}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="grid gap-x-4 gap-y-2 text-[13px] leading-5 text-slate-600 dark:text-slate-300/88 lg:grid-cols-2">
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {t("settings.runtimePathLabel")}
                          </span>{" "}
                          <span className="break-all">{row.workspacePath}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {t("settings.runtimeLeaseSourcesLabel")}
                          </span>{" "}
                          {row.leaseSources.join(" · ") || "—"}
                          {` · ${t("settings.runtimeTurnLeaseCountLabel", {
                            count: row.turnLeaseCount,
                          })} · ${t("settings.runtimeStreamLeaseCountLabel", {
                            count: row.streamLeaseCount,
                          })}`}
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {t("settings.runtimeProcessLabel")}
                          </span>{" "}
                          {row.pid
                            ? t("settings.runtimePidLabel", { pid: row.pid })
                            : "—"}
                          {row.processDiagnostics?.rootCommand
                            ? ` · ${row.processDiagnostics.rootCommand}`
                            : ""}
                          {row.processDiagnostics
                            ? ` · ${t("settings.runtimeProcessTreeLabel", {
                                count: row.processDiagnostics.totalProcesses,
                              })}`
                            : ""}
                          {row.processDiagnostics
                            ? ` · ${t("settings.runtimeNodeProcessLabel", {
                                count: row.processDiagnostics.nodeProcesses,
                              })}`
                            : ""}
                          {row.processDiagnostics
                            ? ` · ${t("settings.runtimeManagedProcessCountLabel", {
                                count: row.processDiagnostics.managedRuntimeProcesses,
                              })}`
                            : ""}
                          {row.processDiagnostics
                            ? ` · ${t("settings.runtimeHelperProcessCountLabel", {
                                count: row.processDiagnostics.resumeHelperProcesses,
                              })}`
                            : ""}
                          {row.processDiagnostics
                            ? ` · ${t("settings.runtimeOrphanProcessCountLabel", {
                                count: row.processDiagnostics.orphanResidueProcesses,
                              })}`
                            : ""}
                          {row.wrapperKind ? ` · ${row.wrapperKind}` : ""}
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {t("settings.runtimeBinaryLabel")}
                          </span>{" "}
                          <span className="break-all">{row.resolvedBin ?? "—"}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-slate-500 dark:text-slate-400/90">
                        <div className="inline-flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5" />
                          {t("settings.runtimeStartedAtLabel")} {formatTimestamp(row.startedAtMs)}
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t("settings.runtimeLastUsedLabel")} {formatTimestamp(row.lastUsedAtMs)}
                        </div>
                      </div>

                      {row.error ? (
                        <div className="rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-[13px] leading-5 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200">
                          {row.error}
                        </div>
                      ) : null}
                      {row.evictionReason ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[13px] leading-5 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                          {t("settings.runtimeEvictionReasonLabel")} {row.evictionReason}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 xl:w-[208px] xl:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void handleRuntimeMutation("pin", row.workspaceId, row.engine, !row.pinned);
                        }}
                        disabled={runtimeSaving}
                        className="h-8.5 px-3 text-xs dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Pin className="mr-2 h-4 w-4" />
                        {row.pinned
                          ? t("settings.runtimeUnpin")
                          : t("settings.runtimePin")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void handleRuntimeMutation("releaseToCold", row.workspaceId, row.engine);
                        }}
                        disabled={runtimeSaving}
                        className="h-8.5 px-3 text-xs dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Snowflake className="mr-2 h-4 w-4" />
                        {t("settings.runtimeRelease")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void handleRuntimeMutation("close", row.workspaceId, row.engine);
                        }}
                        disabled={runtimeSaving}
                        className="h-8.5 px-3 text-xs dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("settings.runtimeClose")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-8 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm dark:border dark:border-white/10 dark:bg-slate-900 dark:shadow-none">
                <SquareTerminal className="h-5 w-5 text-slate-500 dark:text-slate-300" />
              </div>
              <div className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                {t("settings.runtimePoolEmpty")}
              </div>
              <div className="mt-1.5 text-sm leading-5 text-slate-500 dark:text-slate-400/90">
                {t("settings.runtimeEmptyDescription")}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
