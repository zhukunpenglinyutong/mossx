import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ReviewPromptState,
  ReviewPromptStep,
} from "../../threads/hooks/useReviewPrompt";

type ReviewInlinePromptProps = {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onClose: () => void;
  onShowPreset: () => void;
  onChoosePreset: (preset: Exclude<ReviewPromptStep, "preset"> | "uncommitted") => void;
  highlightedPresetIndex: number;
  onHighlightPreset: (index: number) => void;
  highlightedBranchIndex: number;
  onHighlightBranch: (index: number) => void;
  highlightedCommitIndex: number;
  onHighlightCommit: (index: number) => void;
  onSelectBranch: (value: string) => void;
  onSelectBranchAtIndex: (index: number) => void;
  onConfirmBranch: () => Promise<void>;
  onSelectCommit: (sha: string, title: string) => void;
  onSelectCommitAtIndex: (index: number) => void;
  onConfirmCommit: () => Promise<void>;
  onUpdateCustomInstructions: (value: string) => void;
  onConfirmCustom: () => Promise<void>;
  onKeyDown?: (event: {
    key: string;
    shiftKey?: boolean;
    preventDefault: () => void;
  }) => boolean;
};

function shortSha(sha: string) {
  return sha.slice(0, 7);
}

const StepToolbar = memo(function StepToolbar({
  onBack,
  onConfirm,
  isSubmitting,
  confirmDisabled,
}: {
  onBack: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  confirmDisabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="review-inline-toolbar">
      <button
        type="button"
        className="review-inline-action-link review-inline-action-back"
        onClick={onBack}
        disabled={isSubmitting}
      >
        <span className="codicon codicon-arrow-left" aria-hidden />
        <span>{t("workspace.back")}</span>
      </button>
      <button
        type="button"
        className="review-inline-action-link review-inline-action-start"
        onClick={() => void onConfirm()}
        disabled={isSubmitting || confirmDisabled}
      >
        <span className="codicon codicon-play" aria-hidden />
        <span>{t("composer.startReview")}</span>
      </button>
    </div>
  );
});

