import { SpecHubPresentational as SpecHubPresentationalImpl } from "./spec-hub/presentational/SpecHubPresentationalImpl";
import type { DetachedSpecHubSession } from "../detachedSpecHub";
import { SpecHubSurfaceFrame } from "./spec-hub/reader/SpecHubSurfaceFrame";

export type SpecHubProps = {
  workspaceId: string | null;
  workspaceName: string | null;
  files: string[];
  directories: string[];
  onBackToChat: () => void;
  surfaceMode?: "embedded" | "detached";
  detachedReaderSession?: DetachedSpecHubSession | null;
};

export function SpecHubPresentational(props: SpecHubProps) {
  return (
    <SpecHubSurfaceFrame {...props}>
      <SpecHubPresentationalImpl {...props} />
    </SpecHubSurfaceFrame>
  );
}
