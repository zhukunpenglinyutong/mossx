// @ts-nocheck
import type { Dispatch, SetStateAction } from "react";
import Stethoscope from "lucide-react/dist/esm/icons/stethoscope";
import type {
  AppSettings,
  CodexDoctorResult,
  WorkspaceInfo,
  WorkspaceSettings,
} from "@/types";
import { FileEditorCard } from "../../../../shared/components/FileEditorCard";
import { normalizeOverrideValue } from "../actions/settingsViewActions";

type DoctorState = {
  status: "idle" | "running" | "done" | "error";
  result: CodexDoctorResult | null;
  error: string | null;
};

type CodexSectionProps = {
  active: boolean;
  t: (key: string) => string;
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  codexPathDraft: string;
  setCodexPathDraft: (value: string) => void;
  codexArgsDraft: string;
  setCodexArgsDraft: (value: string) => void;
  codexDirty: boolean;
  handleBrowseCodex: () => Promise<void>;
  handleSaveCodexSettings: () => Promise<void>;
  isSavingSettings: boolean;
  handleRunDoctor: () => Promise<void>;
  doctorState: DoctorState;
  remoteHostDraft: string;
  setRemoteHostDraft: (value: string) => void;
  remoteTokenDraft: string;
  setRemoteTokenDraft: (value: string) => void;
  handleCommitRemoteHost: () => Promise<void>;
  handleCommitRemoteToken: () => Promise<void>;
  globalAgentsMeta: string | null;
  globalAgentsError: string | null;
  globalAgentsContent: string;
  globalAgentsLoading: boolean;
  globalAgentsRefreshDisabled: boolean;
  globalAgentsSaveDisabled: boolean;
  globalAgentsSaveLabel: string;
  setGlobalAgentsContent: (value: string) => void;
  refreshGlobalAgents: () => Promise<void>;
  saveGlobalAgents: () => Promise<void>;
  globalConfigMeta: string | null;
  globalConfigError: string | null;
  globalConfigContent: string;
  globalConfigLoading: boolean;
  globalConfigRefreshDisabled: boolean;
  globalConfigSaveDisabled: boolean;
  globalConfigSaveLabel: string;
  setGlobalConfigContent: (value: string) => void;
  refreshGlobalConfig: () => Promise<void>;
  saveGlobalConfig: () => Promise<void>;
  projects: WorkspaceInfo[];
  codexBinOverrideDrafts: Record<string, string>;
  setCodexBinOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  codexHomeOverrideDrafts: Record<string, string>;
  setCodexHomeOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  codexArgsOverrideDrafts: Record<string, string>;
  setCodexArgsOverrideDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onUpdateWorkspaceCodexBin: (id: string, codexBin: string | null) => Promise<void>;
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<void>;
};

