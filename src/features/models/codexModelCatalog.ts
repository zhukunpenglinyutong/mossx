export type CodexModelCatalogEntry = {
  id: string;
  label: string;
  description: string;
};

export const CODEX_MODEL_CATALOG: CodexModelCatalogEntry[] = [
  {
    id: "gpt-5.5",
    label: "gpt-5.5",
    description: "Frontier model for complex coding, research, and real-world work.",
  },
  {
    id: "gpt-5.4",
    label: "gpt-5.4",
    description: "Strong model for everyday coding.",
  },
  {
    id: "gpt-5.4-mini",
    label: "gpt-5.4-mini",
    description: "Small, fast, and cost-efficient model for simpler coding tasks.",
  },
  {
    id: "gpt-5.3-codex",
    label: "gpt-5.3-codex",
    description: "Coding-optimized model.",
  },
  {
    id: "gpt-5.3-codex-spark",
    label: "gpt-5.3-codex-spark",
    description: "Ultra-fast coding model.",
  },
  {
    id: "gpt-5.2",
    label: "gpt-5.2",
    description: "Optimized for professional work and long-running agents.",
  },
];
