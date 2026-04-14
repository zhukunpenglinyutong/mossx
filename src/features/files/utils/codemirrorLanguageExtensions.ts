import { type Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown as cmMarkdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { java } from "@codemirror/lang-java";
import { properties as propertiesMode } from "@codemirror/legacy-modes/mode/properties";
import { groovy as groovyMode } from "@codemirror/legacy-modes/mode/groovy";
import { sql as sqlMode } from "@codemirror/legacy-modes/mode/sql";
import { toml as tomlMode } from "@codemirror/legacy-modes/mode/toml";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { kotlin as kotlinMode } from "@codemirror/legacy-modes/mode/clike";
import {
  resolveEditorLanguageFromPath,
  type EditorLanguageId,
} from "../../../utils/fileLanguageRegistry";

const EDITOR_EXTENSIONS_BY_LANGUAGE: Record<EditorLanguageId, Extension[]> = {
  javascript: [javascript()],
  "javascript-jsx": [javascript({ jsx: true })],
  typescript: [javascript({ typescript: true })],
  "typescript-jsx": [javascript({ jsx: true, typescript: true })],
  json: [json()],
  html: [html()],
  css: [css()],
  markdown: [cmMarkdown()],
  python: [python()],
  rust: [rust()],
  xml: [xml()],
  yaml: [yaml()],
  java: [java()],
  groovy: [StreamLanguage.define(groovyMode)],
  kotlin: [StreamLanguage.define(kotlinMode)],
  properties: [StreamLanguage.define(propertiesMode)],
  sql: [StreamLanguage.define(sqlMode({}))],
  toml: [StreamLanguage.define(tomlMode)],
  shell: [StreamLanguage.define(shellMode)],
};

export function codeMirrorExtensionsForEditorLanguage(
  editorLanguage: EditorLanguageId | null | undefined,
): Extension[] {
  if (!editorLanguage) {
    return [];
  }
  return EDITOR_EXTENSIONS_BY_LANGUAGE[editorLanguage] ?? [];
}

export function codeMirrorExtensionsForPath(filePath: string): Extension[] {
  const editorLanguage = resolveEditorLanguageFromPath(filePath);
  return codeMirrorExtensionsForEditorLanguage(editorLanguage);
}
