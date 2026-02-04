import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

type SidebarCornerActionsProps = {
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
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
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  accountSwitching,
  accountCancelDisabled,
  onSwitchAccount,
  onCancelSwitchAccount,
}: SidebarCornerActionsProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = await getVersion();
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };
    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

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

  return (
    <div className="sidebar-corner-actions">
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
      <button
        className="ghost sidebar-corner-button"
        type="button"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
      >
        <Settings size={14} aria-hidden />
      </button>
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
      {version && (
        <span className="sidebar-version" title={`Version ${version}`}>
          v{version}
        </span>
      )}
    </div>
  );
}
