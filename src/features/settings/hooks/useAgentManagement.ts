import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AgentConfig, AgentImportPreviewItem } from "../../../types";
import {
  addAgentConfig,
  applyImportAgentConfigs,
  deleteAgentConfig,
  exportAgentConfigs,
  listAgentConfigs,
  previewImportAgentConfigs,
  updateAgentConfig,
} from "../../../services/tauri";

export type AgentConflictStrategy = "skip" | "overwrite" | "duplicate";

export type AgentDialogState = {
  open: boolean;
  mode: "create" | "edit";
  target: AgentConfig | null;
  name: string;
  prompt: string;
  nameError: string | null;
  saving: boolean;
};

export type AgentDeleteState = {
  open: boolean;
  target: AgentConfig | null;
  deleting: boolean;
};

export type AgentExportState = {
  open: boolean;
  saving: boolean;
  selectedIds: Set<string>;
};

export type AgentImportState = {
  open: boolean;
  loading: boolean;
  applying: boolean;
  preview: {
    items: AgentImportPreviewItem[];
    summary: {
      total: number;
      newCount: number;
      updateCount: number;
    };
  } | null;
  selectedIds: Set<string>;
  strategy: AgentConflictStrategy;
};

export function useAgentManagement() {
  const { t } = useTranslation();

  const [agentList, setAgentList] = useState<AgentConfig[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentNotice, setAgentNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [agentDialog, setAgentDialog] = useState<AgentDialogState>({
    open: false,
    mode: "create",
    target: null,
    name: "",
    prompt: "",
    nameError: null,
    saving: false,
  });
  const [agentDelete, setAgentDelete] = useState<AgentDeleteState>({
    open: false,
    target: null,
    deleting: false,
  });
  const [agentExport, setAgentExport] = useState<AgentExportState>({
    open: false,
    saving: false,
    selectedIds: new Set<string>(),
  });
  const [agentImport, setAgentImport] = useState<AgentImportState>({
    open: false,
    loading: false,
    applying: false,
    preview: null,
    selectedIds: new Set<string>(),
    strategy: "skip",
  });

  const loadAgents = useCallback(async () => {
    setAgentLoading(true);
    setAgentError(null);
    try {
      const list = await listAgentConfigs();
      setAgentList(Array.isArray(list) ? list : []);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentLoading(false);
    }
  }, []);

  const handleOpenCreateAgent = useCallback(() => {
    setAgentDialog({
      open: true,
      mode: "create",
      target: null,
      name: "",
      prompt: "",
      nameError: null,
      saving: false,
    });
  }, []);

  const handleOpenEditAgent = useCallback((agent: AgentConfig) => {
    setAgentDialog({
      open: true,
      mode: "edit",
      target: agent,
      name: agent.name ?? "",
      prompt: agent.prompt ?? "",
      nameError: null,
      saving: false,
    });
  }, []);

  const closeAgentDialog = useCallback(() => {
    setAgentDialog((prev) => ({
      ...prev,
      open: false,
      saving: false,
      nameError: null,
    }));
  }, []);

  const handleSaveAgent = useCallback(async () => {
    const trimmedName = agentDialog.name.trim();
    const trimmedPrompt = agentDialog.prompt.trim();
    const nameLength = trimmedName.length;
    if (nameLength < 1 || nameLength > 20) {
      setAgentDialog((prev) => ({
        ...prev,
        nameError: t("settings.agent.dialog.nameInvalid"),
      }));
      return;
    }
    if (trimmedPrompt.length > 100000) {
      setAgentDialog((prev) => ({
        ...prev,
        nameError: t("settings.agent.dialog.promptTooLong"),
      }));
      return;
    }

    setAgentDialog((prev) => ({ ...prev, saving: true, nameError: null }));
    setAgentNotice(null);
    try {
      if (agentDialog.mode === "create") {
        const newId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        await addAgentConfig({
          id: newId,
          name: trimmedName,
          prompt: trimmedPrompt || null,
          createdAt: Date.now(),
        });
        setAgentNotice({
          kind: "success",
          message: t("settings.agent.addSuccess"),
        });
      } else if (agentDialog.target) {
        await updateAgentConfig(agentDialog.target.id, {
          name: trimmedName,
          prompt: trimmedPrompt || null,
        });
        setAgentNotice({
          kind: "success",
          message: t("settings.agent.updateSuccess"),
        });
      }
      setAgentDialog({
        open: false,
        mode: "create",
        target: null,
        name: "",
        prompt: "",
        nameError: null,
        saving: false,
      });
      await loadAgents();
    } catch (error) {
      setAgentDialog((prev) => ({ ...prev, saving: false }));
      setAgentNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [agentDialog, loadAgents, t]);

  const handleOpenDeleteAgent = useCallback((agent: AgentConfig) => {
    setAgentDelete({
      open: true,
      target: agent,
      deleting: false,
    });
  }, []);

  const handleConfirmDeleteAgent = useCallback(async () => {
    if (!agentDelete.target) {
      return;
    }
    setAgentDelete((prev) => ({ ...prev, deleting: true }));
    setAgentNotice(null);
    try {
      await deleteAgentConfig(agentDelete.target.id);
      setAgentDelete({ open: false, target: null, deleting: false });
      setAgentNotice({
        kind: "success",
        message: t("settings.agent.deleteSuccess"),
      });
      await loadAgents();
    } catch (error) {
      setAgentDelete((prev) => ({ ...prev, deleting: false }));
      setAgentNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [agentDelete.target, loadAgents, t]);

  const handleOpenExportAgents = useCallback(() => {
    if (agentList.length === 0) {
      setAgentNotice({
        kind: "error",
        message: t("settings.agent.noAgents"),
      });
      return;
    }
    setAgentExport({
      open: true,
      saving: false,
      selectedIds: new Set(agentList.map((agent) => agent.id)),
    });
  }, [agentList, t]);

  const handleConfirmExportAgents = useCallback(async () => {
    const selectedIds = Array.from(agentExport.selectedIds);
    if (selectedIds.length === 0) {
      return;
    }
    const targetPath = await save({
      title: t("settings.agent.exportDialog.title"),
      defaultPath: `agents-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!targetPath) {
      return;
    }

    setAgentExport((prev) => ({ ...prev, saving: true }));
    setAgentNotice(null);
    try {
      await exportAgentConfigs(selectedIds, targetPath);
      setAgentExport({ open: false, saving: false, selectedIds: new Set() });
      setAgentNotice({
        kind: "success",
        message: t("settings.agent.importDialog.exportSuccess"),
      });
    } catch (error) {
      setAgentExport((prev) => ({ ...prev, saving: false }));
      setAgentNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [agentExport.selectedIds, t]);

  const handleOpenImportAgents = useCallback(async () => {
    const selection = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selection || Array.isArray(selection)) {
      return;
    }

    setAgentImport({
      open: true,
      loading: true,
      applying: false,
      preview: null,
      selectedIds: new Set<string>(),
      strategy: "skip",
    });
    setAgentNotice(null);
    try {
      const preview = await previewImportAgentConfigs(selection);
      const selectedIds = new Set(preview.items.map((item) => item.data.id));
      setAgentImport({
        open: true,
        loading: false,
        applying: false,
        preview,
        selectedIds,
        strategy: "skip",
      });
    } catch (error) {
      setAgentImport({
        open: false,
        loading: false,
        applying: false,
        preview: null,
        selectedIds: new Set<string>(),
        strategy: "skip",
      });
      setAgentNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const hasImportConflicts = useMemo(
    () => Boolean(agentImport.preview?.items.some((item) => item.conflict)),
    [agentImport.preview],
  );

  const handleConfirmImportAgents = useCallback(async () => {
    if (!agentImport.preview || agentImport.selectedIds.size === 0) {
      return;
    }
    setAgentImport((prev) => ({ ...prev, applying: true }));
    setAgentNotice(null);
    try {
      const selectedAgents = agentImport.preview.items
        .filter((item) => agentImport.selectedIds.has(item.data.id))
        .map((item) => item.data);
      const result = await applyImportAgentConfigs({
        agents: selectedAgents,
        strategy: hasImportConflicts ? agentImport.strategy : "skip",
      });
      setAgentImport({
        open: false,
        loading: false,
        applying: false,
        preview: null,
        selectedIds: new Set<string>(),
        strategy: "skip",
      });
      setAgentNotice({
        kind: result.success ? "success" : "error",
        message: t("settings.agent.importDialog.importPartialSuccess", {
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
        }),
      });
      await loadAgents();
    } catch (error) {
      setAgentImport((prev) => ({ ...prev, applying: false }));
      setAgentNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [agentImport.preview, agentImport.selectedIds, agentImport.strategy, hasImportConflicts, loadAgents, t]);

  // Auto-dismiss agent notice after 3.2 seconds
  useEffect(() => {
    if (!agentNotice) {
      return;
    }
    const timer = window.setTimeout(() => {
      setAgentNotice(null);
    }, 3200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [agentNotice]);

  return {
    agentList,
    agentLoading,
    agentError,
    agentNotice,
    agentDialog,
    setAgentDialog,
    agentDelete,
    setAgentDelete,
    agentExport,
    setAgentExport,
    agentImport,
    setAgentImport,
    loadAgents,
    handleOpenCreateAgent,
    handleOpenEditAgent,
    closeAgentDialog,
    handleSaveAgent,
    handleOpenDeleteAgent,
    handleConfirmDeleteAgent,
    handleOpenExportAgents,
    handleConfirmExportAgents,
    handleOpenImportAgents,
    hasImportConflicts,
    handleConfirmImportAgents,
  };
}
