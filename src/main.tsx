import React from "react";
import ReactDOM from "react-dom/client";
import { preloadClientStores } from "./services/clientStorage";
import { migrateLocalStorageToFileStore } from "./services/migrateLocalStorage";
import { initInputHistoryStore } from "./features/composer/hooks/useInputHistoryStore";

async function bootstrap() {
  await preloadClientStores();
  migrateLocalStorageToFileStore();
  await initInputHistoryStore();
  // i18n must be imported after preload so language can be read from cache
  await import("./i18n");
  const { default: App } = await import("./App");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
