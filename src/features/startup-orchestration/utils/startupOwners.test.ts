import { describe, expect, it } from "vitest";
import {
  STARTUP_OWNER_RECORDS,
  findDuplicateStartupOwners,
  type StartupOwnerRecord,
} from "./startupOwners";

describe("startup owner map", () => {
  it("keeps each startup command on a single migration owner path", () => {
    expect(findDuplicateStartupOwners()).toEqual([]);
  });

  it("detects legacy/orchestrator double ownership", () => {
    const records: StartupOwnerRecord[] = [
      ...STARTUP_OWNER_RECORDS,
      {
        commandLabel: "skills_list",
        ownerKind: "legacy-hook",
        ownerId: "legacy-useSkills",
        scope: "workspace",
      },
    ];

    expect(findDuplicateStartupOwners(records)).toEqual(["skills_list"]);
  });
});
