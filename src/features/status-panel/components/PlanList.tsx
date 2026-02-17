import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { TurnPlan } from "../../../types";

interface PlanListProps {
  plan: TurnPlan | null;
  isPlanMode: boolean;
  isProcessing: boolean;
  isCodexEngine?: boolean;
}

export const PlanList = memo(function PlanList({
  plan,
  isPlanMode,
  isProcessing,
  isCodexEngine = false,
}: PlanListProps) {
  const { t } = useTranslation();
  const steps = plan?.steps ?? [];

  if (!isPlanMode && !isCodexEngine) {
    return <div className="sp-empty">{t("statusPanel.planSwitchHint")}</div>;
  }
  if (isProcessing && steps.length === 0) {
    return <div className="sp-empty">{t("statusPanel.planGenerating")}</div>;
  }
  if (steps.length === 0) {
    return <div className="sp-empty">{t("statusPanel.emptyPlan")}</div>;
  }

  return (
    <ol className="sp-plan-list">
      {steps.map((step, index) => (
        <li key={`${step.step}-${index}`} className={`sp-plan-item sp-plan-${step.status}`}>
          <span className="sp-plan-status" aria-hidden>
            {step.status === "completed" ? "✓" : step.status === "inProgress" ? "…" : "○"}
          </span>
          <span className="sp-plan-text">{step.step}</span>
        </li>
      ))}
    </ol>
  );
});
