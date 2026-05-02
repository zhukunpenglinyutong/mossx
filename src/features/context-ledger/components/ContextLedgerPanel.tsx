import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextLedgerBlock, ContextLedgerGroup, ContextLedgerProjection } from "../types";
import { normalizeManagedInstructionSource } from "../../skills/utils/managedInstructionSource";

type ContextLedgerPanelProps = {
  projection: ContextLedgerProjection;
  expanded: boolean;
  onToggle: () => void;
  onExcludeBlock?: (block: ContextLedgerBlock) => void;
  onTogglePinBlock?: (block: ContextLedgerBlock) => void;
};

function formatCompactCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return Number.isInteger(millions) ? `${millions}m` : `${millions.toFixed(1)}m`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
}

function resolveGroupLabel(t: (key: string) => string, group: ContextLedgerGroup) {
  switch (group.kind) {
    case "recent_turns":
      return t("composer.contextLedgerGroupRecentTurns");
    case "compaction_summary":
      return t("composer.contextLedgerGroupCompaction");
    case "manual_memory":
      return t("composer.contextLedgerGroupManualMemory");
    case "attached_resource":
      return t("composer.contextLedgerGroupAttachedResource");
    case "helper_selection":
      return t("composer.contextLedgerGroupHelperSelection");
  }
}

function resolveBlockLabel(t: (key: string) => string, block: ContextLedgerBlock) {
  switch (block.kind) {
    case "usage_snapshot":
      return t("composer.contextLedgerBlockUsageSnapshot");
    case "compaction_summary":
      return t("composer.contextLedgerBlockCompactionSummary");
    case "manual_memory":
      return t("composer.contextLedgerBlockManualMemory");
    case "note_card":
      return t("composer.contextLedgerBlockNoteCard");
    case "file_reference":
      return t("composer.contextLedgerBlockFileReference");
    case "helper_selection":
      return t("composer.contextLedgerBlockHelperSelection");
  }
}

function resolveParticipationLabel(t: (key: string) => string, value: ContextLedgerBlock["participationState"]) {
  switch (value) {
    case "selected":
      return t("composer.contextLedgerParticipationSelected");
    case "pinned_next_send":
      return t("composer.contextLedgerParticipationPinnedNextSend");
    case "shared":
      return t("composer.contextLedgerParticipationShared");
    case "degraded":
      return t("composer.contextLedgerParticipationDegraded");
  }
}

function resolveFreshnessLabel(t: (key: string) => string, value: ContextLedgerBlock["freshness"]) {
  switch (value) {
    case "fresh":
      return t("composer.contextLedgerFreshnessFresh");
    case "pending_sync":
      return t("composer.contextLedgerFreshnessPendingSync");
    case "unknown":
      return t("composer.contextLedgerFreshnessUnknown");
  }
}

function resolveAttributionLabel(
  t: (key: string) => string,
  value: ContextLedgerBlock["attributionKind"],
) {
  switch (value) {
    case "workspace_context":
      return t("composer.contextLedgerAttributionWorkspaceContext");
    case "engine_injected":
      return t("composer.contextLedgerAttributionEngineInjected");
    case "system_injected":
      return t("composer.contextLedgerAttributionSystemInjected");
    case "degraded":
      return t("composer.contextLedgerAttributionDegraded");
    default:
      return null;
  }
}

function resolveBackendSourceLabel(
  t: (key: string) => string,
  value: ContextLedgerBlock["backendSource"],
) {
  switch (normalizeManagedInstructionSource(value)) {
    case "workspace_managed":
      return t("composer.contextLedgerBackendSourceWorkspaceManaged");
    case "project_claude":
      return t("composer.contextLedgerBackendSourceProjectClaude");
    case "project_codex":
      return t("composer.contextLedgerBackendSourceProjectCodex");
    case "project_agents":
      return t("composer.contextLedgerBackendSourceProjectAgents");
    case "global_claude":
      return t("composer.contextLedgerBackendSourceGlobalClaude");
    case "global_claude_plugin":
      return t("composer.contextLedgerBackendSourceGlobalClaudePlugin");
    case "global_codex":
      return t("composer.contextLedgerBackendSourceGlobalCodex");
    case "global_gemini":
      return t("composer.contextLedgerBackendSourceGlobalGemini");
    case "global_agents":
      return t("composer.contextLedgerBackendSourceGlobalAgents");
    default:
      return null;
  }
}

