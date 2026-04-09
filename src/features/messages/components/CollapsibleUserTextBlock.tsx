import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import FileIcon from "../../../components/FileIcon";

type CollapsibleUserTextBlockProps = {
  content: string;
};

const MAX_COLLAPSED_HEIGHT = 160;

type UserReferenceSegment = {
  path: string;
  displayName: string;
  parentPath: string;
  isDirectory: boolean;
};

function isTokenBoundary(char: string | undefined) {
  if (!char) {
    return true;
  }
  return /\s/.test(char) || /[([{"'`，。！？；：、（）【】《》“”‘’]/.test(char);
}

function isQuoteChar(char: string | undefined) {
  return char === '"' || char === "'";
}

function splitTrailingPunctuation(token: string) {
  const suffixMatch = token.match(/[),.;!?，。；：！？、）】》”’"'`]+$/);
  if (!suffixMatch) {
    return { body: token, suffix: "" };
  }
  const suffix = suffixMatch[0] ?? "";
  return {
    body: token.slice(0, token.length - suffix.length),
    suffix,
  };
}

function normalizeReferencePath(tokenPath: string) {
  const trimmed = tokenPath.trim();
  if (!trimmed) {
    return "";
  }
  if (!trimmed.startsWith("file://")) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "file:") {
      return trimmed;
    }
    const decodedPath = decodeURIComponent(url.pathname || "");
    const normalizedPath = decodedPath.replace(/\\/g, "/");
    const hostname = (url.hostname || "").trim();

    if (/^\/[A-Za-z]:\//.test(normalizedPath)) {
      return normalizedPath.slice(1);
    }
    if (/^[A-Za-z]:\//.test(normalizedPath)) {
      return normalizedPath;
    }
    if (hostname && hostname !== "localhost") {
      return `//${hostname}${normalizedPath}`;
    }
    return normalizedPath;
  } catch {
    const withoutScheme = trimmed.slice("file://".length);
    const decoded = decodeURIComponent(withoutScheme);
    if (/^\/[A-Za-z]:\//.test(decoded)) {
      return decoded.slice(1);
    }
    return decoded;
  }
}

function isLikelyPath(path: string) {
  return /^(?:\/|~\/|\.{1,2}\/|[A-Za-z]:[\\/]|\\\\|\/\/)/.test(path);
}

function stripLineSuffix(path: string) {
  const withoutHashLine = path.replace(/#L?\d+(?:C\d+)?(?:-\d+)?$/i, "");
  return withoutHashLine.replace(/:(\d+)(?::\d+)?$/g, "");
}

function getPathParts(path: string) {
  const normalized = stripLineSuffix(path).replace(/\\/g, "/");
  const hadTrailingSlash = /\/$/.test(normalized);
  const clean = normalized.replace(/\/+$/, "");
  const segments = clean.split("/").filter(Boolean);
  const baseName = segments[segments.length - 1] ?? clean;
  const parentPath = segments.length > 1 ? clean.slice(0, clean.length - baseName.length - 1) : "";
  return { baseName, parentPath, hadTrailingSlash };
}

function isExtractablePathCandidate(path: string) {
  if (!path || !isLikelyPath(path)) {
    return false;
  }
  const { baseName, hadTrailingSlash } = getPathParts(path);
  if (!baseName) {
    return hadTrailingSlash;
  }

  if (hadTrailingSlash) {
    return true;
  }

  if (baseName.includes(".")) {
    const extension = baseName.split(".").pop() ?? "";
    return /^[A-Za-z0-9_-]{1,16}$/.test(extension);
  }

  return !/\s/.test(baseName);
}

function findReferenceTokenEnd(content: string, atIndex: number) {
  let end = atIndex + 1;
  while (end < content.length) {
    const char = content[end] ?? "";
    if (char === "\n" || char === "\r" || char === "\t") {
      break;
    }
    if (char === "@") {
      const prevChar = end > 0 ? content[end - 1] : undefined;
      if (isTokenBoundary(prevChar)) {
        break;
      }
    }
    end += 1;
  }
  return end;
}

function resolveReferenceToken(rawToken: string) {
  let bestMatch: { normalizedPath: string; suffix: string; consumedLength: number } | null = null;
  const windowToken = rawToken.trimEnd();

  for (let candidateEnd = 1; candidateEnd <= windowToken.length; candidateEnd += 1) {
    const candidateToken = windowToken.slice(0, candidateEnd);
    const { body, suffix } = splitTrailingPunctuation(candidateToken);
    const normalizedPath = normalizeReferencePath(body);
    if (!isExtractablePathCandidate(normalizedPath)) {
      continue;
    }
    bestMatch = {
      normalizedPath,
      suffix,
      consumedLength: candidateEnd,
    };
  }

  return bestMatch;
}

function parseQuotedReferenceToken(content: string, atIndex: number) {
  const quoteChar = content[atIndex + 1];
  if (!isQuoteChar(quoteChar)) {
    return null;
  }

  let cursor = atIndex + 2;
  while (cursor < content.length) {
    const currentChar = content[cursor] ?? "";
    const previousChar = cursor > atIndex + 2 ? content[cursor - 1] : undefined;
    if (currentChar === quoteChar && previousChar !== "\\") {
      break;
    }
    cursor += 1;
  }

  if (cursor >= content.length || content[cursor] !== quoteChar) {
    return null;
  }

  const quotedBody = content.slice(atIndex + 2, cursor);
  const normalizedPath = normalizeReferencePath(quotedBody);
  if (!isExtractablePathCandidate(normalizedPath)) {
    return null;
  }

  let suffixEnd = cursor + 1;
  while (suffixEnd < content.length) {
    const char = content[suffixEnd] ?? "";
    if (/\s/.test(char) || char === "@") {
      break;
    }
    suffixEnd += 1;
  }
  const suffix = content.slice(cursor + 1, suffixEnd);

  return {
    normalizedPath,
    suffix,
    consumedEnd: suffixEnd,
  };
}

function createReferenceSegment(path: string): UserReferenceSegment {
  const { baseName, parentPath, hadTrailingSlash } = getPathParts(path);
  const isDirectory = hadTrailingSlash || !baseName.includes(".");
  const displayName = isDirectory ? `${baseName}/` : baseName;
  return {
    path,
    displayName: displayName || path,
    parentPath,
    isDirectory,
  };
}

function parseUserTextContent(content: string): { plainText: string; references: UserReferenceSegment[] } {
  if (!content) {
    return { plainText: "", references: [] };
  }

  const textParts: string[] = [];
  const references: UserReferenceSegment[] = [];
  const seenPaths = new Set<string>();
  let cursor = 0;
  let index = 0;

  while (index < content.length) {
    if (content[index] !== "@") {
      index += 1;
      continue;
    }

    const previousChar = index > 0 ? content[index - 1] : undefined;
    if (!isTokenBoundary(previousChar)) {
      index += 1;
      continue;
    }

    const quotedToken = parseQuotedReferenceToken(content, index);
    if (quotedToken) {
      if (cursor < index) {
        textParts.push(content.slice(cursor, index));
      }
      if (quotedToken.suffix) {
        textParts.push(quotedToken.suffix);
      }

      const dedupeKey = quotedToken.normalizedPath.toLowerCase();
      if (!seenPaths.has(dedupeKey)) {
        seenPaths.add(dedupeKey);
        references.push(createReferenceSegment(quotedToken.normalizedPath));
      }

      cursor = quotedToken.consumedEnd;
      index = quotedToken.consumedEnd;
      continue;
    }

    const tokenEnd = findReferenceTokenEnd(content, index);
    const rawToken = content.slice(index + 1, tokenEnd);
    if (!rawToken) {
      index += 1;
      continue;
    }

    const resolvedToken = resolveReferenceToken(rawToken);
    if (!resolvedToken) {
      index += 1;
      continue;
    }
    const { normalizedPath, suffix, consumedLength } = resolvedToken;

    if (cursor < index) {
      textParts.push(content.slice(cursor, index));
    }
    if (suffix) {
      textParts.push(suffix);
    }
    if (consumedLength < rawToken.length) {
      textParts.push(rawToken.slice(consumedLength));
    }

    const dedupeKey = normalizedPath.toLowerCase();
    if (!seenPaths.has(dedupeKey)) {
      seenPaths.add(dedupeKey);
      references.push(createReferenceSegment(normalizedPath));
    }

    cursor = tokenEnd;
    index = tokenEnd;
  }

  if (cursor < content.length) {
    textParts.push(content.slice(cursor));
  }

  return {
    plainText: textParts.join(""),
    references,
  };
}

export const CollapsibleUserTextBlock = memo(function CollapsibleUserTextBlock({
  content,
}: CollapsibleUserTextBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const parsedContent = useMemo(() => parseUserTextContent(content), [content]);

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    const checkHeight = () => {
      if (!contentRef.current) {
        return;
      }
      setIsOverflowing(contentRef.current.scrollHeight > MAX_COLLAPSED_HEIGHT);
    };

    checkHeight();
    const observer = new ResizeObserver(checkHeight);
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [content]);

  return (
    <div className={`user-collapsible-block ${expanded ? "is-expanded" : "is-collapsed"}`}>
      <div
        className="user-collapsible-content"
        ref={contentRef}
        style={{
          maxHeight: expanded || !isOverflowing ? "none" : `${MAX_COLLAPSED_HEIGHT}px`,
          overflow: "hidden",
        }}
      >
        <div className="user-collapsible-text-content">
          <span>{parsedContent.plainText}</span>
        </div>
        {parsedContent.references.length > 0 ? (
          <div className="user-reference-card" aria-label="Referenced files and folders">
            <div className="user-reference-card-title">References</div>
            <div className="user-reference-card-list">
              {parsedContent.references.map((reference) => (
                <div
                  key={reference.path}
                  className="user-reference-card-item"
                  title={reference.path}
                >
                  <span className="user-reference-card-icon" aria-hidden>
                    <FileIcon filePath={reference.path} isFolder={reference.isDirectory} />
                  </span>
                  <span className="user-reference-card-meta">
                    <span className="user-reference-card-name">{reference.displayName}</span>
                    {reference.parentPath ? (
                      <span className="user-reference-card-parent">{reference.parentPath}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!expanded && isOverflowing ? <div className="user-collapsible-overlay" /> : null}
      </div>
      {isOverflowing ? (
        <button
          type="button"
          className="user-collapsible-toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-label={expanded ? t("messages.collapseInput") : t("messages.expandInput")}
        >
          <span className={`codicon codicon-chevron-down${expanded ? " is-expanded" : ""}`} />
        </button>
      ) : null}
    </div>
  );
});
