// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchToolBlock } from "./SearchToolBlock";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

describe("SearchToolBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows raw detail when output is empty", () => {
    render(
      <SearchToolBlock
        item={{
          id: "search-single-1",
          kind: "tool",
          toolType: "webSearch",
          title: "Web search",
          detail: "openclaw github",
          status: "completed",
          output: "",
        }}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );

    expect(screen.getByText("openclaw github")).toBeTruthy();
  });

  it("renders url summary as clickable link", () => {
    render(
      <SearchToolBlock
        item={{
          id: "search-single-2",
          kind: "tool",
          toolType: "webSearch",
          title: "Web search",
          detail: "search openclaw",
          status: "completed",
          output: "https://openclaw.ai/",
        }}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://openclaw.ai/");
  });

  it("normalizes json query detail to plain readable text", () => {
    render(
      <SearchToolBlock
        item={{
          id: "search-single-3",
          kind: "tool",
          toolType: "webSearch",
          title: "Web search",
          detail: JSON.stringify({ query: "https://openclaw.ai/" }),
          status: "completed",
          output: "",
        }}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );

    expect(screen.queryByText(/\{"query"/)).toBeNull();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://openclaw.ai/");
  });

  it("does not toggle expansion when clicking inline links", () => {
    const onToggle = vi.fn();
    render(
      <SearchToolBlock
        item={{
          id: "search-single-link-1",
          kind: "tool",
          toolType: "mcpToolCall",
          title: "Tool: codex / search_query",
          detail: JSON.stringify({ query: "openclaw docs" }),
          status: "completed",
          output: "https://developers.openai.com/codex/guides/agents-md",
        }}
        isExpanded={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole("link"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("toggles expansion and shows formatted output summary", () => {
    const onToggle = vi.fn();
    render(
      <SearchToolBlock
        item={{
          id: "search-single-4",
          kind: "tool",
          toolType: "mcpToolCall",
          title: "Tool: codex / search_query",
          detail: JSON.stringify({ query: "site:developers.openai.com Codex AGENTS.md" }),
          status: "completed",
          output: JSON.stringify({
            type: "search",
            query: "site:developers.openai.com Codex AGENTS.md",
            queries: ["site:developers.openai.com Codex AGENTS.md"],
          }),
        }}
        isExpanded={false}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByLabelText(/tools\.search/i));
    expect(onToggle).toHaveBeenCalledWith("search-single-4");

    expect(screen.queryByText("summary")).toBeNull();

    cleanup();

    render(
      <SearchToolBlock
        item={{
          id: "search-single-4",
          kind: "tool",
          toolType: "mcpToolCall",
          title: "Tool: codex / search_query",
          detail: JSON.stringify({ query: "site:developers.openai.com Codex AGENTS.md" }),
          status: "completed",
          output: JSON.stringify({
            type: "search",
            query: "site:developers.openai.com Codex AGENTS.md",
            queries: ["site:developers.openai.com Codex AGENTS.md"],
          }),
        }}
        isExpanded
        onToggle={onToggle}
      />,
    );

    expect(screen.getByText("summary")).toBeTruthy();
    expect(screen.getByText(/"type": "search"/)).toBeTruthy();
  });

  it("shows detail block when output is empty and expanded", () => {
    render(
      <SearchToolBlock
        item={{
          id: "search-single-5",
          kind: "tool",
          toolType: "mcpToolCall",
          title: "Tool: codex / find",
          detail: JSON.stringify({
            type: "find_in_page",
            url: "https://developers.openai.com/codex/guides/agents-md",
            pattern: "searches for AGENTS.md",
          }),
          status: "completed",
          output: "",
        }}
        isExpanded
        onToggle={() => {}}
      />,
    );

    expect(screen.getByText("detail")).toBeTruthy();
    expect(screen.getByText(/find_in_page/)).toBeTruthy();
  });
});
