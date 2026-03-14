/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeClientStoreValue } from "../../../services/clientStorage";
import { useResizablePanels } from "./useResizablePanels";

type HookResult = ReturnType<typeof useResizablePanels>;

type RenderedHook = {
  result: HookResult;
  unmount: () => void;
};

function renderResizablePanels(): RenderedHook {
  let result: HookResult | undefined;

  function Test() {
    result = useResizablePanels();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(Test));
  });

  return {
    get result() {
      if (!result) {
        throw new Error("Hook not rendered");
      }
      return result;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useResizablePanels", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(writeClientStoreValue).mockClear();
    document.body.innerHTML = "";
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1200,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads stored sizes and clamps to bounds", () => {
    // Pre-populate the mock client store with values
    writeClientStoreValue("layout", "sidebarWidth", 999);
    writeClientStoreValue("layout", "rightPanelWidth", 100);
    writeClientStoreValue("layout", "planPanelHeight", "not-a-number");

    const hook = renderResizablePanels();

    // 999 is clamped to MAX_SIDEBAR_WIDTH (360)
    expect(hook.result.sidebarWidth).toBe(360);
    // 100 is clamped to MIN_RIGHT_PANEL_WIDTH (270)
    expect(hook.result.rightPanelWidth).toBe(270);
    // "not-a-number" is NaN, so falls back to DEFAULT_PLAN_PANEL_HEIGHT (220)
    expect(hook.result.planPanelHeight).toBe(220);

    hook.unmount();
  });

  it("allows the right panel to expand to at least half of the viewport", () => {
    writeClientStoreValue("layout", "rightPanelWidth", 9999);

    const hook = renderResizablePanels();

    expect(hook.result.rightPanelWidth).toBe(600);

    hook.unmount();
  });

  it("keeps right panel drag updates live without committing state until mouseup", () => {
    const app = document.createElement("div");
    app.className = "app";
    document.body.appendChild(app);
    writeClientStoreValue("layout", "rightPanelWidth", 300);

    const hook = renderResizablePanels();
    const initialWidth = hook.result.rightPanelWidth;

    act(() => {
      hook.result.onRightPanelResizeStart({
        clientX: 800,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 500, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    expect(app.style.getPropertyValue("--right-panel-width")).toBe("600px");
    expect(hook.result.rightPanelWidth).toBe(initialWidth);

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
      vi.runAllTimers();
    });

    expect(hook.result.rightPanelWidth).toBe(600);
    expect(writeClientStoreValue).toHaveBeenCalledWith(
      "layout",
      "rightPanelWidth",
      600,
    );

    app.remove();
    hook.unmount();
  });

  it("persists sidebar width changes and clamps max", () => {
    const hook = renderResizablePanels();

    act(() => {
      hook.result.onSidebarResizeStart({
        clientX: 0,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4000, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    expect(hook.result.sidebarWidth).toBe(360);
    expect(writeClientStoreValue).toHaveBeenCalledWith(
      "layout",
      "sidebarWidth",
      360,
    );

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    hook.unmount();
  });

  it("persists sidebar width changes and clamps min", () => {
    const hook = renderResizablePanels();

    act(() => {
      hook.result.onSidebarResizeStart({
        clientX: 0,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: -4000, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    expect(hook.result.sidebarWidth).toBe(210);
    expect(writeClientStoreValue).toHaveBeenCalledWith(
      "layout",
      "sidebarWidth",
      210,
    );

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    hook.unmount();
  });
});
