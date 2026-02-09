import { useState, useCallback, useEffect } from "react";
import type { CodexProviderConfig } from "../types";
import { STORAGE_KEYS } from "../types";
import {
  getCodexProviders,
  addCodexProvider,
  updateCodexProvider,
  deleteCodexProvider,
  switchCodexProvider,
} from "../../../services/tauri";

export interface CodexProviderDialogState {
  isOpen: boolean;
  provider: CodexProviderConfig | null;
}

export interface DeleteCodexConfirmState {
  isOpen: boolean;
  provider: CodexProviderConfig | null;
}

function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    window.dispatchEvent(
      new CustomEvent("localStorageChange", { detail: { key } }),
    );
    return true;
  } catch {
    return false;
  }
}

export function useCodexProviderManagement() {
  const [codexProviders, setCodexProviders] = useState<CodexProviderConfig[]>(
    [],
  );
  const [codexLoading, setCodexLoading] = useState(false);

  const [codexProviderDialog, setCodexProviderDialog] =
    useState<CodexProviderDialogState>({
      isOpen: false,
      provider: null,
    });

  const [deleteCodexConfirm, setDeleteCodexConfirm] =
    useState<DeleteCodexConfirmState>({
      isOpen: false,
      provider: null,
    });

  const loadCodexProviders = useCallback(async () => {
    setCodexLoading(true);
    try {
      const list = await getCodexProviders();
      setCodexProviders(list);
      const active = list.find((p: CodexProviderConfig) => p.isActive);
      if (active) {
        safeSetLocalStorage(
          STORAGE_KEYS.CODEX_CUSTOM_MODELS,
          JSON.stringify(active.customModels || []),
        );
      }
    } catch {
      // ignore
    } finally {
      setCodexLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCodexProviders();
  }, [loadCodexProviders]);

  const handleAddCodexProvider = useCallback(() => {
    setCodexProviderDialog({ isOpen: true, provider: null });
  }, []);

  const handleEditCodexProvider = useCallback(
    (provider: CodexProviderConfig) => {
      setCodexProviderDialog({ isOpen: true, provider });
    },
    [],
  );

  const handleCloseCodexProviderDialog = useCallback(() => {
    setCodexProviderDialog({ isOpen: false, provider: null });
  }, []);

  const handleSaveCodexProvider = useCallback(
    async (providerData: CodexProviderConfig) => {
      const isAdding = !codexProviderDialog.provider;

      try {
        if (isAdding) {
          await addCodexProvider(providerData);
        } else {
          await updateCodexProvider(providerData.id, providerData);
        }

        const activeProvider = codexProviders.find((p) => p.isActive);
        if (activeProvider && activeProvider.id === providerData.id) {
          safeSetLocalStorage(
            STORAGE_KEYS.CODEX_CUSTOM_MODELS,
            JSON.stringify(providerData.customModels || []),
          );
        }

        setCodexProviderDialog({ isOpen: false, provider: null });
        await loadCodexProviders();
      } catch {
        // ignore
      }
    },
    [codexProviderDialog.provider, codexProviders, loadCodexProviders],
  );

  const handleSwitchCodexProvider = useCallback(
    async (id: string) => {
      try {
        await switchCodexProvider(id);
        await loadCodexProviders();
      } catch {
        // ignore
      }
    },
    [loadCodexProviders],
  );

  const handleDeleteCodexProvider = useCallback(
    (provider: CodexProviderConfig) => {
      setDeleteCodexConfirm({ isOpen: true, provider });
    },
    [],
  );

  const confirmDeleteCodexProvider = useCallback(async () => {
    const provider = deleteCodexConfirm.provider;
    if (!provider) return;

    try {
      await deleteCodexProvider(provider.id);
      await loadCodexProviders();
    } catch {
      // ignore
    }
    setDeleteCodexConfirm({ isOpen: false, provider: null });
  }, [deleteCodexConfirm.provider, loadCodexProviders]);

  const cancelDeleteCodexProvider = useCallback(() => {
    setDeleteCodexConfirm({ isOpen: false, provider: null });
  }, []);

  return {
    codexProviders,
    codexLoading,
    codexProviderDialog,
    deleteCodexConfirm,
    loadCodexProviders,
    handleAddCodexProvider,
    handleEditCodexProvider,
    handleCloseCodexProviderDialog,
    handleSaveCodexProvider,
    handleSwitchCodexProvider,
    handleDeleteCodexProvider,
    confirmDeleteCodexProvider,
    cancelDeleteCodexProvider,
  };
}

export type UseCodexProviderManagementReturn = ReturnType<
  typeof useCodexProviderManagement
>;
