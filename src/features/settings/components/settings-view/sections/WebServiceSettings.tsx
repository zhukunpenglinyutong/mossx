import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings } from "@/types";
import {
  getDaemonStatus,
  getWebServerStatus,
  startDaemon,
  startWebServer,
  stopDaemon,
  stopWebServer,
  type DaemonStatus,
  type WebServerStatus,
} from "@/services/tauri";

type WebServiceSettingsProps = {
  t: (key: string) => string;
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

type WebServiceAction =
  | "start"
  | "stop"
  | "refresh"
  | "save-token"
  | "clear-token"
  | "generate-token"
  | "daemon-start"
  | "daemon-stop"
  | "daemon-refresh"
  | null;

function parseWebServicePort(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1024 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function maskToken(token: string) {
  if (token.length <= 8) {
    return "•".repeat(Math.max(token.length, 6));
  }
  return `${token.slice(0, 4)}${"•".repeat(20)}${token.slice(-4)}`;
}

function normalizeFixedWebServiceToken(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function generateFixedWebServiceToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function humanizeWebServiceError(
  t: (key: string) => string,
  raw: string,
): string {
  if (!raw) {
    return raw;
  }
  if (raw.startsWith("WEB_SERVICE_ALREADY_RUNNING")) {
    return t("settings.webServiceErrorAlreadyRunning");
  }
  if (raw.startsWith("WEB_SERVICE_PORT_INVALID")) {
    return t("settings.webServiceErrorPortInvalid");
  }
  if (raw.startsWith("WEB_SERVICE_PORT_IN_USE")) {
    return t("settings.webServiceErrorPortInUse");
  }
  if (raw.startsWith("WEB_SERVICE_BIND_FAILED")) {
    return t("settings.webServiceErrorBindFailed");
  }
  if (raw.startsWith("WEB_SERVICE_STOP_TIMEOUT")) {
    return t("settings.webServiceErrorStopTimeout");
  }
  if (raw.includes("Failed to connect to remote backend")) {
    return t("settings.webServiceErrorDaemonUnavailable");
  }
  if (raw.includes("unauthorized") || raw.includes("invalid token")) {
    return t("settings.webServiceErrorDaemonAuth");
  }
  return raw;
}

export function WebServiceSettings({
  t,
  appSettings,
  onUpdateAppSettings,
}: WebServiceSettingsProps) {
  const [portDraft, setPortDraft] = useState(
    String(appSettings.webServicePort ?? 3080),
  );
  const [fixedTokenDraft, setFixedTokenDraft] = useState(
    appSettings.webServiceToken ?? "",
  );
  const [status, setStatus] = useState<WebServerStatus | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [action, setAction] = useState<WebServiceAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  const parsedPort = useMemo(() => parseWebServicePort(portDraft), [portDraft]);
  const running = Boolean(status?.running);
  const rpcEndpoint =
    status?.rpcEndpoint || daemonStatus?.host || appSettings.remoteBackendHost;
  const daemonRunning = Boolean(daemonStatus?.running);
  const webPort = status?.webPort ?? parsedPort ?? appSettings.webServicePort;
  const addresses = status?.addresses ?? [];
  const rawToken = status?.webAccessToken ?? null;
  const tokenToDisplay = rawToken
    ? showToken
      ? rawToken
      : maskToken(rawToken)
    : "";
  const normalizedFixedToken = normalizeFixedWebServiceToken(
    appSettings.webServiceToken,
  );
  const fixedTokenDraftNormalized =
    normalizeFixedWebServiceToken(fixedTokenDraft);
  const hasFixedTokenDraftChange =
    fixedTokenDraftNormalized !== normalizedFixedToken;

  const refreshDaemonStatus = useCallback(async () => {
    setAction("daemon-refresh");
    try {
      const next = await getDaemonStatus();
      setDaemonStatus(next);
      if (next.lastError) {
        setError(humanizeWebServiceError(t, next.lastError));
      }
    } catch (daemonError) {
      setError(
        humanizeWebServiceError(
          t,
          daemonError instanceof Error
            ? daemonError.message
            : String(daemonError),
        ),
      );
    } finally {
      setAction(null);
    }
  }, [t]);

  const refreshStatus = useCallback(async () => {
    setAction("refresh");
    try {
      const next = await getWebServerStatus();
      setStatus(next);
      setError(
        next.lastError ? humanizeWebServiceError(t, next.lastError) : null,
      );
    } catch (refreshError) {
      setError(
        humanizeWebServiceError(
          t,
          refreshError instanceof Error
            ? refreshError.message
            : String(refreshError),
        ),
      );
    } finally {
      setAction(null);
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
    void refreshDaemonStatus();
  }, [refreshDaemonStatus, refreshStatus]);

  useEffect(() => {
    setPortDraft(String(appSettings.webServicePort ?? 3080));
  }, [appSettings.webServicePort]);

  useEffect(() => {
    setFixedTokenDraft(appSettings.webServiceToken ?? "");
  }, [appSettings.webServiceToken]);

  useEffect(() => {
    if (!copiedMessage) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedMessage(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copiedMessage]);

  const savePort = useCallback(async () => {
    if (parsedPort == null) {
      setError(t("settings.webServicePortInvalid"));
      return false;
    }
    if (parsedPort === appSettings.webServicePort) {
      return true;
    }
    await onUpdateAppSettings({
      ...appSettings,
      webServicePort: parsedPort,
    });
    return true;
  }, [appSettings, onUpdateAppSettings, parsedPort, t]);

  const saveFixedToken = useCallback(
    async (token: string | null) => {
      const normalizedToken = normalizeFixedWebServiceToken(token);
      setAction("save-token");
      setError(null);
      try {
        await onUpdateAppSettings({
          ...appSettings,
          webServiceToken: normalizedToken,
        });
        setFixedTokenDraft(normalizedToken ?? "");
      } catch (tokenError) {
        setError(
          tokenError instanceof Error ? tokenError.message : String(tokenError),
        );
      } finally {
        setAction(null);
      }
    },
    [appSettings, onUpdateAppSettings],
  );

  const clearFixedToken = useCallback(async () => {
    setAction("clear-token");
    setError(null);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        webServiceToken: null,
      });
      setFixedTokenDraft("");
    } catch (tokenError) {
      setError(
        tokenError instanceof Error ? tokenError.message : String(tokenError),
      );
    } finally {
      setAction(null);
    }
  }, [appSettings, onUpdateAppSettings]);

  const generateAndSaveFixedToken = useCallback(async () => {
    const nextToken = generateFixedWebServiceToken();
    setAction("generate-token");
    setError(null);
    try {
      await onUpdateAppSettings({
        ...appSettings,
        webServiceToken: nextToken,
      });
      setFixedTokenDraft(nextToken);
    } catch (tokenError) {
      setError(
        tokenError instanceof Error ? tokenError.message : String(tokenError),
      );
    } finally {
      setAction(null);
    }
  }, [appSettings, onUpdateAppSettings]);

  const handleStart = useCallback(async () => {
    if (parsedPort == null) {
      setError(t("settings.webServicePortInvalid"));
      return;
    }
    setAction("start");
    setError(null);
    try {
      await savePort();
      const next = await startWebServer({
        port: parsedPort,
        token: fixedTokenDraftNormalized,
      });
      setStatus(next);
      setError(
        next.lastError ? humanizeWebServiceError(t, next.lastError) : null,
      );
    } catch (startError) {
      setError(
        humanizeWebServiceError(
          t,
          startError instanceof Error ? startError.message : String(startError),
        ),
      );
    } finally {
      setAction(null);
    }
  }, [fixedTokenDraftNormalized, parsedPort, savePort, t]);

  const handleStop = useCallback(async () => {
    setAction("stop");
    setError(null);
    try {
      const next = await stopWebServer();
      setStatus(next);
      setError(
        next.lastError ? humanizeWebServiceError(t, next.lastError) : null,
      );
      setShowToken(false);
    } catch (stopError) {
      setError(
        humanizeWebServiceError(
          t,
          stopError instanceof Error ? stopError.message : String(stopError),
        ),
      );
    } finally {
      setAction(null);
    }
  }, [t]);

  const handleStartDaemon = useCallback(async () => {
    setAction("daemon-start");
    setError(null);
    try {
      const next = await startDaemon();
      setDaemonStatus(next);
      if (next.lastError) {
        setError(humanizeWebServiceError(t, next.lastError));
      } else {
        await refreshStatus();
      }
    } catch (daemonError) {
      setError(
        humanizeWebServiceError(
          t,
          daemonError instanceof Error
            ? daemonError.message
            : String(daemonError),
        ),
      );
    } finally {
      setAction(null);
    }
  }, [refreshStatus, t]);

  const handleStopDaemon = useCallback(async () => {
    setAction("daemon-stop");
    setError(null);
    try {
      const next = await stopDaemon();
      setDaemonStatus(next);
      if (next.lastError) {
        setError(humanizeWebServiceError(t, next.lastError));
      } else {
        await refreshStatus();
      }
    } catch (daemonError) {
      setError(
        humanizeWebServiceError(
          t,
          daemonError instanceof Error
            ? daemonError.message
            : String(daemonError),
        ),
      );
    } finally {
      setAction(null);
    }
  }, [refreshStatus, t]);

  const handleCopy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopiedMessage(t("settings.webServiceCopied"));
      } catch {
        setError(t("settings.webServiceCopyFailed"));
      }
    },
    [t],
  );

  const isBusy = action != null;

  return (
    <div className="settings-field">
      <div className="settings-field-label">
        {t("settings.webServiceTitle")}
      </div>
      <div className="settings-help">{t("settings.webServiceDescription")}</div>

      <label className="settings-field-label" htmlFor="web-service-port">
        {t("settings.webServicePort")}
      </label>
      <div className="settings-field-row">
        <input
          id="web-service-port"
          className="settings-input settings-input--compact"
          value={portDraft}
          onChange={(event) => setPortDraft(event.target.value)}
          onBlur={() => {
            void savePort();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void savePort();
            }
          }}
          aria-label={t("settings.webServicePortAriaLabel")}
          disabled={isBusy}
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void savePort();
          }}
          disabled={
            isBusy ||
            parsedPort == null ||
            parsedPort === appSettings.webServicePort
          }
        >
          {t("settings.webServiceSavePort")}
        </button>
      </div>

      <label className="settings-field-label" htmlFor="web-service-fixed-token">
        {t("settings.webServiceFixedToken")}
      </label>
      <div className="settings-field-row">
        <input
          id="web-service-fixed-token"
          className="settings-input"
          type="password"
          value={fixedTokenDraft}
          onChange={(event) => setFixedTokenDraft(event.target.value)}
          placeholder={t("settings.webServiceFixedTokenAuto")}
          aria-label={t("settings.webServiceFixedTokenAriaLabel")}
          disabled={isBusy}
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void saveFixedToken(fixedTokenDraft);
          }}
          disabled={isBusy || !hasFixedTokenDraftChange}
        >
          {t("settings.webServiceSaveToken")}
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void clearFixedToken();
          }}
          disabled={
            isBusy || (!fixedTokenDraft && !appSettings.webServiceToken)
          }
        >
          {t("settings.webServiceClearToken")}
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void generateAndSaveFixedToken();
          }}
          disabled={isBusy}
        >
          {t("settings.webServiceGenerateToken")}
        </button>
      </div>
      <div className="settings-help">
        {t("settings.webServiceFixedTokenHint")}
      </div>
      <div className="settings-help">
        {running
          ? t("settings.webServiceFixedTokenRunningHint")
          : t("settings.webServiceFixedTokenStoppedHint")}
      </div>

      <div className="settings-field-label">
        {t("settings.webServiceStatus")}
      </div>
      <div className="settings-field-row">
        <div
          className="settings-help"
          style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: running ? "#16a34a" : "#9ca3af",
              display: "inline-block",
            }}
          />
          {running
            ? t("settings.webServiceRunning")
            : t("settings.webServiceStopped")}
        </div>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void refreshStatus();
          }}
          disabled={isBusy}
        >
          {t("settings.refresh")}
        </button>
        {running ? (
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void handleStop();
            }}
            disabled={isBusy}
          >
            {action === "stop"
              ? t("settings.running")
              : t("settings.webServiceStop")}
          </button>
        ) : (
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void handleStart();
            }}
            disabled={isBusy || parsedPort == null}
          >
            {action === "start"
              ? t("settings.running")
              : t("settings.webServiceStart")}
          </button>
        )}
      </div>

      <div className="settings-field-label">
        {t("settings.webServiceDaemonStatus")}
      </div>
      <div className="settings-field-row">
        <div
          className="settings-help"
          style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: daemonRunning ? "#16a34a" : "#9ca3af",
              display: "inline-block",
            }}
          />
          {daemonRunning
            ? t("settings.webServiceDaemonRunning")
            : t("settings.webServiceDaemonStopped")}
        </div>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void refreshDaemonStatus();
          }}
          disabled={isBusy}
        >
          {t("settings.refresh")}
        </button>
        {daemonRunning ? (
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void handleStopDaemon();
            }}
            disabled={isBusy}
          >
            {action === "daemon-stop"
              ? t("settings.running")
              : t("settings.webServiceDaemonStop")}
          </button>
        ) : (
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => {
              void handleStartDaemon();
            }}
            disabled={isBusy}
          >
            {action === "daemon-start"
              ? t("settings.running")
              : t("settings.webServiceDaemonStart")}
          </button>
        )}
      </div>

      <div className="settings-field-label">
        {t("settings.webServiceRpcEndpoint")}
      </div>
      <input className="settings-input" value={rpcEndpoint} readOnly />

      <div className="settings-field-label">
        {t("settings.webServiceAddresses")}
      </div>
      {addresses.length === 0 ? (
        <div className="settings-help">{t("settings.webServiceNoAddress")}</div>
      ) : (
        addresses.map((address) => (
          <div className="settings-field-row" key={address}>
            <input className="settings-input" value={address} readOnly />
            <button
              type="button"
              className="ghost settings-button-compact"
              onClick={() => {
                void handleCopy(address);
              }}
            >
              {t("settings.copy")}
            </button>
          </div>
        ))
      )}

      <div className="settings-field-label">
        {t("settings.webServiceRuntimeToken")}
      </div>
      <div className="settings-field-row">
        <input
          className="settings-input"
          value={tokenToDisplay}
          readOnly
          placeholder={t("settings.webServiceTokenEmpty")}
        />
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => setShowToken((value) => !value)}
          disabled={!rawToken}
        >
          {showToken
            ? t("settings.webServiceHideToken")
            : t("settings.webServiceShowToken")}
        </button>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            if (rawToken) {
              void handleCopy(rawToken);
            }
          }}
          disabled={!rawToken}
        >
          {t("settings.copy")}
        </button>
      </div>
      <div className="settings-help">{t("settings.webServiceTokenHint")}</div>
      {copiedMessage ? (
        <div className="settings-help">{copiedMessage}</div>
      ) : null}
      {error ? (
        <div
          className="settings-help"
          style={{ color: "var(--danger-text, #dc2626)" }}
        >
          {error}
        </div>
      ) : null}
      <div className="settings-help">
        {t("settings.webServiceControlPlaneHint")
          .replace("{{rpc}}", rpcEndpoint)
          .replace("{{port}}", String(webPort))}
      </div>
    </div>
  );
}
