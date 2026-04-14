// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LatestUserMessagePanel } from "./LatestUserMessagePanel";

describe("LatestUserMessagePanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders empty state when there is no message", () => {
    render(
      <LatestUserMessagePanel
        preview={{ text: "", imageCount: 0, hasMessage: false }}
      />,
    );

    expect(screen.getByText("No latest user message")).toBeTruthy();
  });

  it("shows collapsed state for messages longer than four lines", () => {
    render(
      <LatestUserMessagePanel
        preview={{
          text: "1\n2\n3\n4\n5",
          imageCount: 0,
          hasMessage: true,
        }}
      />,
    );

    expect(screen.getByText("Expand")).toBeTruthy();
    expect(document.querySelector(".sp-latest-user-message-text.is-collapsed")).toBeTruthy();
  });

  it("expands and collapses long messages", () => {
    render(
      <LatestUserMessagePanel
        preview={{
          text: "1\n2\n3\n4\n5",
          imageCount: 0,
          hasMessage: true,
        }}
      />,
    );

    fireEvent.click(screen.getByText("Expand"));
    expect(screen.getByText("Collapse")).toBeTruthy();
    expect(document.querySelector(".sp-latest-user-message-text.is-collapsed")).toBeNull();
  });
});
