import { useEffect } from "react";
import type { AppSettings } from "../../../types";

type Params = {
  enabled: boolean;
  appSettingsLoading: boolean;
  selectionReady: boolean;
  selectedModelId: string | null;
  selectedEffort: string | null;
  setAppSettings: (updater: (current: AppSettings) => AppSettings) => void;
  queueSaveSettings: (next: AppSettings) => Promise<AppSettings>;
};

export function usePersistComposerSettings({
  enabled,
  appSettingsLoading,
  selectionReady,
  selectedModelId,
  selectedEffort,
  setAppSettings,
  queueSaveSettings,
}: Params) {
  useEffect(() => {
    if (!enabled || appSettingsLoading || !selectionReady) {
      return;
    }
    setAppSettings((current) => {
      if (
        current.lastComposerModelId === selectedModelId &&
        current.lastComposerReasoningEffort === selectedEffort
      ) {
        return current;
      }
      const nextSettings = {
        ...current,
        lastComposerModelId: selectedModelId,
        lastComposerReasoningEffort: selectedEffort,
      };
      void queueSaveSettings(nextSettings);
      return nextSettings;
    });
  }, [
    enabled,
    appSettingsLoading,
    selectionReady,
    queueSaveSettings,
    selectedEffort,
    selectedModelId,
    setAppSettings,
  ]);
}
