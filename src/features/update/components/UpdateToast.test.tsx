// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../hooks/useUpdater";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "update.title": "Update",
        "update.checkingForUpdates": "Checking for updates...",
        "update.updateAvailable": "A new version is available.",
        "update.upToDate": "You're up to date.",
        "update.downloading": "Downloading update…",
        "update.installing": "Installing update…",
        "update.restarting": "Restarting…",
        "update.failed": "Update failed.",
        "update.downloaded": "downloaded",
        "common.later": "Later",
        "common.dismiss": "Dismiss",
        "common.retry": "Retry",
      };
      return translations[key] ?? key;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

import { UpdateToast } from "./UpdateToast";

describe("UpdateToast", () => {
  it("renders available state and handles actions", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    const state: UpdateState = { stage: "available", version: "1.2.3" };

    render(
      <UpdateToast state={state} onUpdate={onUpdate} onDismiss={onDismiss} />,
    );

    expect(screen.getAllByText("Update")).toHaveLength(2);
    expect(screen.getByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("A new version is available.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders downloading state with progress", () => {
    const state: UpdateState = {
      stage: "downloading",
      progress: { totalBytes: 1000, downloadedBytes: 500 },
    };

    const { container } = render(
      <UpdateToast state={state} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText(/Downloading update/)).toBeTruthy();
    expect(screen.getByText("500 B / 1000 B")).toBeTruthy();
    const fill = container.querySelector(".update-toast-progress-fill");
    expect(fill).toBeTruthy();
    if (!fill) {
      throw new Error("Expected progress fill element");
    }
    expect(fill.getAttribute("style")).toContain("width: 50%");
  });

  it("renders error state and lets you dismiss or retry", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    const state: UpdateState = {
      stage: "error",
      error: "Network error",
    };

    render(
      <UpdateToast state={state} onUpdate={onUpdate} onDismiss={onDismiss} />,
    );

    expect(screen.getByText("Update failed.")).toBeTruthy();
    expect(screen.getByText("Network error")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders latest state and allows dismiss", () => {
    const onDismiss = vi.fn();
    const state: UpdateState = { stage: "latest" };

    const { container } = render(
      <UpdateToast state={state} onUpdate={vi.fn()} onDismiss={onDismiss} />,
    );
    const scoped = within(container);

    expect(scoped.getByText(/up to date/i)).toBeTruthy();
    fireEvent.click(scoped.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
