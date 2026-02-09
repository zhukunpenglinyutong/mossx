import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, SkillOption, WorkspaceInfo } from "../../../types";
import { getSkillsList } from "../../../services/tauri";

type UseSkillsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

function flattenSkillBuckets(buckets: unknown) {
  if (!Array.isArray(buckets)) {
    return [] as any[];
  }
  return buckets.flatMap((bucket: any) =>
    Array.isArray(bucket?.skills) ? bucket.skills : [],
  );
}

function extractRawSkills(response: unknown) {
  const payload = response as any;

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.skills)) {
    return payload.skills;
  }

  if (Array.isArray(payload?.result?.skills)) {
    return payload.result.skills;
  }

  const fromResultData = flattenSkillBuckets(payload?.result?.data);
  if (fromResultData.length > 0) {
    return fromResultData;
  }

  const fromData = flattenSkillBuckets(payload?.data);
  if (fromData.length > 0) {
    return fromData;
  }

  if (Array.isArray(payload?.result)) {
    return payload.result;
  }

  return [] as any[];
}

function normalizeSkillName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^[/$]+/, "");
}

export function useSkills({ activeWorkspace, onDebug }: UseSkillsOptions) {
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const refreshSkills = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-skills-list`,
      timestamp: Date.now(),
      source: "client",
      label: "skills/list",
      payload: { workspaceId },
    });
    try {
      const response = await getSkillsList(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-skills-list`,
        timestamp: Date.now(),
        source: "server",
        label: "skills/list response",
        payload: response,
      });
      const rawSkills = extractRawSkills(response);
      const data: SkillOption[] = rawSkills
        .map((item: any) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          if (item.enabled === false) {
            return null;
          }
          const name = normalizeSkillName(item.name ?? item.skillName);
          if (!name) {
            return null;
          }
          return {
            name,
            path: String(item.path ?? ""),
            description:
              item.description ?? item.shortDescription ?? item.interface?.shortDescription,
          };
        })
        .filter((entry: SkillOption | null): entry is SkillOption => Boolean(entry));
      setSkills(data);
      lastFetchedWorkspaceId.current = workspaceId;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-skills-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "skills/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.current = false;
    }
  }, [isConnected, onDebug, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && skills.length > 0) {
      return;
    }
    refreshSkills();
  }, [isConnected, refreshSkills, skills.length, workspaceId]);

  const skillOptions = useMemo(
    () => skills.filter((skill) => skill.name),
    [skills],
  );

  return {
    skills: skillOptions,
    refreshSkills,
  };
}
