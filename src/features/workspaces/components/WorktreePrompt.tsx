import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import CircleCheck from "lucide-react/dist/esm/icons/circle-check";
import CircleX from "lucide-react/dist/esm/icons/circle-x";
import CloudUpload from "lucide-react/dist/esm/icons/cloud-upload";
import FolderTree from "lucide-react/dist/esm/icons/folder-tree";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import GitCommitHorizontal from "lucide-react/dist/esm/icons/git-commit-horizontal";
import Hash from "lucide-react/dist/esm/icons/hash";
import Info from "lucide-react/dist/esm/icons/info";
import SquareTerminal from "lucide-react/dist/esm/icons/square-terminal";

type WorktreeBaseRefOption = {
  name: string;
  group: "local" | "origin" | "upstream" | "remote";
  shortSha: string | null;
};

const BASE_REF_GROUP_ORDER = ["upstream", "origin", "local", "remote"] as const;
const ROOT_BUCKET_KEY = "__root__";

type BaseRefBucketOption = {
  option: WorktreeBaseRefOption;
  shortName: string;
  relativePath: string;
};

type BaseRefBucket = {
  key: string;
  label: string;
  options: BaseRefBucketOption[];
};

type BaseRefTreeSection = {
  group: WorktreeBaseRefOption["group"];
  total: number;
  buckets: BaseRefBucket[];
};

function getRelativeBranchPath(option: WorktreeBaseRefOption): string {
  if ((option.group === "origin" || option.group === "upstream") && option.name.startsWith(`${option.group}/`)) {
    return option.name.slice(option.group.length + 1);
  }
  return option.name;
}

