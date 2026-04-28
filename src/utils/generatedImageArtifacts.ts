import { convertFileSrc } from "@tauri-apps/api/core";

const IMAGE_FILE_EXTENSION_REGEX =
  /\.(png|jpe?g|gif|webp|bmp|tiff?|svg|ico|avif)(?:[?#].*)?$/i;
const IMAGE_FILE_EXTENSION_PATTERN =
  "(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico|avif)";

export type GeneratedImageArtifactStatus =
  | "processing"
  | "completed"
  | "degraded";

export type GeneratedImageArtifactImage = {
  src: string;
  localPath?: string | null;
};

export type ResolvedGeneratedImageArtifact = {
  status: GeneratedImageArtifactStatus;
  promptText?: string;
  fallbackText?: string;
  images: GeneratedImageArtifactImage[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function safeDecodePathToken(token: string) {
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}

function decodeLocalPathValue(value: string) {
  return value
    .split(/([\\/])/)
    .map((token) =>
      token === "/" || token === "\\" ? token : safeDecodePathToken(token),
    )
    .join("");
}

function stripSourceSuffix(value: string) {
  return value.replace(/[?#].*$/, "");
}

function appendImageSourceCandidate(candidate: string, collector: string[]) {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return;
  }
  collector.push(trimmed);
  const compact = trimmed.replace(/\s+/g, "");
  if (
    !trimmed.startsWith("data:image/") &&
    /^[A-Za-z0-9+/=]{64,}$/.test(compact) &&
    compact.length % 4 === 0
  ) {
    collector.push(`data:image/png;base64,${compact}`);
  }
}

function stringifyUnknown(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return asString(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeToolName(value: string) {
  return value.trim().toLowerCase();
}

export function isGeneratedImageToolName(value: string) {
  const normalized = normalizeToolName(value);
  return (
    normalized === "imagegen" ||
    normalized === "image_gen" ||
    normalized === "image-gen"
  );
}

export function extractGeneratedImagePromptText(
  argumentsPayload: unknown,
): string | undefined {
  if (typeof argumentsPayload === "string") {
    const trimmed = argumentsPayload.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return extractGeneratedImagePromptText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (Array.isArray(argumentsPayload)) {
    for (const entry of argumentsPayload) {
      const prompt = extractGeneratedImagePromptText(entry);
      if (prompt) {
        return prompt;
      }
    }
    return undefined;
  }
  const record = asRecord(argumentsPayload);
  if (!record) {
    return undefined;
  }
  for (const key of [
    "prompt",
    "prompt_text",
    "promptText",
    "revised_prompt",
    "revisedPrompt",
    "description",
    "query",
    "text",
    "input",
  ]) {
    const value = asString(record[key]).trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function toImageLocalPath(rawPath: string): string {
  const decoded = stripSourceSuffix(decodeLocalPathValue(rawPath.trim()));
  if (!decoded) {
    return "";
  }
  if (decoded.startsWith("file://")) {
    const withoutScheme = decoded.slice("file://".length);
    const isLocalhostFileUrl = withoutScheme.startsWith("localhost/");
    const withoutHost = isLocalhostFileUrl
      ? withoutScheme.slice("localhost/".length)
      : withoutScheme;
    if (/^\/[A-Za-z]:[\\/]/.test(withoutHost)) {
      return withoutHost.slice(1);
    }
    if (/^[A-Za-z]:[\\/]/.test(withoutHost)) {
      return withoutHost;
    }
    if (withoutHost.startsWith("/")) {
      return withoutHost;
    }
    return isLocalhostFileUrl ? `/${withoutHost}` : `//${withoutHost}`;
  }
  if (
    decoded.startsWith("/") ||
    decoded.startsWith("./") ||
    decoded.startsWith("../") ||
    decoded.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/.test(decoded) ||
    /^\\\\[^\\]/.test(decoded)
  ) {
    return decoded;
  }
  return "";
}

function resolveGeneratedImagePreviewSrc(rawPath: string): string {
  const directSource = rawPath.trim();
  if (!directSource) {
    return "";
  }
  if (
    directSource.startsWith("http://") ||
    directSource.startsWith("https://") ||
    directSource.startsWith("data:") ||
    directSource.startsWith("asset://")
  ) {
    return IMAGE_FILE_EXTENSION_REGEX.test(directSource) ||
      directSource.startsWith("data:image/")
      ? directSource
      : "";
  }
  const normalizedPath = toImageLocalPath(directSource);
  if (!normalizedPath) {
    return "";
  }
  if (!IMAGE_FILE_EXTENSION_REGEX.test(normalizedPath)) {
    return "";
  }
  try {
    return convertFileSrc(normalizedPath);
  } catch {
    return "";
  }
}

function getDirectStringField(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function resolvePreferredInlineImageSource(
  record: Record<string, unknown>,
): string | null {
  const inlineDataSource = getDirectStringField(record, [
    "data",
    "result",
    "b64_json",
    "b64Json",
    "base64",
  ]);
  if (inlineDataSource) {
    return inlineDataSource;
  }
  return getDirectStringField(record, [
    "saved_path",
    "savedPath",
    "local_path",
    "localPath",
    "file_path",
    "filePath",
    "image_url",
    "imageUrl",
    "url",
    "src",
    "path",
  ]);
}

function resolveInlineImageArtifactFromRecord(
  record: Record<string, unknown>,
): GeneratedImageArtifactImage | null {
  const inlineSource = resolvePreferredInlineImageSource(record);
  if (!inlineSource) {
    return null;
  }
  const inlineCandidates: string[] = [];
  appendImageSourceCandidate(inlineSource, inlineCandidates);
  const previewSrc = inlineCandidates
    .map((candidate) => resolveGeneratedImagePreviewSrc(candidate))
    .find(Boolean);
  if (!previewSrc) {
    return null;
  }
  const localSource = getDirectStringField(record, [
    "saved_path",
    "savedPath",
    "local_path",
    "localPath",
    "file_path",
    "filePath",
    "path",
  ]);
  const localPath = localSource ? toImageLocalPath(localSource) : "";
  return {
    src: previewSrc,
    localPath:
      localPath &&
      !localPath.startsWith("http://") &&
      !localPath.startsWith("https://") &&
      !localPath.startsWith("data:") &&
      !localPath.startsWith("asset://")
        ? localPath
        : undefined,
  };
}

function collectImageSourceCandidatesFromUnknown(
  value: unknown,
  collector: string[],
): void {
  if (typeof value === "string") {
    appendImageSourceCandidate(value, collector);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) =>
      collectImageSourceCandidatesFromUnknown(entry, collector),
    );
    return;
  }
  const record = asRecord(value);
  if (!record) {
    return;
  }
  const preferredInlineSource = resolvePreferredInlineImageSource(record);
  if (preferredInlineSource) {
    appendImageSourceCandidate(preferredInlineSource, collector);
    return;
  }
  const prioritizedKeys = ["image_url", "imageUrl", "url", "src", "path", "data"];
  prioritizedKeys.forEach((key) => {
    if (key in record) {
      collectImageSourceCandidatesFromUnknown(record[key], collector);
    }
  });
  Object.values(record).forEach((entry) => {
    collectImageSourceCandidatesFromUnknown(entry, collector);
  });
}

function extractImageSourcesFromPayloadText(payload: string): string[] {
  const candidates: string[] = [];
  const trimmed = payload.trim();
  if (!trimmed) {
    return candidates;
  }
  const compact = trimmed.replace(/\s+/g, "");
  const dataUrlMatch = trimmed.match(
    /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/,
  );
  if (dataUrlMatch?.[0]) {
    candidates.push(dataUrlMatch[0]);
  }
  if (/^[A-Za-z0-9+/=]{64,}$/.test(compact) && compact.length % 4 === 0) {
    candidates.push(`data:image/png;base64,${compact}`);
  }
  const urlMatches = trimmed.match(
    /https?:\/\/[^\s"'()]+?\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|ico|avif)(?:[?#][^\s"'()]*)?/gi,
  );
  if (urlMatches?.length) {
    candidates.push(...urlMatches);
  }
  candidates.push(...extractLocalImagePathCandidates(trimmed));
  try {
    collectImageSourceCandidatesFromUnknown(JSON.parse(trimmed), candidates);
  } catch {
    // ignore non-json payloads
  }
  return candidates;
}

function extractLocalImagePathCandidates(payloadText: string): string[] {
  const pathBodyPattern = String.raw`[^\n"'<>]+?\.${IMAGE_FILE_EXTENSION_PATTERN}`;
  const suffixPattern = String.raw`(?:[?#][^\s"'<>]*)?`;
  const patterns = [
    new RegExp(String.raw`file://${pathBodyPattern}${suffixPattern}`, "gi"),
    new RegExp(String.raw`[A-Za-z]:[\\/]${pathBodyPattern}${suffixPattern}`, "g"),
    new RegExp(String.raw`(?:\\\\|//)${pathBodyPattern}${suffixPattern}`, "g"),
    new RegExp(
      String.raw`/(?:Users|home|tmp|var|opt|private|mnt|Volumes)/${pathBodyPattern}${suffixPattern}`,
      "g",
    ),
  ];
  return patterns.flatMap((pattern) => payloadText.match(pattern) ?? []);
}

function normalizeFallbackText(rawStatus: string, outputText: string): string | undefined {
  const output = outputText.trim();
  if (output) {
    return output;
  }
  const status = rawStatus.trim();
  return status || undefined;
}

function resolveArtifactStatus(
  rawStatus: string,
  images: GeneratedImageArtifactImage[],
): GeneratedImageArtifactStatus {
  if (images.length > 0) {
    return "completed";
  }
  const normalized = rawStatus.trim().toLowerCase();
  if (
    normalized === "completed" ||
    normalized === "success" ||
    normalized === "succeeded" ||
    normalized === "done" ||
    normalized === "failed" ||
    normalized === "error"
  ) {
    return "degraded";
  }
  return "processing";
}

export function resolveGeneratedImageArtifact(
  rawStatus: string,
  argumentsPayload: unknown,
  outputPayload: unknown,
): ResolvedGeneratedImageArtifact {
  const promptText = extractGeneratedImagePromptText(argumentsPayload);
  const dedupedImages: GeneratedImageArtifactImage[] = [];
  const seen = new Set<string>();
  const inlineArtifacts = [outputPayload, argumentsPayload]
    .map((payload) => {
      const record = asRecord(payload);
      return record ? resolveInlineImageArtifactFromRecord(record) : null;
    })
    .filter((artifact): artifact is GeneratedImageArtifactImage => Boolean(artifact));
  const imageCandidates =
    inlineArtifacts.length > 0
      ? []
      : [
          ...extractImageSourcesFromPayloadText(stringifyUnknown(outputPayload)),
          ...extractImageSourcesFromPayloadText(stringifyUnknown(argumentsPayload)),
        ];
  [...inlineArtifacts].forEach((image) => {
    if (!image.src || seen.has(image.src)) {
      return;
    }
    seen.add(image.src);
    dedupedImages.push(image);
  });
  imageCandidates.forEach((candidate) => {
    const previewSrc = resolveGeneratedImagePreviewSrc(candidate);
    if (!previewSrc || seen.has(previewSrc)) {
      return;
    }
    seen.add(previewSrc);
    const localPath = toImageLocalPath(candidate);
    dedupedImages.push({
      src: previewSrc,
      localPath:
        localPath &&
        !localPath.startsWith("http://") &&
        !localPath.startsWith("https://") &&
        !localPath.startsWith("data:") &&
        !localPath.startsWith("asset://")
          ? localPath
          : undefined,
    });
  });
  const fallbackText = normalizeFallbackText(rawStatus, stringifyUnknown(outputPayload));
  return {
    status: resolveArtifactStatus(rawStatus, dedupedImages),
    promptText,
    fallbackText,
    images: dedupedImages,
  };
}
