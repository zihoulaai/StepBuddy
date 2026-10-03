import { diagnosisResultSchema, type DiagnosisResult } from "@stepbuddy/contracts";
import type { DiagnoseSubmission } from "../../src/diagnose/index.js";
import {
  MODEL_VERSION,
  type LlmClient,
  type LlmErrorCode,
  type LlmRequest,
  type LlmResult,
} from "../../src/llm/index.js";

/**
 * 诊断编排测试辅助（Task 7）：fake client 造法与 test/llm/structure.test.ts 一致；
 * 学生步骤样本与 Task 5 rules 测试（ALN-01/02/04/12/13）同构复用。
 */

/** 按序回放预置结果；末项重复返回（模拟持续失败）。记录全部请求供锁定断言。 */
export function fakeClient(results: LlmResult[]): { client: LlmClient; requests: LlmRequest[] } {
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

export const okContent = (dto: unknown): LlmResult => ({
  ok: true,
  response: { content: JSON.stringify(dto), model: MODEL_VERSION },
  attempts: 1,
});

export const transportFail = (code: LlmErrorCode, message: string): LlmResult => ({
  ok: false,
  attempts: [{ code, message, attempt: 1 }],
});

/** 标准题 golden Extraction（甲比乙多10 + 和80 → 方程 (x+10)+x=80，与 STR-01 同） */
export const GOLDEN_DTO = {
  entities: [
    { name: "甲", role: "unknown" },
    { name: "乙", role: "unknown" },
  ],
  clauses: [
    {
      subjectName: "甲",
      referenceName: "乙",
      relation: "more",
      quantity: { num: 10, den: 1 },
      unit: "个",
      statement: "甲比乙多10个",
    },
    {
      subjectName: "甲",
      referenceName: "乙",
      relation: "sum",
      quantity: { num: 80, den: 1 },
      unit: "个",
      statement: "甲和乙一共80个",
    },
  ],
  targets: ["甲", "乙"],
};

export const STANDARD_QUESTION = "甲和乙一共80个，甲比乙多10个，求甲和乙";

/**
 * 合法非推荐路径全对样本（Task 5 ALN-02 已验证逐步 correct）：
 * 第 2 步偏离推荐路径 → 触发 pathSuggestion（5.3）。
 */
export const CORRECT_STEPS = ["x+10+x=80", "x+x=80-10", "2*x=80-10", "2*x=70", "x=70/2", "x=35"];

/** 移项未变号样本（Task 5 ALN-04）：第 3 步 source 错误（知识性 + ALG.EQ.MOVE），第 4 步 inherited */
export const SIGN_FLIP_STEPS = ["x+10+x=80", "2*x+10=80", "2*x=80+10", "x=45"];

/** 已知单量题 golden Extraction（乙有30个 + 和100 → 方程 x+30=100，与 ALN-12/13 同题；
 *  形状对齐 rules extract 实测：已知量以 has 子句 + entity role=known 表达） */
export const KNOWN_ONE_DTO = {
  entities: [
    { name: "甲", role: "unknown" },
    { name: "乙", role: "known" },
  ],
  clauses: [
    {
      subjectName: "甲",
      referenceName: "乙",
      relation: "sum",
      quantity: { num: 100, den: 1 },
      unit: "个",
      statement: "甲和乙一共100个",
    },
    {
      subjectName: "乙",
      referenceName: "乙",
      relation: "has",
      quantity: { num: 30, den: 1 },
      unit: "个",
      statement: "乙有30个",
    },
  ],
  targets: ["甲"],
};

export const KNOWN_ONE_QUESTION = "甲和乙一共100个，乙有30个，求甲";

/** 终态后多余步骤样本（Task 5 ALN-12）：第 4 步重复终态 → not_judged + ALIGN_FAILED */
export const BEYOND_TERMINAL_STEPS = ["x+30=100", "x=100-30", "x=70", "x=70"];

/** 除零步骤样本（Task 5 ALN-13）：第 2 步 x=100÷0 → not_judged + INVALID_EXPR */
export const DIV_ZERO_STEPS = ["x+30=100", "x=100÷0"];

export function submission(overrides: Partial<DiagnoseSubmission> = {}): DiagnoseSubmission {
  return {
    questionText: STANDARD_QUESTION,
    studentStepsText: CORRECT_STEPS.join("\n"),
    ...overrides,
  };
}

/** 7.2 结构性保证：每个用例输出再独立过一遍 contracts schema（组装层 parse 的双保险） */
export function expectValidResult(result: DiagnosisResult): void {
  const parsed = diagnosisResultSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error(`结果未过 diagnosisResultSchema：${JSON.stringify(parsed.error.issues)}`);
  }
}
