import { Bot } from "lucide-react";
import type { CSSProperties } from "react";
import type { EngineType } from "../../../types";

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

function ClaudeGlyph({ size, className, style }: SvgGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2.8v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 18.2v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M2.8 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18.2 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5.3 5.3l2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16.6 16.6l2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18.7 5.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7.4 16.6l-2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CodexGlyph({ size, className, style }: SvgGlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      aria-hidden
    >
      <path
        d="M12 3.6 18.9 7.6v8.8L12 20.4 5.1 16.4V7.6L12 3.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 3.6v8.4l6.9 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12 5.1 16.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12 18.9 7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12 5.1 7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

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
  switch (engine) {
    case "claude":
      return <ClaudeGlyph size={size} className={className} style={style} />;
    case "codex":
      return <CodexGlyph size={size} className={className} style={style} />;
    case "gemini":
      return <Bot size={size} className={className} style={style} />;
    case "opencode":
      return <OpenCodeGlyph size={size} className={className} style={style} />;
    default:
      return <CodexGlyph size={size} className={className} style={style} />;
  }
}
