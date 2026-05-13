// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  clampRendererContextMenuPosition,
  RendererContextMenu,
  type RendererContextMenuState,
} from "./RendererContextMenu";

function createMenu(overrides?: Partial<RendererContextMenuState>): RendererContextMenuState {
  return {
    x: 10,
    y: 20,
    label: "Actions",
    items: [
      {
        type: "item",
        id: "open",
        label: "Open",
        onSelect: vi.fn(),
      },
      {
        type: "item",
        id: "disabled",
        label: "Disabled",
        disabled: true,
        onSelect: vi.fn(),
      },
    ],
    ...overrides,
  };
}

describe("RendererContextMenu", () => {
  it("closes on backdrop click and Escape", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <RendererContextMenu menu={createMenu()} onClose={onClose} />,
    );

    fireEvent.click(container.querySelector(".renderer-context-menu-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<RendererContextMenu menu={createMenu()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not activate disabled items", () => {
    const onClose = vi.fn();
    const onDisabledSelect = vi.fn();
    render(
      <RendererContextMenu
        menu={createMenu({
          items: [
            {
              type: "item",
              id: "disabled",
              label: "Disabled",
              disabled: true,
              onSelect: onDisabledSelect,
            },
          ],
        })}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Disabled" }));

    expect(onDisabledSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes before activating enabled items", () => {
    const events: string[] = [];
    render(
      <RendererContextMenu
        menu={createMenu({
          items: [
            {
              type: "item",
              id: "open",
              label: "Open",
              onSelect: () => {
                events.push("select");
              },
            },
          ],
        })}
        onClose={() => {
          events.push("close");
        }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    expect(events).toEqual(["close", "select"]);
  });

  it("clamps the menu inside the viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 240,
    });

    expect(
      clampRendererContextMenuPosition(999, 999, {
        width: 120,
        height: 100,
        padding: 8,
      }),
    ).toEqual({ x: 192, y: 132 });
    expect(
      clampRendererContextMenuPosition(-20, -10, {
        width: 120,
        height: 100,
        padding: 8,
      }),
    ).toEqual({ x: 8, y: 8 });
  });
});
