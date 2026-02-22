import { lazy, memo, Suspense } from "react";
import { useRenameThreadPrompt } from "../../threads/hooks/useRenameThreadPrompt";
import { useClonePrompt } from "../../workspaces/hooks/useClonePrompt";
import { useWorktreePrompt } from "../../workspaces/hooks/useWorktreePrompt";

const RenameThreadPrompt = lazy(() =>
  import("../../threads/components/RenameThreadPrompt").then((module) => ({
    default: module.RenameThreadPrompt,
  })),
);
const WorktreePrompt = lazy(() =>
  import("../../workspaces/components/WorktreePrompt").then((module) => ({
    default: module.WorktreePrompt,
  })),
);
const WorktreeCreateResultDialog = lazy(() =>
  import("../../workspaces/components/WorktreeCreateResultDialog").then((module) => ({
    default: module.WorktreeCreateResultDialog,
  })),
);
const ClonePrompt = lazy(() =>
  import("../../workspaces/components/ClonePrompt").then((module) => ({
    default: module.ClonePrompt,
  })),
);

type RenamePromptState = ReturnType<typeof useRenameThreadPrompt>["renamePrompt"];

type WorktreePromptState = ReturnType<typeof useWorktreePrompt>["worktreePrompt"];
type WorktreeCreateResultState = ReturnType<typeof useWorktreePrompt>["worktreeCreateResult"];

type ClonePromptState = ReturnType<typeof useClonePrompt>["clonePrompt"];

type AppModalsProps = {
  renamePrompt: RenamePromptState;
  onRenamePromptChange: (value: string) => void;
  onRenamePromptCancel: () => void;
  onRenamePromptConfirm: () => void;
  worktreePrompt: WorktreePromptState;
  onWorktreePromptChange: (value: string) => void;
  onWorktreePromptBaseRefChange: (value: string) => void;
  onWorktreePromptPublishChange: (value: boolean) => void;
  onWorktreeSetupScriptChange: (value: string) => void;
  onWorktreePromptCancel: () => void;
  onWorktreePromptConfirm: () => void;
  worktreeCreateResult: WorktreeCreateResultState;
  onWorktreeCreateResultClose: () => void;
  clonePrompt: ClonePromptState;
  onClonePromptCopyNameChange: (value: string) => void;
  onClonePromptChooseCopiesFolder: () => void;
  onClonePromptUseSuggestedFolder: () => void;
  onClonePromptClearCopiesFolder: () => void;
  onClonePromptCancel: () => void;
  onClonePromptConfirm: () => void;
};

export const AppModals = memo(function AppModals({
  renamePrompt,
  onRenamePromptChange,
  onRenamePromptCancel,
  onRenamePromptConfirm,
  worktreePrompt,
  onWorktreePromptChange,
  onWorktreePromptBaseRefChange,
  onWorktreePromptPublishChange,
  onWorktreeSetupScriptChange,
  onWorktreePromptCancel,
  onWorktreePromptConfirm,
  worktreeCreateResult,
  onWorktreeCreateResultClose,
  clonePrompt,
  onClonePromptCopyNameChange,
  onClonePromptChooseCopiesFolder,
  onClonePromptUseSuggestedFolder,
  onClonePromptClearCopiesFolder,
  onClonePromptCancel,
  onClonePromptConfirm,
}: AppModalsProps) {
  return (
    <>
      {renamePrompt && (
        <Suspense fallback={null}>
          <RenameThreadPrompt
            currentName={renamePrompt.originalName}
            name={renamePrompt.name}
            onChange={onRenamePromptChange}
            onCancel={onRenamePromptCancel}
            onConfirm={onRenamePromptConfirm}
          />
        </Suspense>
      )}
      {worktreePrompt && (
        <Suspense fallback={null}>
          <WorktreePrompt
            workspaceName={worktreePrompt.workspace.name}
            workspacePath={worktreePrompt.workspace.path}
            branch={worktreePrompt.branch}
            baseRef={worktreePrompt.baseRef}
            baseRefOptions={worktreePrompt.baseRefOptions}
            isLoadingBaseRefs={worktreePrompt.isLoadingBaseRefs}
            isNonGitRepository={worktreePrompt.isNonGitRepository}
            nonGitRepositoryRawError={worktreePrompt.nonGitRepositoryRawError}
            publishToOrigin={worktreePrompt.publishToOrigin}
            setupScript={worktreePrompt.setupScript}
            scriptError={worktreePrompt.scriptError}
            error={worktreePrompt.error}
            errorRetryCommand={worktreePrompt.errorRetryCommand}
            isBusy={worktreePrompt.isSubmitting}
            isSavingScript={worktreePrompt.isSavingScript}
            onChange={onWorktreePromptChange}
            onBaseRefChange={onWorktreePromptBaseRefChange}
            onPublishToOriginChange={onWorktreePromptPublishChange}
            onSetupScriptChange={onWorktreeSetupScriptChange}
            onCancel={onWorktreePromptCancel}
            onConfirm={onWorktreePromptConfirm}
          />
        </Suspense>
      )}
      {worktreeCreateResult && (
        <Suspense fallback={null}>
          <WorktreeCreateResultDialog
            result={worktreeCreateResult}
            onClose={onWorktreeCreateResultClose}
          />
        </Suspense>
      )}
      {clonePrompt && (
        <Suspense fallback={null}>
          <ClonePrompt
            workspaceName={clonePrompt.workspace.name}
            copyName={clonePrompt.copyName}
            copiesFolder={clonePrompt.copiesFolder}
            suggestedCopiesFolder={clonePrompt.suggestedCopiesFolder}
            error={clonePrompt.error}
            isBusy={clonePrompt.isSubmitting}
            onCopyNameChange={onClonePromptCopyNameChange}
            onChooseCopiesFolder={onClonePromptChooseCopiesFolder}
            onUseSuggestedCopiesFolder={onClonePromptUseSuggestedFolder}
            onClearCopiesFolder={onClonePromptClearCopiesFolder}
            onCancel={onClonePromptCancel}
            onConfirm={onClonePromptConfirm}
          />
        </Suspense>
      )}
    </>
  );
});
