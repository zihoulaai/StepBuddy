import { describe, expect, it } from "vitest";
import {
  assertWithinBudget,
  buildExplainMessages,
  buildStructureMessages,
  estimateTokens,
  PROMPT_TEMPLATE_VERSION,
  TokenBudgetExceeded,
  TOKEN_BUDGET,
} from "../../src/llm/index.js";

const QUESTION = "甲和乙一共80个，甲比乙多10个，求甲和乙";

describe("template：prompt 构造与版本守卫", () => {
  it("TPL-01 模板版本冻结为 tpl-2.1（03 §1.4 示例；改模板必须升版）", () => {
    expect(PROMPT_TEMPLATE_VERSION).toBe("tpl-2.1");
  });

  it("TPL-02 结构化消息：system 含 JSON 契约 + user 为题面本体", () => {
    const { templateVersion, messages } = buildStructureMessages(QUESTION);
    expect(templateVersion).toBe(PROMPT_TEMPLATE_VERSION);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    // 输出契约三要素 + 零温度占位由 client 保证，模板层落到 entities/clauses/targets
    expect(messages[0].content).toContain("entities");
    expect(messages[0].content).toContain("clauses");
    expect(messages[0].content).toContain("targets");
    expect(messages[1]).toEqual({ role: "user", content: QUESTION });
  });

  it("TPL-03 estimateTokens 边界：空串 0 / CJK 每字 1 / 其余每 4 字符 1", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("你好")).toBe(2);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("甲a")).toBe(2); // 1 CJK + 1 other → 1 + ceil(1/4)
  });

  it("TPL-04 结构化题面超预算 → 构造期抛 TokenBudgetExceeded（不截断发送）", () => {
    // 2300 token ≈ 2300 CJK 字；构造 2400 字必超
    const long = "题".repeat(2400);
    const { messages } = buildStructureMessages(long);
    expect(() => assertWithinBudget("question", messages)).toThrow(TokenBudgetExceeded);
    // 正常题面不超
    const ok = buildStructureMessages(QUESTION);
    expect(() => assertWithinBudget("question", ok.messages)).not.toThrow();
  });

  it("TPL-05 讲解载荷超 800 token → 抛 TokenBudgetExceeded", () => {
    const { messages } = buildExplainMessages({
      questionText: QUESTION,
      steps: [{ expression: "x+10+x=80", status: "correct" }],
    });
    expect(() => assertWithinBudget("explain", messages)).not.toThrow();
    const huge = buildExplainMessages({
      questionText: QUESTION,
      steps: [{ expression: "步".repeat(1000), status: "correct" }],
    });
    expect(() => assertWithinBudget("explain", huge.messages)).toThrow(TokenBudgetExceeded);
    expect(TOKEN_BUDGET.question).toBe(2300);
    expect(TOKEN_BUDGET.explain).toBe(800);
  });
});
