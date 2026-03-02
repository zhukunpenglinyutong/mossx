import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Plug from "lucide-react/dist/esm/icons/plug";
import Server from "lucide-react/dist/esm/icons/server";
import type { WorkspaceInfo } from "../../../types";
import {
  getOpenCodeStatusSnapshot,
  listGlobalMcpServers,
  listMcpServerStatus,
  setOpenCodeMcpToggle,
  type GlobalMcpServerEntry,
} from "../../../services/tauri";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type McpSectionProps = {
  activeWorkspace: WorkspaceInfo | null;
  activeEngine: string | null;
};

type CodexMcpServer = {
  name: string;
  authLabel: string | null;
  toolNames: string[];
  resourcesCount: number;
  templatesCount: number;
};

type OpenCodeMcpServer = {
  name: string;
  enabled: boolean;
  status: string | null;
  permissionHint: string | null;
};

type OpenCodeSnapshot = {
  mcpEnabled: boolean;
  mcpServers: OpenCodeMcpServer[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseCodexMcpServers(raw: unknown): CodexMcpServer[] {
  const payload = asRecord(raw);
  const result = asRecord(payload?.result) ?? payload;
  const data = Array.isArray(result?.data) ? result.data : [];

  return data
    .map((item) => {
      const row = asRecord(item);
      if (!row) {
        return null;
      }
      const name = String(row.name ?? "").trim();
      if (!name) {
        return null;
      }
      const auth = row.authStatus ?? row.auth_status;
      const authLabel =
        typeof auth === "string"
          ? auth
          : asRecord(auth)
            ? String(asRecord(auth)?.status ?? "").trim() || null
            : null;

      const toolsRecord = asRecord(row.tools) ?? {};
      const prefix = `mcp__${name}__`;
      const toolNames = Object.keys(toolsRecord)
        .map((toolName) =>
          toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName,
        )
        .sort((left, right) => left.localeCompare(right));

      const resourcesCount = Array.isArray(row.resources) ? row.resources.length : 0;
      const templatesCount = Array.isArray(row.resourceTemplates)
        ? row.resourceTemplates.length
        : Array.isArray(row.resource_templates)
          ? row.resource_templates.length
          : 0;

      return {
        name,
        authLabel,
        toolNames,
        resourcesCount,
        templatesCount,
      } satisfies CodexMcpServer;
    })
    .filter((item): item is CodexMcpServer => Boolean(item))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function McpSection({ activeWorkspace, activeEngine }: McpSectionProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codexServers, setCodexServers] = useState<CodexMcpServer[]>([]);
  const [globalServers, setGlobalServers] = useState<GlobalMcpServerEntry[]>([]);
  const [openCodeSnapshot, setOpenCodeSnapshot] = useState<OpenCodeSnapshot | null>(
    null,
  );
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const isOpenCodeMode = activeEngine === "opencode";
  const workspaceId = activeWorkspace?.id ?? null;

  const loadMcp = useCallback(async () => {
    if (isOpenCodeMode && !workspaceId) {
      setCodexServers([]);
      setGlobalServers([]);
      setOpenCodeSnapshot(null);
      setError(t("settings.mcpPanel.workspaceRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isOpenCodeMode) {
        const snapshot = await getOpenCodeStatusSnapshot({ workspaceId: workspaceId! });
        setOpenCodeSnapshot({
          mcpEnabled: snapshot.mcpEnabled,
          mcpServers: (snapshot.mcpServers ?? []).map((item) => ({
            name: item.name,
            enabled: item.enabled,
            status: item.status ?? null,
            permissionHint: item.permissionHint ?? null,
          })),
        });
        setCodexServers([]);
        setGlobalServers([]);
      } else {
        const globalMcpServers = await listGlobalMcpServers();
        setGlobalServers(globalMcpServers);
        if (workspaceId) {
          try {
            const response = await listMcpServerStatus(workspaceId, null, null);
            setCodexServers(parseCodexMcpServers(response));
          } catch {
            setCodexServers([]);
          }
        } else {
          setCodexServers([]);
        }
        setOpenCodeSnapshot(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setCodexServers([]);
      setGlobalServers([]);
      setOpenCodeSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [isOpenCodeMode, t, workspaceId]);

  useEffect(() => {
    void loadMcp();
  }, [loadMcp]);

  const totalTools = useMemo(() => {
    if (isOpenCodeMode) {
      return openCodeSnapshot?.mcpServers.length ?? 0;
    }
    if (codexServers.length === 0) {
      return 0;
    }
    return codexServers.reduce((sum, row) => sum + row.toolNames.length, 0);
  }, [codexServers, isOpenCodeMode, openCodeSnapshot?.mcpServers.length]);

  const serverCount = useMemo(() => {
    if (isOpenCodeMode) {
      return openCodeSnapshot?.mcpServers.length ?? 0;
    }
    if (globalServers.length > 0) {
      return globalServers.length;
    }
    return codexServers.length;
  }, [codexServers.length, globalServers.length, isOpenCodeMode, openCodeSnapshot?.mcpServers.length]);

  const handleToggleGlobal = useCallback(
    async (enabled: boolean) => {
      if (!workspaceId) {
        return;
      }
      setTogglingKey("global");
      try {
        await setOpenCodeMcpToggle(workspaceId, { globalEnabled: enabled });
        await loadMcp();
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
      } finally {
        setTogglingKey(null);
      }
    },
    [loadMcp, workspaceId],
  );

  const handleToggleServer = useCallback(
    async (serverName: string, enabled: boolean) => {
      if (!workspaceId) {
        return;
      }
      const key = `server:${serverName}`;
      setTogglingKey(key);
      try {
        await setOpenCodeMcpToggle(workspaceId, {
          serverName,
          enabled,
        });
        await loadMcp();
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
      } finally {
        setTogglingKey(null);
      }
    },
    [loadMcp, workspaceId],
  );

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.mcpPanel.title")}</div>
      <div className="settings-section-subtitle">{t("settings.mcpPanel.description")}</div>

      <div className="settings-mcp-toolbar">
        <div className="settings-inline-muted">
          {t("settings.mcpPanel.serverCount", {
            count: serverCount,
            toolCount: totalTools,
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadMcp()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "is-spin" : ""} />
          {t("settings.mcpPanel.refresh")}
        </Button>
      </div>

      {error && <div className="settings-inline-error">{error}</div>}

      {loading && (
        <div className="settings-inline-muted">{t("settings.loading")}</div>
      )}

      {!loading && !error && isOpenCodeMode && openCodeSnapshot && (
        <div className="settings-mcp-list">
          <div className="settings-mcp-global">
            <div>
              <div className="settings-toggle-title">
                <Plug size={14} />
                {t("settings.mcpPanel.globalToggle")}
              </div>
              <div className="settings-toggle-subtitle">
                {t("settings.mcpPanel.globalToggleDesc")}
              </div>
            </div>
            <Switch
              checked={openCodeSnapshot.mcpEnabled}
              onCheckedChange={(checked) => {
                void handleToggleGlobal(checked);
              }}
              disabled={togglingKey === "global"}
            />
          </div>

          {openCodeSnapshot.mcpServers.length === 0 ? (
            <div className="settings-inline-muted">{t("settings.mcpPanel.noServers")}</div>
          ) : (
            openCodeSnapshot.mcpServers.map((server) => {
              const key = `server:${server.name}`;
              return (
                <div key={server.name} className="settings-mcp-server-row">
                  <div>
                    <div className="settings-mcp-server-name">{server.name}</div>
                    <div className="settings-mcp-server-meta">
                      {server.status ?? t("settings.mcpPanel.statusUnknown")}
                      {server.permissionHint ? ` · ${server.permissionHint}` : ""}
                    </div>
                  </div>
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(checked) => {
                      void handleToggleServer(server.name, checked);
                    }}
                    disabled={togglingKey === key}
                  />
                </div>
              );
            })
          )}
        </div>
      )}

      {!loading && !error && !isOpenCodeMode && (
        <div className="settings-mcp-list">
          {globalServers.length > 0 ? (
            globalServers.map((server) => {
              const sourceLabel = server.source === "claude_json"
                ? t("settings.mcpPanel.sourceClaude")
                : t("settings.mcpPanel.sourceCodemoss");
              const targetLabel = server.command
                ? t("settings.mcpPanel.commandMeta", {
                    command: server.command,
                    args: server.argsCount,
                  })
                : server.url
                  ? t("settings.mcpPanel.urlMeta", { url: server.url })
                  : t("settings.mcpPanel.transportUnknown");
              const transportLabel = server.transport ?? t("settings.mcpPanel.transportUnknown");
              return (
                <div key={server.name} className="settings-mcp-codex-card">
                  <div className="settings-mcp-codex-head">
                    <div className="settings-mcp-server-name">
                      <Server size={14} />
                      {server.name}
                    </div>
                    <span className="settings-mcp-auth">
                      {server.enabled
                        ? t("settings.mcpPanel.enabled")
                        : t("settings.mcpPanel.disabled")}
                    </span>
                  </div>
                  <div className="settings-mcp-codex-meta">
                    {transportLabel} · {targetLabel}
                  </div>
                  <div className="settings-mcp-server-meta">{sourceLabel}</div>
                </div>
              );
            })
          ) : codexServers.length === 0 ? (
            <div className="settings-inline-muted">{t("settings.mcpPanel.noServers")}</div>
          ) : (
            codexServers.map((server) => (
              <div key={server.name} className="settings-mcp-codex-card">
                <div className="settings-mcp-codex-head">
                  <div className="settings-mcp-server-name">
                    <Server size={14} />
                    {server.name}
                  </div>
                  <span className="settings-mcp-auth">
                    {server.authLabel ?? t("settings.mcpPanel.authUnknown")}
                  </span>
                </div>
                <div className="settings-mcp-codex-meta">
                  {t("settings.mcpPanel.resourcesTemplates", {
                    resources: server.resourcesCount,
                    templates: server.templatesCount,
                  })}
                </div>
                <div className="settings-mcp-tools">
                  {server.toolNames.length === 0 ? (
                    <span className="settings-inline-muted">{t("settings.mcpPanel.noTools")}</span>
                  ) : (
                    server.toolNames.map((tool) => (
                      <span key={`${server.name}-${tool}`} className="settings-mcp-tool-chip">
                        {tool}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
