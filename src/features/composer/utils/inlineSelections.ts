type NamedOption = {
  name: string;
};

type InlineSelections = {
  cleanedText: string;
  matchedSkillNames: string[];
  matchedCommonsNames: string[];
};

function normalizeToken(value: string) {
  return value.trim().replace(/^[/$]+/, "").replace(/\s+/g, "-").toLowerCase();
}

function toAliasCandidates(name: string) {
  const raw = name.trim().replace(/^[/$]+/, "");
  if (!raw) {
    return [];
  }
  const collapsedSpace = raw.replace(/\s+/g, " ");
  return Array.from(
    new Set([
      raw,
      raw.replace(/\s+/g, "-"),
      raw.replace(/\s+/g, "_"),
      collapsedSpace,
      collapsedSpace.replace(/\s+/g, "-"),
      collapsedSpace.replace(/\s+/g, "_"),
    ]),
  );
}

function buildAliasMap(options: NamedOption[]) {
  const aliasMap = new Map<string, string>();
  for (const option of options) {
    for (const alias of toAliasCandidates(option.name)) {
      aliasMap.set(normalizeToken(alias), option.name);
    }
  }
  return aliasMap;
}

function getMaxAliasWordCount(aliasMap: Map<string, string>) {
  let maxCount = 1;
  for (const alias of aliasMap.keys()) {
    const count = alias.split("-").filter(Boolean).length;
    if (count > maxCount) {
      maxCount = count;
    }
  }
  return maxCount;
}

export function mergeUniqueNames(previous: string[], incoming: string[]) {
  if (incoming.length === 0) {
    return previous;
  }
  const seen = new Set(previous);
  const merged = [...previous];
  for (const name of incoming) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    merged.push(name);
  }
  return merged;
}

export function extractInlineSelections(
  text: string,
  skills: NamedOption[],
  commons: NamedOption[],
): InlineSelections {
  const tokenMatches = text.match(/[/$][^\s]+/g) ?? [];
  if (tokenMatches.length === 0) {
    return { cleanedText: text, matchedSkillNames: [], matchedCommonsNames: [] };
  }

  const skillMap = buildAliasMap(skills);
  const commonsMap = buildAliasMap(commons);
  const skillMaxWordCount = getMaxAliasWordCount(skillMap);
  const commonsMaxWordCount = getMaxAliasWordCount(commonsMap);
  const matchedSkillNames: string[] = [];
  const matchedCommonsNames: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { cleanedText: text, matchedSkillNames, matchedCommonsNames };
  }

  const consumedWordIndexes = new Set<number>();

  for (let index = 0; index < words.length; index += 1) {
    if (consumedWordIndexes.has(index)) {
      continue;
    }
    const word = words[index] ?? "";
    const canMatchSkill = word.startsWith("/") || word.startsWith("$");
    const canMatchCommons = word.startsWith("/");
    if (!canMatchSkill && !canMatchCommons) {
      continue;
    }

    let matched = false;
    const maxWordCount = Math.max(
      canMatchSkill ? skillMaxWordCount : 1,
      canMatchCommons ? commonsMaxWordCount : 1,
    );

    for (let wordCount = maxWordCount; wordCount >= 1; wordCount -= 1) {
      const endIndex = index + wordCount;
      if (endIndex > words.length) {
        continue;
      }

      const candidate = words.slice(index, endIndex).join(" ");
      const normalized = normalizeToken(candidate);

      if (canMatchSkill) {
        const skillName = skillMap.get(normalized);
        if (skillName) {
          matchedSkillNames.push(skillName);
          for (let i = index; i < endIndex; i += 1) {
            consumedWordIndexes.add(i);
          }
          matched = true;
          break;
        }
      }

      if (canMatchCommons) {
        const commonsName = commonsMap.get(normalized);
        if (commonsName) {
          matchedCommonsNames.push(commonsName);
          for (let i = index; i < endIndex; i += 1) {
            consumedWordIndexes.add(i);
          }
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      continue;
    }
  }

  if (consumedWordIndexes.size === 0) {
    return { cleanedText: text, matchedSkillNames, matchedCommonsNames };
  }

  const cleanedText = words
    .filter((_, index) => !consumedWordIndexes.has(index))
    .join(" ");
  return { cleanedText, matchedSkillNames, matchedCommonsNames };
}
