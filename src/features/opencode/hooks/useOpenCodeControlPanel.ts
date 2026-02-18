import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  connectOpenCodeProvider,
  getOpenCodeProviderCatalog,
  getOpenCodeProviderHealth,
  getOpenCodeSessionList,
  getOpenCodeStatusSnapshot,
  setOpenCodeMcpToggle,
} from "../../../services/tauri";
import type {
  OpenCodeProviderHealth,
  OpenCodeProviderOption,
  OpenCodeSessionSummary,
  OpenCodeStatusSnapshot,
} from "../types";

type UseOpenCodeControlPanelOptions = {
  workspaceId: string | null;
  threadId: string | null;
  selectedModel: string | null;
  selectedAgent: string | null;
  selectedVariant: string | null;
  enabled: boolean;
  loadProviderCatalog?: boolean;
};

const FALLBACK_PROVIDER_HEALTH: OpenCodeProviderHealth = {
  provider: "unknown",
  connected: false,
  credentialCount: 0,
  matched: false,
  error: null,
};
const REFRESH_THROTTLE_MS = 1200;

export function useOpenCodeControlPanel({
  workspaceId,
  threadId,
  selectedModel,
  selectedAgent,
  selectedVariant,
  enabled,
  loadProviderCatalog = false,
}: UseOpenCodeControlPanelOptions) {
  const inferProviderFromModel = useCallback((model: string | null | undefined): string | null => {
    const raw = (model ?? "").trim();
    if (!raw) {
      return null;
    }
    if (raw.includes("/")) {
      const provider = raw.split("/")[0]?.trim().toLowerCase();
      return provider || null;
    }
    const key = raw.toLowerCase();
    if (
      key.startsWith("gpt-") ||
      key.startsWith("o1") ||
      key.startsWith("o3") ||
      key.startsWith("o4") ||
      key.startsWith("codex")
    ) {
      return "openai";
    }
    if (key.startsWith("claude-")) {
      return "anthropic";
    }
    if (key.startsWith("gemini-")) {
      return "google";
    }
    if (key.includes("minimax")) {
      return "minimax-cn-coding-plan";
    }
    return null;
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<OpenCodeStatusSnapshot | null>(null);
  const [providerHealth, setProviderHealth] = useState<OpenCodeProviderHealth | null>(null);
  const [testingProvider, setTestingProvider] = useState(false);
  const [sessions, setSessions] = useState<OpenCodeSessionSummary[]>([]);
  const [favoriteSessionIds, setFavoriteSessionIds] = useState<Record<string, true>>({});
  const [providerOptions, setProviderOptions] = useState<OpenCodeProviderOption[]>([]);
  const [connectingProvider, setConnectingProvider] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const providerCatalogLoadedRef = useRef(false);

  const sanitizeProviderOptions = useCallback((rows: OpenCodeProviderOption[]) => {
    const noisePattern =
      /(select provider|add credential|login method|to select|enter: confirm|type: to search|^search:)/i;
    const seen = new Map<string, OpenCodeProviderOption>();
    for (const row of rows) {
      const label = (row.label ?? "").trim();
      const id = (row.id ?? "").trim();
      if (!label || !id || noisePattern.test(label)) {
        continue;
      }
      const dedupKey = label.toLowerCase();
      const next: OpenCodeProviderOption = {
        ...row,
        label,
        id,
        category: row.category === "popular" ? "popular" : "other",
      };
      const prev = seen.get(dedupKey);
      if (!prev) {
        seen.set(dedupKey, next);
        continue;
      }
      const merged: OpenCodeProviderOption = {
        ...prev,
        category:
          prev.category === "popular" || next.category === "popular"
            ? "popular"
            : "other",
        recommended: prev.recommended || next.recommended,
        description: prev.description ?? next.description,
      };
      seen.set(dedupKey, merged);
    }
    return Array.from(seen.values()).sort((a, b) => {
      const scoreA = a.category === "popular" ? 0 : 1;
      const scoreB = b.category === "popular" ? 0 : 1;
      return scoreA - scoreB || Number(b.recommended) - Number(a.recommended) || a.label.localeCompare(b.label);
    });
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!enabled || !workspaceId) {
      return;
    }
    const now = Date.now();
    const needsCatalog = loadProviderCatalog && !providerCatalogLoadedRef.current;
    if (!force && now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS && !needsCatalog) {
      return;
    }
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const task = (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getOpenCodeStatusSnapshot({
          workspaceId,
          threadId,
          model: selectedModel,
          agent: selectedAgent,
          variant: selectedVariant,
        });
        setSnapshot(result);
        setProviderHealth(result.providerHealth ?? FALLBACK_PROVIDER_HEALTH);
        const sessionRows = await getOpenCodeSessionList(workspaceId);
        setSessions(sessionRows ?? []);
        if (loadProviderCatalog && !providerCatalogLoadedRef.current) {
          const providerRows = await getOpenCodeProviderCatalog(workspaceId);
          setProviderOptions(sanitizeProviderOptions(providerRows ?? []));
          providerCatalogLoadedRef.current = true;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        lastRefreshAtRef.current = Date.now();
        setLoading(false);
      }
    })();
    refreshInFlightRef.current = task;
    try {
      await task;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [
    enabled,
    loadProviderCatalog,
    sanitizeProviderOptions,
    workspaceId,
    threadId,
    selectedModel,
    selectedAgent,
    selectedVariant,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    providerCatalogLoadedRef.current = false;
    setProviderOptions([]);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const key = `opencode-favorite-sessions:${workspaceId}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setFavoriteSessionIds({});
        return;
      }
      const parsed = JSON.parse(raw) as string[];
      const next: Record<string, true> = {};
      parsed.forEach((item) => {
        if (typeof item === "string" && item.trim()) {
          next[item] = true;
        }
      });
      setFavoriteSessionIds(next);
    } catch {
      setFavoriteSessionIds({});
    }
  }, [workspaceId]);

  const testProvider = useCallback(async (providerId?: string | null) => {
    if (!enabled || !workspaceId) {
      return null;
    }
    const provider =
      providerId?.trim() ||
      snapshot?.provider ||
      inferProviderFromModel(selectedModel);
    setTestingProvider(true);
    try {
      const result = await getOpenCodeProviderHealth(workspaceId, provider);
      setProviderHealth(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setTestingProvider(false);
    }
  }, [enabled, inferProviderFromModel, workspaceId, selectedModel, snapshot?.provider]);

  const connectProvider = useCallback(
    async (providerId: string | null) => {
      if (!enabled || !workspaceId) {
        return;
      }
      setConnectingProvider(true);
      try {
        await connectOpenCodeProvider(workspaceId, providerId);
        setError(null);
        await refresh(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setConnectingProvider(false);
      }
    },
    [enabled, refresh, workspaceId],
  );

  const toggleMcpGlobal = useCallback(
    async (enabledValue: boolean) => {
      if (!workspaceId) {
        return;
      }
      await setOpenCodeMcpToggle(workspaceId, {
        globalEnabled: enabledValue,
      });
      await refresh(true);
    },
    [refresh, workspaceId],
  );

  const toggleMcpServer = useCallback(
    async (serverName: string, enabledValue: boolean) => {
      if (!workspaceId) {
        return;
      }
      await setOpenCodeMcpToggle(workspaceId, {
        serverName,
        enabled: enabledValue,
      });
      await refresh(true);
    },
    [refresh, workspaceId],
  );

  const effectiveProviderHealth = useMemo(
    () => providerHealth ?? snapshot?.providerHealth ?? FALLBACK_PROVIDER_HEALTH,
    [providerHealth, snapshot?.providerHealth],
  );

  const toggleFavoriteSession = useCallback(
    (sessionId: string) => {
      if (!workspaceId || !sessionId) {
        return;
      }
      setFavoriteSessionIds((prev) => {
        const next = { ...prev };
        if (next[sessionId]) {
          delete next[sessionId];
        } else {
          next[sessionId] = true;
        }
        try {
          const key = `opencode-favorite-sessions:${workspaceId}`;
          window.localStorage.setItem(key, JSON.stringify(Object.keys(next)));
        } catch {
          // Ignore storage errors.
        }
        return next;
      });
    },
    [workspaceId],
  );

  return {
    loading,
    error,
    snapshot,
    providerHealth: effectiveProviderHealth,
    testingProvider,
    sessions,
    providerOptions,
    connectingProvider,
    favoriteSessionIds,
    refresh,
    testProvider,
    connectProvider,
    toggleMcpGlobal,
    toggleMcpServer,
    toggleFavoriteSession,
  };
}
