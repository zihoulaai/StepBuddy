/**
 * prompt 模板与 token 预算（Task 6：tasks.md 6.1 模板版本化）。
 *
 * 规格依据：
 * - 归档 04 §8.2：提示词模板版本化并冻结（模板变更触发主评测集全量回归，§8.1）；
 * - PRD L203-218：单题结构化 token ≤ 2300、讲解 ≤ 800；
 * - 归档 13 §1.1：可用性目标待选型后确定，当前不写具体数字。
 *
 * 模板内容为模块常量：变更必须同升 PROMPT_TEMPLATE_VERSION（TPL-01 测试守卫），
 * 保证「模板版本 ↔ 模板内容」一一对应，诊断快照可复现。
 */

import { PROMPT_TEMPLATE_VERSION, type ExplainInput, type LlmMessage, type StepExplanation } from "./types.js";
import { OUTBOUND_WHITELIST } from "./whitelist.js";

/** PRD 非功能需求：token 上限 */
export const TOKEN_BUDGET = { question: 2300, explain: 800 } as const;

export type BudgetKind = keyof typeof TOKEN_BUDGET;

/** 构造期预算超限：不发出请求，由上层转降级（绝不截断题面——截断即猜题意） */
export class TokenBudgetExceeded extends Error {
  constructor(kind: BudgetKind, estimated: number, limit: number) {
    super(`token 预算超限：${kind} 估算 ${estimated} > 上限 ${limit}（PRD L203-218，不截断发送）`);
    this.name = "TokenBudgetExceeded";
  }
}

/**
 * 确定性 token 估算：CJK 字符每字 1 token，其余每 4 字符 1 token。
 * 规格只给上限未给计量口径——用无依赖确定性估算在构造期断言，
 * 不引 tokenizer（D6：测试可机械化，同输入同输出）。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意
      (code >= 0x3400 && code <= 0x4dbf) || // 扩展 A
      (code >= 0x3000 && code <= 0x303f) || // CJK 标点
      (code >= 0xff00 && code <= 0xffef) // 全角
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return cjk + Math.ceil(other / 4);
}

/** 消息数组总 token 估算（system + user 全部计入出站体量） */
export function estimateMessagesTokens(messages: readonly LlmMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/** 构造期断言：超预算抛 TokenBudgetExceeded（调用方捕获后转降级） */
export function assertWithinBudget(kind: BudgetKind, messages: readonly LlmMessage[]): void {
  const estimated = estimateMessagesTokens(messages);
  if (estimated > TOKEN_BUDGET[kind]) {
    throw new TokenBudgetExceeded(kind, estimated, TOKEN_BUDGET[kind]);
  }
}

/* ------------------------------------------------------------------ */
/* 结构化 prompt（输出契约 = rules Extraction 交换格式）                  */
/* ------------------------------------------------------------------ */

const STRUCTURE_SYSTEM_PROMPT = `你是小学数学应用题的结构化器。把题面解析为 JSON，只输出 JSON 本身，不要任何解释。

输出 schema：
{
  "entities": [{ "name": "实体名", "role": "known|unknown", "quantity": { "num": 整数, "den": 正整数 }, "unit": "单位(可选)" }],
  "clauses": [{
    "subjectName": "主体名",
    "referenceName": "基准名",
    "relation": "more|less|more_fraction|less_fraction|times|times_more|fraction|fraction_more|fraction_less|combo_more|combo_less|sum|per_unit|per_count|per_total|has",
    "quantity": { "num": 整数, "den": 正整数 },
    "diffQuantity": { "num": 整数, "den": 正整数 },
    "unit": "单位(可选)",
    "statement": "原句"
  }],
  "targets": ["求解目标名"]
}

relation 读法（机械化，禁止自行发明）：
- more: A比B多N → A = B + N
- less: A比B少N → A = B − N
- more_fraction / less_fraction: A比B多/少 p/q单位
- times: A是B的n倍 → A = B × n
- times_more: A比B多n倍 → A = B × (n+1)
- fraction: A是B的p/q → A = B × p/q
- fraction_more / fraction_less: A比B多/少 p/q
- combo_more / combo_less: A比B的n倍多/少M → A = B × n ± M（M 入 diffQuantity）
- sum: A和B一共N → A + B = N
- per_unit: 每X N单位 → 每份量 = N
- per_count: N个X + 一共多少 → 份数 = N，目标为总量
- per_total: N个X共M单位 / N小时行M → 总量 = M，份数 = N
- has: A有N单位 → A = N（已知量）

数量一律用 { num, den } 平面结构（整数 num/den，分数不约分也可）。
只提取题面明确陈述的关系，猜不出的子句不要输出；宁缺毋滥。`;

export function buildStructureMessages(questionText: string): {
  templateVersion: string;
  messages: LlmMessage[];
} {
  return {
    templateVersion: PROMPT_TEMPLATE_VERSION,
    messages: [
      { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
      { role: "user", content: questionText },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* 讲解 prompt（输入 = 白名单字段：题面 + 表达式与步骤判定）                */
/* ------------------------------------------------------------------ */

function renderStepsForPrompt(steps: readonly StepExplanation[]): string {
  return steps
    .map((step, i) => `第 ${i + 1} 步：${step.expression} —— ${step.status}${step.reason ? `；${step.reason}` : ""}`)
    .join("\n");
}

export function buildExplainMessages(input: ExplainInput): {
  templateVersion: string;
  messages: LlmMessage[];
} {
  const lines = renderStepsForPrompt(input.steps);
  return {
    templateVersion: PROMPT_TEMPLATE_VERSION,
    messages: [
      {
        role: "system",
        content:
          "你是小学数学讲解助手。根据给定的题目与分步判定结论，为教师生成一段简明中文讲解。" +
          `只允许基于给定内容讲解，不得引入题目之外的信息。允许外发的字段集合：${OUTBOUND_WHITELIST.join("、")}。`,
      },
      {
        role: "user",
        content: `题目：${input.questionText}\n分步判定：\n${lines}`,
      },
    ],
  };
}
