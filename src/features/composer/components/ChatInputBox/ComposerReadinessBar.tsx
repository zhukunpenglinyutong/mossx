import { useTranslation } from 'react-i18next';
import { EngineIcon } from '../../../engine/components/EngineIcon';
import type { ComposerSendReadiness } from '../../utils/composerSendReadiness';

function parseContextChipCount(chip: string, prefix: string) {
  if (!chip.startsWith(prefix)) {
    return null;
  }
  const count = Number(chip.slice(prefix.length));
  return Number.isFinite(count) && count > 0 ? count : null;
}

type ComposerReadinessBarProps = {
  readiness: ComposerSendReadiness;
  onJumpToRequest?: () => void;
  onExpandContextSources?: () => void;
  contextSourcesExpanded?: boolean;
};

export function ComposerReadinessBar({
  readiness,
  onJumpToRequest,
  onExpandContextSources,
  contextSourcesExpanded = false,
}: ComposerReadinessBarProps) {
  const { t } = useTranslation();
  const modeLabel = readiness.target.modeLabel ?? readiness.target.accessModeLabel;
  const hasContext = readiness.contextSummary.chips.length > 0;
  const contextLabels = readiness.contextSummary.chips.map((chip) => {
    const memoryCount = parseContextChipCount(chip, 'memory:');
    if (memoryCount !== null) {
      return t('composer.manualMemorySelection', { count: memoryCount });
    }
    const noteCount = parseContextChipCount(chip, 'notes:');
    if (noteCount !== null) {
      return t('composer.noteCardSelection', { count: noteCount });
    }
    const fileCount = parseContextChipCount(chip, 'files:');
    if (fileCount !== null) {
      return t('composer.readinessContextFileReference', { count: fileCount });
    }
    const imageCount = parseContextChipCount(chip, 'images:');
    if (imageCount !== null) {
      return t('composer.readinessContextImage', { count: imageCount });
    }
    const ledgerItemCount = parseContextChipCount(chip, 'items:');
    if (ledgerItemCount !== null) {
      return t('composer.contextLedgerSummaryBlocks', { count: ledgerItemCount });
    }
    const ledgerGroupCount = parseContextChipCount(chip, 'groups:');
    if (ledgerGroupCount !== null) {
      return t('composer.contextLedgerSummaryGroups', { count: ledgerGroupCount });
    }
    if (chip.startsWith('agent:')) {
      return t('composer.readinessContextAgent', { name: chip.slice('agent:'.length) });
    }
    return chip;
  });
  const canJumpToRequest =
    Boolean(onJumpToRequest) && readiness.requestPointer?.canJumpToRequest === true;
  const canExpandContextSources = hasContext && Boolean(onExpandContextSources);

  return (
    <div
      className={`composer-readiness-bar composer-readiness-bar--${readiness.activity.severity}`}
      data-activity={readiness.activity.kind}
      data-primary-action={readiness.readiness.primaryAction}
      aria-label={t('composer.readinessAriaLabel', {
        target: readiness.target.providerLabel,
        model: readiness.target.modelLabel,
        activity: readiness.activity.shortLabel,
      })}
    >
      <div className="composer-readiness-target" title={readiness.activity.detailLabel}>
        <span className="composer-readiness-icon" aria-hidden="true">
          <EngineIcon engine={readiness.target.engine} size={17} />
        </span>
        <span className="composer-readiness-provider">
          {readiness.target.providerLabel}
        </span>
        <span className="composer-readiness-divider" aria-hidden="true">
          /
        </span>
        <span className="composer-readiness-model">
          {readiness.target.modelLabel}
        </span>
        {modeLabel ? (
          <span className="composer-readiness-chip">
            {modeLabel}
          </span>
        ) : null}
        {readiness.target.modeImpactLabel ? (
          <span className="composer-readiness-mode-impact">
            {readiness.target.modeImpactLabel}
          </span>
        ) : null}
      </div>

      <div className="composer-readiness-activity" title={readiness.activity.detailLabel}>
        {contextLabels.length > 0 ? (
          <span
            className="composer-readiness-context-summary"
            title={readiness.contextSummary.detailLabel}
          >
            {contextLabels.join(' · ')}
          </span>
        ) : null}
        {canJumpToRequest ? (
          <button
            type="button"
            className="composer-readiness-action"
            onClick={onJumpToRequest}
          >
            {t('composer.readinessJumpToRequest')}
          </button>
        ) : null}
        {canExpandContextSources ? (
          <button
            type="button"
            className="composer-readiness-expand"
            onClick={onExpandContextSources}
            aria-expanded={contextSourcesExpanded}
          >
            {t('composer.contextLedgerExpand')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
