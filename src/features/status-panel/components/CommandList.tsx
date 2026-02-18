import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import type { CommandSummary } from "../types";

interface CommandListProps {
  commands: CommandSummary[];
  enableExpand?: boolean;
}

const STATUS_ICON = {
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
} as const;

function stripTrailingEllipsis(text: string): string {
  return text.replace(/(?:\u2026|\.{3})\s*$/, "");
}

export const CommandList = memo(function CommandList({
  commands,
  enableExpand = false,
}: CommandListProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    if (!enableExpand) {
      return;
    }
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [enableExpand]);

  if (commands.length === 0) {
    return <div className="sp-empty">{t("statusPanel.emptyCommands")}</div>;
  }
  return (
    <div className="sp-command-list">
      {commands.map((entry) => {
        const Icon = STATUS_ICON[entry.status] ?? Loader2;
        const isExpanded = expandedIds.has(entry.id);
        const canExpand = enableExpand && entry.command.length > 0;
        const displayCommand =
          isExpanded && canExpand
            ? stripTrailingEllipsis(entry.command)
            : entry.command;
        return (
          <div
            key={entry.id}
            className={`sp-command-item sp-command-${entry.status}${canExpand ? " is-expandable" : ""}`}
            onClick={() => toggleExpanded(entry.id)}
            role={canExpand ? "button" : undefined}
            tabIndex={canExpand ? 0 : undefined}
            aria-expanded={canExpand ? isExpanded : undefined}
            onKeyDown={(event) => {
              if (!canExpand) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleExpanded(entry.id);
              }
            }}
          >
            <span className="sp-command-icon">
              <Icon size={14} />
            </span>
            <code
              className={`sp-command-text${isExpanded ? " is-expanded" : ""}`}
              title={entry.command}
            >
              {displayCommand}
            </code>
          </div>
        );
      })}
    </div>
  );
});
