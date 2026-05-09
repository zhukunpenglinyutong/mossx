import { lazy, Suspense } from "react";
import { useWindowLabel } from "./features/layout/hooks/useWindowLabel";
import { AppShell } from "./app-shell";

const AboutView = lazy(() =>
  import("./features/about/components/AboutView").then((module) => ({
    default: module.AboutView,
  })),
);

const DetachedFileExplorerWindow = lazy(() =>
  import("./features/files/components/DetachedFileExplorerWindow").then((module) => ({
    default: module.DetachedFileExplorerWindow,
  })),
);

const DetachedSpecHubWindow = lazy(() =>
  import("./features/spec/components/DetachedSpecHubWindow").then((module) => ({
    default: module.DetachedSpecHubWindow,
  })),
);

const ClientDocumentationWindow = lazy(() =>
  import("./features/client-documentation/components/ClientDocumentationWindow").then((module) => ({
    default: module.ClientDocumentationWindow,
  })),
);

export function AppRouter() {
  const windowLabel = useWindowLabel();
  if (windowLabel === "about") {
    return (
      <Suspense fallback={null}>
        <AboutView />
      </Suspense>
    );
  }
  if (windowLabel === "file-explorer") {
    return (
      <Suspense fallback={null}>
        <DetachedFileExplorerWindow />
      </Suspense>
    );
  }
  if (windowLabel === "spec-hub") {
    return (
      <Suspense fallback={null}>
        <DetachedSpecHubWindow />
      </Suspense>
    );
  }
  if (windowLabel === "client-documentation") {
    return (
      <Suspense fallback={null}>
        <ClientDocumentationWindow />
      </Suspense>
    );
  }
  return <AppShell />;
}

export default AppRouter;
