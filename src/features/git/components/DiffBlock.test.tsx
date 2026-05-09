/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiffBlock } from "./DiffBlock";

describe("DiffBlock annotation selection", () => {
  const diff = [
    "@@ -1,2 +1,3 @@",
    " context",
    "-old",
    "+new",
    "+next",
  ].join("\n");

  it("reveals a selected range for beginner-friendly annotation flows", () => {
    const onLineSelect = vi.fn();

    render(
      <DiffBlock
        diff={diff}
        showHunkHeaders={false}
        selectedRange={{ start: 2, end: 3 }}
        onLineSelect={onLineSelect}
      />,
    );

    const selectedRows = document.querySelectorAll(".diff-line.is-selected");
    expect(selectedRows).toHaveLength(2);
    fireEvent.click(selectedRows[0] as HTMLElement);
    expect(onLineSelect).toHaveBeenCalled();
  });

  it("keeps deleted-only lines from exposing direct annotation buttons", () => {
    render(
      <DiffBlock
        diff={diff}
        showHunkHeaders={false}
        onAnnotateLine={vi.fn()}
        annotationLabel="Annotate for AI"
      />,
    );

    expect(screen.queryByRole("button", { name: "Annotate for AI L1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Annotate for AI L2" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Annotate for AI L3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Annotate for AI Lundefined" })).toBeNull();
  });

  it("renders line extensions inline with the target diff row", () => {
    render(
      <DiffBlock
        diff={diff}
        showHunkHeaders={false}
        renderLineExtension={(line) =>
          line.newLine === 2 ? <div data-testid="inline-annotation">标注回显</div> : null
        }
      />,
    );

    const inlineAnnotation = screen.getByTestId("inline-annotation");
    const row = inlineAnnotation.closest(".diff-line");
    expect(row?.getAttribute("data-line")).toBe("2");
  });

  it("renders split line extensions only for the requested pane mode", () => {
    render(
      <DiffBlock
        diff={diff}
        diffStyle="split"
        showHunkHeaders={false}
        renderLineExtension={(line, _index, mode) =>
          mode === "new" && line.newLine === 1
            ? <div data-testid="split-inline-annotation">标注回显</div>
            : null
        }
      />,
    );

    expect(screen.getAllByTestId("split-inline-annotation")).toHaveLength(1);
    const row = screen.getByTestId("split-inline-annotation").closest(".diff-line");
    expect(row?.closest(".diff-split-pane-new")).toBeTruthy();
    expect(row?.closest(".diff-split-pane-old")).toBeNull();
  });
});
