import { memo, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CircleAlert from "lucide-react/dist/esm/icons/circle-alert";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import TriangleAlert from "lucide-react/dist/esm/icons/triangle-alert";
import type { TFunction } from "i18next";
import { GitDiffViewer } from "../../git/components/GitDiffViewer";
import { FileIcon } from "../../messages/components/toolBlocks/FileIcon";
import { resolveWorkspaceRelativePath } from "../../../utils/workspacePaths";
import type {
  CheckpointAction,
  CheckpointMessageToken,
  CheckpointValidationKind,
  CheckpointViewModel,
  FileChangeSummary,
} from "../types";
import { resolveCheckpointValidationProfile } from "../utils/checkpoint";
import { FileChangesList } from "./FileChangesList";

interface CheckpointPanelProps {
  checkpoint: CheckpointViewModel;
  compact?: boolean;
  fileChanges: FileChangeSummary[];
  totalAdditions: number;
  totalDeletions: number;
  onOpenDiffPath?: (path: string) => void;
  onOpenFilePath?: (path: string) => void;
  onAfterSelect?: () => void;
  workspaceId?: string | null;
  workspacePath?: string | null;
}

const VERDICT_ICON = {
  running: Loader2,
  blocked: CircleAlert,
  needs_review: TriangleAlert,
  ready: ShieldCheck,
} as const;

export const CheckpointPanel = memo(function CheckpointPanel({
  checkpoint,
  compact = false,
  fileChanges,
  totalAdditions,
  totalDeletions,
  onOpenDiffPath,
  onOpenFilePath,
  onAfterSelect,
  workspaceId = null,
  workspacePath = null,
}: CheckpointPanelProps) {
  const { t } = useTranslation();
  const [isDiffModalMaximized, setIsDiffModalMaximized] = useState(false);
  const [diffHeaderControlsTarget, setDiffHeaderControlsTarget] = useState<HTMLElement | null>(null);
  const [diffStyle, setDiffStyle] = useState<"split" | "unified">("split");
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const VerdictIcon = VERDICT_ICON[checkpoint.verdict];
  const displayFiles = fileChanges;
  const primaryDiffPath =
    fileChanges.find((entry) => entry.diff?.trim())?.filePath ?? fileChanges[0]?.filePath ?? null;
  const hasFileDetails = displayFiles.length > 0;
  const validationProfile = useMemo(
    () =>
      resolveCheckpointValidationProfile({
        commands: checkpoint.evidence.commands,
        fileChanges,
      }),
    [checkpoint.evidence.commands, fileChanges],
  );
  const visibleValidations = useMemo(
    () =>
      checkpoint.evidence.validations.filter(
        (entry) =>
          validationProfile.visibleKinds.includes(entry.kind) ||
          entry.status !== "not_observed" ||
          Boolean(entry.sourceId),
      ),
    [checkpoint.evidence.validations, validationProfile],
  );
  const missingValidationCommands = useMemo(
    () =>
      visibleValidations
        .filter((entry) => entry.status === "not_run")
        .map((entry) => ({
          kind: entry.kind,
          command: validationProfile.commands[entry.kind] ?? null,
        }))
        .filter((entry): entry is { kind: CheckpointValidationKind; command: string } =>
          Boolean(entry.command),
        ),
    [validationProfile, visibleValidations],
  );
  const hasMissingValidationWithoutCommand = visibleValidations.some(
    (entry) => entry.status === "not_run" && !validationProfile.commands[entry.kind],
  );
  const nextActionHintKey = resolveNextActionHintKey(
    checkpoint.verdict,
    missingValidationCommands.length > 0 || hasMissingValidationWithoutCommand,
  );
  const translatedRisks = useMemo(
    () =>
      checkpoint.risks.map((entry) => ({
        ...entry,
        translatedMessage: renderToken(t, entry.message),
      })),
    [checkpoint.risks, t],
  );
  const diffEntries = useMemo(
    () =>
      fileChanges
        .filter((entry) => entry.diff?.trim())
        .map((entry) => ({
          path: entry.filePath,
          status: entry.status,
          diff: entry.diff ?? "",
        })),
    [fileChanges],
  );
  const sidebarFiles = useMemo(
    () => fileChanges.filter((entry) => entry.diff?.trim() || entry.status === "A"),
    [fileChanges],
  );
  const activeDiffPath =
    selectedDiffPath && sidebarFiles.some((entry) => entry.filePath === selectedDiffPath)
      ? selectedDiffPath
      : diffEntries[0]?.path ??
        sidebarFiles.find((entry) => entry.status === "A")?.filePath ??
        sidebarFiles[0]?.filePath ??
        null;
  const activeDiffFile =
    sidebarFiles.find((entry) => entry.filePath === activeDiffPath) ?? null;
  const activeDiffEntry =
    diffEntries.find((entry) => entry.path === activeDiffPath) ?? null;
  const activeDiffGitPath = activeDiffFile
    ? resolveWorkspaceRelativePath(workspacePath, activeDiffFile.filePath)
    : null;
  const visibleNextActions = checkpoint.nextActions.filter(
    (action) => action.type !== "review_diff",
  );
  const handleReviewDiff = () => {
    if (!primaryDiffPath) {
      return;
    }
    if (diffEntries.length > 0) {
      setSelectedDiffPath(primaryDiffPath);
      return;
    }
    if (onOpenDiffPath) {
      onOpenDiffPath(primaryDiffPath);
      onAfterSelect?.();
    }
  };

  return (
    <div className={`sp-checkpoint${compact ? " sp-checkpoint--compact" : ""}`}>
      <section
        className={`sp-checkpoint-section sp-checkpoint-section--hero sp-checkpoint-${checkpoint.verdict}`}
      >
        <div className="sp-checkpoint-hero-row">
          <div className="sp-checkpoint-hero-copy">
            <span className="sp-checkpoint-kicker">{t("statusPanel.checkpoint.verdictTitle")}</span>
            <div className="sp-checkpoint-headline-row">
              <span className="sp-checkpoint-hero-icon">
                <VerdictIcon size={16} className={checkpoint.verdict === "running" ? "is-spinning" : ""} />
              </span>
              <span className="sp-checkpoint-headline">{renderToken(t, checkpoint.headline)}</span>
            </div>
            {checkpoint.summary ? (
              <span className="sp-checkpoint-summary">{renderToken(t, checkpoint.summary)}</span>
            ) : null}
          </div>
          <span className={`sp-checkpoint-badge sp-checkpoint-badge-${checkpoint.verdict}`}>
            {t(`statusPanel.checkpoint.verdict.${checkpoint.verdict}`)}
          </span>
        </div>
      </section>

      <section className="sp-checkpoint-section">
        <div className="sp-checkpoint-evidence-compact">
          <div className="sp-checkpoint-inline-heading">
            <span className="sp-checkpoint-section-title">{t("statusPanel.checkpoint.evidenceTitle")}</span>
            <span className="sp-checkpoint-metric-label">
              {t("statusPanel.checkpoint.evidence.validations")}
            </span>
          </div>
          <article className="sp-checkpoint-metric-card sp-checkpoint-metric-card-compact">
            <ul className="sp-checkpoint-validation-list sp-checkpoint-validation-list-compact">
              {visibleValidations.map((entry) => (
                <li key={entry.kind} className="sp-checkpoint-validation-item">
                  <span>{t(`statusPanel.checkpoint.validations.${entry.kind}`)}</span>
                  <span className={`sp-checkpoint-validation-status is-${entry.status}`}>
                    {t(`statusPanel.checkpoint.validations.status.${entry.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </article>

          {(checkpoint.evidence.todos || checkpoint.evidence.subagents) ? (
            <div className="sp-checkpoint-evidence-summary-badges">
              {checkpoint.evidence.todos ? (
                <span className="sp-checkpoint-evidence-badge">
                  {t("statusPanel.checkpoint.evidence.tasks")} {checkpoint.evidence.todos.completed}/
                  {checkpoint.evidence.todos.total}
                </span>
              ) : null}
              {checkpoint.evidence.subagents ? (
                <span className="sp-checkpoint-evidence-badge">
                  {t("statusPanel.checkpoint.evidence.agents")} {checkpoint.evidence.subagents.completed}/
                  {checkpoint.evidence.subagents.total}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {missingValidationCommands.length > 0 || hasMissingValidationWithoutCommand ? (
          <div className="sp-checkpoint-validation-guide">
            <span className="sp-checkpoint-validation-guide-label">
              {t(
                missingValidationCommands.length > 0
                  ? "statusPanel.checkpoint.evidence.runMissing"
                  : "statusPanel.checkpoint.evidence.runMissingGeneric",
              )}
            </span>
            <div className="sp-checkpoint-validation-command-list">
              {missingValidationCommands.map((entry) => (
                <button
                  key={entry.kind}
                  type="button"
                  className="sp-checkpoint-validation-command"
                  title={t("workspace.copyCommand")}
                  onClick={() => copyTextToClipboard(entry.command)}
                >
                  {entry.command}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="sp-checkpoint-section">
        {checkpoint.keyChanges.length > 1 ? (
          <ul className="sp-checkpoint-key-change-list">
            {checkpoint.keyChanges.slice(1).map((entry) => (
              <li key={entry.id} className="sp-checkpoint-key-change-item">
                <span className="sp-checkpoint-key-change-label">{renderToken(t, entry.label)}</span>
                <span className="sp-checkpoint-key-change-summary">
                  {renderToken(t, entry.summary)}
                </span>
              </li>
            ))}
          </ul>
        ) : checkpoint.keyChanges.length === 0 ? (
          <div className="sp-empty">{t("statusPanel.checkpoint.keyChangesEmpty")}</div>
        ) : null}

        {hasFileDetails ? (
          <div className="sp-checkpoint-file-detail">
            <FileChangesList
              fileChanges={displayFiles}
              totalAdditions={totalAdditions}
              totalDeletions={totalDeletions}
              onOpenFilePath={onOpenFilePath}
              onOpenDiffPath={onOpenDiffPath}
              onOpenTotalDiff={primaryDiffPath ? handleReviewDiff : undefined}
              onAfterSelect={onAfterSelect}
            />
          </div>
        ) : null}
      </section>

      <section className="sp-checkpoint-section sp-checkpoint-section--summary-line">
        <div className="sp-checkpoint-inline-heading">
          <span className="sp-checkpoint-section-title">{t("statusPanel.checkpoint.risksTitle")}</span>
          {translatedRisks.length === 0 ? (
            <span className="sp-checkpoint-empty-state">
              {t("statusPanel.checkpoint.risks.none")}
            </span>
          ) : null}
        </div>
        {translatedRisks.length > 0 ? (
          <ul className="sp-checkpoint-risk-list">
            {translatedRisks.map((entry) => (
              <li key={`${entry.code}:${entry.sourceId ?? "none"}`} className="sp-checkpoint-risk-item">
                <span className={`sp-checkpoint-risk-severity is-${entry.severity}`}>
                  {t(`statusPanel.checkpoint.risks.severity.${entry.severity}`)}
                </span>
                <span>{entry.translatedMessage}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="sp-checkpoint-section sp-checkpoint-section--summary-line">
        <div className="sp-checkpoint-inline-heading">
          <span className="sp-checkpoint-section-title">{t("statusPanel.checkpoint.nextActionTitle")}</span>
          <span className="sp-checkpoint-action-hint">{t(nextActionHintKey)}</span>
        </div>
        {visibleNextActions.length > 0 ? (
          <div className="sp-checkpoint-action-row">
            {visibleNextActions.map((action) => (
              <button
                key={action.type}
                type="button"
                className="sp-checkpoint-action"
                disabled={!resolveActionEnabled(action, primaryDiffPath)}
              >
                {renderToken(t, action.label)}
              </button>
            ))}
          </div>
        ) : null}
      </section>
      {selectedDiffPath && activeDiffPath && activeDiffFile && activeDiffGitPath && typeof document !== "undefined"
        ? createPortal(
            <div
              className="git-history-diff-modal-overlay is-popup checkpoint-diff-modal-overlay"
              role="presentation"
              onClick={() => {
                setSelectedDiffPath(null);
                setIsDiffModalMaximized(false);
              }}
            >
              <div
                className={`git-history-diff-modal checkpoint-diff-modal${
                  isDiffModalMaximized ? " is-maximized" : ""
                }`}
                role="dialog"
                aria-modal="true"
                aria-label={activeDiffGitPath}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="git-history-diff-modal-header">
                  <div className="git-history-diff-modal-title">
                    <span className={`git-history-file-status git-status-${activeDiffFile.status.toLowerCase()}`}>
                      {activeDiffFile.status}
                    </span>
                    <span className="git-history-tree-icon is-file" aria-hidden>
                      <FileIcon fileName={activeDiffFile.fileName} />
                    </span>
                    <span className="git-history-diff-modal-path">{activeDiffGitPath}</span>
                    <span className="git-history-diff-modal-stats">
                      <span className="is-add">+{activeDiffFile.additions}</span>
                      <span className="is-sep">/</span>
                      <span className="is-del">-{activeDiffFile.deletions}</span>
                    </span>
                  </div>
                  <div className="git-history-diff-modal-actions" ref={setDiffHeaderControlsTarget}>
                    <button
                      type="button"
                      className="git-history-diff-modal-close"
                      onClick={() => setIsDiffModalMaximized((value) => !value)}
                      aria-label={isDiffModalMaximized ? t("common.restore") : t("menu.maximize")}
                      title={isDiffModalMaximized ? t("common.restore") : t("menu.maximize")}
                    >
                      <span className="git-history-diff-modal-close-glyph" aria-hidden>
                        {isDiffModalMaximized ? "❐" : "□"}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="checkpoint-diff-modal-shell">
                  <div className="checkpoint-diff-viewer">
                    {activeDiffEntry ? (
                      <GitDiffViewer
                        workspaceId={workspaceId}
                        diffs={[
                          {
                            ...activeDiffEntry,
                            path: activeDiffGitPath,
                          },
                        ]}
                        selectedPath={activeDiffGitPath}
                        isLoading={false}
                        error={null}
                        listView="flat"
                        stickyHeaderMode="controls-only"
                        embeddedAnchorVariant="modal-pager"
                        showContentModeControls
                        headerControlsTarget={diffHeaderControlsTarget}
                        fullDiffSourceKey={[
                          activeDiffGitPath,
                          activeDiffFile.status,
                          activeDiffFile.additions,
                          activeDiffFile.deletions,
                          activeDiffFile.diff ?? "",
                        ].join(":")}
                        diffStyle={diffStyle}
                        onDiffStyleChange={setDiffStyle}
                        onRequestClose={() => {
                          setSelectedDiffPath(null);
                          setIsDiffModalMaximized(false);
                        }}
                      />
                    ) : (
                      <div className="checkpoint-diff-fallback">
                        <div className="checkpoint-diff-fallback-copy">
                          {activeDiffFile.status === "A"
                            ? t("git.diffUnavailable")
                            : t("git.diffUnavailable")}
                        </div>
                        {onOpenFilePath ? (
                          <button
                            type="button"
                            className="sp-checkpoint-action"
                            onClick={() => {
                              onOpenFilePath(activeDiffFile.filePath);
                              onAfterSelect?.();
                              setSelectedDiffPath(null);
                            }}
                          >
                            {t("common.openFile")}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <aside className="checkpoint-diff-sidebar">
                    <div className="checkpoint-diff-sidebar-title-row">
                      <div className="checkpoint-diff-sidebar-title">
                        {t("statusPanel.checkpoint.fileDetailsTitle")}
                      </div>
                      <div className="checkpoint-diff-sidebar-count">
                        {sidebarFiles.length}
                      </div>
                    </div>
                    <div className="checkpoint-diff-sidebar-list">
                      {sidebarFiles.map((file) => {
                        const selected = file.filePath === activeDiffPath;
                        return (
                          <button
                            key={file.filePath}
                            type="button"
                            className={`checkpoint-diff-sidebar-item${
                              selected ? " is-active" : ""
                            }`}
                            onClick={() => setSelectedDiffPath(file.filePath)}
                          >
                            <span className={`git-history-file-status git-status-${file.status.toLowerCase()}`}>
                              {file.status}
                            </span>
                            <span className="checkpoint-diff-sidebar-name">{file.fileName}</span>
                            <span className="checkpoint-diff-sidebar-stats">
                              <span className="is-add">+{file.additions}</span>
                              <span className="is-del">-{file.deletions}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </aside>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

function resolveActionEnabled(
  action: CheckpointAction,
  primaryDiffPath: string | null,
) {
  if (!action.enabled) {
    return false;
  }
  if (action.type === "review_diff") {
    return Boolean(primaryDiffPath);
  }
  return action.enabled;
}

function resolveNextActionHintKey(
  verdict: CheckpointViewModel["verdict"],
  hasMissingValidationCommands: boolean,
) {
  if (hasMissingValidationCommands) {
    return "statusPanel.checkpoint.actions.hint.runMissingValidation";
  }
  return `statusPanel.checkpoint.actions.hint.${verdict}`;
}

function copyTextToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }
  void navigator.clipboard.writeText(value);
}

function renderToken(t: TFunction, token: CheckpointMessageToken) {
  if ("text" in token) {
    return token.text;
  }
  return t(token.key, token.params as Record<string, string> | undefined);
}
