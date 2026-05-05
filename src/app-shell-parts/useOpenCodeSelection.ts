import { useCallback, useEffect, useRef, useState } from "react";
import { getOpenCodeAgentsList } from "../services/tauri";
import type { DebugEntry, EngineType, OpenCodeAgentOption } from "../types";

type SelectionMap = Record<string, string | null>;

type ResolveOpenCodeThreadSelectionOptions = {
  activeWorkspaceId: string | null;
  threadId: string | null;
  byThreadId: SelectionMap;
  defaultsByWorkspace: SelectionMap;
};

type MigratePendingOpenCodeThreadSelectionOptions = {
  selectionsByThreadId: SelectionMap;
  previousThreadId: string | null;
  activeThreadId: string | null;
};

type UseOpenCodeSelectionOptions = {
  activeEngine: EngineType;
  enabled?: boolean;
  activeWorkspaceId: string | null;
  onDebug?: (entry: DebugEntry) => void;
};

type UseOpenCodeSelectionResult = {
  openCodeAgents: OpenCodeAgentOption[];
  resolveOpenCodeAgentForThread: (threadId: string | null) => string | null;
  resolveOpenCodeVariantForThread: (threadId: string | null) => string | null;
  selectOpenCodeAgentForThread: (threadId: string | null, agentId: string | null) => void;
  selectOpenCodeVariantForThread: (threadId: string | null, variant: string | null) => void;
  syncActiveOpenCodeThread: (threadId: string | null) => void;
};

export function normalizeOpenCodeSelectionValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeOpenCodeAgentsResponse(response: unknown): OpenCodeAgentOption[] {
  const payload = Array.isArray(response)
    ? response
    : Array.isArray((response as { result?: unknown[] } | null)?.result)
      ? (response as { result: unknown[] }).result
      : [];
  return payload
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: String(record?.id ?? "").trim(),
        description: record?.description ? String(record.description) : undefined,
        isPrimary: Boolean(record?.isPrimary ?? record?.is_primary),
      };
    })
    .filter((item) => item.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveOpenCodeThreadSelection({
  activeWorkspaceId,
  threadId,
  byThreadId,
  defaultsByWorkspace,
}: ResolveOpenCodeThreadSelectionOptions) {
  if (!activeWorkspaceId) {
    return null;
  }
  if (threadId && threadId in byThreadId) {
    return byThreadId[threadId] ?? null;
  }
  return defaultsByWorkspace[activeWorkspaceId] ?? null;
}

export function migratePendingOpenCodeThreadSelection({
  selectionsByThreadId,
  previousThreadId,
  activeThreadId,
}: MigratePendingOpenCodeThreadSelectionOptions) {
  if (
    !previousThreadId ||
    !activeThreadId ||
    previousThreadId === activeThreadId ||
    !previousThreadId.startsWith("opencode-pending-") ||
    !activeThreadId.startsWith("opencode:") ||
    !(previousThreadId in selectionsByThreadId) ||
    activeThreadId in selectionsByThreadId
  ) {
    return selectionsByThreadId;
  }
  return {
    ...selectionsByThreadId,
    [activeThreadId]: selectionsByThreadId[previousThreadId] ?? null,
  };
}

export function useOpenCodeSelection({
  activeEngine,
  enabled = true,
  activeWorkspaceId,
  onDebug,
}: UseOpenCodeSelectionOptions): UseOpenCodeSelectionResult {
  const [openCodeAgents, setOpenCodeAgents] = useState<OpenCodeAgentOption[]>([]);
  const [openCodeAgentByThreadId, setOpenCodeAgentByThreadId] = useState<SelectionMap>({});
  const [openCodeVariantByThreadId, setOpenCodeVariantByThreadId] = useState<SelectionMap>({});
  const [openCodeDefaultAgentByWorkspace, setOpenCodeDefaultAgentByWorkspace] =
    useState<SelectionMap>({});
  const [openCodeDefaultVariantByWorkspace, setOpenCodeDefaultVariantByWorkspace] =
    useState<SelectionMap>({});
  const previousOpenCodeThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || activeEngine !== "opencode") {
      setOpenCodeAgents([]);
      return;
    }
    let cancelled = false;
    void getOpenCodeAgentsList()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setOpenCodeAgents(normalizeOpenCodeAgentsResponse(response));
      })
      .catch((error) => {
        onDebug?.({
          id: `${Date.now()}-opencode-agents-list-error`,
          timestamp: Date.now(),
          source: "error",
          label: "opencode/agents list error",
          payload: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [activeEngine, enabled, onDebug]);

  const resolveOpenCodeAgentForThread = useCallback(
    (threadId: string | null) =>
      resolveOpenCodeThreadSelection({
        activeWorkspaceId,
        threadId,
        byThreadId: openCodeAgentByThreadId,
        defaultsByWorkspace: openCodeDefaultAgentByWorkspace,
      }),
    [activeWorkspaceId, openCodeAgentByThreadId, openCodeDefaultAgentByWorkspace],
  );

  const resolveOpenCodeVariantForThread = useCallback(
    (threadId: string | null) =>
      resolveOpenCodeThreadSelection({
        activeWorkspaceId,
        threadId,
        byThreadId: openCodeVariantByThreadId,
        defaultsByWorkspace: openCodeDefaultVariantByWorkspace,
      }),
    [activeWorkspaceId, openCodeDefaultVariantByWorkspace, openCodeVariantByThreadId],
  );

  const selectOpenCodeAgentForThread = useCallback(
    (threadId: string | null, agentId: string | null) => {
      if (!activeWorkspaceId) {
        return;
      }
      const normalized = normalizeOpenCodeSelectionValue(agentId);
      setOpenCodeDefaultAgentByWorkspace((prev) => ({
        ...prev,
        [activeWorkspaceId]: normalized,
      }));
      if (!threadId) {
        return;
      }
      setOpenCodeAgentByThreadId((prev) => ({
        ...prev,
        [threadId]: normalized,
      }));
    },
    [activeWorkspaceId],
  );

  const selectOpenCodeVariantForThread = useCallback(
    (threadId: string | null, variant: string | null) => {
      if (!activeWorkspaceId) {
        return;
      }
      const normalized = normalizeOpenCodeSelectionValue(variant);
      setOpenCodeDefaultVariantByWorkspace((prev) => ({
        ...prev,
        [activeWorkspaceId]: normalized,
      }));
      if (!threadId) {
        return;
      }
      setOpenCodeVariantByThreadId((prev) => ({
        ...prev,
        [threadId]: normalized,
      }));
    },
    [activeWorkspaceId],
  );

  const syncActiveOpenCodeThread = useCallback((threadId: string | null) => {
    const previousThreadId = previousOpenCodeThreadIdRef.current;
    setOpenCodeAgentByThreadId((prev) =>
      migratePendingOpenCodeThreadSelection({
        selectionsByThreadId: prev,
        previousThreadId,
        activeThreadId: threadId,
      }),
    );
    setOpenCodeVariantByThreadId((prev) =>
      migratePendingOpenCodeThreadSelection({
        selectionsByThreadId: prev,
        previousThreadId,
        activeThreadId: threadId,
      }),
    );
    previousOpenCodeThreadIdRef.current = threadId ?? null;
  }, []);

  return {
    openCodeAgents,
    resolveOpenCodeAgentForThread,
    resolveOpenCodeVariantForThread,
    selectOpenCodeAgentForThread,
    selectOpenCodeVariantForThread,
    syncActiveOpenCodeThread,
  };
}
