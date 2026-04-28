// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModelSelect } from "./ModelSelect";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.model ? `${key}:${params.model}` : key,
  }),
}));

vi.mock("@lobehub/icons", () => ({
  Claude: {
    Color: ({ size }: { size?: number }) => (
      <span data-testid="claude-icon" style={{ width: size, height: size }} />
    ),
  },
  Gemini: {
    Color: ({ size }: { size?: number }) => (
      <span data-testid="gemini-icon" style={{ width: size, height: size }} />
    ),
  },
}));

vi.mock("../../../../engine/components/EngineIcon", () => ({
  EngineIcon: ({ engine }: { engine: string }) => (
    <span data-testid={`${engine}-icon`} />
  ),
}));

describe("ModelSelect", () => {
  it("does not display the first model when no model value is selected", () => {
    render(
      <ModelSelect
        value=""
        currentProvider="codex"
        onChange={vi.fn()}
        models={[
          {
            id: "gpt-5.5",
            label: "gpt-5.5",
          },
        ]}
      />,
    );

    const buttonText = screen.getByRole("button").textContent ?? "";

    expect(buttonText).toContain("models.selectModel");
    expect(buttonText).not.toContain("gpt-5.5");
  });
});
