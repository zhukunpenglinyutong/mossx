import { describe, expect, it } from "vitest";
import {
  CLIENT_DOCUMENTATION_BOUNDARY_GUARDS,
  CLIENT_DOCUMENTATION_MODULE_MAPPINGS,
  CLIENT_DOCUMENTATION_PLATFORM_CHECKS,
  CLIENT_DOCUMENTATION_REQUIRED_MODULE_IDS,
  CLIENT_DOCUMENTATION_REQUIRED_UI_CONTROL_IDS,
  CLIENT_DOCUMENTATION_TREE,
  CLIENT_DOCUMENTATION_WINDOW_LABEL,
} from "./clientDocumentationData";
import { CLIENT_UI_CONTROL_IDS } from "../client-ui-visibility/utils/clientUiVisibility";
import {
  findClientDocumentationNode,
  flattenClientDocumentationNodes,
  getClientDocumentationContentIssues,
  getDefaultClientDocumentationNode,
  getSelectableClientDocumentationNode,
  validateClientDocumentationKey,
} from "./clientDocumentationUtils";

describe("client documentation data", () => {
  it("covers every required top-level client module with feature children", () => {
    const topLevelIds = CLIENT_DOCUMENTATION_TREE.map((node) => node.id);

    expect(topLevelIds).toEqual([...CLIENT_DOCUMENTATION_REQUIRED_MODULE_IDS]);
    for (const node of CLIENT_DOCUMENTATION_TREE) {
      expect(node.children?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every selectable node complete and platform-safe", () => {
    expect(getClientDocumentationContentIssues()).toEqual([]);
    expect(validateClientDocumentationKey(CLIENT_DOCUMENTATION_WINDOW_LABEL)).toBe(true);

    const nodes = flattenClientDocumentationNodes();
    const ids = nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of nodes) {
      expect(validateClientDocumentationKey(node.id)).toBe(true);
      expect(node.purpose.trim()).not.toBe("");
      expect(node.entry.trim()).not.toBe("");
      expect(node.features.length).toBeGreaterThan(0);
      expect(node.notes.length).toBeGreaterThan(0);
      expect(node.relatedModules.length).toBeGreaterThan(0);
    }
  });

  it("adds icons and detailed usage instructions for every top-level module", () => {
    const iconKeys = CLIENT_DOCUMENTATION_TREE.map((node) => node.iconKey);

    expect(new Set(iconKeys).size).toBe(CLIENT_DOCUMENTATION_TREE.length);
    for (const node of CLIENT_DOCUMENTATION_TREE) {
      expect(node.iconKey).toBeTruthy();
      expect(node.usageSteps?.length ?? 0).toBeGreaterThanOrEqual(6);
    }
  });

  it("documents every configurable UI visibility control", () => {
    expect([...CLIENT_DOCUMENTATION_REQUIRED_UI_CONTROL_IDS]).toEqual([
      ...CLIENT_UI_CONTROL_IDS,
    ]);

    const documentedControlIds = flattenClientDocumentationNodes()
      .map((node) => node.uiControlId)
      .filter((controlId): controlId is string => Boolean(controlId));

    expect(new Set(documentedControlIds)).toEqual(
      new Set(CLIENT_DOCUMENTATION_REQUIRED_UI_CONTROL_IDS),
    );
    expect(findClientDocumentationNode("ui-control-top-tool-terminal")?.title).toBe(
      "终端快捷入口",
    );
    expect(findClientDocumentationNode("ui-control-right-toolbar-files")?.title).toBe(
      "文件入口",
    );
    expect(findClientDocumentationNode("ui-control-right-toolbar-search")?.title).toBe(
      "搜索入口",
    );
  });

  it("records source mappings, boundary guards, and platform checks", () => {
    expect(CLIENT_DOCUMENTATION_MODULE_MAPPINGS).toHaveLength(
      CLIENT_DOCUMENTATION_REQUIRED_MODULE_IDS.length,
    );
    expect(CLIENT_DOCUMENTATION_BOUNDARY_GUARDS.map((guard) => guard.id)).toEqual([
      "no-remote-docs",
      "no-user-doc-storage",
      "no-runtime-control",
      "no-production-dependency",
    ]);
    expect(CLIENT_DOCUMENTATION_PLATFORM_CHECKS.map((check) => check.id)).toEqual([
      "safe-window-label",
      "tauri-open-or-focus",
      "macos-drag-region",
      "windows-no-console",
      "path-example-parity",
    ]);
  });

  it("selects default, known, and unknown nodes safely", () => {
    expect(getDefaultClientDocumentationNode()?.id).toBe("ui-toolbars-visibility");
    expect(findClientDocumentationNode("git-history-branch")?.title).toBe(
      "Git history 与 branch compare",
    );
    expect(getSelectableClientDocumentationNode("missing-node")?.id).toBe(
      "ui-toolbars-visibility",
    );
    expect(getSelectableClientDocumentationNode(null)?.id).toBe("ui-toolbars-visibility");
  });

  it("rejects unsafe cross-platform keys", () => {
    expect(validateClientDocumentationKey("client-documentation")).toBe(true);
    expect(validateClientDocumentationKey("Client Documentation")).toBe(false);
    expect(validateClientDocumentationKey("客户端说明")).toBe(false);
    expect(validateClientDocumentationKey("client/documentation")).toBe(false);
    expect(validateClientDocumentationKey("client_documentation")).toBe(false);
    expect(validateClientDocumentationKey("C:\\client")).toBe(false);
  });

  it("contains both Windows and POSIX path guidance", () => {
    const allNotes = flattenClientDocumentationNodes()
      .flatMap((node) => node.notes)
      .join("\n");

    expect(allNotes).toContain("C:\\Repo\\client-app");
    expect(allNotes).toContain("/Users/name/code/client-app");
  });
});
