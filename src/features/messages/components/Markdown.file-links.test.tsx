// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown file links", () => {
  it("routes absolute file links to the file opener callback", () => {
    const onOpenFileLink = vi.fn();

    render(
      <Markdown
        value={
          "文件: [collaboration_policy.rs](/Users/test/Library/Application%20Support/repo/src-tauri/src/codex/collaboration_policy.rs#L42)"
        }
        onOpenFileLink={onOpenFileLink}
      />,
    );

    fireEvent.click(
      screen.getByRole("link", { name: "collaboration_policy.rs" }),
    );

    expect(onOpenFileLink).toHaveBeenCalledWith(
      "/Users/test/Library/Application Support/repo/src-tauri/src/codex/collaboration_policy.rs#L42",
    );
  });
});
