import React, { useRef, useCallback, useMemo, useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import Crosshair from 'lucide-react/dist/esm/icons/crosshair';
import ListCollapse from 'lucide-react/dist/esm/icons/list-collapse';
import Mail from 'lucide-react/dist/esm/icons/mail';
import { AgentIcon } from '../../../../components/AgentIcon';
import { getFileIcon } from '../../utils/fileIcons';
import { TokenIndicator } from './TokenIndicator';
import type {
  ClaudeContextUsageViewModel,
  ContextSelectionChip,
  DualContextUsageViewModel,
  SelectedAgent,
} from './types';
import { sanitizeSvg } from './utils/sanitize';
import {
  MESSAGES_LIVE_AUTO_FOLLOW_FLAG_KEY,
  MESSAGES_LIVE_COLLAPSE_MIDDLE_STEPS_FLAG_KEY,
  MESSAGES_LIVE_CONTROLS_UPDATED_EVENT,
  readLocalBooleanFlag,
  writeLocalBooleanFlag,
} from '../../../messages/constants/liveCanvasControls';
import { CODEX_AUTO_COMPACTION_THRESHOLD_OPTIONS } from '../../../codex/constants/codexAutoCompactionThreshold';

type CodexAutoCompactionSettingsPatch = {
  enabled?: boolean;
  thresholdPercent?: number;
};

interface ContextBarProps {
  surface?: 'external' | 'tool-popover';
  activeFile?: string;
  selectedLines?: string;
  percentage?: number | null;
  usedTokens?: number;
  maxTokens?: number;
  showUsage?: boolean;
  contextDualViewEnabled?: boolean;
  dualContextUsage?: DualContextUsageViewModel | null;
  claudeContextUsage?: ClaudeContextUsageViewModel | null;
  onRequestContextCompaction?: () => Promise<void> | void;
  codexAutoCompactionEnabled?: boolean;
  codexAutoCompactionThresholdPercent?: number;
  onCodexAutoCompactionSettingsChange?: (patch: CodexAutoCompactionSettingsPatch) => Promise<void> | void;
  isLoading?: boolean;
  onClearFile?: () => void;
  onAddAttachment?: (files?: FileList | null) => void;
  selectedAgent?: SelectedAgent | null;
  selectedContextChips?: ContextSelectionChip[];
  onRemoveContextChip?: (chip: ContextSelectionChip) => void;
  onClearAgent?: () => void;
  /** Current provider (for conditional rendering) */
  currentProvider?: string;
  /** Whether there are messages (for rewind button visibility) */
  hasMessages?: boolean;
  /** Rewind callback */
  onRewind?: () => void;
  /** Whether to show rewind entry */
  showRewindEntry?: boolean;
  /** Whether StatusPanel is expanded */
  statusPanelExpanded?: boolean;
  /** Whether to show StatusPanel toggle button */
  showStatusPanelToggle?: boolean;
  /** Toggle StatusPanel expand/collapse */
  onToggleStatusPanel?: () => void;
  /** Whether the current thread has one-shot completion email armed */
  completionEmailSelected?: boolean;
  /** Whether completion email toggle is disabled */
  completionEmailDisabled?: boolean;
  /** Toggle one-shot completion email for current thread */
  onToggleCompletionEmail?: () => void;
}

export const ContextBar: React.FC<ContextBarProps> = memo(({
  surface = 'tool-popover',
  activeFile,
  selectedLines,
  percentage = null,
  usedTokens,
  maxTokens,
  contextDualViewEnabled = false,
  dualContextUsage = null,
  claudeContextUsage = null,
  onRequestContextCompaction,
  codexAutoCompactionEnabled = true,
  codexAutoCompactionThresholdPercent = 92,
  onCodexAutoCompactionSettingsChange,
  isLoading = false,
  onClearFile,
  onAddAttachment,
  selectedAgent,
  selectedContextChips = [],
  onRemoveContextChip,
  onClearAgent,
  currentProvider = 'claude',
  hasMessages = false,
  onRewind,
  showRewindEntry = true,
  statusPanelExpanded = true,
  showStatusPanelToggle = true,
  onToggleStatusPanel,
  completionEmailSelected = false,
  completionEmailDisabled = false,
  onToggleCompletionEmail,
}) => {
  const { t } = useTranslation();
  const isToolPopoverSurface = surface === 'tool-popover';
  const manualCompactionLockRef = useRef(false);
  const manualCompactionRequestInFlightRef = useRef(false);
  const manualCompactionStartedAtRef = useRef<number>(0);
  const compactionBusyRef = useRef(false);
  const [manualCompactionPending, setManualCompactionPending] = useState(false);
  const [liveAutoFollowEnabled, setLiveAutoFollowEnabled] = useState(() =>
    readLocalBooleanFlag(MESSAGES_LIVE_AUTO_FOLLOW_FLAG_KEY, true),
  );
  const [collapseLiveMiddleStepsEnabled, setCollapseLiveMiddleStepsEnabled] = useState(() =>
    readLocalBooleanFlag(MESSAGES_LIVE_COLLAPSE_MIDDLE_STEPS_FLAG_KEY, false),
  );
  const manualCompactionMinSpinMs = 1200;
  const showLiveAutoFollowControl = Boolean(isLoading && showStatusPanelToggle);
  const showCollapseMiddleStepsControl = Boolean((isLoading || hasMessages) && showStatusPanelToggle);
  const showLiveCanvasControls = showLiveAutoFollowControl || showCollapseMiddleStepsControl;
  const rewindDisabled = !hasMessages || isLoading;

  const handleAttachClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAddAttachment?.();
  }, [onAddAttachment]);

  // Extract filename from path
  const getFileName = (path: string) => {
    return path.split(/[/\\]/).pop() || path;
  };

  const getFileIconSvg = (path: string) => {
    const fileName = getFileName(path);
    const extension = fileName.indexOf('.') !== -1 ? fileName.split('.').pop() : '';
    return getFileIcon(extension, fileName);
  };

  const displayText = activeFile ? (
    selectedLines ? `${getFileName(activeFile)}#${selectedLines}` : getFileName(activeFile)
  ) : '';

  const fullDisplayText = activeFile ? (
    selectedLines ? `${activeFile}#${selectedLines}` : activeFile
  ) : '';

  const formatCompactTokens = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return '0';
    }
    if (value >= 1_000_000) {
      const mValue = value / 1_000_000;
      return Number.isInteger(mValue) ? `${mValue}m` : `${mValue.toFixed(1)}m`;
    }
    if (value >= 1_000) {
      const kValue = value / 1_000;
      return Number.isInteger(kValue) ? `${kValue}k` : `${kValue.toFixed(1)}k`;
    }
    return `${Math.round(value)}`;
  }, []);

  const dualUsageSummary = useMemo(() => {
    const isCodexProvider = currentProvider === 'codex';
    if (!dualContextUsage || !contextDualViewEnabled || !isCodexProvider) {
      return null;
    }
    const totalTokensValue = formatCompactTokens(Math.max(usedTokens ?? 0, 0));
    const usedContextTokenCount = Math.max(dualContextUsage.usedTokens, 0);
    const contextWindowTokenCount = Math.max(dualContextUsage.contextWindow, 0);
    const usagePercentFromTokens = contextWindowTokenCount > 0
      ? (usedContextTokenCount / contextWindowTokenCount) * 100
      : null;
    const usagePercentFromSnapshot = Number.isFinite(dualContextUsage.percent)
      ? Math.max(dualContextUsage.percent, 0)
      : 0;
    const realUsagePercent = usagePercentFromTokens ?? usagePercentFromSnapshot;
    const usagePercentForDisplay = Math.round(dualContextUsage.hasUsage ? realUsagePercent : 0);
    const usagePercentForRing = dualContextUsage.hasUsage
      ? Math.min(realUsagePercent, 100)
      : 0;
    const remainingPercent = Math.max(0, 100 - usagePercentForDisplay);
    const usedPercentValue = `${usagePercentForDisplay}%`;
    const remainingPercentValue = `${remainingPercent}%`;
    const usedContextTokens = formatCompactTokens(usedContextTokenCount);
    const totalContextTokens = formatCompactTokens(contextWindowTokenCount);
    const windowTokensValue = `${usedContextTokens} / ${totalContextTokens}`;
    const windowTitleText = t('chat.contextDualViewWindowTitle');
    const windowUsageText = `${t('chat.contextDualViewTooltipUsedLabel')} ${usedPercentValue} · ${t('chat.contextDualViewTooltipRemainingLabel')} ${remainingPercentValue}`;
    const windowTokensText = t('chat.contextDualViewWindowTokens', {
      usedTokens: usedContextTokens,
      totalTokens: totalContextTokens,
    });
    const autoCompactionText = t('chat.contextDualViewAutoCompactionNote');
    const autoCompactionEnabledValue = codexAutoCompactionEnabled !== false;
    const autoCompactionThresholdValue = `${codexAutoCompactionThresholdPercent}%`;
    const isAutoCompactionSource = dualContextUsage.compactionSource === 'auto';
    if (dualContextUsage.compactionState === 'compacting') {
      return {
        stateClass: 'compacting',
        barPercent: usagePercentForRing,
        percentLabel: usedPercentValue,
        totalTokensValue,
        windowTitleText,
        usedPercentValue,
        remainingPercentValue,
        windowTokensValue,
        autoCompactionText,
        autoCompactionEnabledValue,
        autoCompactionThresholdValue,
        statusText: t(
          isAutoCompactionSource
            ? 'chat.contextDualViewCompactingAuto'
            : 'chat.contextDualViewCompacting',
        ),
        ariaState: t(
          isAutoCompactionSource
            ? 'chat.contextDualViewCompactingAuto'
            : 'chat.contextDualViewCompacting',
        ),
      };
    }
    if (dualContextUsage.compactionState === 'compacted') {
      const completedKey = dualContextUsage.usageSyncPendingAfterCompaction
        ? (
          isAutoCompactionSource
            ? 'chat.contextDualViewCompactedPendingSyncAuto'
            : 'chat.contextDualViewCompactedPendingSync'
        )
        : 'chat.contextDualViewCompacted';
      return {
        stateClass: 'compacted',
        barPercent: usagePercentForRing,
        percentLabel: usedPercentValue,
        totalTokensValue,
        windowTitleText,
        usedPercentValue,
        remainingPercentValue,
        windowTokensValue,
        autoCompactionText,
        autoCompactionEnabledValue,
        autoCompactionThresholdValue,
        statusText: t(completedKey),
        ariaState: t(completedKey),
      };
    }
    if (!dualContextUsage.hasUsage || dualContextUsage.contextWindow <= 0) {
      return {
        stateClass: 'empty',
        barPercent: 0,
        percentLabel: '0%',
        totalTokensValue,
        windowTitleText,
        usedPercentValue: '0%',
        remainingPercentValue: '100%',
        windowTokensValue: `0 / ${totalContextTokens}`,
        autoCompactionText,
        autoCompactionEnabledValue,
        autoCompactionThresholdValue,
        statusText: undefined,
        ariaState: t('chat.contextDualViewEmpty'),
      };
    }
    return {
      stateClass: 'data',
      barPercent: usagePercentForRing,
      percentLabel: usedPercentValue,
      totalTokensValue,
      windowTitleText,
      usedPercentValue,
      remainingPercentValue,
      windowTokensValue,
      autoCompactionText,
      autoCompactionEnabledValue,
      autoCompactionThresholdValue,
      statusText: undefined,
      ariaState: `${windowUsageText} · ${windowTokensText}`,
    };
  }, [
    codexAutoCompactionEnabled,
    codexAutoCompactionThresholdPercent,
    contextDualViewEnabled,
    currentProvider,
    dualContextUsage,
    formatCompactTokens,
    t,
    usedTokens,
  ]);
  const showCompactionButton = Boolean(
    currentProvider === 'codex'
      && onRequestContextCompaction
      && dualContextUsage,
  );
  const disableCompactionButton = manualCompactionPending
    || dualContextUsage?.compactionState === 'compacting';
  const showCompactionSpinner = manualCompactionPending
    || dualContextUsage?.compactionState === 'compacting';
  const isCompactionBusy = Boolean(
    dualContextUsage?.compactionState === 'compacting'
      || (manualCompactionPending && isLoading),
  );

  useEffect(() => {
    compactionBusyRef.current = isCompactionBusy;
  }, [isCompactionBusy]);
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) {
        return;
      }
      if (event.key === MESSAGES_LIVE_AUTO_FOLLOW_FLAG_KEY) {
        setLiveAutoFollowEnabled(readLocalBooleanFlag(MESSAGES_LIVE_AUTO_FOLLOW_FLAG_KEY, true));
        return;
      }
      if (event.key === MESSAGES_LIVE_COLLAPSE_MIDDLE_STEPS_FLAG_KEY) {
        setCollapseLiveMiddleStepsEnabled(
          readLocalBooleanFlag(MESSAGES_LIVE_COLLAPSE_MIDDLE_STEPS_FLAG_KEY, false),
        );
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const emitLiveCanvasControlsUpdate = useCallback(
    (detail: { liveAutoFollowEnabled?: boolean; collapseLiveMiddleStepsEnabled?: boolean }) => {
      window.dispatchEvent(
        new CustomEvent(MESSAGES_LIVE_CONTROLS_UPDATED_EVENT, {
          detail,
        }),
      );
    },
    [],
  );

  const handleToggleLiveAutoFollow = useCallback(() => {
    setLiveAutoFollowEnabled((previous) => {
      const next = !previous;
      writeLocalBooleanFlag(MESSAGES_LIVE_AUTO_FOLLOW_FLAG_KEY, next);
      emitLiveCanvasControlsUpdate({ liveAutoFollowEnabled: next });
      return next;
    });
  }, [emitLiveCanvasControlsUpdate]);

  const handleToggleCollapseLiveMiddleSteps = useCallback(() => {
    setCollapseLiveMiddleStepsEnabled((previous) => {
      const next = !previous;
      writeLocalBooleanFlag(MESSAGES_LIVE_COLLAPSE_MIDDLE_STEPS_FLAG_KEY, next);
      emitLiveCanvasControlsUpdate({ collapseLiveMiddleStepsEnabled: next });
      return next;
    });
  }, [emitLiveCanvasControlsUpdate]);

  const handleCompletionEmailToggle = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleCompletionEmail?.();
  }, [onToggleCompletionEmail]);

  const releaseManualCompactionPending = useCallback(async () => {
    const elapsed = Date.now() - manualCompactionStartedAtRef.current;
    const remainingSpinMs = Math.max(0, manualCompactionMinSpinMs - elapsed);
    if (remainingSpinMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, remainingSpinMs);
      });
    }
    if (manualCompactionRequestInFlightRef.current || compactionBusyRef.current) {
      return;
    }
    setManualCompactionPending(false);
    manualCompactionLockRef.current = false;
  }, [manualCompactionMinSpinMs]);

  useEffect(() => {
    if (!manualCompactionPending) {
      return;
    }
    if (manualCompactionRequestInFlightRef.current || isCompactionBusy) {
      return;
    }
    void releaseManualCompactionPending();
  }, [isCompactionBusy, manualCompactionPending, releaseManualCompactionPending]);

  const handleRequestContextCompaction = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      !onRequestContextCompaction
      || disableCompactionButton
      || manualCompactionLockRef.current
    ) {
      return;
    }
    manualCompactionLockRef.current = true;
    manualCompactionRequestInFlightRef.current = true;
    manualCompactionStartedAtRef.current = Date.now();
    setManualCompactionPending(true);
    try {
      await onRequestContextCompaction();
    } finally {
      manualCompactionRequestInFlightRef.current = false;
      if (!compactionBusyRef.current) {
        await releaseManualCompactionPending();
      }
    }
  }, [disableCompactionButton, onRequestContextCompaction, releaseManualCompactionPending]);

  const shouldShowLegacyTokenIndicator = !(currentProvider === 'codex' && contextDualViewEnabled);
  const hasPrimaryUsageTools = Boolean(
    onAddAttachment ||
      (shouldShowLegacyTokenIndicator && (percentage !== null || usedTokens !== undefined || claudeContextUsage)) ||
      (contextDualViewEnabled && dualUsageSummary),
  );
  const hasExternalContext = Boolean(
    selectedContextChips.length > 0 ||
      selectedAgent ||
      displayText,
  );

  if (!isToolPopoverSurface && !hasExternalContext) {
    return null;
  }

  return (
    <div className={`context-bar context-bar--${surface}${contextDualViewEnabled ? ' context-bar--dual' : ''}`}>
      {/* Tool Icons Group */}
      {isToolPopoverSurface && hasPrimaryUsageTools && (
        <div className="context-tools">
          {onAddAttachment && (
            <button
              className="context-tool-btn context-tool-btn--labeled"
              onClick={handleAttachClick}
              title={t('chat.addAttachment')}
              aria-label={t('chat.addAttachment')}
            >
              <span className="codicon codicon-attach" />
              <span className="context-tool-label">{t('chat.attach')}</span>
            </button>
          )}

          {shouldShowLegacyTokenIndicator && (
            <div className="context-token-indicator">
              <TokenIndicator
                percentage={percentage}
                usedTokens={usedTokens}
                maxTokens={maxTokens}
                claudeContextUsage={currentProvider === 'claude' ? claudeContextUsage : null}
                size={14}
              />
            </div>
          )}

          {contextDualViewEnabled && dualUsageSummary && (
            <div
              className={`context-dual-usage context-dual-usage--${dualUsageSummary.stateClass}`}
              role="status"
              aria-label={t('chat.contextDualViewAriaLabel', {
                state: dualUsageSummary.ariaState,
              })}
            >
              <span
                className="context-dual-usage-ring"
                style={
                  {
                    '--dual-usage-percent': `${dualUsageSummary.barPercent}%`,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              >
                <span className="context-dual-usage-ring-inner" />
              </span>
              <span className="context-dual-usage-percent">
                {dualUsageSummary.percentLabel}
              </span>
              <div
                className="context-dual-tooltip"
                role="tooltip"
              >
                <div className="context-dual-tooltip-kv">
                  <span className="context-dual-tooltip-key">{t('chat.contextDualViewTooltipTotalLabel')}</span>
                  <span className="context-dual-tooltip-value">{dualUsageSummary.totalTokensValue}</span>
                </div>
                <div className="context-dual-tooltip-divider" />
                <div className="context-dual-tooltip-title">{dualUsageSummary.windowTitleText}</div>
                <div className="context-dual-tooltip-grid">
                  <div className="context-dual-tooltip-kv">
                    <span className="context-dual-tooltip-key">{t('chat.contextDualViewTooltipUsedLabel')}</span>
                    <span className="context-dual-tooltip-value">{dualUsageSummary.usedPercentValue}</span>
                  </div>
                  <div className="context-dual-tooltip-kv">
                    <span className="context-dual-tooltip-key">{t('chat.contextDualViewTooltipRemainingLabel')}</span>
                    <span className="context-dual-tooltip-value">{dualUsageSummary.remainingPercentValue}</span>
                  </div>
                  <div className="context-dual-tooltip-kv context-dual-tooltip-kv--wide">
                    <span className="context-dual-tooltip-key">{t('chat.contextDualViewTooltipTokensLabel')}</span>
                    <span className="context-dual-tooltip-value">{dualUsageSummary.windowTokensValue}</span>
                  </div>
                </div>
                <div className="context-dual-tooltip-auto-settings">
                  <label className="context-dual-tooltip-switch">
                    <input
                      type="checkbox"
                      checked={dualUsageSummary.autoCompactionEnabledValue}
                      onChange={(event) => {
                        void onCodexAutoCompactionSettingsChange?.({
                          enabled: event.target.checked,
                        });
                      }}
                    />
                    <span>{t('chat.contextDualViewAutoCompactionEnabled')}</span>
                  </label>
                  <label className="context-dual-tooltip-threshold">
                    <span>{t('chat.contextDualViewAutoCompactionThreshold')}</span>
                    <select
                      value={codexAutoCompactionThresholdPercent}
                      disabled={!dualUsageSummary.autoCompactionEnabledValue}
                      onChange={(event) => {
                        void onCodexAutoCompactionSettingsChange?.({
                          thresholdPercent: Number(event.target.value),
                        });
                      }}
                    >
                      {CODEX_AUTO_COMPACTION_THRESHOLD_OPTIONS.map((thresholdPercent) => (
                        <option key={thresholdPercent} value={thresholdPercent}>
                          {thresholdPercent}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="context-dual-tooltip-foot">
                  <div className="context-dual-tooltip-note">
                    {dualUsageSummary.autoCompactionText} · {dualUsageSummary.autoCompactionThresholdValue}
                  </div>
                  {showCompactionButton && (
                    <div className="context-dual-tooltip-actions">
                      <button
                        type="button"
                        className="context-dual-tooltip-action-btn"
                        onClick={handleRequestContextCompaction}
                        disabled={disableCompactionButton}
                        title={t('chat.contextDualViewManualCompact')}
                        aria-label={t('chat.contextDualViewManualCompact')}
                      >
                        <span
                          className={`codicon ${showCompactionSpinner ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  )}
                </div>
                {dualUsageSummary.statusText && (
                  <div className="context-dual-tooltip-status">{dualUsageSummary.statusText}</div>
                )}
              </div>
            </div>
          )}

          {onAddAttachment ? <div className="context-tool-divider" /> : null}
        </div>
      )}

      {/* Selected Skill / Commons Chips */}
      {!isToolPopoverSurface && selectedContextChips.map((chip) => (
        <div
          key={`${chip.type}:${chip.name}`}
          className="context-item has-tooltip"
          data-tooltip={chip.description || chip.name}
          style={{ cursor: 'default' }}
        >
          <span
            className={`codicon ${chip.type === 'skill' ? 'codicon-tools' : 'codicon-wrench'}`}
            style={{ marginRight: 4 }}
          />
          <span className="context-text">
            <span dir="ltr">{chip.name}</span>
          </span>
          <span
            className="codicon codicon-close context-close"
            onClick={() => onRemoveContextChip?.(chip)}
            title={t('chat.removeContextSelection')}
          />
        </div>
      ))}

      {/* Selected Agent Chip */}
      {!isToolPopoverSurface && selectedAgent && (
        <div 
          className="context-item has-tooltip" 
          data-tooltip={selectedAgent.name}
          style={{ cursor: 'default' }}
        >
          <AgentIcon
            icon={selectedAgent.icon}
            seed={selectedAgent.id || selectedAgent.name}
            fallback="codicon-robot"
            className="context-agent-icon"
            size={14}
          />
          <span className="context-text">
            <span dir="ltr">
              {selectedAgent.name.length > 3 
                ? `${selectedAgent.name.slice(0, 3)}...` 
                : selectedAgent.name}
            </span>
          </span>
          <span 
            className="codicon codicon-close context-close" 
            onClick={onClearAgent}
            title={t('chat.removeAgent')}
          />
        </div>
      )}

      {/* Active Context Chip */}
      {!isToolPopoverSurface && displayText && (
        <div
          className="context-item has-tooltip"
          data-tooltip={fullDisplayText}
          style={{ cursor: 'default' }}
        >
          {activeFile && (
            <span
              className="context-file-icon"
              style={{
                marginRight: 4,
                display: 'inline-flex',
                alignItems: 'center',
                width: 16,
                height: 16
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(getFileIconSvg(activeFile)) }}
            />
          )}
          <span className="context-text">
            <span dir="ltr">{displayText}</span>
          </span>
          <span
            className="codicon codicon-close context-close"
            onClick={onClearFile}
            title={t('chat.removeFileContext')}
          />
        </div>
      )}

      {/* Right side tools */}
      <div className="context-tools-right">
        {isToolPopoverSurface && onToggleCompletionEmail && (
          <button
            type="button"
            className={`context-tool-btn context-completion-email-btn has-tooltip${completionEmailSelected ? ' is-active' : ''}`}
            onClick={handleCompletionEmailToggle}
            disabled={completionEmailDisabled}
            data-tooltip={
              completionEmailSelected
                ? t('composer.completionEmailSelectedTooltip')
                : t('composer.completionEmailTooltip')
            }
            aria-label={
              completionEmailSelected
                ? t('composer.completionEmailSelected')
                : t('composer.completionEmailAriaLabel')
            }
            aria-pressed={completionEmailSelected}
          >
            <Mail size={14} aria-hidden />
          </button>
        )}

        {isToolPopoverSurface && showLiveCanvasControls && (
          <div className="context-live-canvas-controls" role="group" aria-label={t('messages.liveControls')}>
            {showLiveAutoFollowControl && (
              <button
                type="button"
                className={`context-tool-btn context-tool-btn--labeled context-live-canvas-btn context-live-canvas-btn--focus-follow has-tooltip${liveAutoFollowEnabled ? ' is-active' : ''}`}
                onClick={handleToggleLiveAutoFollow}
                data-tooltip={
                  liveAutoFollowEnabled ? t('messages.liveAutoFollowDisable') : t('messages.liveAutoFollowEnable')
                }
                aria-label={
                  liveAutoFollowEnabled ? t('messages.liveAutoFollowDisable') : t('messages.liveAutoFollowEnable')
                }
                aria-pressed={liveAutoFollowEnabled}
              >
                <Crosshair size={13} aria-hidden />
                <span className="context-tool-label">{t('messages.liveAutoFollowToggle')}</span>
                <span className="context-live-canvas-dot" aria-hidden />
              </button>
            )}
            {showCollapseMiddleStepsControl && (
              <button
                type="button"
                className={`context-tool-btn context-tool-btn--labeled context-live-canvas-btn has-tooltip${collapseLiveMiddleStepsEnabled ? ' is-active' : ''}`}
                onClick={handleToggleCollapseLiveMiddleSteps}
                data-tooltip={
                  collapseLiveMiddleStepsEnabled
                    ? t('messages.collapseMiddleStepsDisable')
                    : t('messages.collapseMiddleStepsEnable')
                }
                aria-label={
                  collapseLiveMiddleStepsEnabled
                    ? t('messages.collapseMiddleStepsDisable')
                    : t('messages.collapseMiddleStepsEnable')
                }
                aria-pressed={collapseLiveMiddleStepsEnabled}
              >
                <ListCollapse size={13} aria-hidden />
                <span className="context-tool-label">{t('messages.collapseMiddleStepsToggle')}</span>
                <span className="context-live-canvas-dot" aria-hidden />
              </button>
            )}
          </div>
        )}

        {/* StatusPanel expand/collapse toggle */}
        {surface === 'external' ? null : onToggleStatusPanel && showStatusPanelToggle && (
          <button
            className={`context-tool-btn context-tool-btn--labeled status-panel-toggle has-tooltip ${statusPanelExpanded ? 'expanded' : 'collapsed'}`}
            onClick={onToggleStatusPanel}
            data-tooltip={statusPanelExpanded ? t('statusPanel.collapse') : t('statusPanel.expand')}
            aria-label={statusPanelExpanded ? t('statusPanel.collapse') : t('statusPanel.expand')}
          >
            <span className={`codicon ${statusPanelExpanded ? 'codicon-chevron-down' : 'codicon-layers'}`} />
          </button>
        )}

        {/* Rewind button */}
        {isToolPopoverSurface &&
          showRewindEntry &&
          (currentProvider === 'claude' || currentProvider === 'codex') &&
          onRewind && (
          <button
            className="context-tool-btn context-tool-btn--labeled context-rewind-btn has-tooltip"
            onClick={onRewind}
            disabled={rewindDisabled}
            data-tooltip={t('rewind.tooltip')}
            aria-label={t('rewind.tooltip')}
          >
            <span className="codicon codicon-history" />
            <span className="context-tool-label">{t('rewind.label')}</span>
          </button>
        )}
      </div>
    </div>
  );
});
