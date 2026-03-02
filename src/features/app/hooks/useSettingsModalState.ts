import { useCallback, useState } from "react";

export type SettingsSection =
  | "basic"
  | "providers"
  | "projects"
  | "usage"
  | "mcp"
  | "permissions"
  | "commit"
  | "agents"
  | "prompts"
  | "skills"
  | "composer"
  | "dictation"
  | "shortcuts"
  | "open-apps"
  | "git"
  | "other"
  | "community"
  | "vendors"
  | "codex"
  | "experimental"
  | "about";

export type SettingsHighlightTarget = "experimental-collaboration-modes";

export function useSettingsModalState() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(
    null,
  );
  const [settingsHighlightTarget, setSettingsHighlightTarget] =
    useState<SettingsHighlightTarget | null>(null);

  const openSettings = useCallback(
    (section?: SettingsSection, highlightTarget?: SettingsHighlightTarget) => {
      setSettingsSection(section ?? null);
      setSettingsHighlightTarget(highlightTarget ?? null);
      setSettingsOpen(true);
    },
    [],
  );

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsSection(null);
    setSettingsHighlightTarget(null);
  }, []);

  return {
    settingsOpen,
    settingsSection,
    settingsHighlightTarget,
    openSettings,
    closeSettings,
    setSettingsOpen,
    setSettingsSection,
    setSettingsHighlightTarget,
  };
}
