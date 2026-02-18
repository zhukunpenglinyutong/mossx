import { useState } from "react";
import type { VendorTab } from "../types";
import { useProviderManagement } from "../hooks/useProviderManagement";
import { useCodexProviderManagement } from "../hooks/useCodexProviderManagement";
import { ProviderList } from "./ProviderList";
import { CodexProviderList } from "./CodexProviderList";
import { ProviderDialog } from "./ProviderDialog";
import { CodexProviderDialog } from "./CodexProviderDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";

export function VendorSettingsPanel() {
  const [activeTab, setActiveTab] = useState<VendorTab>("claude");

  const claude = useProviderManagement();
  const codex = useCodexProviderManagement();

  return (
    <div className="vendor-settings-panel">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as VendorTab)}
      >
        <TabsList className="vendor-tabs">
          <TabsTab className="vendor-tab" value="claude">
            Claude
          </TabsTab>
          <TabsTab className="vendor-tab" value="codex">
            Codex
          </TabsTab>
        </TabsList>

        <TabsPanel value="claude">
          <div className="vendor-tab-content">
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
          </div>
        </TabsPanel>

        <TabsPanel value="codex">
          <div className="vendor-tab-content">
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
          </div>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
