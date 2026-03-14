import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { highlightLine } from "../../../utils/syntax";

type FileMarkdownPreviewProps = {
  value: string;
  className?: string;
};

type PreviewPreNode = {
  children?: Array<{
    tagName?: string;
    properties?: { className?: string[] | string };
    children?: Array<{ value?: string }>;
  }>;
};

type MermaidRenderState =
  | { status: "idle" }
  | { status: "rendering" }
  | { status: "success"; svg: string }
  | { status: "error"; message: string };

type FrontmatterField = {
  key: string;
  value: string;
};

function extractLanguageTag(className?: string) {
  if (!className) {
    return null;
  }
  const match = className.match(/language-([\w-]+)/i);
  return match?.[1] ?? null;
}

function extractCodeFromPre(node?: PreviewPreNode) {
  const codeNode = node?.children?.find((child) => child.tagName === "code");
  const className = codeNode?.properties?.className;
  const normalizedClassName = Array.isArray(className)
    ? className.join(" ")
    : className;
  const value =
    codeNode?.children?.map((child) => child.value ?? "").join("") ?? "";
  return {
    className: normalizedClassName,
    value: value.replace(/\n$/, ""),
  };
}

function detectMermaidTheme(): "dark" | "default" {
  const dataTheme = document.documentElement.dataset.theme;
  if (dataTheme === "light") return "default";
  if (dataTheme === "dark" || dataTheme === "dim") return "dark";
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "default";
  }
  return "dark";
}

function normalizeFrontmatterValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => normalizeFrontmatterValue(item))
      .filter(Boolean)
      .join(" · ");
  }
  return trimmed;
}

function extractFrontmatter(value: string): {
  fields: FrontmatterField[];
  body: string;
} {
  const match = value.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) {
    return { fields: [], body: value };
  }

  const rawFields = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fields = rawFields
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        return null;
      }
      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      return {
        key,
        value: normalizeFrontmatterValue(rawValue),
      };
    })
    .filter((field): field is FrontmatterField => Boolean(field));

  return {
    fields,
    body: value.slice(match[0].length),
  };
}

function FileMarkdownCodeBlock({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  const languageTag = extractLanguageTag(className);
  const highlightedHtml = useMemo(
    () => highlightLine(value, languageTag),
    [languageTag, value],
  );

  return (
    <div className="fvp-file-markdown-codeblock">
      {languageTag ? (
        <div className="fvp-file-markdown-codeblock-label">{languageTag}</div>
      ) : null}
      <pre>
        <code
          className={className}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

function FileMarkdownMermaidBlock({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  const [activeTab, setActiveTab] = useState<"source" | "render">("source");
  const [renderState, setRenderState] = useState<MermaidRenderState>({
    status: "idle",
  });
  const [renderKey, setRenderKey] = useState(0);
  const idRef = useRef(`file-mermaid-${crypto.randomUUID()}`);
  const highlightedHtml = useMemo(() => highlightLine(value, "mermaid"), [value]);

  useEffect(() => {
    if (activeTab !== "render") {
      return;
    }

    let cancelled = false;
    setRenderState({ status: "rendering" });

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: detectMermaidTheme(),
          securityLevel: "strict",
          fontFamily:
            "ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
        });

        const id = `${idRef.current}-${renderKey}-${Date.now()}`;
        const { svg } = await mermaid.render(id, value);
        if (!cancelled) {
          setRenderState({ status: "success", svg });
        }
      } catch (error) {
        if (!cancelled) {
          setRenderState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, renderKey, value]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "data-theme") {
          setRenderKey((prev) => prev + 1);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="fvp-file-markdown-codeblock fvp-file-markdown-mermaid">
      <div className="fvp-file-markdown-codeblock-label">
        <span>Mermaid</span>
        <div className="fvp-file-markdown-mermaid-tabs" role="tablist" aria-label="Mermaid block view">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "source"}
            className={`fvp-file-markdown-mermaid-tab${activeTab === "source" ? " is-active" : ""}`}
            onClick={() => setActiveTab("source")}
          >
            Source
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "render"}
            className={`fvp-file-markdown-mermaid-tab${activeTab === "render" ? " is-active" : ""}`}
            onClick={() => setActiveTab("render")}
          >
            Render
          </button>
        </div>
      </div>

      {activeTab === "source" ? (
        <pre>
          <code
            className={className}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      ) : renderState.status === "success" ? (
        <div
          className="fvp-file-markdown-mermaid-diagram"
          data-testid="file-markdown-mermaid-preview"
          dangerouslySetInnerHTML={{ __html: renderState.svg }}
        />
      ) : renderState.status === "error" ? (
        <div className="fvp-file-markdown-mermaid-status fvp-file-markdown-mermaid-error">
          Render failed: {renderState.message}
        </div>
      ) : (
        <div className="fvp-file-markdown-mermaid-status">
          Rendering diagram...
        </div>
      )}
    </div>
  );
}

export function FileMarkdownPreview({
  value,
  className = "fvp-file-markdown",
}: FileMarkdownPreviewProps) {
  const frontmatter = useMemo(() => extractFrontmatter(value), [value]);
  const rehypePlugins = useMemo(
    () => [
      rehypeRaw,
      [rehypeSanitize, {
        ...defaultSchema,
        tagNames: [
          ...(defaultSchema.tagNames ?? []),
          "details",
          "summary",
          "abbr",
          "mark",
          "ins",
          "del",
          "sub",
          "sup",
          "kbd",
          "var",
          "samp",
        ],
        attributes: {
          ...defaultSchema.attributes,
          "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "class"],
        },
      }],
    ] as Parameters<typeof ReactMarkdown>[0]["rehypePlugins"],
    [],
  );

  const handleAnchorClick = useCallback((event: MouseEvent, href?: string) => {
    if (!href) {
      return;
    }
    const isExternal =
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:");
    if (!isExternal) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void openUrl(href);
  }, []);

  const components = useMemo<Components>(() => ({
    a: ({ href, children }) => (
      <a href={href} onClick={(event) => handleAnchorClick(event, href)}>
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="fvp-file-markdown-table-wrap">
        <table>{children}</table>
      </div>
    ),
    pre: ({ node, children }) => {
      const { className: codeClassName, value: codeValue } = extractCodeFromPre(
        node as PreviewPreNode,
      );
      if (!codeClassName && !codeValue) {
        return <pre>{children}</pre>;
      }
      if (extractLanguageTag(codeClassName) === "mermaid") {
        return (
          <FileMarkdownMermaidBlock
            className={codeClassName}
            value={codeValue}
          />
        );
      }
      return (
        <FileMarkdownCodeBlock
          className={codeClassName}
          value={codeValue}
        />
      );
    },
  }), [handleAnchorClick]);

  return (
    <div className={className} data-testid="file-markdown-preview">
      {frontmatter.fields.length > 0 ? (
        <section className="fvp-file-markdown-frontmatter" data-testid="file-markdown-frontmatter">
          <div className="fvp-file-markdown-frontmatter-label">Metadata</div>
          <dl className="fvp-file-markdown-frontmatter-grid">
            {frontmatter.fields.map((field) => (
              <div key={field.key} className="fvp-file-markdown-frontmatter-row">
                <dt>{field.key}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {frontmatter.body}
      </ReactMarkdown>
    </div>
  );
}
