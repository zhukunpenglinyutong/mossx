import ClipboardList from "lucide-react/dist/esm/icons/clipboard-list";
import LayoutList from "lucide-react/dist/esm/icons/layout-list";
import Search from "lucide-react/dist/esm/icons/search";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Workflow from "lucide-react/dist/esm/icons/workflow";
import type { ComponentType } from "react";
import { Button } from "../../../components/ui/button";
import openSpecLogo from "../../../assets/spec-logos/openspec-mark.svg";
import specKitLogo from "../../../assets/spec-logos/spec-kit-logo.webp";

export type WorkspaceHomeGuide = {
  id: "codebaseScan" | "implementationPlan" | "requirements" | "review" | "debug";
  title: string;
  description: string;
  prompt: string;
};

type WorkspaceHomeSpecModuleProps = {
  title: string;
  hint: string;
  openSpecTitle: string;
  openSpecDescription: string;
  openSpecActionLabel: string;
  specKitTitle: string;
  specKitDescription: string;
  specKitActionLabel: string;
  generalGuidesTitle: string;
  generalGuidesHint: string;
  guides: WorkspaceHomeGuide[];
  pendingGuideId: string | null;
  canRunGuides: boolean;
  startingLabel: string;
  onOpenSpecHub: () => void;
  onRunGuide: (guide: WorkspaceHomeGuide) => void;
};

const GUIDE_ICON: Record<
  WorkspaceHomeGuide["id"],
  ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  codebaseScan: LayoutList,
  implementationPlan: ClipboardList,
  requirements: ClipboardList,
  review: Sparkles,
  debug: Search,
};

export function WorkspaceHomeSpecModule({
  title,
  hint,
  openSpecTitle,
  openSpecDescription,
  openSpecActionLabel,
  specKitTitle,
  specKitDescription,
  specKitActionLabel,
  generalGuidesTitle,
  generalGuidesHint,
  guides,
  pendingGuideId,
  canRunGuides,
  startingLabel,
  onOpenSpecHub,
  onRunGuide,
}: WorkspaceHomeSpecModuleProps) {
  return (
    <section className="workspace-home-panel workspace-home-spec-module">
      <div className="workspace-home-section-header">
        <h2>
          <Workflow size={15} aria-hidden className="workspace-home-title-icon" />
          {title}
        </h2>
        <p>{hint}</p>
      </div>

      <div className="workspace-home-spec-provider-grid">
        <Button
          type="button"
          variant="ghost"
          className="workspace-home-spec-provider-card is-openspec"
          onClick={onOpenSpecHub}
          aria-label={`${openSpecTitle}: ${openSpecDescription}`}
        >
          <span className="workspace-home-spec-provider-icon">
            <img
              src={openSpecLogo}
              alt=""
              aria-hidden
              className="workspace-home-spec-provider-logo"
            />
          </span>
          <span className="workspace-home-spec-provider-body">
            <span className="workspace-home-spec-provider-title">{openSpecTitle}</span>
            <span className="workspace-home-spec-provider-description">{openSpecDescription}</span>
            <span className="workspace-home-spec-provider-action">{openSpecActionLabel}</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="workspace-home-spec-provider-card is-speckit"
          onClick={onOpenSpecHub}
          aria-label={`${specKitTitle}: ${specKitDescription}`}
        >
          <span className="workspace-home-spec-provider-icon">
            <img
              src={specKitLogo}
              alt=""
              aria-hidden
              className="workspace-home-spec-provider-logo"
            />
          </span>
          <span className="workspace-home-spec-provider-body">
            <span className="workspace-home-spec-provider-title">{specKitTitle}</span>
            <span className="workspace-home-spec-provider-description">{specKitDescription}</span>
            <span className="workspace-home-spec-provider-action">{specKitActionLabel}</span>
          </span>
        </Button>
      </div>

      <div className="workspace-home-section-header workspace-home-subsection-header">
        <h3>
          <Sparkles size={14} aria-hidden className="workspace-home-subtitle-icon" />
          {generalGuidesTitle}
        </h3>
        <p>{generalGuidesHint}</p>
      </div>
      <div className="workspace-home-guide-list">
        {guides.map((guide) => {
          const isPending = pendingGuideId === guide.id;
          const GuideIcon = GUIDE_ICON[guide.id];
          return (
            <Button
              type="button"
              key={guide.id}
              variant="ghost"
              size="sm"
              className="workspace-home-guide-card"
              onClick={() => {
                onRunGuide(guide);
              }}
              disabled={!canRunGuides}
              aria-label={`${guide.title}: ${guide.description}`}
            >
              <span className="workspace-home-guide-icon">
                <GuideIcon size={16} aria-hidden />
              </span>
              <span className="workspace-home-guide-body">
                <span className="workspace-home-guide-title">
                  {isPending ? startingLabel : guide.title}
                </span>
                <span className="workspace-home-guide-description">{guide.description}</span>
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