function getShortBranchName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

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
  const baseRefDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isBaseRefDropdownOpen, setIsBaseRefDropdownOpen] = useState(false);
  const [activeBaseRefGroupTab, setActiveBaseRefGroupTab] = useState<WorktreeBaseRefOption["group"] | null>(null);

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
  const isBaseRefSelectorDisabled = isBusy || isLoadingBaseRefs || isNonGitRepository;
  const baseRefDisplayValue = selectedBaseRef?.name ?? t("workspace.baseBranchPlaceholder");

  const baseRefTreeSections: BaseRefTreeSection[] = BASE_REF_GROUP_ORDER.map((group) => {
    const options = groupedBaseRefs[group];
    if (options.length === 0) {
      return null;
    }
    const bucketsMap = new Map<string, BaseRefBucket>();
    for (const option of options) {
      const relativePath = getRelativeBranchPath(option);
      const segments = relativePath.split("/").filter(Boolean);
      const firstSegment = segments[0] ?? "";
      const bucketKey = segments.length > 1 ? firstSegment.toLowerCase() : ROOT_BUCKET_KEY;
      const bucketLabel =
        bucketKey === ROOT_BUCKET_KEY ? t("workspace.baseBranchRootGroup") : firstSegment.toUpperCase();
      const bucketOption: BaseRefBucketOption = {
        option,
        shortName: getShortBranchName(relativePath),
        relativePath,
      };
      const existingBucket = bucketsMap.get(bucketKey);
      if (existingBucket) {
        existingBucket.options.push(bucketOption);
      } else {
        bucketsMap.set(bucketKey, {
          key: bucketKey,
          label: bucketLabel,
          options: [bucketOption],
        });
      }
    }
    const sortedBuckets = Array.from(bucketsMap.values()).sort((left, right) => {
      if (left.key === ROOT_BUCKET_KEY) {
        return -1;
      }
      if (right.key === ROOT_BUCKET_KEY) {
        return 1;
      }
      return left.label.localeCompare(right.label);
    });
    return {
      group,
      total: options.length,
      buckets: sortedBuckets,
    };
  }).filter((section): section is BaseRefTreeSection => Boolean(section));
  const availableBaseRefGroups = baseRefTreeSections.map((section) => section.group);
  const availableBaseRefGroupsKey = availableBaseRefGroups.join("|");
  const baseRefSectionsInActiveTab =
    activeBaseRefGroupTab && availableBaseRefGroups.includes(activeBaseRefGroupTab)
      ? baseRefTreeSections.filter((section) => section.group === activeBaseRefGroupTab)
      : baseRefTreeSections.slice(0, 1);

  useEffect(() => {
    if (!isBaseRefDropdownOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (
        baseRefDropdownRef.current &&
        event.target instanceof Node &&
        !baseRefDropdownRef.current.contains(event.target)
      ) {
        setIsBaseRefDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBaseRefDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBaseRefDropdownOpen]);

  useEffect(() => {
    if (isBaseRefSelectorDisabled) {
      setIsBaseRefDropdownOpen(false);
    }
  }, [isBaseRefSelectorDisabled]);

  useEffect(() => {
    if (!isBaseRefDropdownOpen) {
      return;
    }
    const preferredGroup = selectedBaseRef?.group ?? null;
    setActiveBaseRefGroupTab((previousGroup) => {
      if (preferredGroup && availableBaseRefGroups.includes(preferredGroup)) {
        return preferredGroup;
      }
      if (previousGroup && availableBaseRefGroups.includes(previousGroup)) {
        return previousGroup;
      }
      return availableBaseRefGroups[0] ?? null;
    });
  }, [availableBaseRefGroups, availableBaseRefGroupsKey, isBaseRefDropdownOpen, selectedBaseRef?.group]);

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
            <div
              ref={baseRefDropdownRef}
              className={`worktree-modal-select-wrap${isBaseRefDropdownOpen ? " is-open" : ""}`}
            >
              <button
                id="worktree-base-ref"
                className="worktree-modal-dropdown-trigger"
                type="button"
                onClick={() => setIsBaseRefDropdownOpen((open) => !open)}
                disabled={isBaseRefSelectorDisabled}
                aria-expanded={isBaseRefDropdownOpen}
                aria-haspopup="listbox"
              >
                <span
                  className={`worktree-modal-dropdown-trigger-value${
                    selectedBaseRef ? " is-selected" : " is-placeholder"
                  }`}
                >
                  {baseRefDisplayValue}
                </span>
                <span className="worktree-modal-select-chevron" aria-hidden>
                  <ChevronDown className="worktree-modal-inline-icon" />
                </span>
              </button>
              {isBaseRefDropdownOpen && (
                <div className="worktree-modal-dropdown-panel" role="listbox" aria-labelledby="worktree-base-ref">
                  {baseRefTreeSections.length === 0 ? (
                    <div className="worktree-modal-dropdown-empty">{t("workspace.baseBranchNoOptions")}</div>
                  ) : (
                    <>
                      {baseRefTreeSections.length > 1 && (
                        <div className="worktree-modal-dropdown-tabs" role="tablist" aria-label={t("workspace.baseBranch")}>
                          {baseRefTreeSections.map((section) => {
                            const isActive = section.group === activeBaseRefGroupTab;
                            return (
                              <button
                                key={`tab-${section.group}`}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                className={`worktree-modal-dropdown-tab${isActive ? " is-active" : ""}`}
                                onClick={() => setActiveBaseRefGroupTab(section.group)}
                              >
                                <span>{t(`workspace.baseBranchGroup.${section.group}`)}</span>
                                <span className="worktree-modal-dropdown-tab-count">{section.total}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {baseRefSectionsInActiveTab.map((section) => (
                        <section key={section.group} className="worktree-modal-dropdown-section">
                          <div className="worktree-modal-dropdown-section-content worktree-modal-dropdown-tab-content">
                            {section.buckets.map((bucket) => (
                              <div key={`${section.group}-${bucket.key}`} className="worktree-modal-dropdown-bucket">
                                <div className="worktree-modal-dropdown-bucket-header">
                                  <span className="worktree-modal-dropdown-bucket-title">
                                    <FolderTree className="worktree-modal-inline-icon" />
                                    {bucket.label}
                                  </span>
                                  <span className="worktree-modal-dropdown-bucket-count">
                                    {bucket.options.length}
                                  </span>
                                </div>
                                <div className="worktree-modal-dropdown-options">
                                  {bucket.options.map((bucketOption) => {
                                    const option = bucketOption.option;
                                    const isSelected = option.name === selectedBaseRef?.name;
                                    return (
                                      <button
                                        key={option.name}
                                        className={`worktree-modal-dropdown-option${
                                          isSelected ? " is-selected" : ""
                                        }`}
                                        role="option"
                                        type="button"
                                        aria-selected={isSelected}
                                        title={option.name}
                                        onClick={() => {
                                          onBaseRefChange(option.name);
                                          setIsBaseRefDropdownOpen(false);
                                        }}
                                      >
                                        <span className="worktree-modal-dropdown-option-main">
                                          <GitBranch className="worktree-modal-inline-icon" />
                                          <span className="worktree-modal-dropdown-option-text-row">
                                            <span className="worktree-modal-dropdown-option-main-text">
                                              {bucketOption.shortName}
                                            </span>
                                            {bucketOption.relativePath !== bucketOption.shortName && (
                                              <>
                                                <span className="worktree-modal-dropdown-option-inline-sep"> · </span>
                                                <span className="worktree-modal-dropdown-option-inline-sub">
                                                  {bucketOption.relativePath}
                                                </span>
                                              </>
                                            )}
                                          </span>
                                          {isSelected && (
                                            <Check
                                              className="worktree-modal-inline-icon worktree-modal-dropdown-option-check"
                                            />
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </>
                  )}
                </div>
              )}
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
              aria-busy={isBusy}
            >
              {isBusy ? t("common.creating") : t("common.create")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
