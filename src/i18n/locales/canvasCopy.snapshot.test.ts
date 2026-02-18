import { describe, expect, it } from "vitest";
import en from "./en";
import zh from "./zh";

type LocaleShape = {
  plan: {
    title: string;
    noPlan: string;
  };
  statusPanel: {
    emptyPlan: string;
    planGenerating: string;
    planSwitchHint: string;
  };
  messages: {
    nonStreamingHint: string;
    opencodeHeartbeatPulse: string;
    opencodeHeartbeatHint1: string;
    opencodeHeartbeatHint2: string;
    opencodeHeartbeatHint3: string;
    opencodeHeartbeatHint4: string;
    opencodeHeartbeatHint5: string;
  };
};

function pickCanvasCopy(locale: LocaleShape) {
  return {
    plan: {
      title: locale.plan.title,
      noPlan: locale.plan.noPlan,
      emptyPlan: locale.statusPanel.emptyPlan,
      planGenerating: locale.statusPanel.planGenerating,
      planSwitchHint: locale.statusPanel.planSwitchHint,
    },
    opencodeWaiting: {
      nonStreamingHint: locale.messages.nonStreamingHint,
      heartbeatPulse: locale.messages.opencodeHeartbeatPulse,
      hints: [
        locale.messages.opencodeHeartbeatHint1,
        locale.messages.opencodeHeartbeatHint2,
        locale.messages.opencodeHeartbeatHint3,
        locale.messages.opencodeHeartbeatHint4,
        locale.messages.opencodeHeartbeatHint5,
      ],
    },
  };
}

describe("canvas copy i18n snapshot", () => {
  it("matches zh/en copy for plan panel and opencode waiting hints", () => {
    expect({
      en: pickCanvasCopy(en as LocaleShape),
      zh: pickCanvasCopy(zh as LocaleShape),
    }).toMatchInlineSnapshot(`
      {
        "en": {
          "opencodeWaiting": {
            "heartbeatPulse": "Heartbeat {{pulse}}: {{hint}}",
            "hints": [
              "Collecting tool output and aligning context.",
              "The model is still reasoning. Waiting for the next chunk.",
              "Merging subtask outputs into a readable response.",
              "Validating key steps before returning the answer.",
              "Still requesting response data. Please wait...",
            ],
            "nonStreamingHint": "This model may return non-streaming output, or the network may be unreachable. Please wait...",
          },
          "plan": {
            "emptyPlan": "No plan",
            "noPlan": "No plan available",
            "planGenerating": "Generating plan...",
            "planSwitchHint": "Switch to Plan mode to view plan",
            "title": "Plan",
          },
        },
        "zh": {
          "opencodeWaiting": {
            "heartbeatPulse": "心跳 {{pulse}}：{{hint}}",
            "hints": [
              "正在读取工具输出并整理上下文。",
              "模型仍在推理，正在等待下一段有效结果。",
              "正在合并子任务结果，准备输出可读结论。",
              "正在校验关键步骤，避免返回不完整内容。",
              "正在持续请求响应数据，请稍候。",
            ],
            "nonStreamingHint": "该模型可能非流式返回，或网络暂不可达，请稍候...",
          },
          "plan": {
            "emptyPlan": "暂无计划",
            "noPlan": "无可用计划",
            "planGenerating": "正在生成计划...",
            "planSwitchHint": "切换到 Plan 模式后可查看计划",
            "title": "计划",
          },
        },
      }
    `);
  });
});
