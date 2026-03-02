import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Search from "lucide-react/dist/esm/icons/search";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import type { SkillOption, WorkspaceInfo } from "../../../types";
import { useSkills } from "../../skills/hooks/useSkills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

type SkillsSectionProps = {
  activeWorkspace: WorkspaceInfo | null;
};

export function SkillsSection({ activeWorkspace }: SkillsSectionProps) {
  const { t } = useTranslation();
  const { skills, refreshSkills } = useSkills({ activeWorkspace });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((skill) => {
      if (skill.source) {
        set.add(skill.source);
      }
    });
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }, [skills]);
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const loadSkills = useCallback(async () => {
    if (!activeWorkspace?.id) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await refreshSkills();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id, refreshSkills]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (sourceFilter === "all") {
      return;
    }
    if (!sourceOptions.includes(sourceFilter)) {
      setSourceFilter("all");
    }
  }, [sourceFilter, sourceOptions]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (sourceFilter !== "all" && skill.source !== sourceFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${skill.name} ${skill.description ?? ""} ${skill.path}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, skills, sourceFilter]);

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.skillsPanel.title")}</div>
      <div className="settings-section-subtitle">{t("settings.skillsPanel.description")}</div>

      {!activeWorkspace?.id ? (
        <div className="settings-inline-muted">{t("settings.skillsPanel.workspaceRequired")}</div>
      ) : (
        <>
          <div className="settings-skills-toolbar">
            <label className="settings-search-field">
              <Search size={14} />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("settings.skillsPanel.searchPlaceholder")}
              />
            </label>
            <select
              className="settings-select settings-select--compact"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">{t("settings.skillsPanel.filterAll")}</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSkills()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "is-spin" : ""} />
              {t("settings.skillsPanel.refresh")}
            </Button>
          </div>

          <div className="settings-help">
            {t("settings.skillsPanel.count", {
              count: filteredSkills.length,
              total: skills.length,
            })}
          </div>

          {error && <div className="settings-inline-error">{error}</div>}

          {loading && (
            <div className="settings-inline-muted">{t("settings.loading")}</div>
          )}

          {!loading && filteredSkills.length === 0 && (
            <div className="settings-inline-muted">{t("settings.skillsPanel.empty")}</div>
          )}

          {!loading && filteredSkills.length > 0 && (
            <div className="settings-skills-list">
              {filteredSkills.map((skill: SkillOption) => (
                <div key={skill.path || skill.name} className="settings-skills-card">
                  <div className="settings-skills-card-head">
                    <div className="settings-skills-name">{skill.name}</div>
                    {skill.source && (
                      <span className="settings-skills-source">{skill.source}</span>
                    )}
                  </div>
                  {skill.description && (
                    <div className="settings-skills-description">{skill.description}</div>
                  )}
                  <div className="settings-skills-path" title={skill.path}>
                    {skill.path || "-"}
                  </div>
                  <div className="settings-skills-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (skill.path) {
                          void revealItemInDir(skill.path);
                        }
                      }}
                      disabled={!skill.path}
                    >
                      <FolderOpen size={14} />
                      {t("settings.skillsPanel.reveal")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
