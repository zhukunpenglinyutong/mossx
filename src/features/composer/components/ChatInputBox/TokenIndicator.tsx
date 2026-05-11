import { useTranslation } from 'react-i18next';
import type { TokenIndicatorProps } from './types';

/**
 * TokenIndicator - Usage ring progress bar component
 * Implemented using SVG dual-circle approach
 */
export const TokenIndicator = ({
  percentage,
  size = 14,
  usedTokens,
  maxTokens,
  claudeContextUsage = null,
}: TokenIndicatorProps) => {
  const { t } = useTranslation();
  // Circle radius (accounting for stroke space)
  const radius = (size - 3) / 2;
  const center = size / 2;

  // Circumference
  const circumference = 2 * Math.PI * radius;
  const resolvedPercentage = typeof percentage === 'number' && isFinite(percentage)
    ? Math.max(percentage, 0)
    : null;
  const clampedPercentage = resolvedPercentage !== null
    ? Math.min(resolvedPercentage, 100)
    : 0;

  // Calculate offset (fill clockwise from top)
  const strokeOffset = circumference * (1 - clampedPercentage / 100);

  // Round percentage to one decimal place, but hide trailing .0
  const formatPercent = (value: number | null) => {
    if (value === null) {
      return '...';
    }
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded)
      ? `${Math.round(rounded)}%`
      : `${rounded.toFixed(1)}%`;
  };

  const formattedPercentage = formatPercent(resolvedPercentage);

  const formatTokens = (value?: number | null) => {
    if (typeof value !== 'number' || !isFinite(value)) return undefined;
    // Always display capacity in k (thousands) units
    // e.g.: 1,000,000 -> 1000k, 500,000 -> 500k
    if (value >= 1_000) {
      const kValue = value / 1_000;
      // If it's a whole number, don't show decimal point
      return Number.isInteger(kValue) ? `${kValue}k` : `${kValue.toFixed(1)}k`;
    }
    return `${value}`;
  };

  const usedText = formatTokens(usedTokens);
  const maxText = formatTokens(maxTokens);
  const totalText = formatTokens(claudeContextUsage?.totalTokens);
  const inputText = formatTokens(claudeContextUsage?.inputTokens);
  const cachedText = formatTokens(claudeContextUsage?.cachedInputTokens);
  const outputText = formatTokens(claudeContextUsage?.outputTokens);
  const claudeUsedText = formatTokens(claudeContextUsage?.usedTokens);
  const claudeMaxText = formatTokens(claudeContextUsage?.contextWindow);
  const claudeUsedPercent = formatPercent(claudeContextUsage?.usedPercent ?? resolvedPercentage);
  const claudeRemainingPercent = formatPercent(claudeContextUsage?.remainingPercent ?? null);
  const claudeFreshness = claudeContextUsage?.freshness ?? 'pending';
  const claudeFreshnessLabel = t(`chat.claudeContextFreshness.${claudeFreshness}`, {
    defaultValue: t('chat.claudeContextFreshness.unknown'),
  });
  const claudeWindowUnavailableLabel = claudeFreshness === 'estimated'
    ? t('chat.claudeContextWindowCapacityPending')
    : t('chat.claudeContextUnavailable');
  const claudeWindowTokensValue = claudeUsedText && claudeMaxText
    ? `${claudeUsedText} / ${claudeMaxText}`
    : claudeUsedText
      ? t(
        claudeFreshness === 'live'
          ? 'chat.claudeContextWindowUsedOnly'
          : 'chat.claudeContextWindowEstimatedTokens',
        { tokens: claudeUsedText },
      )
      : claudeWindowUnavailableLabel;
  const tooltip = usedText && maxText
    ? `${formattedPercentage} · ${usedText} / ${maxText} ${' '}${t('chat.context')}`
    : t('chat.usagePercentage', { percentage: formattedPercentage });
  const claudeTotalBreakdown = [
    inputText ? t('chat.claudeContextInputDetail', { tokens: inputText }) : null,
    outputText ? t('chat.claudeContextOutputDetail', { tokens: outputText }) : null,
  ].filter(Boolean).join(' · ');
  const claudeCachedNote = cachedText
    ? t('chat.claudeContextCachedExcludedDetail', { tokens: cachedText })
    : null;
  const claudeWindowBreakdown = [
    inputText ? t('chat.claudeContextInputDetail', { tokens: inputText }) : null,
    cachedText ? t('chat.claudeContextCachedDetail', { tokens: cachedText }) : null,
  ].filter(Boolean).join(' + ');
  const categoryUsages = claudeContextUsage?.categoryUsages ?? [];
  const categoryRowSplitIndex = Math.ceil(categoryUsages.length / 2);
  const categoryUsageRows = categoryUsages.length > 0
    ? [
      categoryUsages.slice(0, categoryRowSplitIndex),
      categoryUsages.slice(categoryRowSplitIndex),
    ].filter((row) => row.length > 0)
    : [];
  const tokenIndicatorClassName = [
    'token-indicator',
    resolvedPercentage === null ? 'token-indicator--pending' : null,
    claudeContextUsage ? 'token-indicator--claude' : null,
  ].filter(Boolean).join(' ');
  const tooltipClassName = [
    'token-tooltip',
    claudeContextUsage ? 'token-tooltip--claude' : null,
  ].filter(Boolean).join(' ');

  return (
    <div className={tokenIndicatorClassName}>
      <div className="token-indicator-wrap">
        <svg
          className="token-indicator-ring"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background circle */}
          <circle
            className="token-indicator-bg"
            cx={center}
            cy={center}
            r={radius}
          />
          {/* Progress arc */}
          <circle
            className="token-indicator-fill"
            cx={center}
            cy={center}
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
          />
        </svg>
        {/* Hover tooltip */}
        <div className={tooltipClassName}>
          {claudeContextUsage ? (
            <div className="claude-context-tooltip">
              <div className="context-dual-tooltip-title">
                {t('chat.claudeContextTooltipTitle')}
              </div>
              <div className="context-dual-tooltip-grid">
                <div className="context-dual-tooltip-kv context-dual-tooltip-kv--wide context-dual-tooltip-kv--detail">
                  <span className="context-dual-tooltip-key">
                    {t('chat.claudeContextTooltipTotalLabel')}
                  </span>
                  <span className="context-dual-tooltip-value">
                    {totalText ?? t('chat.claudeContextPending')}
                  </span>
                  {claudeTotalBreakdown ? (
                    <span className="context-dual-tooltip-note context-dual-tooltip-note--detail">
                      {claudeTotalBreakdown}
                    </span>
                  ) : null}
                  {claudeCachedNote ? (
                    <span className="context-dual-tooltip-note context-dual-tooltip-note--detail">
                      {claudeCachedNote}
                    </span>
                  ) : null}
                </div>
                <div className="context-dual-tooltip-kv">
                  <span className="context-dual-tooltip-key">
                    {t('chat.contextDualViewTooltipUsedLabel')}
                  </span>
                  <span className="context-dual-tooltip-value">{claudeUsedPercent}</span>
                </div>
                <div className="context-dual-tooltip-kv">
                  <span className="context-dual-tooltip-key">
                    {t('chat.contextDualViewTooltipRemainingLabel')}
                  </span>
                  <span className="context-dual-tooltip-value">{claudeRemainingPercent}</span>
                </div>
                <div className="context-dual-tooltip-kv context-dual-tooltip-kv--wide context-dual-tooltip-kv--detail">
                  <span className="context-dual-tooltip-key">
                    {t('chat.claudeContextTooltipWindowTokensLabel')}
                  </span>
                  <span className="context-dual-tooltip-value">
                    {claudeWindowTokensValue}
                  </span>
                  {claudeWindowBreakdown ? (
                    <span className="context-dual-tooltip-note context-dual-tooltip-note--detail">
                      {claudeWindowBreakdown}
                    </span>
                  ) : null}
                </div>
                {categoryUsages.length > 0 ? (
                  <div className="context-dual-tooltip-kv context-dual-tooltip-kv--wide context-dual-tooltip-kv--detail">
                    <span className="context-dual-tooltip-key">
                      {t('chat.claudeContextCategoryTitle')}
                    </span>
                    <div className="claude-context-category-grid">
                      {categoryUsageRows.map((row, rowIndex) => (
                        <div className="claude-context-category-row" key={`category-row-${rowIndex}`}>
                          {row.map((usage) => {
                            const tokens = formatTokens(usage.tokens) ?? String(usage.tokens);
                            const percent = typeof usage.percent === 'number' && isFinite(usage.percent)
                              ? formatPercent(usage.percent)
                              : null;
                            return (
                              <span className="claude-context-category-item" key={`${usage.name}:${usage.tokens}`}>
                                <span className="claude-context-category-name">{usage.name}</span>
                                <span className="claude-context-category-value">
                                  <span>{tokens}</span>
                                  {percent ? <span>{percent}</span> : null}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="context-dual-tooltip-divider" />
              <div className="context-dual-tooltip-status">
                {claudeFreshnessLabel}
              </div>
            </div>
          ) : (
            tooltip
          )}
        </div>
      </div>
      {resolvedPercentage !== null ? (
        <span className="token-percentage-label">{formattedPercentage}</span>
      ) : null}
    </div>
  );
};

export default TokenIndicator;
