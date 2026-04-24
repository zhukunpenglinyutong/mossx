import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { listWorkspaces } from "../../../services/tauri";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ComputerUseActivationFailureKind,
  ComputerUseActivationOutcome,
  ComputerUseActivationResult,
  ComputerUseBrokerFailureKind,
  ComputerUseBrokerOutcome,
  ComputerUseBlockedReason,
  ComputerUseBridgeStatus,
  ComputerUseGuidanceCode,
  ComputerUseHostContractDiagnosticsResult,
  ComputerUseHostContractDiagnosticsKind,
  ComputerUseOfficialParentHandoffKind,
  WorkspaceInfo,
} from "../../../types";
import { ENABLE_COMPUTER_USE_BRIDGE, ENABLE_COMPUTER_USE_BRIDGE_ACTIVATION } from "../constants";
import { useComputerUseActivation } from "../hooks/useComputerUseActivation";
import { useComputerUseBroker } from "../hooks/useComputerUseBroker";
import { useComputerUseBridgeStatus } from "../hooks/useComputerUseBridgeStatus";
import { useComputerUseHostContractDiagnostics } from "../hooks/useComputerUseHostContractDiagnostics";

function statusKey(status: NonNullable<ComputerUseBridgeStatus["status"]>) {
  return `settings.computerUse.status.${status}`;
}

function reasonKey(reason: ComputerUseBlockedReason) {
  return `settings.computerUse.reason.${reason}`;
}

function guidanceKey(code: ComputerUseGuidanceCode) {
  return `settings.computerUse.guidance.${code}`;
}

function activationOutcomeKey(outcome: ComputerUseActivationOutcome) {
  return `settings.computerUse.activation.outcome.${outcome}`;
}

function activationFailureKey(failureKind: ComputerUseActivationFailureKind) {
  return `settings.computerUse.activation.failure.${failureKind}`;
}

function brokerOutcomeKey(outcome: ComputerUseBrokerOutcome) {
  return `settings.computerUse.broker.outcome.${outcome}`;
}

function brokerFailureKey(failureKind: ComputerUseBrokerFailureKind) {
  return `settings.computerUse.broker.failure.${failureKind}`;
}

function hostContractKindKey(kind: ComputerUseHostContractDiagnosticsKind) {
  return `settings.computerUse.hostContract.kind.${kind}`;
}

function officialParentHandoffKindKey(kind: ComputerUseOfficialParentHandoffKind) {
  return `settings.computerUse.hostContract.officialParent.kind.${kind}`;
}

type ParentContractVerdictKind = "requires_official_parent" | "handoff_unavailable";

function parentContractVerdictKey(kind: ParentContractVerdictKind) {
  return `settings.computerUse.parentContractVerdict.kind.${kind}`;
}

function booleanLabel(value: boolean, t: (key: string) => string) {
  return value ? t("settings.computerUse.value.yes") : t("settings.computerUse.value.no");
}

function joinedList(values: string[]) {
  return values.length > 0 ? values.join(", ") : null;
}

function renderCodeRow(label: string, value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{value}</code>
    </div>
  );
}

function getParentContractVerdictKind(result: ComputerUseHostContractDiagnosticsResult | null): ParentContractVerdictKind | null {
  if (!result) {
    return null;
  }

  const handoffKind = result.evidence.officialParentHandoff.kind;
  if (handoffKind === "handoff_candidate_found") {
    return null;
  }

  if (result.kind === "requires_official_parent" || handoffKind === "requires_official_parent") {
    return "requires_official_parent";
  }

  if (result.kind === "handoff_unavailable" || handoffKind === "handoff_unavailable") {
    return "handoff_unavailable";
  }

  return null;
}

function shouldShowActivationAction(status: ComputerUseBridgeStatus | null, activationResult: ComputerUseActivationResult | null) {
  if (!ENABLE_COMPUTER_USE_BRIDGE_ACTIVATION || !status) {
    return false;
  }

  if (activationResult?.failureKind === "host_incompatible") {
    return false;
  }

  return (
    status.activationEnabled &&
    status.platform === "macos" &&
    status.status === "blocked" &&
    status.codexAppDetected &&
    status.pluginDetected &&
    status.pluginEnabled &&
    Boolean(status.helperPath) &&
    status.blockedReasons.includes("helper_bridge_unverified")
  );
}

