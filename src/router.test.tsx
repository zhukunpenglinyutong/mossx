/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let windowLabel = "main";

vi.mock("./features/layout/hooks/useWindowLabel", () => ({
  useWindowLabel: () => windowLabel,
}));

vi.mock("./app-shell", () => ({
  AppShell: () => <div>main-shell</div>,
}));

vi.mock("./features/about/components/AboutView", () => ({
  AboutView: () => <div>about-view</div>,
}));

vi.mock("./features/files/components/DetachedFileExplorerWindow", () => ({
  DetachedFileExplorerWindow: () => <div>detached-file-explorer-view</div>,
}));

vi.mock("./features/spec/components/DetachedSpecHubWindow", () => ({
  DetachedSpecHubWindow: () => <div>detached-spec-hub-view</div>,
}));

import { AppRouter } from "./router";

describe("AppRouter", () => {
  beforeEach(() => {
    windowLabel = "main";
  });

  it("renders the main shell for the main window", () => {
    render(<AppRouter />);
    expect(screen.getByText("main-shell")).not.toBeNull();
  });

  it("renders the about view for the about window", async () => {
    windowLabel = "about";
    render(<AppRouter />);
    expect(await screen.findByText("about-view")).not.toBeNull();
  });

  it("renders the detached file explorer for the file-explorer window", async () => {
    windowLabel = "file-explorer";
    render(<AppRouter />);
    expect(await screen.findByText("detached-file-explorer-view")).not.toBeNull();
  });

  it("renders the detached Spec Hub for the spec-hub window", async () => {
    windowLabel = "spec-hub";
    render(<AppRouter />);
    expect(await screen.findByText("detached-spec-hub-view")).not.toBeNull();
  });
});