function resolveEstimateLabel(t: (key: string, params?: Record<string, unknown>) => string, block: ContextLedgerBlock) {
  if (block.estimate.kind === "tokens" && block.estimate.value != null) {
    return t("composer.contextLedgerEstimateTokens", {
      count: formatCompactCount(block.estimate.value),
    });
  }
  if (block.estimate.kind === "chars" && block.estimate.value != null) {
    return t("composer.contextLedgerEstimateChars", {
      count: block.estimate.value,
    });
  }
  return t("composer.contextLedgerEstimateUnknown");
}

function resolveBlockTitle(t: (key: string, params?: Record<string, unknown>) => string, block: ContextLedgerBlock) {
  if (block.titleKey) {
    return t(block.titleKey, block.titleParams ?? undefined);
  }
  return block.title;
}

function resolveBlockDetail(t: (key: string, params?: Record<string, unknown>) => string, block: ContextLedgerBlock) {
  if (block.detailKey) {
    return t(block.detailKey, block.detailParams ?? undefined);
  }
  return block.detail;
}

function resolveInspectionTitle(
  t: (key: string, params?: Record<string, unknown>) => string,
  block: ContextLedgerBlock,
) {
  return block.inspectionTitle ?? resolveBlockTitle(t, block);
}

function resolveInspectionContent(
  t: (key: string, params?: Record<string, unknown>) => string,
  block: ContextLedgerBlock,
) {
  return block.inspectionContent ?? resolveBlockDetail(t, block) ?? block.sourceRef ?? "";
}

function canExcludeBlock(block: ContextLedgerBlock) {
  return (
    block.kind === "manual_memory"
    || block.kind === "note_card"
    || block.kind === "helper_selection"
    || block.kind === "file_reference"
  ) && (
    block.participationState === "selected"
    || block.participationState === "pinned_next_send"
  );
}

function canTogglePinBlock(block: ContextLedgerBlock) {
  return (
    block.kind === "manual_memory"
    || block.kind === "note_card"
    || block.kind === "helper_selection"
  ) && (
    block.participationState === "selected"
    || block.participationState === "pinned_next_send"
  );
}

