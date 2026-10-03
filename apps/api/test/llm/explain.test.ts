import { describe, expect, it } from "vitest";
import {
  EXPLAIN_FALLBACK_NOTICE,
  explainQuestion,
  MODEL_VERSION,
  PROMPT_TEMPLATE_VERSION,
  renderTemplateExplanation,
  type ExplainInput,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
} from "../../src/llm/index.js";

const INPUT: ExplainInput = {
  questionText: "甲和乙一共80个，甲比乙多10个，求甲和乙",
  steps: [
    { expression: "x+10+x=80", status: "correct" },
    { expression: "2*x=80+10", status: "incorrect", reason: "移项没有变号" },
  ],
};

function fakeClient(results: LlmResult[]): { client: LlmClient; requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  let cursor = 0;
  const client: LlmClient = {
    async complete(request: LlmRequest): Promise<LlmResult> {
      requests.push(request);
      const result = results[Math.min(cursor, results.length - 1)];
      cursor += 1;
      return JSON.parse(JSON.stringify(result)) as LlmResult;
    },
  };
  return { client, requests };
}

const llmOk: LlmResult = {
  ok: true,
  response: { content: "先找等量关系：甲乙之和为 80……", model: "explain-model-1" },
  attempts: 1,
};

describe("explain：讲解生成与 G-2 降级（6.2）", () => {
  it("EXP-01 模板文案确定性：双跑 deepEqual（M-6 一致率由函数性天然保证）", () => {
    const first = renderTemplateExplanation(INPUT);
    const second = renderTemplateExplanation(INPUT);
    expect(first).toBe(second);
    expect(first).toContain("题目：甲和乙一共80个");
    expect(first).toContain("第 1 步：x+10+x=80 —— correct");
    expect(first).toContain("第 2 步：2*x=80+10 —— incorrect；移项没有变号");
  });

  it("EXP-02 LLM 可用 → status llm，文本透传，模板版本随行", async () => {
    const { client, requests } = fakeClient([llmOk]);
    const outcome = await explainQuestion(INPUT, client);
    expect(outcome.status).toBe("llm");
    if (outcome.status !== "llm") return;
    expect(outcome.text).toBe("先找等量关系：甲乙之和为 80……");
    expect(outcome.model).toBe("explain-model-1");
    expect(outcome.templateVersion).toBe(PROMPT_TEMPLATE_VERSION);
    // 零温度 + 白名单载荷（题面 + 步骤表达式与判定结论，C-7/归档 13 D-3）
    expect(requests[0].temperature).toBe(0);
    expect(requests[0].model).toBe(MODEL_VERSION);
    expect(requests[0].messages[1].content).toContain("x+10+x=80");
    expect(requests[0].messages[1].content).toContain("移项没有变号"); // reason 属判定结论，白名单内
    expect(requests[0].messages[0].content).toContain("stepTexts");
  });

  it("EXP-03 LLM 传输失败 → G-2 降级：模板文案 + 「标准讲解稍后补充」", async () => {
    const { client } = fakeClient([
      { ok: false, attempts: [{ code: "TIMEOUT", message: "超时", attempt: 1 }] },
    ]);
    const outcome = await explainQuestion(INPUT, client);
    expect(outcome.status).toBe("template");
    if (outcome.status !== "template") return;
    expect(outcome.notice).toBe(EXPLAIN_FALLBACK_NOTICE);
    expect(outcome.notice).toBe("标准讲解稍后补充");
    expect(outcome.text).toBe(renderTemplateExplanation(INPUT));
  });

  it("EXP-04 LLM 空内容 → 降级；降级文案确定性（不因失败形态变化）", async () => {
    const { client } = fakeClient([
      { ok: true, response: { content: "   ", model: "explain-model-1" }, attempts: 1 },
    ]);
    const outcome = await explainQuestion(INPUT, client);
    expect(outcome.status).toBe("template");
    if (outcome.status !== "template") return;
    expect(outcome.text).toBe(renderTemplateExplanation(INPUT));
    expect(outcome.text).toContain("第 2 步");
  });
});
