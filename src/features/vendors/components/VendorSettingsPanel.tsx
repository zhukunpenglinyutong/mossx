import { useState } from "react";
import type { VendorTab } from "../types";
import { useProviderManagement } from "../hooks/useProviderManagement";
import { useCodexProviderManagement } from "../hooks/useCodexProviderManagement";
import { ProviderList } from "./ProviderList";
import { CodexProviderList } from "./CodexProviderList";
import { ProviderDialog } from "./ProviderDialog";
import { CodexProviderDialog } from "./CodexProviderDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export function VendorSettingsPanel() {
  const [activeTab, setActiveTab] = useState<VendorTab>("claude");

  const claude = useProviderManagement();
  const codex = useCodexProviderManagement();

  return (
    <div className="vendor-settings-panel">
      <div className="vendor-tabs">
        <button
          type="button"
          className={`vendor-tab ${activeTab === "claude" ? "active" : ""}`}
          onClick={() => setActiveTab("claude")}
        >
          Claude
        </button>
        <button
          type="button"
          className={`vendor-tab ${activeTab === "codex" ? "active" : ""}`}
          onClick={() => setActiveTab("codex")}
        >
          Codex
        </button>
      </div>

      <div className="vendor-tab-content">
        {activeTab === "claude" && (
          <>
            <ProviderList
              providers={claude.providers}
              loading={claude.loading}
              onAdd={claude.handleAddProvider}
              onEdit={claude.handleEditProvider}
              onDelete={claude.handleDeleteProvider}
              onSwitch={claude.handleSwitchProvider}
            />
            <ProviderDialog
              isOpen={claude.providerDialog.isOpen}
              provider={claude.providerDialog.provider}
              onClose={claude.handleCloseProviderDialog}
              onSave={claude.handleSaveProvider}
            />
            <DeleteConfirmDialog
              isOpen={claude.deleteConfirm.isOpen}
              providerName={claude.deleteConfirm.provider?.name ?? ""}
              onConfirm={claude.confirmDeleteProvider}
              onCancel={claude.cancelDeleteProvider}
            />
          </>
        )}

        {activeTab === "codex" && (
          <>
            <CodexProviderList
              providers={codex.codexProviders}
              loading={codex.codexLoading}
              onAdd={codex.handleAddCodexProvider}
              onEdit={codex.handleEditCodexProvider}
              onDelete={codex.handleDeleteCodexProvider}
              onSwitch={codex.handleSwitchCodexProvider}
            />
            <CodexProviderDialog
              isOpen={codex.codexProviderDialog.isOpen}
              provider={codex.codexProviderDialog.provider}
              onClose={codex.handleCloseCodexProviderDialog}
              onSave={codex.handleSaveCodexProvider}
            />
            <DeleteConfirmDialog
              isOpen={codex.deleteCodexConfirm.isOpen}
              providerName={codex.deleteCodexConfirm.provider?.name ?? ""}
              onConfirm={codex.confirmDeleteCodexProvider}
              onCancel={codex.cancelDeleteCodexProvider}
            />
          </>
        )}
      </div>
    </div>
  );
}