function shouldShowHostContractDiagnosticsAction(
  status: ComputerUseBridgeStatus | null,
  activationResult: ComputerUseActivationResult | null,
  parentContractVerdictKind: ParentContractVerdictKind | null,
) {
  if (!ENABLE_COMPUTER_USE_BRIDGE_ACTIVATION || !status || !activationResult || parentContractVerdictKind) {
    return false;
  }

  return (
    activationResult.failureKind === "host_incompatible" &&
    status.activationEnabled &&
    status.platform === "macos" &&
    status.status === "blocked" &&
    status.codexAppDetected &&
    status.pluginDetected &&
    status.pluginEnabled &&
    Boolean(status.helperPath)
  );
}

function hasOnlyManualPermissionBlockers(status: ComputerUseBridgeStatus) {
  return status.blockedReasons.every((reason) => reason === "permission_required" || reason === "approval_required");
}

function shouldEnableBroker(status: ComputerUseBridgeStatus | null) {
  if (!status || status.platform !== "macos") {
    return false;
  }

  if (!status.pluginDetected || !status.pluginEnabled || !status.helperPath) {
    return false;
  }

  if (status.blockedReasons.includes("helper_bridge_unverified")) {
    return false;
  }

  return status.status === "ready" || hasOnlyManualPermissionBlockers(status);
}

function firstConnectedWorkspace(
  workspaces: WorkspaceInfo[] | null | undefined,
) {
  if (!Array.isArray(workspaces)) {
    return null;
  }
  return workspaces.find((workspace) => workspace.connected) ?? workspaces[0] ?? null;
}