export function CodexSection({
  active,
  t,
  appSettings,
  onUpdateAppSettings,
  codexPathDraft,
  setCodexPathDraft,
  codexArgsDraft,
  setCodexArgsDraft,
  codexDirty,
  handleBrowseCodex,
  handleSaveCodexSettings,
  isSavingSettings,
  handleRunDoctor,
  doctorState,
  remoteHostDraft,
  setRemoteHostDraft,
  remoteTokenDraft,
  setRemoteTokenDraft,
  handleCommitRemoteHost,
  handleCommitRemoteToken,
  globalAgentsMeta,
  globalAgentsError,
  globalAgentsContent,
  globalAgentsLoading,
  globalAgentsRefreshDisabled,
  globalAgentsSaveDisabled,
  globalAgentsSaveLabel,
  setGlobalAgentsContent,
  refreshGlobalAgents,
  saveGlobalAgents,
  globalConfigMeta,
  globalConfigError,
  globalConfigContent,
  globalConfigLoading,
  globalConfigRefreshDisabled,
  globalConfigSaveDisabled,
  globalConfigSaveLabel,
  setGlobalConfigContent,
  refreshGlobalConfig,
  saveGlobalConfig,
  projects,
  codexBinOverrideDrafts,
  setCodexBinOverrideDrafts,
  codexHomeOverrideDrafts,
  setCodexHomeOverrideDrafts,
  codexArgsOverrideDrafts,
  setCodexArgsOverrideDrafts,
  onUpdateWorkspaceCodexBin,
  onUpdateWorkspaceSettings,
}: CodexSectionProps) {
  if (!active) {
    return null;
  }

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.codexTitle")}</div>
      <div className="settings-section-subtitle">
        {t("settings.codexDescription")}
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="codex-path">
          {t("settings.defaultCodexPath")}
        </label>
        <div className="settings-field-row">
          <input
            id="codex-path"
            className="settings-input"
            value={codexPathDraft}
            placeholder={t("settings.codexPlaceholder")}
            onChange={(event) => setCodexPathDraft(event.target.value)}
          />
          <button type="button" className="ghost" onClick={() => void handleBrowseCodex()}>
            {t("settings.browse")}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setCodexPathDraft("")}
          >
            {t("settings.usePath")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.pathResolutionDesc")}
        </div>
        <label className="settings-field-label" htmlFor="codex-args">
          {t("settings.defaultCodexArgs")}
        </label>
        <div className="settings-field-row">
          <input
            id="codex-args"
            className="settings-input"
            value={codexArgsDraft}
            placeholder={t("settings.codexArgsPlaceholder")}
            onChange={(event) => setCodexArgsDraft(event.target.value)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => setCodexArgsDraft("")}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.codexArgsDesc")} <code>{t("settings.appServer")}</code>{t("settings.codexArgsDescSuffix")}
        </div>
        <div className="settings-field-actions">
          {codexDirty && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                void handleSaveCodexSettings();
              }}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? t("settings.saving") : t("common.save")}
            </button>
          )}
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void handleRunDoctor();
            }}
            disabled={doctorState.status === "running"}
          >
            <Stethoscope aria-hidden />
            {doctorState.status === "running" ? t("settings.running") : t("settings.runDoctor")}
          </button>
        </div>

        {doctorState.result && (
          <div
            className={`settings-doctor ${doctorState.result.ok ? "ok" : "error"}`}
          >
            <div className="settings-doctor-title">
              {doctorState.result.ok ? t("settings.codexLooksGood") : t("settings.codexIssueDetected")}
            </div>
            <div className="settings-doctor-body">
              <div>
                {t("settings.versionLabel")} {doctorState.result.version ?? t("git.unknown")}
              </div>
              <div>
                {t("settings.appServerLabel")} {doctorState.result.appServerOk ? t("settings.statusOk") : t("settings.statusFailed")}
              </div>
              {doctorState.result.appServerProbeStatus && (
                <div>
                  <strong>{t("settings.doctorAppServerProbe")}:</strong> {doctorState.result.appServerProbeStatus}
                </div>
              )}
              {doctorState.result.resolvedBinaryPath && (
                <div>
                  <strong>{t("settings.doctorResolvedBinary")}:</strong> {doctorState.result.resolvedBinaryPath}
                </div>
              )}
              {doctorState.result.wrapperKind && (
                <div>
                  <strong>{t("settings.doctorWrapperKind")}:</strong> {doctorState.result.wrapperKind}
                </div>
              )}
              {doctorState.result.fallbackRetried ? (
                <div>
                  <strong>{t("settings.doctorWrapperFallbackRetry")}:</strong> {t("settings.doctorAttempted")}
                </div>
              ) : null}
              {doctorState.result.proxyEnvSnapshot &&
              Object.keys(doctorState.result.proxyEnvSnapshot).length > 0 ? (
                <div>
                  <strong>{t("settings.doctorProxyEnvironment")}:</strong>{" "}
                  {Object.entries(doctorState.result.proxyEnvSnapshot)
                    .map(([key, value]) => `${key}=${value ?? t("settings.notSet")}`)
                    .join(" · ")}
                </div>
              ) : null}
              <div>
                {t("settings.nodeLabel")}{" "}
                {doctorState.result.nodeOk
                  ? `${t("settings.statusOk")} (${doctorState.result.nodeVersion ?? t("git.unknown")})`
                  : t("settings.statusMissing")}
              </div>
              {doctorState.result.details && (
                <div>{doctorState.result.details}</div>
              )}
              {doctorState.result.nodeDetails && (
                <div>{doctorState.result.nodeDetails}</div>
              )}
              {doctorState.result.path && (
                <div className="settings-doctor-path">
                  {t("settings.pathLabel")} {doctorState.result.path}
                </div>
              )}
              {doctorState.result.debug && (
                <details className="settings-doctor-debug">
                  <summary style={{ cursor: "pointer", marginTop: "8px", fontWeight: "bold" }}>
                    {t("settings.doctorDebugInfo")} ({t("settings.doctorClickToExpand")})
                  </summary>
                  <div style={{ marginTop: "8px", fontSize: "12px", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    <div><strong>{t("settings.doctorPlatform")}:</strong> {doctorState.result.debug.platform} ({doctorState.result.debug.arch})</div>
                    <div><strong>{t("settings.doctorResolvedBinary")}:</strong> {doctorState.result.debug.resolvedBinaryPath ?? t("settings.notFound")}</div>
                    <div><strong>{t("settings.doctorWrapperKind")}:</strong> {doctorState.result.debug.wrapperKind ?? t("settings.statusUnknown")}</div>
                    <div><strong>{t("settings.doctorPathUsed")}:</strong> {doctorState.result.debug.pathEnvUsed ?? t("settings.notSet")}</div>
                    <div><strong>{t("settings.doctorClaudeFound")}:</strong> {doctorState.result.debug.claudeFound ?? t("settings.notFound")}</div>
                    <div><strong>{t("settings.doctorCodexFound")}:</strong> {doctorState.result.debug.codexFound ?? t("settings.notFound")}</div>
                    <div><strong>{t("settings.doctorClaudeStandardWhich")}:</strong> {doctorState.result.debug.claudeStandardWhich ?? t("settings.notFound")}</div>
                    <div><strong>{t("settings.doctorCodexStandardWhich")}:</strong> {doctorState.result.debug.codexStandardWhich ?? t("settings.notFound")}</div>
                    {doctorState.result.debug.proxyEnvSnapshot && (
                      <>
                        <div style={{ marginTop: "8px" }}><strong>{t("settings.doctorProxyEnvironment")}:</strong></div>
                        {Object.entries(doctorState.result.debug.proxyEnvSnapshot).map(([key, value]) => (
                          <div key={key} style={{ marginLeft: "12px" }}>
                            <strong>{key}:</strong> {value ?? t("settings.notSet")}
                          </div>
                        ))}
                      </>
                    )}
                    <div style={{ marginTop: "8px" }}><strong>Environment Variables:</strong></div>
                    {Object.entries(doctorState.result.debug.envVars).map(([key, value]) => (
                      <div key={key} style={{ marginLeft: "12px" }}>
                        <strong>{key}:</strong> {value ?? "(not set)"}
                      </div>
                    ))}
                    <div style={{ marginTop: "8px" }}><strong>Extra Search Paths:</strong></div>
                    {doctorState.result.debug.extraSearchPaths.map((p, i) => (
                      <div key={i} style={{ marginLeft: "12px" }}>
                        {p.path}{" "}
                        {p.exists ? (p.isDir ? "✓" : "✓ (file)") : "✗"}{" "}
                        {p.hasCodexCmd && <span style={{ color: "green" }}>[codex.cmd ✓]</span>}
                        {p.hasClaudeCmd && <span style={{ color: "green" }}>[claude.cmd ✓]</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="default-access">
          {t("settings.defaultAccessMode")}
        </label>
        <select
          id="default-access"
          className="settings-select"
          value="full-access"
          disabled
        >
          <option value="full-access">{t("settings.fullAccess")}</option>
        </select>
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="backend-mode">
          {t("settings.backendMode")}
        </label>
        <select
          id="backend-mode"
          className="settings-select"
          value={appSettings.backendMode}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              backendMode: event.target.value as AppSettings["backendMode"],
            })
          }
        >
          <option value="local">{t("settings.backendLocal")}</option>
          <option value="remote">{t("settings.backendRemote")}</option>
        </select>
        <div className="settings-help">
          {t("settings.backendRemoteDesc")}
        </div>
      </div>

      {appSettings.backendMode === "remote" && (
        <div className="settings-field">
          <div className="settings-field-label">{t("settings.remoteBackend")}</div>
          <div className="settings-field-row">
            <input
              className="settings-input settings-input--compact"
              value={remoteHostDraft}
              placeholder="127.0.0.1:4732"
              onChange={(event) => setRemoteHostDraft(event.target.value)}
              onBlur={() => {
                void handleCommitRemoteHost();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCommitRemoteHost();
                }
              }}
              aria-label={t("settings.remoteBackendHostAriaLabel")}
            />
            <input
              type="password"
              className="settings-input settings-input--compact"
              value={remoteTokenDraft}
              placeholder={t("settings.remoteBackendToken")}
              onChange={(event) => setRemoteTokenDraft(event.target.value)}
              onBlur={() => {
                void handleCommitRemoteToken();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCommitRemoteToken();
                }
              }}
              aria-label={t("settings.remoteBackendTokenAriaLabel")}
            />
          </div>
          <div className="settings-help">
            {t("settings.remoteBackendDesc")}
          </div>
        </div>
      )}
      <FileEditorCard
        title={t("settings.globalAgentsMd")}
        meta={globalAgentsMeta}
        error={globalAgentsError}
        value={globalAgentsContent}
        placeholder={t("settings.globalAgentsMdPlaceholder")}
        disabled={globalAgentsLoading}
        refreshDisabled={globalAgentsRefreshDisabled}
        saveDisabled={globalAgentsSaveDisabled}
        saveLabel={globalAgentsSaveLabel}
        onChange={setGlobalAgentsContent}
        onRefresh={() => {
          void refreshGlobalAgents();
        }}
        onSave={() => {
          void saveGlobalAgents();
        }}
        helpText={
          <>
            {t("settings.storedAt")} <code>~/.codex/AGENTS.md</code>.
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />

      <FileEditorCard
        title={t("settings.globalCodexConfig")}
        meta={globalConfigMeta}
        error={globalConfigError}
        value={globalConfigContent}
        placeholder={t("settings.globalConfigTomlPlaceholder")}
        disabled={globalConfigLoading}
        refreshDisabled={globalConfigRefreshDisabled}
        saveDisabled={globalConfigSaveDisabled}
        saveLabel={globalConfigSaveLabel}
        onChange={setGlobalConfigContent}
        onRefresh={() => {
          void refreshGlobalConfig();
        }}
        onSave={() => {
          void saveGlobalConfig();
        }}
        helpText={
          <>
            {t("settings.storedAt")} <code>~/.codex/config.toml</code>.
          </>
        }
        classNames={{
          container: "settings-field settings-agents",
          header: "settings-agents-header",
          title: "settings-field-label",
          actions: "settings-agents-actions",
          meta: "settings-help settings-help-inline",
          iconButton: "ghost settings-icon-button",
          error: "settings-agents-error",
          textarea: "settings-agents-textarea",
          help: "settings-help",
        }}
      />

      <div className="settings-field">
        <div className="settings-field-label">{t("settings.workspaceOverrides")}</div>
        <div className="settings-overrides">
          {projects.map((workspace) => (
            <div key={workspace.id} className="settings-override-row">
              <div className="settings-override-info">
                <div className="settings-project-name">{workspace.name}</div>
                <div className="settings-project-path">{workspace.path}</div>
              </div>
              <div className="settings-override-actions">
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexBinOverrideDrafts[workspace.id] ?? ""}
                    placeholder={t("settings.codexBinaryOverride")}
                    onChange={(event) =>
                      setCodexBinOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexBinOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (nextValue === (workspace.codex_bin ?? null)) {
                        return;
                      }
                      await onUpdateWorkspaceCodexBin(workspace.id, nextValue);
                    }}
                    aria-label={`Codex binary override for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      setCodexBinOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceCodexBin(workspace.id, null);
                    }}
                  >
                    {t("settings.clear")}
                  </button>
                </div>
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexHomeOverrideDrafts[workspace.id] ?? ""}
                    placeholder={t("settings.codexHomeOverride")}
                    onChange={(event) =>
                      setCodexHomeOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexHomeOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (nextValue === (workspace.settings.codexHome ?? null)) {
                        return;
                      }
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexHome: nextValue,
                      });
                    }}
                    aria-label={`CODEX_HOME override for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      setCodexHomeOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexHome: null,
                      });
                    }}
                  >
                    {t("settings.clear")}
                  </button>
                </div>
                <div className="settings-override-field">
                  <input
                    className="settings-input settings-input--compact"
                    value={codexArgsOverrideDrafts[workspace.id] ?? ""}
                    placeholder={t("settings.codexArgsOverride")}
                    onChange={(event) =>
                      setCodexArgsOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: event.target.value,
                      }))
                    }
                    onBlur={async () => {
                      const draft = codexArgsOverrideDrafts[workspace.id] ?? "";
                      const nextValue = normalizeOverrideValue(draft);
                      if (nextValue === (workspace.settings.codexArgs ?? null)) {
                        return;
                      }
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexArgs: nextValue,
                      });
                    }}
                    aria-label={`Codex args override for ${workspace.name}`}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      setCodexArgsOverrideDrafts((prev) => ({
                        ...prev,
                        [workspace.id]: "",
                      }));
                      await onUpdateWorkspaceSettings(workspace.id, {
                        codexArgs: null,
                      });
                    }}
                  >
                    {t("settings.clear")}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="settings-empty">{t("settings.noProjectsYet")}</div>
          )}
        </div>
      </div>
    </section>
  );
}
