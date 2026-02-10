import { useCallback, useEffect, useState } from "react";
import {
  type ProjectMemoryItem,
  type ProjectMemorySettings,
} from "../../../services/tauri";
import { projectMemoryFacade } from "../services/projectMemoryFacade";

type UseProjectMemoryOptions = {
  workspaceId: string | null;
};

const DEFAULT_SETTINGS: ProjectMemorySettings = {
  autoEnabled: true,
  captureMode: "balanced",
  dedupeEnabled: true,
  desensitizeEnabled: true,
  workspaceOverrides: {},
};

export function useProjectMemory({ workspaceId }: UseProjectMemoryOptions) {
  const [items, setItems] = useState<ProjectMemoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [importance, setImportance] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState<ProjectMemorySettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [workspaceAutoEnabled, setWorkspaceAutoEnabled] = useState<boolean>(true);

  const selectedItem = items.find((entry) => entry.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setItems([]);
      setTotal(0);
      setSelectedId(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await projectMemoryFacade.list({
        workspaceId,
        query,
        kind,
        importance,
        tag: tag.trim() || null,
        page,
        pageSize,
      });
      setItems(response.items);
      setTotal(response.total);
      setSelectedId((current) => {
        if (!current) {
          return response.items[0]?.id ?? null;
        }
        return response.items.some((item) => item.id === current)
          ? current
          : response.items[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [importance, kind, page, pageSize, query, tag, workspaceId]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await projectMemoryFacade.getSettings();
      setSettings(data);
      if (workspaceId) {
        const override = data.workspaceOverrides[workspaceId];
        setWorkspaceAutoEnabled(override?.autoEnabled ?? data.autoEnabled);
      } else {
        setWorkspaceAutoEnabled(data.autoEnabled);
      }
    } catch {
      setSettings(DEFAULT_SETTINGS);
      setWorkspaceAutoEnabled(true);
    } finally {
      setSettingsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateSettings = useCallback(
    async (next: ProjectMemorySettings) => {
      const saved = await projectMemoryFacade.updateSettings(next);
      setSettings(saved);
      if (workspaceId) {
        const override = saved.workspaceOverrides[workspaceId];
        setWorkspaceAutoEnabled(override?.autoEnabled ?? saved.autoEnabled);
      } else {
        setWorkspaceAutoEnabled(saved.autoEnabled);
      }
      return saved;
    },
    [workspaceId],
  );

  const toggleWorkspaceAutoCapture = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    const nextValue = !workspaceAutoEnabled;
    const nextSettings: ProjectMemorySettings = {
      ...settings,
      workspaceOverrides: {
        ...settings.workspaceOverrides,
        [workspaceId]: {
          autoEnabled: nextValue,
        },
      },
    };
    await updateSettings(nextSettings);
  }, [settings, updateSettings, workspaceAutoEnabled, workspaceId]);

  const createMemory = useCallback(
    async (input: {
      kind?: string | null;
      title?: string | null;
      summary?: string | null;
      detail?: string | null;
      tags?: string[] | null;
      importance?: string | null;
    }) => {
      if (!workspaceId) {
        throw new Error("No active workspace");
      }
      const created = await projectMemoryFacade.create({
        workspaceId,
        ...input,
        source: "manual",
      });
      setItems((prev) => [created, ...prev]);
      setTotal((prev) => prev + 1);
      setSelectedId(created.id);
      return created;
    },
    [workspaceId],
  );

  const updateMemory = useCallback(async (id: string, patch: Parameters<typeof projectMemoryFacade.update>[2]) => {
    if (!workspaceId) {
      throw new Error("No active workspace");
    }
    const updated = await projectMemoryFacade.update(id, workspaceId, patch);
    setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    return updated;
  }, [workspaceId]);

  const deleteMemory = useCallback(async (id: string) => {
    if (!workspaceId) {
      throw new Error("No active workspace");
    }
    await projectMemoryFacade.delete(id, workspaceId);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    setSelectedId((current) => (current === id ? null : current));
  }, [workspaceId]);

  useEffect(() => {
    setPage(0);
  }, [workspaceId, query, kind, importance, tag]);

  return {
    items,
    total,
    page,
    pageSize,
    query,
    kind,
    importance,
    tag,
    selectedId,
    selectedItem,
    loading,
    error,
    settingsLoading,
    settings,
    workspaceAutoEnabled,
    setQuery,
    setKind,
    setImportance,
    setTag,
    setPage,
    setSelectedId,
    refresh,
    loadSettings,
    updateSettings,
    toggleWorkspaceAutoCapture,
    createMemory,
    updateMemory,
    deleteMemory,
  };
}
