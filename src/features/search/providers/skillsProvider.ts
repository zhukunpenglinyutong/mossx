import type { SkillOption } from "../../../types";
import type { SearchResult } from "../types";

type NormalizedSkillEntry = {
  name: string;
  description: string;
  path: string;
  source: string;
};

function normalizeSkillPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeSkillSource(value: string | undefined): string {
  return value?.trim() ?? "";
}

function buildSkillIdentityKey(entry: NormalizedSkillEntry): string {
  return `${entry.name.toLowerCase()}\u0000${entry.path}\u0000${entry.source.toLowerCase()}`;
}

function buildSkillResultId(entry: NormalizedSkillEntry, workspaceId?: string | null): string {
  const workspaceToken = encodeURIComponent(workspaceId ?? "active");
  const nameToken = encodeURIComponent(entry.name.toLowerCase());
  const pathToken = encodeURIComponent(entry.path || "-");
  const sourceToken = encodeURIComponent(entry.source.toLowerCase() || "-");
  return `skill:${workspaceToken}:${nameToken}:${pathToken}:${sourceToken}`;
}

export function searchSkills(
  query: string,
  skills: SkillOption[],
  workspaceId?: string | null,
): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const normalizedSkills = new Map<string, NormalizedSkillEntry>();

  for (const skill of skills) {
    const name = skill.name.trim();
    if (!name) {
      continue;
    }
    const description = skill.description?.trim() ?? "";
    const path = normalizeSkillPath(skill.path?.trim() ?? "");
    const source = normalizeSkillSource(skill.source);
    const entry: NormalizedSkillEntry = {
      name,
      description,
      path,
      source,
    };
    const identityKey = buildSkillIdentityKey(entry);
    const existing = normalizedSkills.get(identityKey);
    if (!existing) {
      normalizedSkills.set(identityKey, entry);
      continue;
    }
    if (!existing.description && description) {
      normalizedSkills.set(identityKey, entry);
    }
  }

  const results: SearchResult[] = [];
  for (const skill of normalizedSkills.values()) {
    const searchText = `${skill.name} ${skill.description}`.toLowerCase();
    const index = searchText.indexOf(normalizedQuery);
    if (index < 0) {
      continue;
    }
    results.push({
      id: buildSkillResultId(skill, workspaceId),
      kind: "skill",
      title: `/${skill.name}`,
      subtitle: skill.description || "Skill",
      score: index === 0 ? 35 : 210 + index,
      workspaceId: workspaceId ?? undefined,
      skillName: skill.name,
      sourceKind: "skills",
      locationLabel: skill.path || skill.name,
    });
  }
  return results;
}
