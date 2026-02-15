import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../../types";
import { getAppSettings, runCodexDoctor, updateAppSettings } from "../../../services/tauri";
import { clampUiScale, UI_SCALE_DEFAULT } from "../../../utils/uiScale";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  CODE_FONT_SIZE_DEFAULT,
  clampCodeFontSize,
  normalizeFontFamily,
} from "../../../utils/fonts";
import {
  DEFAULT_OPEN_APP_ID,
  DEFAULT_OPEN_APP_TARGETS,
} from "../../app/constants";
import { getClientStoreSync } from "../../../services/clientStorage";
import { normalizeOpenAppTargets } from "../../app/utils/openApp";
import { getDefaultInterruptShortcut } from "../../../utils/shortcuts";

const allowedThemes = new Set(["system", "light", "dark", "dim"]);
const SEARCH_SHORTCUT_DISALLOWED = new Set(["cmd+p", "ctrl+p"]);

function normalizeShortcutValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return normalized || null;
}

function normalizeGlobalSearchShortcut(value: string | null | undefined): string {
  const normalized = normalizeShortcutValue(value);
  if (!normalized || SEARCH_SHORTCUT_DISALLOWED.has(normalized)) {
    return "cmd+o";
  }
  return normalized;
}

const defaultSettings: AppSettings = {
  codexBin: null,
  codexArgs: null,
  backendMode: "local",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
  defaultAccessMode: "full-access",
  composerModelShortcut: "cmd+shift+m",
  composerAccessShortcut: "cmd+shift+a",
  composerReasoningShortcut: "cmd+shift+r",
  composerCollaborationShortcut: "shift+tab",
  interruptShortcut: getDefaultInterruptShortcut(),
  newAgentShortcut: "cmd+n",
  newWorktreeAgentShortcut: "cmd+shift+n",
  newCloneAgentShortcut: "cmd+alt+n",
  archiveThreadShortcut: "cmd+ctrl+a",
  toggleProjectsSidebarShortcut: "cmd+shift+p",
  toggleGitSidebarShortcut: "cmd+shift+g",
  toggleGlobalSearchShortcut: "cmd+o",
  toggleDebugPanelShortcut: "cmd+shift+d",
  toggleTerminalShortcut: "cmd+shift+t",
  cycleAgentNextShortcut: "cmd+ctrl+down",
  cycleAgentPrevShortcut: "cmd+ctrl+up",
  cycleWorkspaceNextShortcut: "cmd+shift+down",
  cycleWorkspacePrevShortcut: "cmd+shift+up",
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  uiScale: UI_SCALE_DEFAULT,
  theme: "system",
  usageShowRemaining: false,
  showMessageAnchors: true,
  uiFontFamily: DEFAULT_UI_FONT_FAMILY,
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  codeFontSize: CODE_FONT_SIZE_DEFAULT,
  notificationSoundsEnabled: true,
  systemNotificationEnabled: true,
  preloadGitDiffs: true,
  experimentalCollabEnabled: false,
  experimentalCollaborationModesEnabled: false,
  experimentalSteerEnabled: false,
  experimentalUnifiedExecEnabled: false,
  dictationEnabled: false,
  dictationModelId: "base",
  dictationPreferredLanguage: null,
  dictationHoldKey: "alt",
  composerEditorPreset: "default",
  composerFenceExpandOnSpace: false,
  composerFenceExpandOnEnter: false,
  composerFenceLanguageTags: false,
  composerFenceWrapSelection: false,
  composerFenceAutoWrapPasteMultiline: false,
  composerFenceAutoWrapPasteCodeLike: false,
  composerListContinuation: false,
  composerCodeBlockCopyUseModifier: false,
  workspaceGroups: [],
  openAppTargets: DEFAULT_OPEN_APP_TARGETS,
  selectedOpenAppId: DEFAULT_OPEN_APP_ID,
};

function normalizeAppSettings(settings: AppSettings): AppSettings {
  const normalizedTargets =
    settings.openAppTargets && settings.openAppTargets.length
      ? normalizeOpenAppTargets(settings.openAppTargets)
      : DEFAULT_OPEN_APP_TARGETS;
  const storedOpenAppId = getClientStoreSync<string>("app", "openWorkspaceApp") ?? null;
  const hasPersistedSelection = normalizedTargets.some(
    (target) => target.id === settings.selectedOpenAppId,
  );
  const hasStoredSelection =
    !hasPersistedSelection &&
    storedOpenAppId !== null &&
    normalizedTargets.some((target) => target.id === storedOpenAppId);
  const selectedOpenAppId = hasPersistedSelection
    ? settings.selectedOpenAppId
    : hasStoredSelection
      ? storedOpenAppId
      : normalizedTargets[0]?.id ?? DEFAULT_OPEN_APP_ID;
  return {
    ...settings,
    codexBin: settings.codexBin?.trim() ? settings.codexBin.trim() : null,
    codexArgs: settings.codexArgs?.trim() ? settings.codexArgs.trim() : null,
    uiScale: clampUiScale(settings.uiScale),
    theme: allowedThemes.has(settings.theme) ? settings.theme : "system",
    uiFontFamily: normalizeFontFamily(
      settings.uiFontFamily,
      DEFAULT_UI_FONT_FAMILY,
    ),
    codeFontFamily: normalizeFontFamily(
      settings.codeFontFamily,
      DEFAULT_CODE_FONT_FAMILY,
    ),
    codeFontSize: clampCodeFontSize(settings.codeFontSize),
    toggleGlobalSearchShortcut: normalizeGlobalSearchShortcut(settings.toggleGlobalSearchShortcut),
    openAppTargets: normalizedTargets,
    selectedOpenAppId,
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await getAppSettings();
        if (active) {
          setSettings(
            normalizeAppSettings({
              ...defaultSettings,
              ...response,
            }),
          );
        }
      } catch {
        // Defaults stay in place if loading settings fails.
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const saveSettings = useCallback(async (next: AppSettings) => {
    const normalized = normalizeAppSettings(next);
    const saved = await updateAppSettings(normalized);
    setSettings(
      normalizeAppSettings({
        ...defaultSettings,
        ...saved,
      }),
    );
    return saved;
  }, []);

  const doctor = useCallback(
    async (codexBin: string | null, codexArgs: string | null) => {
      return runCodexDoctor(codexBin, codexArgs);
    },
    [],
  );

  return {
    settings,
    setSettings,
    saveSettings,
    doctor,
    isLoading,
  };
}
