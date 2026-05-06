/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import { listExternalAbsoluteDirectoryChildren } from "../../../services/tauri";
import { useSkills } from "../../skills/hooks/useSkills";
import { SkillsSection } from "./SkillsSection";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => path),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  listExternalAbsoluteDirectoryChildren: vi.fn(),
  readExternalAbsoluteFile: vi.fn(),
  writeExternalAbsoluteFile: vi.fn(),
}));

vi.mock("../../skills/hooks/useSkills", () => ({
  useSkills: vi.fn(),
}));

const activeWorkspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

describe("SkillsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSkills).mockReturnValue({
      skills: [],
      refreshSkills: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(listExternalAbsoluteDirectoryChildren).mockImplementation(
      async (_workspaceId, path) => {
        if (path === "/opt/team-a") {
          return {
            directories: ["/opt/team-a/review"],
            files: [],
            gitignored_files: [],
            gitignored_directories: [],
          };
        }
        if (path === "/opt/team-b") {
          return {
            directories: [],
            files: ["/opt/team-b/helper.md"],
            gitignored_files: [],
            gitignored_directories: [],
          };
        }
        return {
          directories: [],
          files: [],
          gitignored_files: [],
          gitignored_directories: [],
        };
      },
    );
  });

  it("renders every custom root in the custom engine browser", async () => {
    render(
      <SkillsSection
        activeWorkspace={activeWorkspace}
        embedded
        appSettings={
          {
            customSkillDirectories: ["/opt/team-a", "/opt/team-b"],
          } as AppSettings
        }
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "custom" },
    });

    await waitFor(() => {
      expect(listExternalAbsoluteDirectoryChildren).toHaveBeenCalledWith(
        "workspace-1",
        "/opt/team-a",
      );
    });
    await waitFor(() => {
      expect(listExternalAbsoluteDirectoryChildren).toHaveBeenCalledWith(
        "workspace-1",
        "/opt/team-b",
      );
    });

    expect(screen.getAllByText("team-a").length).toBeGreaterThan(0);
    expect(screen.getAllByText("team-b").length).toBeGreaterThan(0);
  });
});
