import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from 'antd';
import { AgentIcon } from '../../../../../components/AgentIcon';
import { agentProvider, CREATE_NEW_AGENT_ID, EMPTY_STATE_ID, type AgentItem } from '../providers/agentProvider';
import type { AccountRateLimitsInfo, CodexSpeedMode, ProviderId, SelectedAgent } from '../types';
import { formatRelativeTime } from '../../../../../utils/time';

interface ConfigSelectProps {
  currentProvider: string;
  onProviderChange: (providerId: string) => void;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
  providerVersions?: Partial<Record<ProviderId, string | null>>;
  alwaysThinkingEnabled?: boolean;
  onToggleThinking?: (enabled: boolean) => void;
  streamingEnabled?: boolean;
  onStreamingEnabledChange?: (enabled: boolean) => void;
  accountRateLimits?: AccountRateLimitsInfo | null;
  usageShowRemaining?: boolean;
  onRefreshAccountRateLimits?: () => Promise<void> | void;
  selectedCollaborationModeId?: string | null;
  onSelectCollaborationMode?: (id: string | null) => void;
  codexSpeedMode?: CodexSpeedMode;
  onCodexSpeedModeChange?: (mode: Exclude<CodexSpeedMode, 'unknown'>) => void;
  onCodexReviewQuickStart?: () => void;
  onForkQuickStart?: () => void;
  selectedAgent?: SelectedAgent | null;
  onAgentSelect?: (agent: SelectedAgent) => void;
  onOpenAgentSettings?: () => void;
}

/**
 * ConfigSelect - Combined Configuration Selector
 * Contains CLI Tool Selection and Thinking Switch
 */