export function ComputerUseStatusCard() {
  const { t } = useTranslation();
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [brokerInstruction, setBrokerInstruction] = useState("");
  const { status, isLoading, error, refresh } = useComputerUseBridgeStatus({
    enabled: ENABLE_COMPUTER_USE_BRIDGE,
  });
  const activationEnabled = ENABLE_COMPUTER_USE_BRIDGE_ACTIVATION && Boolean(status?.activationEnabled);
  const {
    result: activationResult,
    isRunning: isActivating,
    error: activationError,
    activate,
    reset: resetActivation,
  } = useComputerUseActivation({
    enabled: ENABLE_COMPUTER_USE_BRIDGE && activationEnabled,
  });
  const {
    result: hostContractResult,
    isRunning: isDiagnosingHostContract,
    error: hostContractError,
    diagnose: diagnoseHostContract,
    reset: resetHostContractDiagnostics,
  } = useComputerUseHostContractDiagnostics({
    enabled: ENABLE_COMPUTER_USE_BRIDGE && activationEnabled,
  });
  const brokerEnabled = ENABLE_COMPUTER_USE_BRIDGE && shouldEnableBroker(hostContractResult?.bridgeStatus ?? activationResult?.bridgeStatus ?? status);
  const {
    result: brokerResult,
    isRunning: isBrokerRunning,
    error: brokerError,
    run: runBroker,
    reset: resetBroker,
  } = useComputerUseBroker({
    enabled: brokerEnabled,
  });

  const effectiveStatus = hostContractResult?.bridgeStatus ?? activationResult?.bridgeStatus ?? status;
  const parentContractVerdictKind = getParentContractVerdictKind(hostContractResult);
  const showActivationAction = shouldShowActivationAction(effectiveStatus, activationResult);
  const showHostContractDiagnosticsAction = shouldShowHostContractDiagnosticsAction(effectiveStatus, activationResult, parentContractVerdictKind);
  const connectedWorkspaces = useMemo(() => workspaces.filter((workspace) => workspace.connected), [workspaces]);
  const selectableWorkspaces = connectedWorkspaces.length > 0 ? connectedWorkspaces : workspaces;
  const selectedWorkspace = selectableWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  useEffect(() => {
    if (!ENABLE_COMPUTER_USE_BRIDGE) {
      return;
    }

    let cancelled = false;
    listWorkspaces()
      .then((nextWorkspaces) => {
        if (cancelled) {
          return;
        }
        const safeWorkspaces = Array.isArray(nextWorkspaces) ? nextWorkspaces : [];
        setWorkspaces(safeWorkspaces);
        setWorkspaceLoadError(null);
        setSelectedWorkspaceId((currentWorkspaceId) => {
          if (currentWorkspaceId) {
            return currentWorkspaceId;
          }
          const defaultWorkspace = firstConnectedWorkspace(safeWorkspaces);
          return defaultWorkspace?.id ?? "";
        });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setWorkspaceLoadError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const detailRows = useMemo(() => {
    if (!effectiveStatus) {
      return [];
    }
    return [
      {
        label: t("settings.computerUse.platform"),
        value: effectiveStatus.platform,
      },
      {
        label: t("settings.computerUse.codexAppDetected"),
        value: booleanLabel(effectiveStatus.codexAppDetected, t),
      },
      {
        label: t("settings.computerUse.pluginDetected"),
        value: booleanLabel(effectiveStatus.pluginDetected, t),
      },
      {
        label: t("settings.computerUse.pluginEnabled"),
        value: booleanLabel(effectiveStatus.pluginEnabled, t),
      },
    ];
  }, [effectiveStatus, t]);

  if (!ENABLE_COMPUTER_USE_BRIDGE) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("settings.computerUse.title")}</CardTitle>
            <CardDescription>{t("settings.computerUse.description")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {showActivationAction ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  resetHostContractDiagnostics();
                  void activate();
                }}
                disabled={isLoading || isActivating || isDiagnosingHostContract}
              >
                {isActivating ? t("settings.computerUse.activation.running") : t("settings.computerUse.activation.verify")}
              </Button>
            ) : null}
            {showHostContractDiagnosticsAction ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void diagnoseHostContract();
                }}
                disabled={isLoading || isActivating || isDiagnosingHostContract}
              >
                {isDiagnosingHostContract ? t("settings.computerUse.hostContract.running") : t("settings.computerUse.hostContract.run")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetActivation();
                resetHostContractDiagnostics();
                resetBroker();
                void refresh();
              }}
              disabled={isLoading || isActivating || isDiagnosingHostContract || isBrokerRunning}
            >
              {isLoading ? t("settings.computerUse.loading") : t("settings.computerUse.refresh")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("settings.computerUse.loadFailed")}: {error}
          </div>
        ) : null}

        {activationError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("settings.computerUse.activation.failedToRun")}: {activationError}
          </div>
        ) : null}

        {hostContractError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("settings.computerUse.hostContract.failedToRun")}: {hostContractError}
          </div>
        ) : null}

        {brokerError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("settings.computerUse.broker.failedToRun")}: {brokerError}
          </div>
        ) : null}

        {effectiveStatus ? (
          <>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.statusLabel")}</div>
              <div className="mt-1 text-sm font-medium">{t(statusKey(effectiveStatus.status))}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {detailRows.map((row) => (
                <div key={row.label} className="rounded-md border px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">{row.label}</div>
                  <div className="mt-1 text-sm">{row.value}</div>
                </div>
              ))}
            </div>

            {parentContractVerdictKind ? (
              <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">{t("settings.computerUse.parentContractVerdict.title")}</div>
                  <div className="text-xs text-muted-foreground">{t(parentContractVerdictKey(parentContractVerdictKind))}</div>
                </div>
                <div className="text-sm">{t("settings.computerUse.parentContractVerdict.body")}</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>{t("settings.computerUse.parentContractVerdict.macEvidence")}</li>
                  <li>{t("settings.computerUse.parentContractVerdict.hostBoundary")}</li>
                  <li>{t("settings.computerUse.parentContractVerdict.notPermission")}</li>
                  <li>{t("settings.computerUse.parentContractVerdict.stopCondition")}</li>
                </ul>
              </div>
            ) : null}

            {activationResult ? (
              <div className="space-y-3 rounded-md border px-3 py-3">
                <div className="text-sm font-medium">{t("settings.computerUse.activation.resultTitle")}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.activation.outcomeLabel")}</div>
                    <div className="text-sm">{t(activationOutcomeKey(activationResult.outcome))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.activation.duration")}</div>
                    <div className="text-sm">{activationResult.durationMs}ms</div>
                  </div>
                  {activationResult.failureKind ? (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.activation.failureKind")}</div>
                      <div className="text-sm">{t(activationFailureKey(activationResult.failureKind))}</div>
                    </div>
                  ) : null}
                  {activationResult.exitCode !== null ? (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.activation.exitCode")}</div>
                      <div className="text-sm">{activationResult.exitCode}</div>
                    </div>
                  ) : null}
                </div>

                {activationResult.diagnosticMessage ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.activation.diagnosticMessage")}</div>
                    <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{activationResult.diagnosticMessage}</code>
                  </div>
                ) : null}

                {activationResult.stderrSnippet ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.activation.stderrSnippet")}</div>
                    <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{activationResult.stderrSnippet}</code>
                  </div>
                ) : null}
              </div>
            ) : null}

            {hostContractResult ? (
              <div className="space-y-3 rounded-md border px-3 py-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">{t("settings.computerUse.hostContract.resultTitle")}</div>
                  <div className="text-xs text-muted-foreground">{t("settings.computerUse.hostContract.diagnosticOnlyNotice")}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.hostContract.kindLabel")}</div>
                    <div className="text-sm">{t(hostContractKindKey(hostContractResult.kind))}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.hostContract.duration")}</div>
                    <div className="text-sm">{hostContractResult.durationMs}ms</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.hostContract.diagnosticMessage")}</div>
                  <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{hostContractResult.diagnosticMessage}</code>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {renderCodeRow(t("settings.computerUse.hostContract.handoffMethod"), hostContractResult.evidence.handoffMethod)}
                  {renderCodeRow(t("settings.computerUse.hostContract.currentHostPath"), hostContractResult.evidence.currentHostPath)}
                  {renderCodeRow(t("settings.computerUse.hostContract.codesignSummary"), hostContractResult.evidence.codesignSummary)}
                  {renderCodeRow(t("settings.computerUse.hostContract.spctlSummary"), hostContractResult.evidence.spctlSummary)}
                  {renderCodeRow(t("settings.computerUse.hostContract.stdoutSnippet"), hostContractResult.evidence.stdoutSnippet)}
                  {renderCodeRow(t("settings.computerUse.hostContract.stderrSnippet"), hostContractResult.evidence.stderrSnippet)}
                </div>

                <div className="space-y-3 rounded-md border px-3 py-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{t("settings.computerUse.hostContract.officialParent.title")}</div>
                    <div className="text-xs text-muted-foreground">{t("settings.computerUse.hostContract.officialParent.notice")}</div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.hostContract.officialParent.kindLabel")}</div>
                      <div className="text-sm">{t(officialParentHandoffKindKey(hostContractResult.evidence.officialParentHandoff.kind))}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.hostContract.officialParent.duration")}</div>
                      <div className="text-sm">
                        {hostContractResult.evidence.officialParentHandoff.durationMs}
                        ms
                      </div>
                    </div>
                  </div>

                  {renderCodeRow(t("settings.computerUse.hostContract.officialParent.message"), hostContractResult.evidence.officialParentHandoff.diagnosticMessage)}

                  {hostContractResult.evidence.officialParentHandoff.kind === "handoff_candidate_found" ? (
                    <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">{t("settings.computerUse.hostContract.officialParent.candidateEvidenceOnly")}</div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.parentTeam"), hostContractResult.evidence.officialParentHandoff.evidence.parentTeamIdentifier)}
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.applicationGroups"), joinedList(hostContractResult.evidence.officialParentHandoff.evidence.applicationGroups))}
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.codexUrlSchemes"), joinedList(hostContractResult.evidence.officialParentHandoff.evidence.codexUrlSchemes))}
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.serviceBundleId"), hostContractResult.evidence.officialParentHandoff.evidence.serviceBundleIdentifier)}
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.helperBundleId"), hostContractResult.evidence.officialParentHandoff.evidence.helperBundleIdentifier)}
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.parentRequirementPath"), hostContractResult.evidence.officialParentHandoff.evidence.parentCodeRequirementPath)}
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.mcpDescriptorPath"), hostContractResult.evidence.officialParentHandoff.evidence.mcpDescriptorPath)}
                    {renderCodeRow(t("settings.computerUse.hostContract.officialParent.xpcServices"), joinedList(hostContractResult.evidence.officialParentHandoff.evidence.xpcServiceIdentifiers))}
                  </div>

                  {hostContractResult.evidence.officialParentHandoff.methods.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.hostContract.officialParent.methods")}</div>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {hostContractResult.evidence.officialParentHandoff.methods.map((method) => (
                          <li key={`${method.method}:${method.identifier}`}>
                            {method.method} / {method.identifier} / {method.confidence}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-md border px-3 py-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("settings.computerUse.broker.title")}</div>
                <div className="text-xs text-muted-foreground">{brokerEnabled ? t("settings.computerUse.broker.readyNotice") : t("settings.computerUse.broker.blockedNotice")}</div>
              </div>

              {workspaceLoadError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {t("settings.computerUse.broker.workspaceLoadFailed")}: {workspaceLoadError}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.broker.workspace")}</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={selectedWorkspaceId}
                    onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                    disabled={isBrokerRunning || selectableWorkspaces.length === 0}
                  >
                    {selectableWorkspaces.length === 0 ? <option value="">{t("settings.computerUse.broker.noWorkspace")}</option> : null}
                    {selectableWorkspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                        {workspace.connected ? "" : ` ${t("settings.computerUse.broker.disconnectedWorkspace")}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.broker.instruction")}</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-background px-2 py-2 text-sm"
                    value={brokerInstruction}
                    placeholder={t("settings.computerUse.broker.placeholder")}
                    onChange={(event) => setBrokerInstruction(event.target.value)}
                    disabled={isBrokerRunning}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">{selectedWorkspace ? selectedWorkspace.path : t("settings.computerUse.broker.selectWorkspace")}</div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={!brokerEnabled || isBrokerRunning || !selectedWorkspaceId || brokerInstruction.trim().length === 0}
                  onClick={() => {
                    resetBroker();
                    void runBroker({
                      workspaceId: selectedWorkspaceId,
                      instruction: brokerInstruction,
                    });
                  }}
                >
                  {isBrokerRunning ? t("settings.computerUse.broker.running") : t("settings.computerUse.broker.run")}
                </Button>
              </div>

              {brokerResult ? (
                <div className="space-y-3 rounded-md border px-3 py-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.broker.outcomeLabel")}</div>
                      <div className="text-sm">{t(brokerOutcomeKey(brokerResult.outcome))}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.broker.duration")}</div>
                      <div className="text-sm">{brokerResult.durationMs}ms</div>
                    </div>
                    {brokerResult.failureKind ? (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.broker.failureKind")}</div>
                        <div className="text-sm">{t(brokerFailureKey(brokerResult.failureKind))}</div>
                      </div>
                    ) : null}
                  </div>

                  {brokerResult.diagnosticMessage ? <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{brokerResult.diagnosticMessage}</code> : null}

                  {brokerResult.text ? <div className="whitespace-pre-wrap rounded bg-muted px-3 py-2 text-sm">{brokerResult.text}</div> : null}
                </div>
              ) : null}
            </div>

            {effectiveStatus.blockedReasons.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("settings.computerUse.blockedReasonsTitle")}</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {effectiveStatus.blockedReasons.map((reason) => (
                    <li key={reason}>{t(reasonKey(reason))}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {effectiveStatus.guidanceCodes.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("settings.computerUse.guidanceTitle")}</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {effectiveStatus.guidanceCodes.map((code) => (
                    <li key={code}>{t(guidanceKey(code))}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-3">
              {renderCodeRow(t("settings.computerUse.codexConfigPath"), effectiveStatus.codexConfigPath)}
              {renderCodeRow(t("settings.computerUse.marketplacePath"), effectiveStatus.marketplacePath)}
              {renderCodeRow(t("settings.computerUse.pluginManifestPath"), effectiveStatus.pluginManifestPath)}
              {renderCodeRow(t("settings.computerUse.helperDescriptorPath"), effectiveStatus.helperDescriptorPath)}
              {renderCodeRow(t("settings.computerUse.helperPath"), effectiveStatus.helperPath)}
            </div>

            {effectiveStatus.diagnosticMessage ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">{t("settings.computerUse.diagnosticMessage")}</div>
                <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{effectiveStatus.diagnosticMessage}</code>
              </div>
            ) : null}

            <div className="text-xs text-muted-foreground">{t(effectiveStatus.activationEnabled ? "settings.computerUse.phaseTwoNotice" : "settings.computerUse.phaseOneNotice")}</div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">{isLoading ? t("settings.computerUse.loading") : t("settings.computerUse.empty")}</div>
        )}
      </CardContent>
    </Card>
  );
}