const PresetStep = memo(function PresetStep({
  onChoosePreset,
  isSubmitting,
  highlightedPresetIndex,
  onHighlightPreset,
}: {
  onChoosePreset: ReviewInlinePromptProps["onChoosePreset"];
  isSubmitting: boolean;
  highlightedPresetIndex: number;
  onHighlightPreset: (index: number) => void;
}) {
  const { t } = useTranslation();
  const optionClass = (index: number) =>
    `review-inline-option${index === highlightedPresetIndex ? " is-selected" : ""}`;
  return (
    <div className="review-inline-section">
      <button
        type="button"
        className={optionClass(0)}
        onClick={() => onChoosePreset("baseBranch")}
        onMouseEnter={() => onHighlightPreset(0)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-inline">
          <span className="review-inline-option-title">{t("composer.reviewAgainstBaseBranch")}</span>
          <span className="review-inline-option-subtitle">{t("composer.prStyle")}</span>
        </span>
      </button>
      <button
        type="button"
        className={optionClass(1)}
        onClick={() => onChoosePreset("uncommitted")}
        onMouseEnter={() => onHighlightPreset(1)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">{t("composer.reviewUncommittedChanges")}</span>
      </button>
      <button
        type="button"
        className={optionClass(2)}
        onClick={() => onChoosePreset("commit")}
        onMouseEnter={() => onHighlightPreset(2)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">{t("composer.reviewACommit")}</span>
      </button>
      <button
        type="button"
        className={optionClass(3)}
        onClick={() => onChoosePreset("custom")}
        onMouseEnter={() => onHighlightPreset(3)}
        disabled={isSubmitting}
      >
        <span className="review-inline-option-title">{t("composer.customReviewInstructions")}</span>
      </button>
    </div>
  );
});

const BaseBranchStep = memo(function BaseBranchStep({
  reviewPrompt,
  onSelectBranch,
  highlightedBranchIndex,
  onHighlightBranch,
}: {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onSelectBranch: (value: string) => void;
  highlightedBranchIndex: number;
  onHighlightBranch: (index: number) => void;
}) {
  const { t } = useTranslation();
  const branches = reviewPrompt.branches;
  const [branchQuery, setBranchQuery] = useState("");
  const normalizedBranchQuery = branchQuery.trim().toLowerCase();
  const filteredBranches = useMemo(() => {
    if (!normalizedBranchQuery) {
      return branches;
    }
    return branches.filter((branch) => branch.name.toLowerCase().includes(normalizedBranchQuery));
  }, [branches, normalizedBranchQuery]);
  const selectedBranchIndex = useMemo(
    () => branches.findIndex((branch) => branch.name === reviewPrompt.selectedBranch),
    [branches, reviewPrompt.selectedBranch],
  );
  return (
    <div className="review-inline-section">
      <div className="review-inline-hint">{t("composer.pickRecentLocalBranch")}</div>
      <input
        className="review-inline-input"
        type="text"
        value={branchQuery}
        onChange={(event) => setBranchQuery(event.target.value)}
        placeholder={t("composer.typeToSearchBranches")}
        autoFocus
      />
      <div
        className="review-inline-list"
        role="listbox"
        aria-label="Base branches"
        onMouseLeave={() => onHighlightBranch(selectedBranchIndex >= 0 ? selectedBranchIndex : -1)}
      >
        {reviewPrompt.isLoadingBranches ? (
          <div className="review-inline-empty">{t("composer.loadingBranches")}</div>
        ) : filteredBranches.length === 0 ? (
          <div className="review-inline-empty">{t("composer.noBranchesFoundDot")}</div>
        ) : (
          filteredBranches.map((branch) => {
            const sourceIndex = branches.findIndex((entry) => entry.name === branch.name);
            const selected = branch.name === reviewPrompt.selectedBranch;
            const active = sourceIndex === highlightedBranchIndex;
            return (
              <button
                key={branch.name}
                type="button"
                role="option"
                aria-selected={selected}
                className={`review-inline-list-item${selected ? " is-selected" : ""}${
                  !selected && active ? " is-active" : ""
                }`}
                onClick={() => onSelectBranch(branch.name)}
                onMouseEnter={() => {
                  if (sourceIndex >= 0) {
                    onHighlightBranch(sourceIndex);
                  }
                }}
                disabled={reviewPrompt.isSubmitting}
              >
                <span className="review-inline-list-item-content">{branch.name}</span>
                {selected && <span className="codicon codicon-check review-inline-selected-icon" aria-hidden />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

const CommitStep = memo(function CommitStep({
  reviewPrompt,
  onSelectCommit,
  highlightedCommitIndex,
  onHighlightCommit,
}: {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onSelectCommit: (sha: string, title: string) => void;
  highlightedCommitIndex: number;
  onHighlightCommit: (index: number) => void;
}) {
  const { t } = useTranslation();
  const commits = reviewPrompt.commits;
  const [commitQuery, setCommitQuery] = useState("");
  const normalizedCommitQuery = commitQuery.trim().toLowerCase();
  const filteredCommits = useMemo(() => {
    if (!normalizedCommitQuery) {
      return commits;
    }
    return commits.filter((commit) => {
      const title = commit.summary || commit.sha;
      return (
        title.toLowerCase().includes(normalizedCommitQuery) ||
        commit.sha.toLowerCase().includes(normalizedCommitQuery) ||
        commit.author.toLowerCase().includes(normalizedCommitQuery)
      );
    });
  }, [commits, normalizedCommitQuery]);
  const selectedCommitIndex = useMemo(
    () => commits.findIndex((commit) => commit.sha === reviewPrompt.selectedCommitSha),
    [commits, reviewPrompt.selectedCommitSha],
  );
  return (
    <div className="review-inline-section">
      <div className="review-inline-hint">{t("composer.selectRecentCommit")}</div>
      <input
        className="review-inline-input"
        type="text"
        value={commitQuery}
        onChange={(event) => setCommitQuery(event.target.value)}
        placeholder={t("composer.typeToSearchCommits")}
        autoFocus
      />
      <div
        className="review-inline-list"
        role="listbox"
        aria-label="Commits"
        onMouseLeave={() => onHighlightCommit(selectedCommitIndex >= 0 ? selectedCommitIndex : -1)}
      >
        {reviewPrompt.isLoadingCommits ? (
          <div className="review-inline-empty">{t("composer.loadingCommits")}</div>
        ) : filteredCommits.length === 0 ? (
          <div className="review-inline-empty">{t("composer.noCommitsFound")}</div>
        ) : (
          filteredCommits.map((commit) => {
            const title = commit.summary || commit.sha;
            const sourceIndex = commits.findIndex((entry) => entry.sha === commit.sha);
            const selected = commit.sha === reviewPrompt.selectedCommitSha;
            const active = sourceIndex === highlightedCommitIndex;
            return (
              <button
                key={commit.sha}
                type="button"
                role="option"
                aria-selected={selected}
                className={`review-inline-list-item review-inline-commit${
                  selected ? " is-selected" : ""
                }${!selected && active ? " is-active" : ""}`}
                onClick={() => onSelectCommit(commit.sha, title)}
                onMouseEnter={() => {
                  if (sourceIndex >= 0) {
                    onHighlightCommit(sourceIndex);
                  }
                }}
                disabled={reviewPrompt.isSubmitting}
              >
                <span className="review-inline-commit-title-row">
                  <span className="review-inline-commit-title">{title}</span>
                  {selected && (
                    <span className="codicon codicon-check review-inline-selected-icon" aria-hidden />
                  )}
                </span>
                <span className="review-inline-commit-meta">{shortSha(commit.sha)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

const CustomStep = memo(function CustomStep({
  reviewPrompt,
  onUpdateCustomInstructions,
}: {
  reviewPrompt: NonNullable<ReviewPromptState>;
  onUpdateCustomInstructions: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="review-inline-section">
      <label className="review-inline-label" htmlFor="review-inline-custom-instructions">
        {t("composer.instructions")}
      </label>
      <textarea
        id="review-inline-custom-instructions"
        className="review-inline-textarea"
        value={reviewPrompt.customInstructions}
        onChange={(event) => onUpdateCustomInstructions(event.target.value)}
        placeholder={t("composer.instructionsPlaceholder")}
        autoFocus
        rows={6}
      />
    </div>
  );
});

export const ReviewInlinePrompt = memo(function ReviewInlinePrompt({
  reviewPrompt,
  onClose,
  onShowPreset,
  onChoosePreset,
  highlightedPresetIndex,
  onHighlightPreset,
  highlightedBranchIndex,
  onHighlightBranch,
  highlightedCommitIndex,
  onHighlightCommit,
  onSelectBranch,
  onConfirmBranch,
  onSelectCommit,
  onConfirmCommit,
  onUpdateCustomInstructions,
  onConfirmCustom,
  onKeyDown,
}: ReviewInlinePromptProps) {
  const { t } = useTranslation();
  const { step, error, isSubmitting } = reviewPrompt;

  useEffect(() => {
    if (!onKeyDown) {
      return;
    }
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const handled = onKeyDown({
        key: event.key,
        shiftKey: event.shiftKey,
        preventDefault: () => event.preventDefault(),
      });
      if (handled) {
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [onKeyDown]);

  const title = useMemo(() => {
    switch (step) {
      case "baseBranch":
        return t("composer.selectBaseBranch");
      case "commit":
        return t("composer.selectCommitToReview");
      case "custom":
        return t("composer.customReviewInstructions");
      case "preset":
      default:
        return t("composer.selectReviewPreset");
    }
  }, [step, t]);
  const toolbarConfirmDisabled = useMemo(() => {
    if (step === "baseBranch") {
      return !reviewPrompt.selectedBranch.trim();
    }
    if (step === "commit") {
      return !reviewPrompt.selectedCommitSha;
    }
    if (step === "custom") {
      return reviewPrompt.customInstructions.trim().length === 0;
    }
    return true;
  }, [
    reviewPrompt.customInstructions,
    reviewPrompt.selectedBranch,
    reviewPrompt.selectedCommitSha,
    step,
  ]);
  const handleToolbarConfirm = useMemo<(() => Promise<void>) | null>(() => {
    if (step === "baseBranch") {
      return onConfirmBranch;
    }
    if (step === "commit") {
      return onConfirmCommit;
    }
    if (step === "custom") {
      return onConfirmCustom;
    }
    return null;
  }, [onConfirmBranch, onConfirmCommit, onConfirmCustom, step]);

  return (
    <div className="review-inline" role="dialog" aria-label={title}>
      <div className="review-inline-header">
        <div className="review-inline-header-main">
          <div>
            <div className="review-inline-title">
              <span
                className="codicon codicon-git-pull-request-reviewer review-inline-title-icon"
                aria-hidden
              />
              <span>{title}</span>
            </div>
            <div className="review-inline-subtitle">{reviewPrompt.workspace.name}</div>
          </div>
          <div className="review-inline-header-actions">
            {step !== "preset" && handleToolbarConfirm ? (
              <StepToolbar
                onBack={onShowPreset}
                onConfirm={handleToolbarConfirm}
                isSubmitting={isSubmitting}
                confirmDisabled={toolbarConfirmDisabled}
              />
            ) : null}
            <button
              type="button"
              className="review-inline-action-link review-inline-action-close"
              onClick={onClose}
            >
              <span className="codicon codicon-close" aria-hidden />
              <span>{t("common.close")}</span>
            </button>
          </div>
        </div>
      </div>

      {step === "preset" ? (
        <PresetStep
          onChoosePreset={onChoosePreset}
          isSubmitting={isSubmitting}
          highlightedPresetIndex={highlightedPresetIndex}
          onHighlightPreset={onHighlightPreset}
        />
      ) : step === "baseBranch" ? (
        <BaseBranchStep
          reviewPrompt={reviewPrompt}
          onSelectBranch={onSelectBranch}
          highlightedBranchIndex={highlightedBranchIndex}
          onHighlightBranch={onHighlightBranch}
        />
      ) : step === "commit" ? (
        <CommitStep
          reviewPrompt={reviewPrompt}
          onSelectCommit={onSelectCommit}
          highlightedCommitIndex={highlightedCommitIndex}
          onHighlightCommit={onHighlightCommit}
        />
      ) : (
        <CustomStep
          reviewPrompt={reviewPrompt}
          onUpdateCustomInstructions={onUpdateCustomInstructions}
        />
      )}

      {error && <div className="review-inline-error">{error}</div>}
    </div>
  );
});
