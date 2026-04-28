import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readCssWithImports(filePath: string): string {
  const css = readFileSync(filePath, "utf8");
  const importPattern = /^@import\s+"(.+?)";$/gm;

  return css.replace(importPattern, (_, relativeImportPath: string) =>
    readCssWithImports(resolve(dirname(filePath), relativeImportPath)),
  );
}

const baseCss = readFileSync(
  fileURLToPath(new URL("./base.css", import.meta.url)),
  "utf8",
);
const mainCss = readFileSync(
  fileURLToPath(new URL("./main.css", import.meta.url)),
  "utf8",
);
const sidebarCss = readFileSync(
  fileURLToPath(new URL("./sidebar.css", import.meta.url)),
  "utf8",
);
const messagesCss = readCssWithImports(
  fileURLToPath(new URL("./messages.css", import.meta.url)),
);
const diffViewerCss = readFileSync(
  fileURLToPath(new URL("./diff-viewer.css", import.meta.url)),
  "utf8",
);

function getCssRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("layout swapped platform guard", () => {
  it("scopes swapped structure selectors to desktop layout", () => {
    expect(baseCss).toContain(".app.layout-desktop.layout-swapped {");
    expect(baseCss).toContain(".app.layout-desktop.layout-swapped .main {");
    expect(baseCss).toContain(".app.layout-desktop.layout-swapped .sidebar {");
    expect(baseCss).toContain(".app.layout-desktop.layout-swapped .sidebar-resizer {");
    expect(baseCss).not.toContain(".app.layout-swapped .sidebar-resizer {");

    expect(mainCss).toContain(
      ".app.layout-desktop.layout-swapped .main:not(.settings-open):not(.spec-focus) {",
    );
    expect(mainCss).not.toContain(
      ".app.layout-swapped .main:not(.settings-open):not(.spec-focus) {",
    );
  });

  it("keeps Win/mac titlebar safety selectors mirrored between default and swapped modes", () => {
    expect(mainCss).toContain(
      ".app.windows-desktop.right-panel-collapsed:not(.layout-swapped) .main-topbar,",
    );
    expect(mainCss).toContain(
      ".app.windows-desktop.layout-swapped.sidebar-collapsed .main-topbar {",
    );
    expect(mainCss).toContain(
      ".app.macos-desktop.sidebar-collapsed:not(.layout-swapped) .main-topbar,",
    );
    expect(mainCss).toContain(
      ".app.macos-desktop.layout-swapped.right-panel-collapsed .main-topbar {",
    );
    expect(mainCss).toContain(
      ".app.windows-desktop.right-panel-collapsed:not(.layout-swapped) .main-header-actions,",
    );
    expect(mainCss).toContain(
      ".app.windows-desktop.layout-swapped.sidebar-collapsed .main-header-actions {",
    );
  });

  it("keeps sidebar titlebar controls above the drag strip on macOS", () => {
    expect(baseCss).toContain(".drag-strip {");
    expect(baseCss).toContain("z-index: 2;");
    expect(sidebarCss).toContain(".sidebar-topbar-placeholder {");
    expect(sidebarCss).toContain("position: relative;");
    expect(sidebarCss).toContain("z-index: 3;");
    expect(sidebarCss).toContain(".sidebar-topbar-content {");
    expect(sidebarCss).toContain("-webkit-app-region: no-drag;");
  });

  it("keeps the floating homepage sidebar restore control icon-only", () => {
    const floatingRule = getCssRuleBlock(
      baseCss,
      ".titlebar-sidebar-toggle .main-header-action:not(.open-app-action):not(.open-app-toggle)",
    );
    expect(floatingRule).toContain("border: none;");
    expect(floatingRule).toContain("background: transparent;");
    expect(floatingRule).toContain("box-shadow: none;");
  });

  it("keeps the floating homepage sidebar restore control on the shared titlebar inset anchor", () => {
    const leftAnchorRule = getCssRuleBlock(
      baseCss,
      ".titlebar-toggle-left",
    );
    const rightAnchorRule = getCssRuleBlock(
      baseCss,
      ".titlebar-toggle-right",
    );
    expect(leftAnchorRule).toContain("var(--titlebar-inset-left, 0px)");
    expect(rightAnchorRule).toContain("right: 10px;");
    expect(baseCss).not.toContain(".titlebar-sidebar-toggle.titlebar-toggle-left {");
    expect(baseCss).not.toContain(".titlebar-sidebar-toggle.titlebar-toggle-right {");
  });

  it("keeps the expanded sidebar titlebar toggle icon-only", () => {
    const expandedRule = getCssRuleBlock(
      sidebarCss,
      ".sidebar-titlebar-toggle .main-header-action:not(.open-app-action):not(.open-app-toggle)",
    );
    expect(expandedRule).toContain("border: none;");
    expect(expandedRule).toContain("background: transparent;");
    expect(expandedRule).toContain("box-shadow: none;");
  });

  it("keeps swapped-only overlay anchoring isolated from default mode", () => {
    expect(mainCss).toContain(
      ".app.layout-desktop.layout-swapped .workspace-branch-dropdown {",
    );
    expect(mainCss).toContain(
      ".app.layout-desktop.layout-swapped .workspace-project-dropdown {",
    );
    expect(messagesCss).toContain(
      ".app.layout-desktop.layout-swapped .messages-live-controls {",
    );
    expect(diffViewerCss).toContain(
      ".app.layout-desktop.layout-swapped .diff-viewer-anchor-floating:not(.is-embedded) {",
    );
  });

  it("keeps collapsed message sticky peek anchored to the canvas right edge", () => {
    const wideCanvasStickyInnerSelector =
      ".app.canvas-width-wide .messages-history-sticky-header-inner";
    const collapsedStickyInnerSelector =
      '.messages-history-sticky-header[data-history-sticky-collapsed="true"]';
    const collapsedStickyInnerRuleHead = `${collapsedStickyInnerSelector}
  .messages-history-sticky-header-inner`;
    const collapsedStickyRule = getCssRuleBlock(
      messagesCss,
      collapsedStickyInnerSelector,
    );
    const wideCollapsedStickyRule = getCssRuleBlock(
      messagesCss,
      `.app.canvas-width-wide ${collapsedStickyInnerSelector}`,
    );
    const collapsedStickyInnerRule = getCssRuleBlock(
      messagesCss,
      `${collapsedStickyInnerSelector} .messages-history-sticky-header-inner`,
    );
    const collapsedStickyContentRule = getCssRuleBlock(
      messagesCss,
      `${collapsedStickyInnerSelector} .messages-history-sticky-header-content`,
    );
    const collapsedStickyBubbleRule = getCssRuleBlock(
      messagesCss,
      ".messages-history-sticky-header-bubble.is-collapsed",
    );
    expect(collapsedStickyRule).toContain("margin-right: calc(-1 * var(--main-panel-padding));");
    expect(wideCollapsedStickyRule).toContain("margin-right: -25px;");
    expect(collapsedStickyInnerRule).toContain("padding-right: 0;");
    expect(collapsedStickyContentRule).toContain("justify-content: flex-end;");
    expect(collapsedStickyBubbleRule).toContain("width: var(--messages-history-sticky-peek-width);");
    expect(collapsedStickyBubbleRule).toContain("transform: none;");
    expect(messagesCss).toContain("--messages-history-sticky-peek-width: 16px;");
    expect(messagesCss).toMatch(
      /\.messages-history-sticky-header-peek\s*\{[\s\S]*border-radius: 0;[\s\S]*clip-path: none;/,
    );
    expect(messagesCss).toMatch(
      /\.messages-history-sticky-header-peek::before\s*\{[\s\S]*width: 5px;[\s\S]*height: 26px;/,
    );
    expect(messagesCss.indexOf(collapsedStickyInnerRuleHead)).toBeGreaterThan(
      messagesCss.indexOf(wideCanvasStickyInnerSelector),
    );
  });

  it("keeps Claude render-safe mitigation scoped to desktop messages shell", () => {
    expect(messagesCss).toMatch(
      /\.app\.windows-desktop[\s\S]*\.messages-shell\.claude-render-safe[\s\S]*\.working\.is-ingress[\s\S]*\.working-spinner\s*\{/,
    );
    expect(messagesCss).toMatch(
      /\.app\.macos-desktop[\s\S]*\.messages-shell\.claude-render-safe[\s\S]*\.working\.is-ingress[\s\S]*\.working-spinner\s*\{/,
    );
    expect(messagesCss).toMatch(
      /\.app\.(windows|macos)-desktop[\s\S]*\.messages-shell\.claude-render-safe[\s\S]*\.message\s*\{/,
    );
    expect(messagesCss).not.toMatch(
      /(^|\n)\.messages-shell\.claude-render-safe[\s\S]*\.working\.is-ingress[\s\S]*\.working-spinner\s*\{/m,
    );
  });

  it("keeps swapped sidebar quick nav in normal LTR order", () => {
    expect(sidebarCss).toContain(
      ".app.layout-desktop.layout-swapped .sidebar-primary-nav .sidebar-primary-nav-item {",
    );
    expect(sidebarCss).toContain("justify-content: flex-start;");
    expect(sidebarCss).toContain("text-align: left;");
    expect(sidebarCss).toContain(
      ".app.layout-desktop.layout-swapped .sidebar-primary-nav .sidebar-primary-nav-item > .sidebar-primary-nav-icon {",
    );
    expect(sidebarCss).toContain("order: 0;");
    expect(sidebarCss).toContain(
      ".app.layout-desktop.layout-swapped .sidebar-primary-nav .sidebar-primary-nav-item > .sidebar-primary-nav-text {",
    );
    expect(sidebarCss).toContain("order: 1;");
    expect(sidebarCss).toContain(
      ".app.layout-desktop.layout-swapped .sidebar-primary-nav .sidebar-primary-nav-item > .sidebar-primary-nav-shortcut {",
    );
    expect(sidebarCss).toContain("order: 2;");
    expect(sidebarCss).toContain("margin-left: auto;");
    expect(sidebarCss).toContain("margin-right: 0;");
  });
});
