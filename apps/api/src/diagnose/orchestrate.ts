/**
 * 单题诊断编排管线（Task 7.1：题面文本 + 学生步骤文本 → 03 §1 诊断结果 JSON）。
 *
 * 管线（每步失败即转对应 fallback，不静默继续）：
 * 1. 学生步骤切分：空 → ANSWER_ONLY；非等号行 → INVALID_EXPR（reason 指行号）；
 * 2. LLM 结构化：UNPARSABLE_INPUT / MODEL_FAILED → 对应 fallback；
 *    DEPENDENCY_UNAVAILABLE → DependencyError（系统类，HTTP 503，spec §4.3 不重试转人工）；
 * 3. 解题空间：no_path → DAG_NO_PATH；partial（DEPTH/COST_EXCEEDED）→ space 照用 + 截断标记（D10）；
 * 4. 前向对齐诊断（MVP 无 IR constraint，tolerance 缺省不启用——D6）；
 * 5. 组装收尾（assemble 内做 contracts schema.parse）。
 *
 * 无静默错判：任何失败路径都产出带 fallback 的显式结果或抛系统异常，
 * 不存在「尽力给一个猜测判定」的分支。
 */

import {
  diagnoseSolution,
  generateSolutionSpace,
  type StudentEquationStep,
} from "@stepbuddy/rules";
import type { DiagnosisResult } from "@stepbuddy/contracts";
import { structureQuestion, type LlmClient } from "../llm/index.js";
import { assembleFallback, assembleResult, type AssembleContext } from "./assemble.js";
import { splitStudentSteps, UnparseableStepError } from "./steps.js";
import type { DiagnoseSubmission } from "./types.js";

/** 系统类异常（LLM 传输/预算失败，01 §5 DEPENDENCY_UNAVAILABLE）：路由层转 HTTP 503 */
export class DependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DependencyError";
  }
}

/** 非等号行的 INVALID_EXPR 步骤产物：not_judged + error.reason 指明行号（可追溯，进错误原因区） */
function notEquationStep(error: UnparseableStepError): DiagnosisResult["steps"] {
  return [
    {
      index: 1,
      status: "not_judged",
      error: {
        role: "source",
        classification: "normative",
        reason: error.message,
        traceable: true,
      },
    },
  ];
}

export async function diagnoseSubmission(
  submission: DiagnoseSubmission,
  deps: { client: LlmClient },
): Promise<DiagnosisResult> {
  const questionText = submission.questionText;
  const studentStepsText = submission.studentStepsText;
  const ctx: AssembleContext = { questionText, studentStepsText };

  // 1. 学生步骤切分（D7：source 缺省 manual）
  let steps: StudentEquationStep[];
  try {
    steps = splitStudentSteps(studentStepsText, submission.source ?? "manual");
  } catch (error) {
    if (error instanceof UnparseableStepError) {
      return assembleFallback("INVALID_EXPR", ctx, { steps: notEquationStep(error) });
    }
    throw error;
  }
  if (steps.length === 0) {
    // 只写答案未写过程（01 §5 ANSWER_ONLY：只给对错，不给原因）
    return assembleFallback("ANSWER_ONLY", ctx);
  }

  // 2. LLM 结构化（Task 6；退出码三分支——决策 D1）
  const structured = await structureQuestion(questionText, deps.client);
  if (structured.status === "failed") {
    if (structured.exitCode === "DEPENDENCY_UNAVAILABLE") {
      throw new DependencyError(structured.reason);
    }
    return assembleFallback(structured.exitCode, ctx);
  }
  const model = structured.model;

  // 3. 解题空间（Task 4；no_path/partial 显式——D10 partial space 照常进对齐）
  const spaceResult = generateSolutionSpace(model);
  if (spaceResult.status === "no_path") {
    return assembleFallback("DAG_NO_PATH", ctx);
  }
  const space = spaceResult.space;
  ctx.nodeTextById = new Map(space.nodes.map((node) => [node.id, node.text]));
  if (spaceResult.status === "partial") {
    ctx.spaceTruncation = spaceResult.flag;
  }

  // 4. 前向对齐诊断（Task 5）
  const outcome = diagnoseSolution({ space, model, steps, tolerance: undefined });

  // 5. 组装收尾（内部 schema.parse）
  return assembleResult(outcome, ctx);
}
