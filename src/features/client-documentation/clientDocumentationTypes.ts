export type ClientDocumentationIconKey =
  | "workspace"
  | "conversation"
  | "composer"
  | "engine"
  | "runtime"
  | "files"
  | "git"
  | "spec"
  | "memory"
  | "tasks"
  | "search"
  | "settings"
  | "extensions"
  | "notifications"
  | "ui";

export type ClientDocumentationNode = {
  id: string;
  uiControlId?: string;
  title: string;
  summary: string;
  iconKey?: ClientDocumentationIconKey;
  entry: string;
  purpose: string;
  features: string[];
  workflow?: string[];
  usageSteps?: string[];
  notes: string[];
  relatedModules: string[];
  children?: ClientDocumentationNode[];
};

export type ClientDocumentationModuleMapping = {
  moduleId: string;
  moduleTitle: string;
  entryEvidence: string;
  sourceEvidence: string[];
};

export type ClientDocumentationBoundaryGuard = {
  id: string;
  description: string;
  verification: string;
};

export type ClientDocumentationPlatformCheck = {
  id: string;
  platform: "windows" | "macos" | "cross-platform";
  description: string;
  verification: string;
};
