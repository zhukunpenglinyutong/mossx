import { useState } from "react";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Link2 from "lucide-react/dist/esm/icons/link-2";
import type { OpenCodeProviderHealth } from "../types";

type OpenCodeProviderSectionProps = {
  providerHealth: OpenCodeProviderHealth;
  providerStatusTone: "is-ok" | "is-runtime" | "is-fail";
  providerStatusLabel: string;
  showHeader?: boolean;
  connectingProvider: boolean;
  onConnectProvider: () => Promise<void>;
};

export function OpenCodeProviderSection({
  providerHealth,
  providerStatusTone,
  providerStatusLabel,
  showHeader = true,
  connectingProvider,
  onConnectProvider,
}: OpenCodeProviderSectionProps) {
  const [providerCheckFeedback, setProviderCheckFeedback] = useState<string | null>(null);

  return (
    <div className="opencode-panel-provider">
      {showHeader && (
        <>
          <div className="opencode-provider-head">
            <div className="opencode-provider-title">
              <ShieldCheck size={13} aria-hidden />
              <span>Provider</span>
            </div>
            <span
              className={`opencode-provider-status ${providerStatusTone}`}
              title={providerHealth.error ?? ""}
            >
              {providerStatusLabel}
            </span>
          </div>
          <div className="opencode-provider-meta">
            <span>{providerHealth.provider}</span>
            <span>{providerHealth.credentialCount} credential(s)</span>
          </div>
        </>
      )}
      <div className="opencode-provider-connect">
        <button
          type="button"
          className="opencode-provider-connect-btn"
          onClick={async () => {
            await onConnectProvider();
            setProviderCheckFeedback("已拉起 CLI 认证流程，请在终端中自行选择空间/Provider 并完成认证。");
          }}
          disabled={connectingProvider}
          title="在系统终端中打开 OpenCode CLI 原生登录流程"
        >
          <Link2 size={12} aria-hidden />
          <span>{connectingProvider ? "启动中..." : "连接（CLI 选择）"}</span>
        </button>
      </div>
      <div className="opencode-provider-hint">
        会在系统终端打开 OpenCode 原生认证流程，完成后回到当前会话继续使用即可；此处不再预选 Provider。
      </div>
      {providerCheckFeedback && (
        <div className="opencode-provider-feedback" role="status">
          {providerCheckFeedback}
        </div>
      )}
    </div>
  );
}
