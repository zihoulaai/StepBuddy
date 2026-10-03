/**
 * 讲解服务（Task 6.2：LLM 讲解 + G-2 模板降级）。
 *
 * 规格依据：
 * - 归档 13 D-3：讲解模型输入「仅结构化后的表达式与判定结论」，不可用降级 G-2
 *   模板文案 + 标注「标准讲解稍后补充」；
 * - D9（任务决策）：先渲染确定性模板再尝试 LLM 增强——模板渲染零依赖不可能失败，
 *   保证任何输入下讲解通道有确定性产物，不阻塞诊断主链路；
 * - 模板渲染为纯函数（同输入同输出），M-6 一致率由其函数性天然保证。
 */

import {
  assertWithinBudget,
  buildExplainMessages,
  type BudgetKind,
} from "./template.js";
import { MODEL_VERSION, PROMPT_TEMPLATE_VERSION, type ExplainInput, type LlmClient } from "./types.js";
import { assertOutbound } from "./whitelist.js";

export type ExplainOutcome =
  | { status: "llm"; text: string; model: string; templateVersion: string }
  | { status: "template"; text: string; templateVersion: string; notice: "标准讲解稍后补充" };

/** G-2 降级标注（归档 13 D-3 原文） */
export const EXPLAIN_FALLBACK_NOTICE = "标准讲解稍后补充" as const;

/** 确定性模板文案：逐行「第 N 步：表达式 —— 判定；原因」+ 结尾标准话术 */
export function renderTemplateExplanation(input: ExplainInput): string {
  const lines = input.steps.map(
    (step, i) => `第 ${i + 1} 步：${step.expression} —— ${step.status}${step.reason ? `；${step.reason}` : ""}`,
  );
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return `题目：${input.questionText}\n${body}以上为逐步判定结果，供讲评参考。`;
}

/**
 * 讲解入口：先渲染模板（降级兜底恒定可得），再尝试 LLM 增强。
 * LLM 失败/空内容/预算超 → G-2 降级模板文案。
 */
export async function explainQuestion(
  input: ExplainInput,
  client: LlmClient,
): Promise<ExplainOutcome> {
  // C-7 预实现：出站载荷仅题面 + 步骤表达式与判定（归档 13 D-3）
  assertOutbound({
    questionText: input.questionText,
    stepTexts: input.steps.map((step) => step.expression),
  });

  const fallback = (): ExplainOutcome => ({
    status: "template",
    text: renderTemplateExplanation(input),
    templateVersion: PROMPT_TEMPLATE_VERSION,
    notice: EXPLAIN_FALLBACK_NOTICE,
  });

  let messages;
  try {
    ({ messages } = buildExplainMessages(input));
    assertWithinBudget("explain" satisfies BudgetKind, messages);
  } catch {
    return fallback();
  }

  const result = await client.complete({ model: MODEL_VERSION, messages, temperature: 0 });
  if (!result.ok || result.response.content.trim().length === 0) {
    return fallback();
  }
  return {
    status: "llm",
    text: result.response.content,
    model: result.response.model,
    templateVersion: PROMPT_TEMPLATE_VERSION,
  };
}
