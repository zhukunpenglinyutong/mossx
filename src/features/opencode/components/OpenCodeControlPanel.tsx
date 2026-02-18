import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Activity from "lucide-react/dist/esm/icons/activity";
import Bot from "lucide-react/dist/esm/icons/bot";
import Brain from "lucide-react/dist/esm/icons/brain";
import Cpu from "lucide-react/dist/esm/icons/cpu";
import Github from "lucide-react/dist/esm/icons/github";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import CircleDashed from "lucide-react/dist/esm/icons/circle-dashed";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import { useOpenCodeControlPanel } from "../hooks/useOpenCodeControlPanel";
import { OpenCodeProviderSection } from "./OpenCodeProviderSection";
import { OpenCodeMcpSection } from "./OpenCodeMcpSection";
import { OpenCodeSessionsSection } from "./OpenCodeSessionsSection";
import { OpenCodeAdvancedSection } from "./OpenCodeAdvancedSection";

type OpenCodeControlPanelProps = {
  workspaceId: string | null;
  threadId: string | null;
  selectedModel: string | null;
  selectedAgent: string | null;
  selectedVariant: string | null;
  visible: boolean;
  embedded?: boolean;
  dock?: boolean;
  selectedModelId?: string | null;
  modelOptions?: Array<{ id: string; displayName: string; model: string }>;
  onSelectModel?: (id: string) => void;
  agentOptions?: Array<{ id: string; isPrimary?: boolean }>;
  onSelectAgent?: (agentId: string | null) => void;
  variantOptions?: string[];
  onSelectVariant?: (variant: string | null) => void;
  onProviderStatusToneChange?: (tone: "is-ok" | "is-runtime" | "is-fail") => void;
  onRunOpenCodeCommand?: (command: string) => void;
};

const PROVIDER_DISCONNECT_GRACE_MS = 8000;

