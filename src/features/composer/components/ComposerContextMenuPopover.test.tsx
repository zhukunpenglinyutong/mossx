/** @vitest-environment jsdom */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ComposerContextMenuPopover } from "./ComposerContextMenuPopover";

function PopoverHarness() {
  const [open, setOpen] = useState(false);
  const [closeOnBackdropClick, setCloseOnBackdropClick] = useState(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setCloseOnBackdropClick(true);
          setOpen(true);
        }}
      >
        Open
      </button>
      <button
        type="button"
        onClick={() => {
          setCloseOnBackdropClick(false);
          setOpen(true);
        }}
      >
        Open non dismissable
      </button>
      <button type="button" ref={triggerRef} style={{ display: "none" }}>
        Anchor
      </button>
      <ComposerContextMenuPopover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        closeOnBackdropClick={closeOnBackdropClick}
        panelProps={{ role: "dialog", "aria-label": "Test popover" }}
      >
        <div>Popover content</div>
      </ComposerContextMenuPopover>
    </div>
  );
}

type RenderedHarness = {
  container: HTMLDivElement;
  unmount: () => void;
};

function renderHarness(): RenderedHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<PopoverHarness />);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function openPopover(container: HTMLElement, mode: "default" | "nonDismissable" = "default") {
  const buttonText = mode === "default" ? "Open" : "Open non dismissable";
  const openButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === buttonText,
  );
  if (!openButton) {
    throw new Error("Open button not found");
  }
  await act(async () => {
    (openButton as HTMLButtonElement).click();
  });
}

function queryDialog() {
  return document.querySelector("[role='dialog'][aria-label='Test popover']");
}

describe("ComposerContextMenuPopover", () => {
  it("closes when Escape is pressed", async () => {
    const harness = renderHarness();
    await openPopover(harness.container);

    expect(queryDialog()).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(queryDialog()).toBeNull();
    harness.unmount();
  });

  it("closes when backdrop is clicked by default", async () => {
    const harness = renderHarness();
    await openPopover(harness.container);

    const backdrop = document.querySelector(".composer-context-backdrop");
    if (!backdrop) {
      throw new Error("Backdrop not found");
    }

    await act(async () => {
      (backdrop as HTMLDivElement).click();
    });

    expect(queryDialog()).toBeNull();
    harness.unmount();
  });

  it("does not close when backdrop dismiss is disabled", async () => {
    const harness = renderHarness();
    await openPopover(harness.container, "nonDismissable");

    const backdrop = document.querySelector(".composer-context-backdrop");
    if (!backdrop) {
      throw new Error("Backdrop not found");
    }

    await act(async () => {
      (backdrop as HTMLDivElement).click();
    });

    expect(queryDialog()).not.toBeNull();
    harness.unmount();
  });
});
