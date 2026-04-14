import Prism, { type Grammar } from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-c";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-css";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-go";
import "prismjs/components/prism-git";
import "prismjs/components/prism-groovy";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
import "prismjs/components/prism-properties";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-yaml";
import { resolvePreviewLanguageFromPath } from "./fileLanguageRegistry";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Defense-in-depth sanitizer for Prism.highlight output.
 * Prism only emits `<span class="token ...">` tags with HTML-escaped content,
 * but we strip anything unexpected as a safety net against potential Prism bugs.
 */
function sanitizePrismHtml(html: string): string {
  return html
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, "")
    .replace(/\bon\w+\s*=/gi, "data-removed=");
}

export function languageFromPath(path?: string | null) {
  return resolvePreviewLanguageFromPath(path);
}

export function highlightLine(text: string, language?: string | null) {
  if (!language || !(Prism.languages as Record<string, unknown>)[language]) {
    return escapeHtml(text);
  }
  return sanitizePrismHtml(
    Prism.highlight(text, Prism.languages[language] as Grammar, language),
  );
}
