/**
 * ContextUsageIndicator - 上下文使用量指示器组件
 *
 * 功能说明（奶奶请看这里）：
 * ─────────────────────────────────────────
 * 这个组件用来显示 AI 对话的"上下文使用量"，就像手机电池电量一样。
 *
 * 什么是"上下文"？
 * - AI 聊天时，它能记住的内容是有限的，就像人的短期记忆一样
 * - 这个限制叫做"上下文窗口"（context window）
 * - 比如 200k 表示能记住 200,000 个"词元"（tokens）
 *
 * 显示的内容：
 * - 百分比：已经用了多少（比如 50% 表示用了一半）
 * - 具体数字：比如 "100k / 200k" 表示用了 10万，总共 20万
 *
 * 颜色含义：
 * - 统一灰白配色，与界面风格保持一致
 * - 深色部分表示剩余空间，浅色部分表示已使用
 * ─────────────────────────────────────────
 */

import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ThreadTokenUsage } from "../../../types";

/**
 * 默认的上下文窗口大小
 * - Claude 模型通常是 200k tokens
 * - 当后端没有提供具体数值时，使用这个默认值
 */
const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * 组件属性定义
 * - contextUsage: 上下文使用量数据（包含当前使用量和总容量）
 */
type ContextUsageIndicatorProps = {
  contextUsage: ThreadTokenUsage | null | undefined;
};

/**
 * 格式化数字为易读的形式
 * 例如：
 * - 1500 → "1.5k"
 * - 200000 → "200k"
 * - 1500000 → "1.5m"
 */
function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    const value = count / 1_000_000;
    // 如果是整数就不显示小数，比如 1m 而不是 1.0m
    return value % 1 === 0 ? `${value}m` : `${value.toFixed(1)}m`;
  }
  if (count >= 1_000) {
    const value = count / 1_000;
    return value % 1 === 0 ? `${value}k` : `${value.toFixed(1)}k`;
  }
  return String(count);
}

/**
 * ContextUsageIndicator 主组件
 *
 * 用 memo 包裹是为了性能优化：
 * - 只有当 contextUsage 数据变化时才重新渲染
 * - 避免不必要的重绘，让界面更流畅
 */
export const ContextUsageIndicator = memo(function ContextUsageIndicator({
  contextUsage,
}: ContextUsageIndicatorProps) {
  const { t } = useTranslation();

  // 计算各种数值
  const computedValues = useMemo(() => {
    // 获取上下文窗口大小（AI 能记住的最大容量）
    // 如果后端没有提供，使用默认值 200k
    const contextWindow = contextUsage?.modelContextWindow ?? DEFAULT_CONTEXT_WINDOW;

    // 计算已使用的 token 数量
    // 重要：上下文使用量 = input_tokens + cached_tokens
    // 不包括 output_tokens（输出不占用上下文窗口，它是生成的）
    const lastInput = contextUsage?.last?.inputTokens ?? 0;
    const lastCached = contextUsage?.last?.cachedInputTokens ?? 0;
    const totalInput = contextUsage?.total?.inputTokens ?? 0;
    const totalCached = contextUsage?.total?.cachedInputTokens ?? 0;

    // 优先使用 last（最近一轮），如果没有则用 total
    const usedTokens = (lastInput + lastCached) > 0
      ? (lastInput + lastCached)
      : (totalInput + totalCached);

    // 计算使用百分比
    const usedPercent = contextWindow > 0
      ? Math.min(Math.max((usedTokens / contextWindow) * 100, 0), 100)
      : 0;

    // 计算剩余百分比（用于进度圈显示）
    const freePercent = 100 - usedPercent;

    return {
      usedTokens,
      contextWindow,
      usedPercent,
      freePercent,
    };
  }, [contextUsage]);

  const { usedTokens, contextWindow, usedPercent, freePercent } = computedValues;

  // ─────────────────────────────────────────
  // 优化点一（奶奶请看）：
  // 当上下文使用量为 0 时，整个指示器不显示
  // 就像手机电量是满的时候，有些手机不会显示电池图标一样
  // ─────────────────────────────────────────
  if (usedTokens === 0) {
    return null; // 返回 null 表示"什么都不渲染"
  }

  // 格式化显示文本
  const usedDisplay = formatTokenCount(usedTokens);
  const totalDisplay = formatTokenCount(contextWindow);
  const percentDisplay = `${Math.round(usedPercent)}%`;

  // 构建完整的显示文本：如 "50% · 100k / 200k 上下文"
  // 这个文本现在只在鼠标悬停时显示（tooltip）
  const fullLabel = `${percentDisplay} · ${usedDisplay} / ${totalDisplay} ${t("composer.context", "上下文")}`;

  // 构建辅助功能描述（给屏幕阅读器用的）
  const ariaLabel = t(
    "composer.contextUsageAriaLabel",
    `上下文使用量：已使用 ${percentDisplay}，${usedDisplay} / ${totalDisplay}`,
  );

  // ─────────────────────────────────────────
  // 优化点二（奶奶请看）：
  // 简化显示 - 只显示一个小圆环
  // 完整信息（百分比、具体数值）放到 tooltip 里
  // 鼠标移上去才能看到详情，界面更简洁
  // ─────────────────────────────────────────
  return (
    <div
      className="context-usage-indicator context-usage-indicator--compact"
      title={fullLabel}
      aria-label={ariaLabel}
      role="status"
    >
      {/* 只显示进度圆环，鼠标悬停显示完整信息 */}
      <div
        className="context-usage-ring"
        style={
          {
            "--context-free": freePercent,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <span className="context-usage-ring-inner" />
      </div>
    </div>
  );
});

export default ContextUsageIndicator;
