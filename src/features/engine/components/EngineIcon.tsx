import type { CSSProperties } from "react";
import type { EngineType } from "../../../types";

// 导入官方模型图标
import claudeIcon from "../../../assets/model-icons/claude.svg";
import geminiIcon from "../../../assets/model-icons/gemini.svg";
import openaiIcon from "../../../assets/model-icons/openai.svg";

type EngineIconProps = {
  engine: EngineType;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

type SvgGlyphProps = {
  size: number;
  className?: string;
  style?: CSSProperties;
};

function OpenCodeGlyph({ size, className, style }: SvgGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      aria-hidden
    >
      <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="m9.4 9.2-2.3 2.4 2.3 2.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12.3 14.2h4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function EngineIcon({
  engine,
  size = 14,
  className,
  style,
}: EngineIconProps) {
  // 官方图标样式
  const iconStyle: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    ...style,
  };

  switch (engine) {
    case "claude":
      return (
        <img
          src={claudeIcon}
          alt="Claude"
          className={className}
          style={iconStyle}
          aria-hidden
        />
      );
    case "codex":
      return (
        <img
          src={openaiIcon}
          alt="OpenAI"
          className={className}
          style={iconStyle}
          aria-hidden
        />
      );
    case "gemini":
      return (
        <img
          src={geminiIcon}
          alt="Gemini"
          className={className}
          style={iconStyle}
          aria-hidden
        />
      );
    case "opencode":
      return <OpenCodeGlyph size={size} className={className} style={style} />;
    default:
      return (
        <img
          src={openaiIcon}
          alt="AI"
          className={className}
          style={iconStyle}
          aria-hidden
        />
      );
  }
}
