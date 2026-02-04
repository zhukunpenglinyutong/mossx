import Blocks from "lucide-react/dist/esm/icons/blocks";
import Box from "lucide-react/dist/esm/icons/box";
import { useTranslation } from "react-i18next";
import { pushErrorToast } from "../../../services/toasts";

export function SidebarMarketLinks() {
  const { t } = useTranslation();

  const handleClick = () => {
    pushErrorToast({
      title: t("sidebar.comingSoon"),
      message: t("sidebar.comingSoonMessage"),
      durationMs: 3000,
    });
  };

  return (
    <div className="sidebar-market-list">
      <button
        type="button"
        className="sidebar-market-item"
        onClick={handleClick}
        data-tauri-drag-region="false"
      >
        <Blocks className="sidebar-market-icon" />
        <span>{t("sidebar.mcpMarket")}</span>
      </button>
      <button
        type="button"
        className="sidebar-market-item"
        onClick={handleClick}
        data-tauri-drag-region="false"
      >
        <Box className="sidebar-market-icon" />
        <span>{t("sidebar.skillsMarket")}</span>
      </button>
    </div>
  );
}