function normalizeProviderDisplayName(raw: string) {
  return raw.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeLooseKey(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildProviderAliasKeys(raw: string) {
  const lower = raw.trim().toLowerCase();
  const aliases = new Set<string>();
  const push = (value: string) => {
    const key = normalizeLooseKey(value);
    if (key) aliases.add(key);
  };
  push(lower);
  if (lower.includes("github")) {
    if (lower.includes("github models")) {
      ["githubmodels"].forEach(push);
    }
    if (lower.includes("github copilot")) {
      ["githubcopilot", "copilot"].forEach(push);
    }
    ["github"].forEach(push);
  }
  if (lower.includes("zhipu") || lower.includes("glm")) {
    ["zhipu", "zhipuai", "glm", "zai", "zaicodingplan", "zhipuaicodingplan"].forEach(push);
  }
  if (lower.includes("minimax")) {
    ["minimax", "minimaxcn", "minimaxcodingplan"].forEach(push);
  }
  if (lower.includes("openai") || lower.includes("gpt") || lower.includes("codex")) {
    ["openai", "gpt", "codex", "gpt5", "gpt53codex"].forEach(push);
  }
  if (lower.includes("anthropic") || lower.includes("claude")) {
    ["anthropic", "claude"].forEach(push);
  }
  return Array.from(aliases);
}

function detectProviderBrand(
  raw: string,
): "openai" | "anthropic" | "github" | "zhipu" | "minimax" | "opencode" | "other" {
  const key = raw.trim().toLowerCase();
  if (!key) return "other";
  if (key.includes("opencode")) return "opencode";
  if (key.includes("openai") || key.includes("gpt") || key.includes("codex")) return "openai";
  if (key.includes("anthropic") || key.includes("claude")) return "anthropic";
  if (key.includes("github") || key.includes("copilot")) return "github";
  if (key.includes("zhipu") || key.includes("glm")) return "zhipu";
  if (key.includes("minimax")) return "minimax";
  return "other";
}

function parseModelRank(raw: string) {
  const key = raw.toLowerCase();
  const numberTokens = key.match(/\d+(?:\.\d+)?/g) ?? [];
  const weights = [1_000_000, 10_000, 100, 1];
  const numericRank = numberTokens.slice(0, 4).reduce((sum, token, index) => {
    const value = Number(token);
    return sum + (Number.isFinite(value) ? value * (weights[index] ?? 1) : 0);
  }, 0);
  const latestBonus = key.includes("latest") ? 100_000_000 : 0;
  const stableBonus = key.includes("preview") || key.includes("beta") ? 0 : 10_000;
  return latestBonus + stableBonus + numericRank;
}

function providerMatchesModel(providerText: string, modelLabel: string) {
  const providerBrand = detectProviderBrand(providerText);
  const modelBrand = detectProviderBrand(modelLabel);
  if (providerBrand !== "other" && providerBrand === modelBrand) {
    return true;
  }
  const modelKey = normalizeLooseKey(modelLabel);
  const aliases = buildProviderAliasKeys(providerText);
  return aliases.some((alias) => alias.length > 0 && modelKey.includes(alias));
}

function deriveOpencodeSyntheticProvider(modelLabel: string): string | null {
  const raw = modelLabel.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  let modelName = "";
  if (lower.startsWith("opencode/")) {
    modelName = raw.slice("opencode/".length).trim();
  } else {
    const bracket = raw.match(/^\[opencode\]\s*(.+)$/i);
    if (!bracket) return null;
    modelName = bracket[1]?.trim() ?? "";
  }
  if (!modelName) return null;
  return `opencode ${modelName.toLowerCase()}`;
}

function canonicalProviderLabel(raw: string) {
  const normalized = raw.trim().toLowerCase();
  const brand = detectProviderBrand(normalized);
  if (brand === "github") return "github";
  if (brand === "opencode") return "opencode";
  return normalized;
}

function scoreProviderAgainstModel(providerName: string, modelKey: string, modelBrand: string) {
  const aliases = buildProviderAliasKeys(providerName);
  let bestAliasLen = 0;
  for (const alias of aliases) {
    if (alias.length > 0 && modelKey.includes(alias)) {
      bestAliasLen = Math.max(bestAliasLen, alias.length);
    }
  }
  const brand = detectProviderBrand(providerName);
  const brandBonus = brand !== "other" && brand === modelBrand ? 100 : 0;
  return bestAliasLen + brandBonus;
}

export function OpenCodeControlPanel({
  workspaceId,
  threadId,
  selectedModel,
  selectedAgent,
  selectedVariant,
  visible,
  embedded = false,
  dock = false,
  selectedModelId = null,
  modelOptions = [],
  onSelectModel,
  agentOptions = [],
  onSelectAgent,
  variantOptions = [],
  onSelectVariant,
  onProviderStatusToneChange,
  onRunOpenCodeCommand,
}: OpenCodeControlPanelProps) {
  const [sessionQuery, setSessionQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<"recent" | "favorites">("recent");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"provider" | "mcp" | "sessions" | "advanced">(
    "provider",
  );
  const [authExpanded, setAuthExpanded] = useState(true);
  const [providerStatusHint, setProviderStatusHint] = useState("");
  const providerHintTimersRef = useRef<number[]>([]);
  const lastAnimatedModelRef = useRef<string | null>(null);
  const providerFailSinceRef = useRef<number | null>(null);
  const panelRootRef = useRef<HTMLElement | null>(null);
  const panelToggleRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const [drawerStyle, setDrawerStyle] = useState<CSSProperties | undefined>(undefined);

  const {
    error,
    snapshot,
    providerHealth,
    sessions,
    connectingProvider,
    favoriteSessionIds,
    connectProvider,
    refresh,
    toggleMcpGlobal,
    toggleMcpServer,
    toggleFavoriteSession,
  } = useOpenCodeControlPanel({
    workspaceId,
    threadId,
    selectedModel,
    selectedAgent,
    selectedVariant,
    enabled: visible && detailOpen,
    loadProviderCatalog: false,
  });

  const sessionIdValue = useMemo(() => {
    const snapshotSessionId = snapshot?.sessionId?.trim();
    if (snapshotSessionId) {
      return snapshotSessionId;
    }
    const activeThreadId = threadId?.trim() ?? "";
    if (activeThreadId.startsWith("opencode:")) {
      return activeThreadId.slice("opencode:".length);
    }
    return null;
  }, [snapshot?.sessionId, threadId]);
  const sessionLabel = useMemo(() => {
    if (!sessionIdValue) return "-";
    return sessionIdValue.length > 24 ? `${sessionIdValue.slice(0, 24)}...` : sessionIdValue;
  }, [sessionIdValue]);
  const hasSessionValue = Boolean(sessionIdValue && sessionIdValue !== "-");
  const sortedAgentOptions = useMemo(() => {
    const primary = agentOptions.filter((agent) => agent.isPrimary);
    const others = agentOptions.filter((agent) => !agent.isPrimary);
    return [...primary, ...others];
  }, [agentOptions]);
  const visibleSessions = useMemo(() => {
    const keyword = sessionQuery.trim().toLowerCase();
    const filtered = sessions.filter((item) => {
      if (sessionFilter === "favorites" && !favoriteSessionIds[item.sessionId]) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.sessionId.toLowerCase().includes(keyword) ||
        item.title.toLowerCase().includes(keyword)
      );
    });
    return filtered.slice(0, 8);
  }, [favoriteSessionIds, sessionFilter, sessionQuery, sessions]);

  const normalizeDisplayValue = (value?: string | null) => {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }
    const lower = normalized.toLowerCase();
    if (
      normalized === "-" ||
      lower === "unknown" ||
      lower === "none" ||
      lower === "null" ||
      lower === "undefined"
    ) {
      return null;
    }
    return normalized;
  };
  const snapshotProviderValue = normalizeDisplayValue(snapshot?.provider);
  const snapshotModelValue = normalizeDisplayValue(snapshot?.model);
  const selectedModelValue = normalizeDisplayValue(selectedModel);
  const resolvedModelValue = selectedModelValue ?? snapshotModelValue;
  const resolvedProviderValue =
    snapshotProviderValue ?? normalizeDisplayValue(providerHealth.provider);
  const visibleAuthenticatedProviders = useMemo(() => {
    const source = providerHealth.authenticatedProviders ?? [];
    const hasOpencodeModels = modelOptions.some((item) =>
      Boolean(deriveOpencodeSyntheticProvider(item.displayName || item.model || item.id)),
    );
    if (source.length === 0) {
      return hasOpencodeModels ? ["opencode"] : source;
    }
    if (modelOptions.length === 0) {
      return source;
    }
    const filtered = source.filter((providerName) =>
      modelOptions.some((item) => {
        const fullLabel = item.displayName || item.model || item.id;
        return providerMatchesModel(providerName, fullLabel);
      }),
    );
    const merged: string[] = [];
    const seen = new Set<string>();
    filtered.forEach((item) => {
      const canonical = canonicalProviderLabel(item);
      const key = normalizeLooseKey(canonical);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(canonical);
      }
    });
    if (hasOpencodeModels) {
      const item = "opencode";
      const key = normalizeLooseKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  }, [modelOptions, providerHealth.authenticatedProviders]);
  const filteredOutProviderCount = Math.max(
    0,
    (providerHealth.authenticatedProviders?.length ?? 0) - visibleAuthenticatedProviders.length,
  );
  const providerConnectedFromSession = Boolean(
    snapshot?.sessionId && (snapshotProviderValue || snapshotModelValue),
  );
  const rawProviderStatusTone = providerHealth.connected
    ? "is-ok"
    : providerConnectedFromSession
      ? "is-runtime"
      : "is-fail";
  const [providerStatusTone, setProviderStatusTone] = useState<"is-ok" | "is-runtime" | "is-fail">(
    rawProviderStatusTone,
  );
  const providerStatusLabel = providerStatusTone === "is-ok"
    ? "Auth Ready"
    : providerStatusTone === "is-runtime"
      ? "Session Active"
      : "Disconnected";
  const completedAuthSummary =
    visibleAuthenticatedProviders.length > 0
      ? `${visibleAuthenticatedProviders.length} 项`
      : "0 项";
  const onboardingNextStep = providerHealth.connected
    ? "认证可用。发送时会尝试网络连通性探测（不阻断发送）。"
    : "请先选择 Provider 并完成认证，再开始发送消息。";
  const authExpandRows = useMemo(() => {
    const providerName = resolvedProviderValue;
    const authenticatedProviders = visibleAuthenticatedProviders;
    const modelOrProviderLabel = resolvedModelValue ?? providerName ?? "unknown";
    const rows: Array<{
      key: "provider" | "authenticatedProviders";
      label: string;
      value: string;
      tone: "ok" | "warn" | "fail";
      icon: "ok" | "warn" | "fail";
      providers?: string[];
    }> = [];
    if (providerName) {
      rows.push({
        key: "provider",
        label: "当前 Provider",
        value: `${modelOrProviderLabel}${providerHealth.connected ? "（已连接）" : "（未连接）"}`,
        tone: providerHealth.connected ? "ok" : "fail",
        icon: providerHealth.connected ? "ok" : "fail",
      });
    }
    rows.push({
      key: "authenticatedProviders",
      label: "已认证 Provider",
      value: authenticatedProviders.length > 0 ? authenticatedProviders.join("、") : "无",
      tone: authenticatedProviders.length > 0 ? "ok" : "warn",
      icon: authenticatedProviders.length > 0 ? "ok" : "warn",
      providers: authenticatedProviders,
    });
    return rows;
  }, [
    providerHealth.connected,
    visibleAuthenticatedProviders,
    resolvedProviderValue,
    resolvedModelValue,
  ]);
  const shouldShowProviderStatusHint =
    providerStatusHint.trim().length > 0 && !providerStatusHint.startsWith("当前 Provider：");

  useEffect(() => {
    if (rawProviderStatusTone !== "is-fail") {
      providerFailSinceRef.current = null;
      setProviderStatusTone(rawProviderStatusTone);
      return;
    }
    const now = Date.now();
    if (providerFailSinceRef.current == null) {
      providerFailSinceRef.current = now;
    }
    const elapsed = now - providerFailSinceRef.current;
    if (elapsed < PROVIDER_DISCONNECT_GRACE_MS) {
      setProviderStatusTone("is-runtime");
      const timer = window.setTimeout(() => {
        setProviderStatusTone((current) => (current === "is-fail" ? current : "is-fail"));
      }, PROVIDER_DISCONNECT_GRACE_MS - elapsed);
      return () => window.clearTimeout(timer);
    }
    setProviderStatusTone("is-fail");
  }, [rawProviderStatusTone]);
  const formatOpenCodeModelName = (value: string) => value.split("/").pop() || value;
  const inferModelProvider = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return "unknown";
    }
    if (normalized.includes("/")) {
      return normalized.split("/")[0] || "unknown";
    }
    if (normalized.includes("[opencode]") || normalized.startsWith("opencode ")) {
      return "opencode";
    }
    if (normalized.startsWith("gpt-") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4")) {
      return "openai";
    }
    if (normalized.startsWith("claude-")) {
      return "anthropic";
    }
    if (normalized.startsWith("gemini-")) {
      return "google";
    }
    if (normalized.includes("github") || normalized.includes("copilot")) {
      return "github";
    }
    if (normalized.includes("zhipu") || normalized.startsWith("glm-") || normalized.startsWith("z.ai/")) {
      return "zhipu";
    }
    if (normalized.includes("minimax")) {
      return "minimax";
    }
    if (normalized.startsWith("mistral-") || normalized.startsWith("ministral-") || normalized.startsWith("codestral-")) {
      return "mistral";
    }
    if (normalized.startsWith("deepseek-")) {
      return "deepseek";
    }
    if (normalized.startsWith("qwen-")) {
      return "qwen";
    }
    if (normalized.startsWith("llama-") || normalized.startsWith("meta-llama-")) {
      return "meta";
    }
    if (normalized.startsWith("phi-")) {
      return "microsoft";
    }
    if (normalized.startsWith("cohere-")) {
      return "cohere";
    }
    if (normalized.startsWith("jais-")) {
      return "jais";
    }
    return "unknown";
  };
  const formatModelOptionLabel = (value: string) => {
    const provider = inferModelProvider(value);
    const model = formatOpenCodeModelName(value);
    return provider === "unknown" ? model : `[${provider}] ${model}`;
  };
  const resolvedModelKey = normalizeLooseKey(resolvedModelValue ?? "");
  const activeProviderTagKey = useMemo(() => {
    const providers = visibleAuthenticatedProviders;
    if (!providers.length || !resolvedModelKey) {
      return "";
    }
    const modelBrand = inferModelProvider(resolvedModelValue ?? "");
    let bestKey = "";
    let bestScore = 0;
    for (const providerName of providers) {
      const normalized = normalizeProviderDisplayName(providerName);
      const score = scoreProviderAgainstModel(normalized, resolvedModelKey, modelBrand);
      if (score > bestScore) {
        bestScore = score;
        bestKey = normalizeLooseKey(normalized);
      }
    }
    return bestScore > 0 ? bestKey : "";
  }, [
    inferModelProvider,
    visibleAuthenticatedProviders,
    resolvedModelKey,
    resolvedModelValue,
  ]);
  const switchToLatestModelByProvider = (providerText: string): string | null => {
    if (!onSelectModel || modelOptions.length === 0) {
      return null;
    }
    const providerBrand = detectProviderBrand(providerText);
    const normalizedProvider = providerText.trim().toLowerCase();
    const providerAliasKeys = buildProviderAliasKeys(normalizedProvider);
    const candidates = modelOptions
      .map((item, index) => {
        const fullLabel = (item.displayName || item.model || item.id).trim();
        const fullLabelLower = fullLabel.toLowerCase();
        const fullLabelKey = normalizeLooseKey(fullLabelLower);
        const inferred = inferModelProvider(fullLabel);
        const sameBrand =
          (providerBrand !== "other" && inferred === providerBrand) ||
          fullLabelLower.includes(normalizedProvider) ||
          providerAliasKeys.some((alias) => alias.length > 0 && fullLabelKey.includes(alias));
        return {
          id: item.id,
          index,
          fullLabel,
          rank: parseModelRank(fullLabel),
          sameBrand,
        };
      })
      .filter((item) => item.sameBrand);
    if (!candidates.length) {
      return null;
    }
    candidates.sort((a, b) => b.rank - a.rank || b.index - a.index);
    const winner = candidates[0];
    onSelectModel(winner.id);
    return winner.fullLabel;
  };

  useEffect(() => {
    if (!visible || !detailOpen) {
      return;
    }
    void refresh(true);
  }, [detailOpen, refresh, visible]);

  useEffect(() => {
    return () => {
      providerHintTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      providerHintTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!visible || !detailOpen) {
      providerHintTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      providerHintTimersRef.current = [];
      lastAnimatedModelRef.current = null;
      setProviderStatusHint("");
      return;
    }
    providerHintTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    providerHintTimersRef.current = [];
    const inferred = selectedModel ? inferModelProvider(selectedModel) : "unknown";
    const resolved = resolvedProviderValue ?? (inferred && inferred !== "unknown" ? inferred : "unknown");
    const statusLabel = providerHealth.connected ? "已连接" : "未连接";
    const modelKey = (selectedModel ?? resolvedModelValue ?? "").trim();
    if (modelKey && modelKey !== lastAnimatedModelRef.current) {
      lastAnimatedModelRef.current = modelKey;
      setProviderStatusHint(`Provider 切换中（目标：${resolved}）...`);
      const checkingTimer = window.setTimeout(() => {
        setProviderStatusHint(`正在校验 ${resolved} 凭据状态...`);
      }, 280);
      const doneTimer = window.setTimeout(() => {
        setProviderStatusHint(`当前 Provider：${resolved}（${statusLabel}）`);
      }, 640);
      providerHintTimersRef.current = [checkingTimer, doneTimer];
      return;
    }
    setProviderStatusHint(`当前 Provider：${resolved}（${statusLabel}）`);
  }, [
    detailOpen,
    inferModelProvider,
    providerHealth.connected,
    resolvedModelValue,
    resolvedProviderValue,
    selectedModel,
    visible,
  ]);

  useEffect(() => {
    onProviderStatusToneChange?.(providerStatusTone);
  }, [onProviderStatusToneChange, providerStatusTone]);

  useEffect(() => {
    if (!visible || !detailOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (detailOpen) {
        setDetailOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailOpen, visible]);

  useEffect(() => {
    if (!visible || !detailOpen) {
      return;
    }
    const updateDrawerPlacement = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const edge = 8;
      const width = Math.min(920, Math.max(360, viewportWidth - edge * 2));
      const centeredLeft = (viewportWidth - width) / 2;
      const left = Math.min(
        Math.max(Math.round(centeredLeft), edge),
        Math.max(edge, viewportWidth - width - edge),
      );
      const estimatedDrawerHeight = 520;
      const maxHeight = Math.max(320, Math.min(820, viewportHeight - edge * 2));
      const centeredTop = (viewportHeight - Math.min(estimatedDrawerHeight, maxHeight)) / 2;
      const top = Math.min(
        Math.max(Math.round(centeredTop), edge),
        Math.max(edge, viewportHeight - maxHeight - edge),
      );
      setDrawerStyle({
        position: "fixed",
        left,
        top,
        width,
        maxHeight,
      });
    };
    updateDrawerPlacement();
    window.addEventListener("resize", updateDrawerPlacement);
    window.addEventListener("scroll", updateDrawerPlacement, true);
    return () => {
      window.removeEventListener("resize", updateDrawerPlacement);
      window.removeEventListener("scroll", updateDrawerPlacement, true);
    };
  }, [detailOpen, visible]);

  useEffect(() => {
    if (!visible || !detailOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (drawerRef.current?.contains(target)) {
        return;
      }
      if (panelRootRef.current?.contains(target)) {
        return;
      }
      setDetailOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [detailOpen, visible]);

  if (!visible) {
    return null;
  }

  return (
    <section
      ref={panelRootRef}
      className={`opencode-panel${embedded ? " is-embedded" : ""}${dock ? " is-dock" : ""}`}
      data-testid="opencode-control-panel"
    >
      <header className="opencode-panel-header">
        {!dock && (
          <div className="opencode-panel-title">
            <Activity size={13} aria-hidden />
            <span>OpenCode 状态中心</span>
          </div>
        )}
        {!dock && (
          <div className="opencode-panel-summary">
            <span className="opencode-summary-pill" title={sessionIdValue ?? "-"}>
              Session: {sessionLabel}
            </span>
            <span
              className={`opencode-connection-indicator ${providerStatusTone}`}
              title={providerHealth.error ?? providerStatusLabel}
            >
              <span
                className={`opencode-connection-dot ${providerStatusTone === "is-ok" ? "is-ok" : providerStatusTone === "is-runtime" ? "is-runtime" : "is-fail"}`}
                aria-hidden
              />
              <span>{providerStatusLabel}</span>
            </span>
          </div>
        )}
        <div className="opencode-panel-actions">
          <button
            ref={panelToggleRef}
            type="button"
            className="opencode-panel-toggle"
            onClick={() => setDetailOpen((prev) => !prev)}
            title={detailOpen ? "关闭状态面板" : "打开状态面板"}
            aria-label={detailOpen ? "关闭状态面板" : "打开状态面板"}
          >
            <SlidersHorizontal size={13} aria-hidden />
          </button>
        </div>
      </header>

      {detailOpen && (
        <div className="opencode-drawer-layer" onClick={() => setDetailOpen(false)}>
          <aside
            ref={drawerRef}
            className="opencode-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="OpenCode 管理面板"
            style={drawerStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="opencode-drawer-header">
              <div className="opencode-drawer-title">
                <Activity size={13} aria-hidden />
                <span>OpenCode 管理面板</span>
              </div>
              <div className="opencode-panel-actions">
                <button
                  type="button"
                  className="opencode-drawer-close"
                  onClick={() => setDetailOpen(false)}
                  aria-label="关闭面板"
                  title="关闭面板"
                >
                  ×
                </button>
              </div>
            </header>
            <div className="opencode-drawer-tabs" role="tablist" aria-label="OpenCode tabs">
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "provider" ? " is-active" : ""}`}
                onClick={() => setActiveTab("provider")}
              >
                Provider
              </button>
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "mcp" ? " is-active" : ""}`}
                onClick={() => setActiveTab("mcp")}
              >
                MCP
              </button>
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "sessions" ? " is-active" : ""}`}
                onClick={() => setActiveTab("sessions")}
              >
                Sessions
              </button>
              <button
                type="button"
                role="tab"
                className={`opencode-drawer-tab${activeTab === "advanced" ? " is-active" : ""}`}
                onClick={() => setActiveTab("advanced")}
              >
                Advanced
              </button>
            </div>
            <div className="opencode-drawer-content">
      <section className="opencode-onboarding-card" aria-label="OpenCode 连接引导">
        <h4>连接引导</h4>
        <p>默认不预选连接。点击连接后请在 CLI 中自行选择空间/Provider 完成认证。</p>
        <div className="opencode-onboarding-metrics">
          <span>认证状态：{providerStatusLabel}</span>
          <button
            type="button"
            className={`opencode-onboarding-chip${authExpanded ? " is-open" : ""}`}
            onClick={() => setAuthExpanded((prev) => !prev)}
            aria-expanded={authExpanded}
            aria-label="展开已完成认证详情"
          >
            已完成认证：{completedAuthSummary}
          </button>
        </div>
        {authExpanded && (
          <div className="opencode-auth-expand">
            {authExpandRows.map((row) => (
              <p key={`${row.label}:${row.value}`} className={`opencode-auth-line is-${row.tone}`}>
                {row.icon === "ok" && <CheckCircle2 size={12} aria-hidden />}
                {row.icon === "warn" && <CircleDashed size={12} aria-hidden />}
                {row.icon === "fail" && <XCircle size={12} aria-hidden />}
                <span className="opencode-auth-key">{row.label}：</span>
                {row.key === "authenticatedProviders" ? (
                  <span className="opencode-auth-vendors">
                    {(row.providers ?? []).length > 0 ? (
                      (row.providers ?? []).map((providerName, providerIndex) => {
                        const normalized = normalizeProviderDisplayName(providerName);
                        const brand = detectProviderBrand(normalized);
                        const tagKey = normalizeLooseKey(normalized);
                        const isSelected = activeProviderTagKey.length > 0 && activeProviderTagKey === tagKey;
                        return (
                          <span
                            key={`${providerName}:${brand}:${providerIndex}`}
                            role="button"
                            tabIndex={0}
                            className={`opencode-auth-vendor-tag${isSelected ? " is-selected" : ""}`}
                            onClick={() => {
                              const switchedModel = switchToLatestModelByProvider(normalized);
                              if (!switchedModel) {
                                setProviderStatusHint(`未找到 ${normalized} 对应可切换模型`);
                              } else {
                                setProviderStatusHint(`已切换到 ${normalized} 最新模型：${switchedModel}`);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }
                              event.preventDefault();
                              const switchedModel = switchToLatestModelByProvider(normalized);
                              if (!switchedModel) {
                                setProviderStatusHint(`未找到 ${normalized} 对应可切换模型`);
                              } else {
                                setProviderStatusHint(`已切换到 ${normalized} 最新模型：${switchedModel}`);
                              }
                            }}
                            title={`切换到 ${normalized} 的最新模型`}
                          >
                            {brand === "openai" && <Bot size={11} aria-hidden />}
                            {brand === "anthropic" && <Brain size={11} aria-hidden />}
                            {brand === "github" && <Github size={11} aria-hidden />}
                            {brand === "zhipu" && <Cpu size={11} aria-hidden />}
                            {brand === "minimax" && <Cpu size={11} aria-hidden />}
                            {brand === "opencode" && <Activity size={11} aria-hidden />}
                            {brand === "other" && <CircleDashed size={11} aria-hidden />}
                            <span>{normalized}</span>
                          </span>
                        );
                      })
                    ) : (
                      <span className="opencode-auth-value">无</span>
                    )}
                  </span>
                ) : (
                  <span className="opencode-auth-value">{row.value}</span>
                )}
              </p>
            ))}
          </div>
        )}
        {shouldShowProviderStatusHint && (
          <p className="opencode-provider-status-hint">{providerStatusHint}</p>
        )}
        {filteredOutProviderCount > 0 && (
          <p className="opencode-provider-status-hint">
            已自动隐藏 {filteredOutProviderCount} 项疑似失效/不可用 Provider
          </p>
        )}
        <p className="opencode-onboarding-next-step">{onboardingNextStep}</p>
      </section>
      <section className="opencode-overview-layout">
        {hasSessionValue && (
          <div className="opencode-panel-item is-session is-hero" title={sessionIdValue ?? "-"}>
            <span>Session</span>
            <strong>{sessionLabel}</strong>
          </div>
        )}
        <div className="opencode-panel-grid">
          <div className="opencode-panel-item is-control" title={snapshot?.agent ?? selectedAgent ?? "default"}>
            <span className="opencode-control-icon-label" title="Agent" aria-label="Agent">
              <Bot size={12} aria-hidden />
            </span>
            {onSelectAgent ? (
              <select
                className="opencode-panel-select"
                aria-label="OpenCode Agent Selector"
                value={selectedAgent ?? ""}
                onChange={(event) => onSelectAgent(event.target.value || null)}
              >
                <option value="">default</option>
                {sortedAgentOptions.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.isPrimary ? `🔥 ${agent.id}` : agent.id}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{snapshot?.agent ?? selectedAgent ?? "default"}</strong>
            )}
          </div>
          <div className="opencode-panel-item is-control" title={resolvedModelValue ?? "未选择模型"}>
            <span className="opencode-control-icon-label" title="Model" aria-label="Model">
              <Brain size={12} aria-hidden />
            </span>
            {onSelectModel ? (
              <select
                className="opencode-panel-select"
                aria-label="OpenCode Model Selector"
                value={selectedModelId ?? ""}
                onChange={(event) => onSelectModel(event.target.value)}
              >
                {modelOptions.length === 0 && (
                  <option value={selectedModelId ?? ""}>
                    {resolvedModelValue ? formatModelOptionLabel(resolvedModelValue) : "无可用模型"}
                  </option>
                )}
                {modelOptions.map((item) => {
                  const fullLabel = item.displayName || item.model || item.id;
                  return (
                    <option key={item.id} value={item.id} title={fullLabel}>
                      {formatModelOptionLabel(fullLabel)}
                    </option>
                  );
                })}
              </select>
            ) : (
              <strong>{resolvedModelValue ?? "未选择模型"}</strong>
            )}
          </div>
          <div className="opencode-panel-item is-control" title={snapshot?.variant ?? selectedVariant ?? "default"}>
            <span className="opencode-control-icon-label" title="Variant" aria-label="Variant">
              <Cpu size={12} aria-hidden />
            </span>
            {onSelectVariant ? (
              <select
                className="opencode-panel-select"
                aria-label="OpenCode Variant Selector"
                value={selectedVariant ?? ""}
                onChange={(event) => onSelectVariant(event.target.value || null)}
              >
                <option value="">default</option>
                {variantOptions.map((variant) => (
                  <option key={variant} value={variant}>
                    {variant}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{snapshot?.variant ?? selectedVariant ?? "default"}</strong>
            )}
          </div>
        </div>
      </section>

      {activeTab === "provider" && (
      <OpenCodeProviderSection
        providerHealth={providerHealth}
        providerStatusTone={providerStatusTone}
        providerStatusLabel={providerStatusLabel}
        showHeader={false}
        connectingProvider={connectingProvider}
        onConnectProvider={() => connectProvider(null)}
      />
      )}

      {activeTab === "mcp" && (
      <OpenCodeMcpSection
        snapshot={snapshot}
        onToggleMcpGlobal={toggleMcpGlobal}
        onToggleMcpServer={toggleMcpServer}
      />
      )}

      {activeTab === "sessions" && (
      <OpenCodeSessionsSection
        sessionFilter={sessionFilter}
        onSessionFilterChange={setSessionFilter}
        sessionQuery={sessionQuery}
        onSessionQueryChange={setSessionQuery}
        visibleSessions={visibleSessions}
        favoriteSessionIds={favoriteSessionIds}
        onToggleFavoriteSession={toggleFavoriteSession}
        onResumeSession={(sessionId) => onRunOpenCodeCommand?.(`/resume ${sessionId}`)}
      />
      )}

      {activeTab === "advanced" && (
      <OpenCodeAdvancedSection
        advancedOpen={advancedOpen}
        onAdvancedOpenChange={setAdvancedOpen}
        onRunQuickCommand={(command) => onRunOpenCodeCommand?.(command)}
      />
      )}
            </div>
          </aside>
        </div>
      )}

      {error && <div className="opencode-panel-error">{error}</div>}
    </section>
  );
}
