import { useTranslation } from "react-i18next";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import Terminal from "lucide-react/dist/esm/icons/terminal";
// TODO: 暂时隐藏登录功能，后续可能恢复
// import User from "lucide-react/dist/esm/icons/user";
// import X from "lucide-react/dist/esm/icons/x";

type SidebarCornerActionsProps = {
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showTerminalButton?: boolean;
  isTerminalOpen?: boolean;
  onToggleTerminal?: () => void;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
};

export function SidebarCornerActions({
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showTerminalButton = false,
  isTerminalOpen = false,
  onToggleTerminal,
  // TODO: 暂时隐藏登录功能，后续可能恢复
  showAccountSwitcher: _showAccountSwitcher,
  accountLabel: _accountLabel,
  accountActionLabel: _accountActionLabel,
  accountDisabled: _accountDisabled,
  accountSwitching: _accountSwitching,
  accountCancelDisabled: _accountCancelDisabled,
  onSwitchAccount: _onSwitchAccount,
  onCancelSwitchAccount: _onCancelSwitchAccount,
}: SidebarCornerActionsProps) {
  const { t } = useTranslation();
  // TODO: 暂时隐藏登录功能，后续可能恢复
  // const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  // const accountMenuRef = useRef<HTMLDivElement | null>(null);

  // TODO: 暂时隐藏登录功能，后续可能恢复
  /*
  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accountMenuRef.current?.contains(target)) {
        return;
      }
      setAccountMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!showAccountSwitcher) {
      setAccountMenuOpen(false);
    }
  }, [showAccountSwitcher]);
  */

  return (
    <div className="sidebar-corner-actions">
      {/* TODO: 暂时隐藏登录功能，后续可能恢复
      {showAccountSwitcher && (
        <div className="sidebar-account-menu" ref={accountMenuRef}>
          <button
            className="ghost sidebar-corner-button"
            type="button"
            onClick={() => setAccountMenuOpen((open) => !open)}
            aria-label="Account"
            title="Account"
          >
            <User size={14} aria-hidden />
          </button>
          {accountMenuOpen && (
            <div className="sidebar-account-popover popover-surface" role="dialog">
              <div className="sidebar-account-title">Account</div>
              <div className="sidebar-account-value">{accountLabel}</div>
              <div className="sidebar-account-actions-row">
                <button
                  type="button"
                  className="primary sidebar-account-action"
                  onClick={onSwitchAccount}
                  disabled={accountDisabled}
                  aria-busy={accountSwitching}
                >
                  <span className="sidebar-account-action-content">
                    {accountSwitching && (
                      <span className="sidebar-account-spinner" aria-hidden />
                    )}
                    <span>{accountActionLabel}</span>
                  </span>
                </button>
                {accountSwitching && (
                  <button
                    type="button"
                    className="secondary sidebar-account-cancel"
                    onClick={onCancelSwitchAccount}
                    disabled={accountCancelDisabled}
                    aria-label="Cancel account switch"
                    title="Cancel"
                  >
                    <X size={12} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      */}
      <button
        className="sidebar-settings-button"
        type="button"
        onClick={onOpenSettings}
        aria-label={t("settings.title")}
        title={t("settings.title")}
      >
        <Settings size={16} aria-hidden />
        <span className="sidebar-settings-label">{t("settings.title")}</span>
      </button>
      {showTerminalButton && onToggleTerminal && (
        <button
          className={`sidebar-terminal-button${isTerminalOpen ? " is-active" : ""}`}
          type="button"
          onClick={onToggleTerminal}
          aria-label={t("common.toggleTerminalPanel")}
          title={t("common.terminal")}
        >
          <Terminal size={16} aria-hidden />
          <span className="sidebar-terminal-label">{t("common.terminal")}</span>
        </button>
      )}
      {showDebugButton && (
        <button
          className="ghost sidebar-corner-button"
          type="button"
          onClick={onOpenDebug}
          aria-label="Open debug log"
          title="Debug log"
        >
          <ScrollText size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
