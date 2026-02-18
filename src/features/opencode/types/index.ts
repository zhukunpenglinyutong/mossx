export type OpenCodeProviderHealth = {
  provider: string;
  connected: boolean;
  credentialCount: number;
  matched: boolean;
  authenticatedProviders?: string[];
  error?: string | null;
};

export type OpenCodeMcpServer = {
  name: string;
  enabled: boolean;
  status?: string | null;
  permissionHint?: string | null;
};

export type OpenCodeSessionSummary = {
  sessionId: string;
  title: string;
  updatedLabel: string;
};

export type OpenCodeProviderOption = {
  id: string;
  label: string;
  description?: string | null;
  category: "popular" | "other";
  recommended: boolean;
};

export type OpenCodeStatusSnapshot = {
  sessionId?: string | null;
  model?: string | null;
  agent?: string | null;
  variant?: string | null;
  provider?: string | null;
  providerHealth: OpenCodeProviderHealth;
  mcpEnabled: boolean;
  mcpServers: OpenCodeMcpServer[];
  mcpRaw: string;
  managedToggles: boolean;
  tokenUsage?: number | null;
  contextWindow?: number | null;
};
