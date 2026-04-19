import { Separator } from "@/components/ui/separator";
import { HistoryCompletionSettings } from "../../HistoryCompletionSettings";
import { SessionRadarHistoryManagementSection } from "../../SessionRadarHistoryManagementSection";
import type { SessionRadarEntry } from "../../../../session-activity/hooks/useSessionRadarFeed";
import type { SessionRadarHistoryDeleteResult } from "../../../../session-activity/utils/sessionRadarHistoryManagement";

type OtherSectionProps = {
  title: string;
  description: string;
  sessionRadarRecentCompletedSessions: SessionRadarEntry[];
  onDeleteSessionRadarHistory: (
    entries: SessionRadarEntry[],
  ) => Promise<SessionRadarHistoryDeleteResult>;
};

export function OtherSection({
  title,
  description,
  sessionRadarRecentCompletedSessions,
  onDeleteSessionRadarHistory,
}: OtherSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">{title}</div>
      <div className="settings-section-subtitle">{description}</div>
      <HistoryCompletionSettings />
      <Separator className="my-4" />
      <SessionRadarHistoryManagementSection
        entries={sessionRadarRecentCompletedSessions}
        onDeleteEntries={onDeleteSessionRadarHistory}
      />
    </section>
  );
}