export const ConfigSelect = ({
  currentProvider: providerId,
  alwaysThinkingEnabled,
  onToggleThinking,
  streamingEnabled,
  onStreamingEnabledChange,
  accountRateLimits,
  usageShowRemaining = false,
  onRefreshAccountRateLimits,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  codexSpeedMode = 'unknown',
  onCodexSpeedModeChange,
  onCodexReviewQuickStart,
  onForkQuickStart,
  selectedAgent,
  onAgentSelect,
  onOpenAgentSettings,
}: ConfigSelectProps) => {
  const USAGE_REFRESH_TIMEOUT_MS = 10_000;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'none' | 'agent' | 'usage' | 'speed'>('none');
  const [agentItems, setAgentItems] = useState<AgentItem[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const agentAbortControllerRef = useRef<AbortController | null>(null);
  const usageLoadingRef = useRef(false);

  const isCodexProvider = providerId === 'codex';
  const isClaudeProvider = providerId === 'claude';
  const supportsReviewQuickAction = isCodexProvider || isClaudeProvider;
  const supportsForkQuickAction = isCodexProvider || isClaudeProvider;
  const isPlanModeEnabled = (selectedCollaborationModeId ?? 'code') === 'plan';

  const handlePlanModeToggle = useCallback(
    (enabled: boolean) => {
      if (!onSelectCollaborationMode) {
        return;
      }
      onSelectCollaborationMode(enabled ? 'plan' : 'code');
    },
    [onSelectCollaborationMode],
  );

  const resolveUsagePercent = useCallback(
    (usedPercent: number | null | undefined): number | null => {
      if (typeof usedPercent !== 'number' || Number.isNaN(usedPercent)) {
        return null;
      }
      const clamped = Math.max(0, Math.min(100, Math.round(usedPercent)));
      return usageShowRemaining ? 100 - clamped : clamped;
    },
    [usageShowRemaining],
  );

  const formatUsageReset = useCallback(
    (value: number | null | undefined, labelKey: 'usage.sessionReset' | 'usage.weeklyReset') => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      const resetMs = value > 1_000_000_000_000 ? value : value * 1000;
      return `${t(labelKey)} ${formatRelativeTime(resetMs)}`;
    },
    [t],
  );

  const usageSnapshot = useMemo(() => {
    const sessionPercent = resolveUsagePercent(accountRateLimits?.primary?.usedPercent);
    const weeklyPercent = resolveUsagePercent(accountRateLimits?.secondary?.usedPercent);
    return {
      sessionPercent,
      weeklyPercent,
      showWeekly: Boolean(accountRateLimits?.secondary),
      sessionResetLabel: formatUsageReset(
        accountRateLimits?.primary?.resetsAt,
        'usage.sessionReset',
      ),
      weeklyResetLabel: formatUsageReset(
        accountRateLimits?.secondary?.resetsAt,
        'usage.weeklyReset',
      ),
    };
  }, [accountRateLimits, formatUsageReset, resolveUsagePercent]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
    if (!isOpen) {
      setActiveSubmenu('none');
    }
  }, [isOpen]);

  const loadAgents = useCallback(async () => {
    if (agentAbortControllerRef.current) {
      agentAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    agentAbortControllerRef.current = controller;

    setAgentsLoading(true);
    try {
      const list = await agentProvider('', controller.signal);
      if (controller.signal.aborted) return;
      setAgentItems(list);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setAgentItems([{
        id: EMPTY_STATE_ID,
        name: t('settings.agent.loadFailed'),
        prompt: '',
      }, {
        id: CREATE_NEW_AGENT_ID,
        name: t('settings.agent.createAgent'),
        prompt: '',
      }]);
    } finally {
      if (!controller.signal.aborted) {
        setAgentsLoading(false);
      }
    }
  }, [t]);

  const refreshUsageSnapshot = useCallback(async () => {
    if (!onRefreshAccountRateLimits || usageLoadingRef.current) {
      return;
    }
    usageLoadingRef.current = true;
    setUsageLoading(true);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        Promise.resolve(onRefreshAccountRateLimits()),
        new Promise<void>((resolve) => {
          timeoutId = setTimeout(resolve, USAGE_REFRESH_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // Ignore refresh failures so the menu remains usable.
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      usageLoadingRef.current = false;
      setUsageLoading(false);
    }
  }, [onRefreshAccountRateLimits]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setActiveSubmenu('none');
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (activeSubmenu !== 'agent') return;
    loadAgents();
  }, [activeSubmenu, loadAgents]);

  useEffect(() => {
    if (activeSubmenu !== 'usage') return;
    void refreshUsageSnapshot();
  }, [activeSubmenu, refreshUsageSnapshot]);

  useEffect(() => {
    return () => {
      if (agentAbortControllerRef.current) {
        agentAbortControllerRef.current.abort();
      }
    };
  }, []);

  const renderAgentSubmenu = () => (
    <div
      className="selector-dropdown"
      style={{
        position: 'absolute',
        left: '100%',
        bottom: 0,
        marginLeft: '-30px',
        zIndex: 10001,
        minWidth: '320px',
        maxWidth: '360px',
        maxHeight: '360px',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        setActiveSubmenu('agent');
      }}
    >
      {agentsLoading ? (
        <div className="selector-option" style={{ cursor: 'default' }}>
          <span className="codicon codicon-loading codicon-modifier-spin" />
          <span>{t('chat.loadingDropdown')}</span>
        </div>
      ) : (
        agentItems.map((agent) => {
          const isInfo = agent.id === EMPTY_STATE_ID;
          const isCreate = agent.id === CREATE_NEW_AGENT_ID;
          const isSelected = !!selectedAgent && selectedAgent.id === agent.id;

          return (
            <div
              key={agent.id}
              className={`selector-option ${isSelected ? 'selected' : ''} ${isInfo ? 'disabled' : ''}`}
              style={{
                alignItems: 'flex-start',
                cursor: isInfo ? 'default' : 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isInfo) return;

                if (isCreate) {
                  setIsOpen(false);
                  setActiveSubmenu('none');
                  onOpenAgentSettings?.();
                  return;
                }

                onAgentSelect?.({
                  id: agent.id,
                  name: agent.name,
                  prompt: agent.prompt,
                  icon: agent.icon,
                });
                setIsOpen(false);
                setActiveSubmenu('none');
              }}
            >
              {isCreate ? (
                <span className="codicon codicon-add" />
              ) : isInfo ? (
                <span className="codicon codicon-info" />
              ) : (
                <AgentIcon
                  icon={agent.icon}
                  seed={agent.id || agent.name}
                  fallback="codicon-robot"
                  className="selector-option-agent-icon"
                  size={16}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</span>
                {agent.prompt ? (
                  <span className="model-description" style={{ fontStyle: 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.prompt.length > 60 ? agent.prompt.substring(0, 60) + '...' : agent.prompt}
                  </span>
                ) : isCreate ? (
                  <span className="model-description" style={{ fontStyle: 'normal' }}>{t('settings.agent.createAgentHint')}</span>
                ) : null}
              </div>
              {isSelected && <span className="codicon codicon-check check-mark" />}
            </div>
          );
        })
      )}
    </div>
  );

  const renderUsageSubmenu = () => (
    <div
      className="selector-dropdown selector-usage-dropdown"
      style={{
        position: 'absolute',
        left: '100%',
        bottom: 0,
        marginLeft: '-30px',
        zIndex: 10001,
        minWidth: '280px',
      }}
    >
      <div className="selector-usage-header">
        <span>{t('home.usageSnapshot')}</span>
        <button
          type="button"
          className="selector-usage-refresh"
          onClick={(e) => {
            e.stopPropagation();
            void refreshUsageSnapshot();
          }}
          title={t('home.refreshUsage')}
        >
          <span className={`codicon ${usageLoading ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
        </button>
      </div>

      <div className="selector-usage-row">
        <div className="selector-usage-row-top">
          <span>5h limit</span>
          <span>
            {usageSnapshot.sessionPercent === null
              ? '--'
              : `${usageSnapshot.sessionPercent}% ${t(
                  usageShowRemaining ? 'usage.remaining' : 'usage.used',
                )}`}
          </span>
        </div>
        <div className="selector-usage-progress-track" aria-hidden>
          <span
            className="selector-usage-progress-fill"
            style={{ width: `${usageSnapshot.sessionPercent ?? 0}%` }}
          />
        </div>
        {usageSnapshot.sessionResetLabel && (
          <div className="selector-usage-reset">{usageSnapshot.sessionResetLabel}</div>
        )}
      </div>

      {usageSnapshot.showWeekly && (
        <div className="selector-usage-row">
          <div className="selector-usage-row-top">
            <span>Weekly limit</span>
            <span>
              {usageSnapshot.weeklyPercent === null
                ? '--'
                : `${usageSnapshot.weeklyPercent}% ${t(
                    usageShowRemaining ? 'usage.remaining' : 'usage.used',
                  )}`}
            </span>
          </div>
          <div className="selector-usage-progress-track" aria-hidden>
            <span
              className="selector-usage-progress-fill"
              style={{ width: `${usageSnapshot.weeklyPercent ?? 0}%` }}
            />
          </div>
          {usageSnapshot.weeklyResetLabel && (
            <div className="selector-usage-reset">{usageSnapshot.weeklyResetLabel}</div>
          )}
        </div>
      )}
    </div>
  );

  const handleCodexSpeedSelect = useCallback((mode: Exclude<CodexSpeedMode, 'unknown'>) => {
    onCodexSpeedModeChange?.(mode);
    setIsOpen(false);
    setActiveSubmenu('none');
  }, [onCodexSpeedModeChange]);

  const handleCodexReviewQuickStart = useCallback(() => {
    onCodexReviewQuickStart?.();
    setIsOpen(false);
    setActiveSubmenu('none');
  }, [onCodexReviewQuickStart]);

  const handleForkQuickStart = useCallback(() => {
    onForkQuickStart?.();
    setIsOpen(false);
    setActiveSubmenu('none');
  }, [onForkQuickStart]);

  const renderSpeedSubmenu = () => (
    <div
      className="selector-dropdown"
      style={{
        position: 'absolute',
        left: '100%',
        bottom: 0,
        marginLeft: '-30px',
        zIndex: 10001,
        minWidth: '180px',
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        setActiveSubmenu('speed');
      }}
    >
      <div
        className="selector-option selector-option-speed-standard"
        onClick={(e) => {
          e.stopPropagation();
          handleCodexSpeedSelect('standard');
        }}
      >
        <span>{t('composer.speedStandard')}</span>
        {codexSpeedMode === 'standard' && <span className="codicon codicon-check check-mark" />}
      </div>
      <div
        className="selector-option selector-option-speed-fast"
        onClick={(e) => {
          e.stopPropagation();
          handleCodexSpeedSelect('fast');
        }}
      >
        <span>{t('composer.speedFast')}</span>
        {codexSpeedMode === 'fast' && <span className="codicon codicon-check check-mark" />}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        className="selector-button config-button"
        onClick={handleToggle}
        title={t('settings.configure', 'Configure')}
      >
        <span className="codicon codicon-settings" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="selector-dropdown"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            zIndex: 10000,
            minWidth: '200px'
          }}
        >
          {/* Agent Item (Disabled) */}
          <div
            className="selector-option"
            onMouseEnter={() => setActiveSubmenu('agent')}
            onMouseLeave={() => setActiveSubmenu('none')}
            style={{ position: 'relative' }}
          >
            <AgentIcon
              icon={selectedAgent?.icon}
              seed={selectedAgent?.id || selectedAgent?.name}
              fallback="codicon-robot"
              className="selector-option-agent-icon"
              size={16}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span>{t('settings.agent.title')}</span>
              {selectedAgent?.name ? (
                <span className="model-description" style={{ fontStyle: 'normal' }}>
                  {selectedAgent.name}
                </span>
              ) : null}
            </div>
            <div 
              style={{ 
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'stretch',
                paddingLeft: '12px',
                cursor: 'pointer'
              }}
            >
              <span className="codicon codicon-chevron-right" style={{ fontSize: '12px' }} />
            </div>

            {activeSubmenu === 'agent' && renderAgentSubmenu()}
          </div>

          {!isCodexProvider && (
            <>
              {/* Divider */}
              <div style={{ height: 1, background: 'var(--dropdown-border)', margin: '4px 0', opacity: 0.5 }} />

              {/* Streaming Switch Item */}
              <div
                className="selector-option selector-option-streaming-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  onStreamingEnabledChange?.(!streamingEnabled);
                }}
                onMouseEnter={() => setActiveSubmenu('none')}
                style={{ justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="codicon codicon-sync" />
                  <span>{t('settings.basic.streaming.label')}</span>
                </div>
                <Switch
                  size="small"
                  checked={streamingEnabled ?? true}
                  onClick={(checked, e) => {
                     e.stopPropagation();
                     onStreamingEnabledChange?.(checked);
                  }}
                />
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--dropdown-border)', margin: '4px 0', opacity: 0.5 }} />

              {/* Thinking Switch Item */}
              <div
                className="selector-option selector-option-thinking-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleThinking?.(!alwaysThinkingEnabled);
                }}
                onMouseEnter={() => setActiveSubmenu('none')}
                style={{ justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="codicon codicon-lightbulb" />
                  <span>{t('common.thinking')}</span>
                </div>
                <Switch
                  size="small"
                  checked={alwaysThinkingEnabled ?? false}
                  onClick={(checked, e) => {
                     e.stopPropagation();
                     onToggleThinking?.(checked);
                  }}
                />
              </div>
            </>
          )}

          {isCodexProvider && (
            <>
              <div style={{ height: 1, background: 'var(--dropdown-border)', margin: '4px 0', opacity: 0.5 }} />
              <div
                className="selector-option selector-option-plan-mode"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlanModeToggle(!isPlanModeEnabled);
                }}
                onMouseEnter={() => setActiveSubmenu('none')}
                style={{ justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="codicon codicon-git-branch" />
                  <span>{t('composer.planModeToggle')}</span>
                </div>
                <Switch
                  size="small"
                  checked={isPlanModeEnabled}
                  disabled={!onSelectCollaborationMode}
                  onClick={(checked, e) => {
                     e.stopPropagation();
                     handlePlanModeToggle(checked);
                  }}
                />
              </div>
            </>
          )}

          {isCodexProvider && (
            <>
              <div style={{ height: 1, background: 'var(--dropdown-border)', margin: '4px 0', opacity: 0.5 }} />
              <div
                className="selector-option selector-option-speed"
                onMouseEnter={() => setActiveSubmenu('speed')}
                onMouseLeave={() => setActiveSubmenu('none')}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubmenu('speed');
                }}
                style={{ position: 'relative' }}
              >
                <span className="codicon codicon-zap" />
                <span>{t('composer.speed')}</span>
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    alignSelf: 'stretch',
                    paddingLeft: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <span className="codicon codicon-chevron-right" style={{ fontSize: '12px' }} />
                </div>
                {activeSubmenu === 'speed' && renderSpeedSubmenu()}
              </div>
            </>
          )}

          {supportsReviewQuickAction && (
            <>
              <div style={{ height: 1, background: 'var(--dropdown-border)', margin: '4px 0', opacity: 0.5 }} />
              {supportsForkQuickAction && (
                <div
                  className="selector-option selector-option-fork-quick"
                  onMouseEnter={() => setActiveSubmenu('none')}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleForkQuickStart();
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="codicon codicon-git-branch-create" />
                  <span>{t('composer.forkQuickAction')}</span>
                </div>
              )}
              <div
                className="selector-option selector-option-review-quick"
                onMouseEnter={() => setActiveSubmenu('none')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCodexReviewQuickStart();
                }}
                style={{ cursor: 'pointer' }}
              >
                <span className="codicon codicon-search" />
                <span>{t('composer.reviewQuickAction')}</span>
              </div>
            </>
          )}

          {isCodexProvider && (
            <>
              <div style={{ height: 1, background: 'var(--dropdown-border)', margin: '4px 0', opacity: 0.5 }} />
              <div
                className="selector-option selector-option-live-usage"
                onMouseEnter={() => setActiveSubmenu('usage')}
                onMouseLeave={() => setActiveSubmenu('none')}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubmenu('usage');
                }}
                style={{ position: 'relative' }}
              >
                <span className="codicon codicon-pulse" />
                <span>{t('composer.liveUsage')}</span>
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    alignSelf: 'stretch',
                    paddingLeft: '12px',
                    cursor: 'pointer',
                  }}
                  title={t('home.usageSnapshot')}
                >
                  <span className="codicon codicon-chevron-right" style={{ fontSize: '12px' }} />
                </div>
                {activeSubmenu === 'usage' && renderUsageSubmenu()}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
