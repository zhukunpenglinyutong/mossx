import { lazy } from "react";

export const SettingsView = lazy(() =>
  import("../features/settings/components/SettingsView").then((module) => ({
    default: module.SettingsView,
  })),
);

export const GitHubPanelData = lazy(() =>
  import("../features/git/components/GitHubPanelData").then((module) => ({
    default: module.GitHubPanelData,
  })),
);
