import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  CircleX,
  CloudUpload,
  GitBranch,
  GitCommitHorizontal,
  Hash,
  Info,
  SquareTerminal,
} from "lucide-react";

type WorktreeBaseRefOption = {
  name: string;
  group: "local" | "origin" | "upstream" | "remote";
  shortSha: string | null;
};

type WorktreePromptProps = {
  workspaceName: string;
  workspacePath?: string;
  branch: string;
  baseRef: string;
  baseRefOptions: WorktreeBaseRefOption[];
  isLoadingBaseRefs?: boolean;
  isNonGitRepository?: boolean;
  nonGitRepositoryRawError?: string | null;
  publishToOrigin: boolean;
  setupScript: string;
  scriptError?: string | null;
  error?: string | null;
  errorRetryCommand?: string | null;
  onChange: (value: string) => void;
  onBaseRefChange: (value: string) => void;
  onPublishToOriginChange: (value: boolean) => void;
  onSetupScriptChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
  isSavingScript?: boolean;
};

export function WorktreePrompt({
  workspaceName,
  workspacePath = "",
  branch,
  baseRef,
  baseRefOptions,
  isLoadingBaseRefs = false,
  isNonGitRepository = false,
  nonGitRepositoryRawError = null,
  publishToOrigin,
  setupScript,
  scriptError = null,
  error = null,
  errorRetryCommand = null,
  onChange,
  onBaseRefChange,
  onPublishToOriginChange,
  onSetupScriptChange,
  onCancel,
  onConfirm,
  isBusy = false,
  isSavingScript = false,
}: WorktreePromptProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const normalizedBaseRef = baseRef.trim();
  const groupedBaseRefs: Record<WorktreeBaseRefOption["group"], WorktreeBaseRefOption[]> = {
    local: [],
    origin: [],
    upstream: [],
    remote: [],
  };
  for (const option of baseRefOptions) {
    groupedBaseRefs[option.group].push(option);
  }
  const selectedBaseRef = baseRefOptions.find((option) => option.name === normalizedBaseRef) ?? null;
  const basePreview = selectedBaseRef
    ? `${selectedBaseRef.name} @ ${selectedBaseRef.shortSha ?? "unknown"}`
    : null;
  const basePreviewGroup = selectedBaseRef?.group ?? null;
  const basePreviewCommit = selectedBaseRef?.shortSha ?? null;
  const isBaseRefValid = Boolean(selectedBaseRef && selectedBaseRef.shortSha);
  const baseRefError =
    normalizedBaseRef.length > 0 && !isBaseRefValid ? t("workspace.baseBranchInvalid") : null;
  const noviceGuideItems = [
    { key: "branch", title: t("workspace.branchName"), body: t("workspace.noviceGuideBranch"), icon: GitBranch },
    {
      key: "base",
      title: t("workspace.baseBranch"),
      body: t("workspace.noviceGuideBaseBranch"),
      icon: GitCommitHorizontal,
    },
    { key: "preview", title: t("workspace.basePreview"), body: t("workspace.noviceGuideBasePreview"), icon: Info },
    {
      key: "publish",
      title: t("workspace.publishToOrigin"),
      body: t("workspace.noviceGuidePublish"),
      icon: CloudUpload,
    },
    {
      key: "script",
      title: t("workspace.worktreeSetupScript"),
      body: t("workspace.noviceGuideSetupScript"),
      icon: SquareTerminal,
    },
    { key: "cancel", title: t("common.cancel"), body: t("workspace.noviceGuideCancel"), icon: CircleX },
    { key: "create", title: t("common.create"), body: t("workspace.noviceGuideCreate"), icon: CircleCheck },
  ];
  const nonGitRepositoryFriendlyError = t("workspace.nonGitRepositoryError");
  const canSubmit =
    branch.trim().length > 0 && isBaseRefValid && !isLoadingBaseRefs && !isNonGitRepository;
  const showBaseSelectError =
    !isLoadingBaseRefs && normalizedBaseRef.length === 0 && !isNonGitRepository;
  const showGenericError = Boolean(
    error && (!isNonGitRepository || error !== nonGitRepositoryFriendlyError),
  );

  return (
    <div className="worktree-modal" role="dialog" aria-modal="true">
      <div
        className="worktree-modal-backdrop"
        onClick={() => {
          if (!isBusy) {
            onCancel();
          }
        }}
      />
      <div className="worktree-modal-card">
        <aside className="worktree-modal-aside">
          <div className="worktree-modal-aside-kicker">{t("workspace.noviceGuideTitle")}</div>
          <div className="worktree-modal-aside-title">{t("workspace.noviceGuideSubtitle")}</div>
          {isNonGitRepository && (
            <div className="worktree-modal-aside-git-guide">
              <div className="worktree-modal-aside-git-guide-title">
                <Info className="worktree-modal-inline-icon" />
                {t("workspace.nonGitRepositoryGuideTitle")}
              </div>
              <p>{t("workspace.nonGitRepositoryGuideDescription")}</p>
              <code>git init</code>
              <code>git add . &amp;&amp; git commit -m \"chore: init repository\"</code>
              <code>git rev-parse --is-inside-work-tree</code>
            </div>
          )}
          <ol className="worktree-modal-guide-list">
            {noviceGuideItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.key} className="worktree-modal-guide-item">
                  <span className="worktree-modal-guide-icon" aria-hidden>
                    <Icon className="worktree-modal-guide-icon-svg" />
                  </span>
                  <div className="worktree-modal-guide-content">
                    <div className="worktree-modal-guide-item-title">{item.title}</div>
                    <p>{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
        <section className="worktree-modal-main">
          <header className="worktree-modal-header">
            <div className="worktree-modal-header-main">
              <div className="worktree-modal-title">{t("workspace.newWorktreeAgent")}</div>
              <div className="worktree-modal-subtitle">
                {t("workspace.createWorktreeUnder", { name: workspaceName })}
              </div>
            </div>
            <div className="worktree-modal-header-workspace">{workspaceName}</div>
          </header>
          {isNonGitRepository && (
            <div className="worktree-modal-non-git-alert" role="status" aria-live="polite">
              <div className="worktree-modal-non-git-alert-title">
                <CircleX className="worktree-modal-inline-icon" />
                {t("workspace.nonGitRepositoryAlertTitle")}
              </div>
              <p>{t("workspace.nonGitRepositoryAlertDescription", { path: workspacePath || workspaceName })}</p>
              <div className="worktree-modal-non-git-alert-hint">
                <SquareTerminal className="worktree-modal-inline-icon" />
                {t("workspace.nonGitRepositoryAlertHint")}
              </div>
              {nonGitRepositoryRawError && (
                <div className="worktree-modal-non-git-raw-error">
                  <span>{t("workspace.nonGitRepositoryTechnicalDetail")}</span>
                  <code>{nonGitRepositoryRawError}</code>
                </div>
              )}
            </div>
          )}
          <div className="worktree-modal-fieldset">
            <label className="worktree-modal-label" htmlFor="worktree-branch">
              {t("workspace.branchName")}
            </label>
            <div className="worktree-modal-field-hint">{t("workspace.branchNameHint")}</div>
            <input
              id="worktree-branch"
              ref={inputRef}
              className="worktree-modal-input"
              value={branch}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (!isBusy) {
                    onCancel();
                  }
                }
                if (event.key === "Enter" && !isBusy && canSubmit) {
                  event.preventDefault();
                  onConfirm();
                }
              }}
            />
          </div>
          <div className="worktree-modal-fieldset">
            <label className="worktree-modal-label" htmlFor="worktree-base-ref">
              {t("workspace.baseBranch")}
            </label>
            <div className="worktree-modal-field-hint">{t("workspace.baseBranchHint")}</div>
            <div className="worktree-modal-select-wrap">
              <select
                id="worktree-base-ref"
                className="worktree-modal-select"
                value={baseRef}
                onChange={(event) => onBaseRefChange(event.target.value)}
                disabled={isBusy || isLoadingBaseRefs || isNonGitRepository}
              >
                <option value="">{t("workspace.baseBranchPlaceholder")}</option>
                {(["upstream", "origin", "local", "remote"] as const).map((group) => {
                  const options = groupedBaseRefs[group];
                  if (options.length === 0) {
                    return null;
                  }
                  return (
                    <optgroup key={group} label={t(`workspace.baseBranchGroup.${group}`)}>
                      {options.map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.shortSha ? `${option.name} (${option.shortSha})` : option.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <span className="worktree-modal-select-chevron" aria-hidden>
                ▾
              </span>
            </div>
            {isLoadingBaseRefs && (
              <div className="worktree-modal-hint">{t("workspace.baseBranchLoading")}</div>
            )}
            {!isLoadingBaseRefs && showBaseSelectError && (
              <div className="worktree-modal-error">
                <CircleX className="worktree-modal-error-icon" />
                <span>{t("workspace.baseBranchPlaceholderError")}</span>
              </div>
            )}
            <div className="worktree-modal-base-preview">
              <span className="worktree-modal-label">{t("workspace.basePreview")}</span>
              <div
                className={`worktree-modal-base-preview-card${
                  selectedBaseRef ? ` is-active is-${selectedBaseRef.group}` : " is-empty"
                }`}
              >
                <div className="worktree-modal-base-preview-meta">
                  <span
                    className={`worktree-modal-base-group${
                      basePreviewGroup ? ` is-${basePreviewGroup}` : " is-empty"
                    }`}
                  >
                    <GitCommitHorizontal className="worktree-modal-inline-icon" />
                    {basePreviewGroup
                      ? t(`workspace.baseBranchGroup.${basePreviewGroup}`)
                      : t("workspace.basePreviewSourceUnknown")}
                  </span>
                  <span className="worktree-modal-base-commit-pill">
                    <Hash className="worktree-modal-inline-icon" />
                    {basePreviewCommit ?? t("workspace.basePreviewCommitUnavailable")}
                  </span>
                </div>
                <div className="worktree-modal-base-preview-ref">
                  <GitBranch className="worktree-modal-inline-icon" />
                  <code>{basePreview ?? t("workspace.basePreviewUnavailable")}</code>
                </div>
                <div className="worktree-modal-base-preview-note">
                  <Info className="worktree-modal-inline-icon" />
                  {t("workspace.basePreviewHint")}
                </div>
              </div>
            </div>
          </div>
          <div className="worktree-modal-fieldset worktree-modal-fieldset-publish">
            <button
              type="button"
              className={`worktree-modal-switch${publishToOrigin ? " on" : ""}`}
              role="switch"
              aria-checked={publishToOrigin}
              onClick={() => onPublishToOriginChange(!publishToOrigin)}
              disabled={isBusy}
            >
              <span className="worktree-modal-switch-track" aria-hidden>
                <span className="worktree-modal-switch-thumb" />
              </span>
              <span className="worktree-modal-switch-copy">
                <span className="worktree-modal-switch-title">{t("workspace.publishToOrigin")}</span>
                <span className="worktree-modal-switch-hint">{t("workspace.publishToOriginHint")}</span>
              </span>
            </button>
          </div>
          <div className="worktree-modal-divider" />
          <div className="worktree-modal-section-title">{t("workspace.worktreeSetupScript")}</div>
          <div className="worktree-modal-field-hint">{t("workspace.worktreeSetupScriptHint")}</div>
          <textarea
            id="worktree-setup-script"
            className="worktree-modal-textarea"
            value={setupScript}
            onChange={(event) => onSetupScriptChange(event.target.value)}
            placeholder="pnpm install"
            rows={4}
            disabled={isBusy || isSavingScript}
          />
          {scriptError && (
            <div className="worktree-modal-error">
              <CircleX className="worktree-modal-error-icon" />
              <span>{scriptError}</span>
            </div>
          )}
          {baseRefError && (
            <div className="worktree-modal-error">
              <CircleX className="worktree-modal-error-icon" />
              <span>{baseRefError}</span>
            </div>
          )}
          {showGenericError && (
            <div className="worktree-modal-error">
              <CircleX className="worktree-modal-error-icon" />
              <span>{error}</span>
            </div>
          )}
          {showGenericError && errorRetryCommand ? (
            <div className="worktree-modal-retry-command">
              <span>{t("workspace.worktreePublishRetryCommandLabel")}</span>
              <code>{errorRetryCommand}</code>
            </div>
          ) : null}
          <div className="worktree-modal-actions-hint">{t("workspace.actionsHint")}</div>
          <div className="worktree-modal-actions">
            <button
              className="ghost worktree-modal-button"
              onClick={onCancel}
              type="button"
              disabled={isBusy}
            >
              {t("common.cancel")}
            </button>
            <button
              className="primary worktree-modal-button"
              onClick={onConfirm}
              type="button"
              disabled={isBusy || !canSubmit}
            >
              {t("common.create")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
