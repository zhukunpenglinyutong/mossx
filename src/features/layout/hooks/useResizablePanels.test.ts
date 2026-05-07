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
    const handle = document.createElement("div");
    handle.className = "right-panel-resizer";
    app.appendChild(handle);
    writeClientStoreValue("layout", "rightPanelWidth", 300);

    const hook = renderResizablePanels();
    const initialWidth = hook.result.rightPanelWidth;
    vi.mocked(writeClientStoreValue).mockClear();

    act(() => {
      hook.result.onRightPanelResizeStart({
        clientX: 800,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 500, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    expect(app.style.getPropertyValue("--right-panel-width")).toBe("");
    expect(hook.result.rightPanelWidth).toBe(initialWidth);
    expect(handle.classList.contains("is-dragging")).toBe(true);
    expect(handle.style.transform).toBe("translate3d(-300px, 0, 0)");
    expect(vi.mocked(writeClientStoreValue)).not.toHaveBeenCalledWith(
      "layout",
      "rightPanelWidth",
      600,
    );

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
      vi.runAllTimers();
    });

    expect(hook.result.rightPanelWidth).toBe(600);
    expect(app.style.getPropertyValue("--right-panel-width")).toBe("600px");
    expect(handle.classList.contains("is-dragging")).toBe(false);
    expect(handle.style.transform).toBe("");
    expect(writeClientStoreValue).toHaveBeenCalledWith(
      "layout",
      "rightPanelWidth",
      600,
    );

    app.remove();
    hook.unmount();
  });

  it("persists sidebar width changes and clamps max", () => {
    const app = document.createElement("div");
    app.className = "app";
    document.body.appendChild(app);
    const handle = document.createElement("div");
    handle.className = "sidebar-resizer";
    app.appendChild(handle);
    writeClientStoreValue("layout", "sidebarWidth", 210);

    const hook = renderResizablePanels();
    const initialWidth = hook.result.sidebarWidth;
    vi.mocked(writeClientStoreValue).mockClear();

    act(() => {
      hook.result.onSidebarResizeStart({
        clientX: 0,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4000, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    expect(hook.result.sidebarWidth).toBe(initialWidth);
    expect(app.style.getPropertyValue("--sidebar-width")).toBe("");
    expect(handle.classList.contains("is-dragging")).toBe(true);
    expect(handle.style.transform).toBe("translate3d(150px, 0, 0)");
    expect(vi.mocked(writeClientStoreValue)).not.toHaveBeenCalledWith(
      "layout",
      "sidebarWidth",
      360,
    );

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.sidebarWidth).toBe(360);
    expect(app.style.getPropertyValue("--sidebar-width")).toBe("360px");
    expect(handle.classList.contains("is-dragging")).toBe(false);
    expect(handle.style.transform).toBe("");
    expect(writeClientStoreValue).toHaveBeenCalledWith(
      "layout",
      "sidebarWidth",
      360,
    );

    app.remove();
    hook.unmount();
  });

  it("persists sidebar width changes and clamps min", () => {
    const app = document.createElement("div");
    app.className = "app";
    document.body.appendChild(app);
    const handle = document.createElement("div");
    handle.className = "sidebar-resizer";
    app.appendChild(handle);
    writeClientStoreValue("layout", "sidebarWidth", 250);

    const hook = renderResizablePanels();
    vi.mocked(writeClientStoreValue).mockClear();

    act(() => {
      hook.result.onSidebarResizeStart({
        clientX: 0,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: -4000, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    expect(hook.result.sidebarWidth).toBe(250);
    expect(app.style.getPropertyValue("--sidebar-width")).toBe("");
    expect(handle.classList.contains("is-dragging")).toBe(true);
    expect(handle.style.transform).toBe("translate3d(-40px, 0, 0)");
    expect(vi.mocked(writeClientStoreValue)).not.toHaveBeenCalledWith(
      "layout",
      "sidebarWidth",
      210,
    );

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.sidebarWidth).toBe(210);
    expect(app.style.getPropertyValue("--sidebar-width")).toBe("210px");
    expect(handle.classList.contains("is-dragging")).toBe(false);
    expect(handle.style.transform).toBe("");

    app.remove();
    hook.unmount();
  });

  it("uses mirrored drag direction for sidebar in swapped layout", () => {
    const app = document.createElement("div");
    app.className = "app layout-swapped";
    document.body.appendChild(app);
    const handle = document.createElement("div");
    handle.className = "sidebar-resizer";
    app.appendChild(handle);
    writeClientStoreValue("layout", "sidebarWidth", 250);

    const hook = renderResizablePanels();

    act(() => {
      hook.result.onSidebarResizeStart({
        clientX: 500,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 400, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    expect(hook.result.sidebarWidth).toBe(250);
    expect(handle.style.transform).toBe("translate3d(-100px, 0, 0)");

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.sidebarWidth).toBe(350);

    app.remove();
    hook.unmount();
  });

  it("uses mirrored drag direction for right panel in swapped layout", () => {
    const app = document.createElement("div");
    app.className = "app layout-swapped";
    document.body.appendChild(app);
    const handle = document.createElement("div");
    handle.className = "right-panel-resizer";
    app.appendChild(handle);
    writeClientStoreValue("layout", "rightPanelWidth", 300);

    const hook = renderResizablePanels();

    act(() => {
      hook.result.onRightPanelResizeStart({
        clientX: 500,
        clientY: 0,
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 600, clientY: 0 }),
      );
      vi.runAllTimers();
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
      vi.runAllTimers();
    });

    expect(hook.result.rightPanelWidth).toBe(400);

    app.remove();
    hook.unmount();
  });

  it("previews and clears the right panel vertical divider while resizing the bottom panel", () => {
    const app = document.createElement("div");
    app.className = "app";
    document.body.appendChild(app);
    const handle = document.createElement("div");
    handle.className = "right-panel-divider";
    app.appendChild(handle);
    writeClientStoreValue("layout", "planPanelHeight", 220);

    const hook = renderResizablePanels();
    vi.mocked(writeClientStoreValue).mockClear();

    act(() => {
      hook.result.onPlanPanelResizeStart({
        clientX: 0,
        clientY: 500,
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 0, clientY: 460 }),
      );
      vi.runAllTimers();
    });

    expect(handle.classList.contains("is-dragging")).toBe(true);
    expect(handle.style.transform).toBe("translate3d(0px, -40px, 0)");
    expect(app.style.getPropertyValue("--plan-panel-height")).toBe("");

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.planPanelHeight).toBe(260);
    expect(app.style.getPropertyValue("--plan-panel-height")).toBe("260px");
    expect(handle.classList.contains("is-dragging")).toBe(false);
    expect(handle.style.transform).toBe("");
    expect(writeClientStoreValue).toHaveBeenCalledWith(
      "layout",
      "planPanelHeight",
      260,
    );

    app.remove();
    hook.unmount();
  });

  it("clamps bottom panel upward dragging to the increased maximum height", () => {
    const app = document.createElement("div");
    app.className = "app";
    document.body.appendChild(app);
    const handle = document.createElement("div");
    handle.className = "right-panel-divider";
    app.appendChild(handle);
    writeClientStoreValue("layout", "planPanelHeight", 600);

    const hook = renderResizablePanels();
    vi.mocked(writeClientStoreValue).mockClear();

    act(() => {
      hook.result.onPlanPanelResizeStart({
        clientX: 0,
        clientY: 500,
        button: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: handle,
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 0, clientY: -200 }),
      );
      vi.runAllTimers();
    });

    expect(hook.result.planPanelHeight).toBe(600);
    expect(handle.style.transform).toBe("translate3d(0px, -30px, 0)");
    expect(app.style.getPropertyValue("--plan-panel-height")).toBe("");

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.planPanelHeight).toBe(630);
    expect(app.style.getPropertyValue("--plan-panel-height")).toBe("630px");
    expect(handle.classList.contains("is-dragging")).toBe(false);
    expect(handle.style.transform).toBe("");
    expect(writeClientStoreValue).toHaveBeenCalledWith(
      "layout",
      "planPanelHeight",
      630,
    );

    app.remove();
    hook.unmount();
  });
});
