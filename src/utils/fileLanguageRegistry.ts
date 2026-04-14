export type EditorLanguageId =
  | "javascript"
  | "javascript-jsx"
  | "typescript"
  | "typescript-jsx"
  | "json"
  | "html"
  | "css"
  | "markdown"
  | "python"
  | "rust"
  | "xml"
  | "yaml"
  | "java"
  | "groovy"
  | "kotlin"
  | "properties"
  | "sql"
  | "toml"
  | "shell";

type LanguageRule = {
  previewLanguage: string | null;
  editorLanguage: EditorLanguageId | null;
};

export type FileLanguageResolution = LanguageRule & {
  matchedBy: "filename" | "extension" | "none";
};

const FILE_NAME_RULES: Array<{ pattern: RegExp; rule: LanguageRule }> = [
  {
    pattern: /^pom\.xml$/i,
    rule: { previewLanguage: "markup", editorLanguage: "xml" },
  },
  {
    pattern: /^application(?:-[a-z0-9_.-]+)?\.properties$/i,
    rule: { previewLanguage: "properties", editorLanguage: "properties" },
  },
  {
    pattern: /^application(?:-[a-z0-9_.-]+)?\.ya?ml$/i,
    rule: { previewLanguage: "yaml", editorLanguage: "yaml" },
  },
  {
    pattern: /^\.gitignore$/i,
    rule: { previewLanguage: "git", editorLanguage: "shell" },
  },
  {
    pattern: /^dockerfile(?:\.[a-z0-9_.-]+)?$/i,
    rule: { previewLanguage: "bash", editorLanguage: "shell" },
  },
  {
    pattern: /^docker-compose(?:\.[a-z0-9_.-]+)?\.ya?ml$/i,
    rule: { previewLanguage: "yaml", editorLanguage: "yaml" },
  },
  {
    pattern: /^\.?envrc$/i,
    rule: { previewLanguage: "bash", editorLanguage: "shell" },
  },
  {
    pattern: /^\.env(?:\.[a-z0-9_.-]+)?$/i,
    rule: { previewLanguage: "ini", editorLanguage: "properties" },
  },
  {
    pattern: /^\.?(?:bashrc|zshrc|kshrc|profile)$/i,
    rule: { previewLanguage: "bash", editorLanguage: "shell" },
  },
  {
    pattern: /^(cargo|uv|poetry)\.lock$/i,
    rule: { previewLanguage: "toml", editorLanguage: "toml" },
  },
];

const EXTENSION_RULES: Record<string, LanguageRule> = {
  bash: { previewLanguage: "bash", editorLanguage: "shell" },
  c: { previewLanguage: "c", editorLanguage: null },
  conf: { previewLanguage: "ini", editorLanguage: "properties" },
  cpp: { previewLanguage: "cpp", editorLanguage: null },
  cs: { previewLanguage: "csharp", editorLanguage: null },
  css: { previewLanguage: "css", editorLanguage: "css" },
  dart: { previewLanguage: "dart", editorLanguage: null },
  gradle: { previewLanguage: "groovy", editorLanguage: "groovy" },
  go: { previewLanguage: "go", editorLanguage: null },
  h: { previewLanguage: "c", editorLanguage: null },
  hpp: { previewLanguage: "cpp", editorLanguage: null },
  html: { previewLanguage: "markup", editorLanguage: "html" },
  ini: { previewLanguage: "ini", editorLanguage: "properties" },
  java: { previewLanguage: "java", editorLanguage: "java" },
  js: { previewLanguage: "javascript", editorLanguage: "javascript" },
  json: { previewLanguage: "json", editorLanguage: "json" },
  jsx: { previewLanguage: "jsx", editorLanguage: "javascript-jsx" },
  kt: { previewLanguage: "kotlin", editorLanguage: null },
  kts: { previewLanguage: "kotlin", editorLanguage: "kotlin" },
  log: { previewLanguage: "text", editorLanguage: null },
  md: { previewLanguage: "markdown", editorLanguage: "markdown" },
  mdx: { previewLanguage: null, editorLanguage: "markdown" },
  mjs: { previewLanguage: "javascript", editorLanguage: "javascript" },
  out: { previewLanguage: "text", editorLanguage: null },
  php: { previewLanguage: "php", editorLanguage: null },
  properties: { previewLanguage: "properties", editorLanguage: "properties" },
  py: { previewLanguage: "python", editorLanguage: "python" },
  rb: { previewLanguage: "ruby", editorLanguage: null },
  rs: { previewLanguage: "rust", editorLanguage: "rust" },
  sass: { previewLanguage: "scss", editorLanguage: "css" },
  scss: { previewLanguage: "scss", editorLanguage: "css" },
  command: { previewLanguage: "bash", editorLanguage: "shell" },
  dash: { previewLanguage: "bash", editorLanguage: "shell" },
  ksh: { previewLanguage: "bash", editorLanguage: "shell" },
  sh: { previewLanguage: "bash", editorLanguage: "shell" },
  sql: { previewLanguage: "sql", editorLanguage: "sql" },
  svg: { previewLanguage: null, editorLanguage: "xml" },
  swift: { previewLanguage: "swift", editorLanguage: null },
  toml: { previewLanguage: "toml", editorLanguage: "toml" },
  trace: { previewLanguage: "text", editorLanguage: null },
  ts: { previewLanguage: "typescript", editorLanguage: "typescript" },
  tsx: { previewLanguage: "tsx", editorLanguage: "typescript-jsx" },
  txt: { previewLanguage: "text", editorLanguage: null },
  err: { previewLanguage: "text", editorLanguage: null },
  vue: { previewLanguage: "markup", editorLanguage: null },
  xml: { previewLanguage: "markup", editorLanguage: "xml" },
  yaml: { previewLanguage: "yaml", editorLanguage: "yaml" },
  yml: { previewLanguage: "yaml", editorLanguage: "yaml" },
  zsh: { previewLanguage: "bash", editorLanguage: "shell" },
  lock: { previewLanguage: "yaml", editorLanguage: "yaml" },
};

function fileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? normalized;
}

export function resolveFileLanguageFromPath(path?: string | null): FileLanguageResolution {
  if (!path) {
    return { previewLanguage: null, editorLanguage: null, matchedBy: "none" };
  }

  const fileName = fileNameFromPath(path);
  const normalizedFileName = fileName.toLowerCase();

  for (const { pattern, rule } of FILE_NAME_RULES) {
    if (pattern.test(normalizedFileName)) {
      return { ...rule, matchedBy: "filename" };
    }
  }

  const dotIndex = normalizedFileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === normalizedFileName.length - 1) {
    return { previewLanguage: null, editorLanguage: null, matchedBy: "none" };
  }
  const ext = normalizedFileName.slice(dotIndex + 1);
  const rule = EXTENSION_RULES[ext];
  if (!rule) {
    return { previewLanguage: null, editorLanguage: null, matchedBy: "none" };
  }
  return { ...rule, matchedBy: "extension" };
}

export function resolvePreviewLanguageFromPath(path?: string | null) {
  return resolveFileLanguageFromPath(path).previewLanguage;
}

export function resolveEditorLanguageFromPath(path?: string | null) {
  return resolveFileLanguageFromPath(path).editorLanguage;
}