export const ContextLedgerPanel = memo(function ContextLedgerPanel({
  projection,
  expanded,
  onToggle,
  onExcludeBlock,
  onTogglePinBlock,
}: ContextLedgerPanelProps) {
  const { t } = useTranslation();
  const [inspectedBlock, setInspectedBlock] = useState<ContextLedgerBlock | null>(null);

  if (!projection.visible) {
    return null;
  }

  const summaryBits = [
    projection.totalUsageTokens != null
      ? t("composer.contextLedgerSummaryTokens", {
          tokens: formatCompactCount(projection.totalUsageTokens),
        })
      : null,
    t("composer.contextLedgerSummaryBlocks", {
      count: projection.totalBlockCount,
    }),
    t("composer.contextLedgerSummaryGroups", {
      count: projection.totalGroupCount,
    }),
  ].filter(Boolean);
  const inspectedAttributionLabel = inspectedBlock
    ? resolveAttributionLabel(t, inspectedBlock.attributionKind)
    : null;
  const inspectedBackendSourceLabel = inspectedBlock
    ? resolveBackendSourceLabel(t, inspectedBlock.backendSource)
    : null;

  return (
    <section className="composer-context-ledger">
      <button
        type="button"
        className="composer-context-ledger-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="composer-context-ledger-title">
          {t("composer.contextLedgerTitle")}
        </span>
        <span className="composer-context-ledger-summary">
          {summaryBits.join(" · ")}
        </span>
        <span className="composer-context-ledger-toggle-text">
          {expanded
            ? t("composer.contextLedgerCollapse")
            : t("composer.contextLedgerExpand")}
        </span>
      </button>

      {expanded ? (
        <div
          className="composer-context-ledger-panel"
          role="region"
          aria-label={t("composer.contextLedgerTitle")}
        >
          {projection.groups.map((group) => (
            <section
              key={group.kind}
              className="composer-context-ledger-group"
            >
              <header className="composer-context-ledger-group-head">
                <span className="composer-context-ledger-group-title">
                  {resolveGroupLabel(t, group)}
                </span>
                <span className="composer-context-ledger-group-count">
                  {group.blocks.length}
                </span>
              </header>
              <div className="composer-context-ledger-block-list">
                {group.blocks.map((block) => (
                  <article
                    key={block.id}
                    className="composer-context-ledger-block"
                  >
                    <div className="composer-context-ledger-block-head">
                      <span className="composer-context-ledger-block-label">
                        {resolveBlockLabel(t, block)}
                      </span>
                      <span className="composer-context-ledger-block-estimate">
                        {resolveEstimateLabel(t, block)}
                      </span>
                    </div>
                    <div className="composer-context-ledger-block-title">
                      {resolveBlockTitle(t, block)}
                    </div>
                    {resolveBlockDetail(t, block) ? (
                      <div className="composer-context-ledger-block-detail">
                        {resolveBlockDetail(t, block)}
                      </div>
                    ) : null}
                    <div className="composer-context-ledger-block-meta">
                      <span className="composer-context-ledger-meta-badge">
                        {resolveParticipationLabel(t, block.participationState)}
                      </span>
                      <span className="composer-context-ledger-meta-badge">
                        {resolveFreshnessLabel(t, block.freshness)}
                      </span>
                      {resolveAttributionLabel(t, block.attributionKind) ? (
                        <span className="composer-context-ledger-meta-badge">
                          {resolveAttributionLabel(t, block.attributionKind)}
                        </span>
                      ) : null}
                      {resolveBackendSourceLabel(t, block.backendSource) ? (
                        <span className="composer-context-ledger-meta-badge">
                          {resolveBackendSourceLabel(t, block.backendSource)}
                        </span>
                      ) : null}
                    </div>
                    {(canTogglePinBlock(block) || canExcludeBlock(block) || resolveInspectionContent(t, block)) ? (
                      <div className="composer-context-ledger-block-actions">
                        {canTogglePinBlock(block) && onTogglePinBlock ? (
                          <button
                            type="button"
                            className="composer-context-ledger-action"
                            onClick={() => onTogglePinBlock(block)}
                          >
                            {block.participationState === "pinned_next_send"
                              ? t("composer.contextLedgerActionCancelKeepNextSend")
                              : t("composer.contextLedgerActionKeepNextSend")}
                          </button>
                        ) : null}
                        {canExcludeBlock(block) && onExcludeBlock ? (
                          <button
                            type="button"
                            className="composer-context-ledger-action"
                            onClick={() => onExcludeBlock(block)}
                          >
                            {t("composer.contextLedgerActionExcludeNextSend")}
                          </button>
                        ) : null}
                        {resolveInspectionContent(t, block) ? (
                          <button
                            type="button"
                            className="composer-context-ledger-action"
                            onClick={() => setInspectedBlock(block)}
                          >
                            {t("composer.contextLedgerActionOpenSourceDetail")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {inspectedBlock ? (
        <div
          className="composer-context-ledger-detail-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={t("composer.contextLedgerDetailDialogTitle")}
        >
          <div className="composer-context-ledger-detail-card">
            <div className="composer-context-ledger-detail-head">
              <div className="composer-context-ledger-detail-copy">
                <div className="composer-context-ledger-detail-kicker">
                  {t("composer.contextLedgerDetailDialogTitle")}
                </div>
                <div className="composer-context-ledger-detail-title">
                  {resolveInspectionTitle(t, inspectedBlock)}
                </div>
              </div>
              <button
                type="button"
                className="composer-context-ledger-detail-close"
                onClick={() => setInspectedBlock(null)}
              >
                {t("composer.contextLedgerDetailDialogClose")}
              </button>
            </div>
            {inspectedAttributionLabel || inspectedBackendSourceLabel || inspectedBlock.sourcePath ? (
              <div className="composer-context-ledger-detail-meta">
                {inspectedAttributionLabel ? (
                  <span className="composer-context-ledger-meta-badge">
                    {inspectedAttributionLabel}
                  </span>
                ) : null}
                {inspectedBackendSourceLabel ? (
                  <span className="composer-context-ledger-meta-badge">
                    {inspectedBackendSourceLabel}
                  </span>
                ) : null}
                {inspectedBlock.sourcePath ? (
                  <span className="composer-context-ledger-detail-path">
                    {inspectedBlock.sourcePath}
                  </span>
                ) : null}
              </div>
            ) : null}
            <pre className="composer-context-ledger-detail-body">
              {resolveInspectionContent(t, inspectedBlock)}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
});
