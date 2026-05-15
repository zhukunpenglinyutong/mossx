type KeyHandler = (event: KeyboardEvent) => void;

const handlers = new Set<KeyHandler>();
let installed = false;

function rootHandler(event: KeyboardEvent) {
  for (const handler of Array.from(handlers)) {
    if (event.defaultPrevented) {
      return;
    }
    handler(event);
  }
}

function ensureInstalled() {
  if (installed) return;
  if (typeof window === "undefined") return;
  window.addEventListener("keydown", rootHandler);
  installed = true;
}

function uninstallIfEmpty() {
  if (!installed) return;
  if (handlers.size > 0) return;
  if (typeof window === "undefined") return;
  window.removeEventListener("keydown", rootHandler);
  installed = false;
}

export function registerKeydownHandler(handler: KeyHandler): () => void {
  handlers.add(handler);
  ensureInstalled();
  return () => {
    handlers.delete(handler);
    uninstallIfEmpty();
  };
}
