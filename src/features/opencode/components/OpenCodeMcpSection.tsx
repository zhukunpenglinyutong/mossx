import Plug from "lucide-react/dist/esm/icons/plug";
import type { OpenCodeStatusSnapshot } from "../types";

type OpenCodeMcpSectionProps = {
  snapshot: OpenCodeStatusSnapshot | null;
  onToggleMcpGlobal: (enabled: boolean) => Promise<void>;
  onToggleMcpServer: (serverName: string, enabled: boolean) => Promise<void>;
};

export function OpenCodeMcpSection({
  snapshot,
  onToggleMcpGlobal,
  onToggleMcpServer,
}: OpenCodeMcpSectionProps) {
  return (
    <div className="opencode-panel-mcp">
      <div className="opencode-mcp-head">
        <div className="opencode-provider-title">
          <Plug size={13} aria-hidden />
          <span>MCP</span>
        </div>
        <label className="opencode-toggle">
          <input
            type="checkbox"
            checked={snapshot?.mcpEnabled ?? true}
            onChange={(event) => {
              void onToggleMcpGlobal(event.target.checked);
            }}
          />
          <span>总开关</span>
        </label>
      </div>
      <div className="opencode-mcp-list">
        {(snapshot?.mcpServers ?? []).length === 0 && (
          <div className="opencode-mcp-empty">暂无 MCP server（可通过 opencode mcp add 添加）</div>
        )}
        {(snapshot?.mcpServers ?? []).map((server) => (
          <label key={server.name} className="opencode-mcp-row" title={server.permissionHint ?? ""}>
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(event) => {
                void onToggleMcpServer(server.name, event.target.checked);
              }}
            />
            <span className="opencode-mcp-name">{server.name}</span>
            <span className="opencode-mcp-status">{server.status ?? "unknown"}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
