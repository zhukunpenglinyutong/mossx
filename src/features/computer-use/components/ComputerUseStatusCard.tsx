import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ComputerUseBlockedReason,
  ComputerUseBridgeStatus,
  ComputerUseGuidanceCode,
} from "../../../types";
import { ENABLE_COMPUTER_USE_BRIDGE } from "../constants";
import { useComputerUseBridgeStatus } from "../hooks/useComputerUseBridgeStatus";

function statusKey(status: NonNullable<ComputerUseBridgeStatus["status"]>) {
  return `settings.computerUse.status.${status}`;
}

function reasonKey(reason: ComputerUseBlockedReason) {
  return `settings.computerUse.reason.${reason}`;
}

function guidanceKey(code: ComputerUseGuidanceCode) {
  return `settings.computerUse.guidance.${code}`;
}

function booleanLabel(value: boolean, t: (key: string) => string) {
  return value ? t("settings.computerUse.value.yes") : t("settings.computerUse.value.no");
}

function renderPathRow(
  label: string,
  value: string | null | undefined,
) {
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

export function ComputerUseStatusCard() {
  const { t } = useTranslation();
  const { status, isLoading, error, refresh } = useComputerUseBridgeStatus({
    enabled: ENABLE_COMPUTER_USE_BRIDGE,
  });

  const detailRows = useMemo(() => {
    if (!status) {
      return [];
    }
    return [
      {
        label: t("settings.computerUse.platform"),
        value: status.platform,
      },
      {
        label: t("settings.computerUse.codexAppDetected"),
        value: booleanLabel(status.codexAppDetected, t),
      },
      {
        label: t("settings.computerUse.pluginDetected"),
        value: booleanLabel(status.pluginDetected, t),
      },
      {
        label: t("settings.computerUse.pluginEnabled"),
        value: booleanLabel(status.pluginEnabled, t),
      },
    ];
  }, [status, t]);

  if (!ENABLE_COMPUTER_USE_BRIDGE) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("settings.computerUse.title")}</CardTitle>
            <CardDescription>
              {t("settings.computerUse.description")}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refresh();
            }}
            disabled={isLoading}
          >
            {isLoading ? t("settings.computerUse.loading") : t("settings.computerUse.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t("settings.computerUse.loadFailed")}: {error}
          </div>
        ) : null}

        {status ? (
          <>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t("settings.computerUse.statusLabel")}
              </div>
              <div className="mt-1 text-sm font-medium">
                {t(statusKey(status.status))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {detailRows.map((row) => (
                <div key={row.label} className="rounded-md border px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">{row.label}</div>
                  <div className="mt-1 text-sm">{row.value}</div>
                </div>
              ))}
            </div>

            {status.blockedReasons.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t("settings.computerUse.blockedReasonsTitle")}
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {status.blockedReasons.map((reason) => (
                    <li key={reason}>{t(reasonKey(reason))}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {status.guidanceCodes.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t("settings.computerUse.guidanceTitle")}
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {status.guidanceCodes.map((code) => (
                    <li key={code}>{t(guidanceKey(code))}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-3">
              {renderPathRow(
                t("settings.computerUse.codexConfigPath"),
                status.codexConfigPath,
              )}
              {renderPathRow(
                t("settings.computerUse.marketplacePath"),
                status.marketplacePath,
              )}
              {renderPathRow(
                t("settings.computerUse.pluginManifestPath"),
                status.pluginManifestPath,
              )}
              {renderPathRow(
                t("settings.computerUse.helperDescriptorPath"),
                status.helperDescriptorPath,
              )}
              {renderPathRow(
                t("settings.computerUse.helperPath"),
                status.helperPath,
              )}
            </div>

            {status.diagnosticMessage ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("settings.computerUse.diagnosticMessage")}
                </div>
                <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                  {status.diagnosticMessage}
                </code>
              </div>
            ) : null}

            <div className="text-xs text-muted-foreground">
              {t("settings.computerUse.phaseOneNotice")}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            {isLoading
              ? t("settings.computerUse.loading")
              : t("settings.computerUse.empty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
