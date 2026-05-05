import { describe, expect, it } from "vitest";
import { parseAgentTaskNotification } from "./agentTaskNotification";

describe("parseAgentTaskNotification", () => {
  it("extracts structured metadata and result text from task notification envelopes", () => {
    const parsed = parseAgentTaskNotification(`
<task-notification>
<task-id>task-42</task-id>
<tool-use-id>call-9</tool-use-id>
<output-file>/private/tmp/tasks/task-42.output</output-file>
<status>completed</status>
<summary>Agent "架构治理评估" completed</summary>
<result>第一段结果

第二段结果</result>
</task-notification>
    `);

    expect(parsed).toEqual({
      taskId: "task-42",
      toolUseId: "call-9",
      outputFile: "/private/tmp/tasks/task-42.output",
      status: "completed",
      summary: 'Agent "架构治理评估" completed',
      resultText: "第一段结果\n\n第二段结果",
    });
  });

  it("returns null for ordinary assistant text", () => {
    expect(parseAgentTaskNotification("普通 assistant 回复")).toBeNull();
  });

  it("returns null for long ordinary prose without decoding the whole body as XML", () => {
    const longOrdinaryText = `${"这是正常的长文输出。".repeat(2_000)}\n最后只是普通总结。`;

    expect(parseAgentTaskNotification(longOrdinaryText)).toBeNull();
  });

  it("parses entity-escaped task notification payloads", () => {
    const parsed = parseAgentTaskNotification(`
&lt;task-notification&gt;
  &lt;task-id&gt;task-99&lt;/task-id&gt;
  &lt;status&gt;completed&lt;/status&gt;
  &lt;summary&gt;Agent "Bug诊断与性能安全审查" completed&lt;/summary&gt;
  &lt;result&gt;读取关键文件后，继续进行全面审查。`);

    expect(parsed).toEqual({
      taskId: "task-99",
      toolUseId: null,
      outputFile: null,
      status: "completed",
      summary: 'Agent "Bug诊断与性能安全审查" completed',
      resultText: "读取关键文件后，继续进行全面审查。",
    });
  });

  it("keeps matching envelopes with empty results so the agent card can still render", () => {
    const parsed = parseAgentTaskNotification(`
<task-notification>
<task-id>task-empty</task-id>
<status>completed</status>
<summary>Agent "空结果任务" completed</summary>
<result></result>
</task-notification>
    `);

    expect(parsed).toEqual({
      taskId: "task-empty",
      toolUseId: null,
      outputFile: null,
      status: "completed",
      summary: 'Agent "空结果任务" completed',
      resultText: "",
    });
  });

  it("does not misclassify ordinary prose that merely mentions task-notification markup", () => {
    expect(
      parseAgentTaskNotification(
        '这里演示 XML：<task-notification><result>not a real agent payload</result></task-notification>',
      ),
    ).toBeNull();
  });

  it("parses double-escaped task notifications", () => {
    const parsed = parseAgentTaskNotification(`
&amp;lt;task-notification&amp;gt;
&amp;lt;task-id&amp;gt;task-double&amp;lt;/task-id&amp;gt;
&amp;lt;result&amp;gt;双重转义结果&amp;lt;/result&amp;gt;
    `);

    expect(parsed).toEqual({
      taskId: "task-double",
      toolUseId: null,
      outputFile: null,
      status: null,
      summary: null,
      resultText: "双重转义结果",
    });
  });
});
