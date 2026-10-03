/**
 * 诊断结果组装（Task 7.1 结果 JSON / 7.2 不可追溯原因强制替换）。
 *
 * 规格依据：
 * - docs/specs/03 §1：schema_version / result_id / versions 四项 / verdict /
 *   steps / source_error / fallback / teaching / knowledge_points；
 * - 03 §1.1：step index 为 positive（1 起），cost 为 number；
 * - 03 §1.2：traceable 为 false 的原因不得出现在错误原因区，只能出现在建议区；
 * - 03 §1.3：退化标记（mode/exit_code/user_message/partial_steps）；
 * - 决策 D3（result_id 确定性哈希，M-6 双跑整包 deepEqual）、D4（verdict 映射）、
 *   D5（teaching 开放 record）、D6（confidence 省略）、D9（DEPTH/COST 话术 N 口径）。
 *
 * 本模块是 rules 内部形状 → contracts 唯一适配点：
 * index 0→1 起、cost {num,den}→number、equivalenceLevel null→省略字段、
 * relationLocation 不进 errorDetail（contracts 无该字段，规则级定位已由 rule_id 承载）。
 */

import { createHash } from "node:crypto";
import {
  diagnosisResultSchema,
  IR_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION,
  type DiagnosisResult,
  type ErrorDetail,
  type ResultVersions,
  type StepResult,
} from "@stepbuddy/contracts";
import type {
  DiagnosisOutcome,
  SpaceTruncationFlag,
  StepError,
  StepJudgment,
} from "@stepbuddy/rules";
import { MODEL_VERSION, PROMPT_TEMPLATE_VERSION } from "../llm/types.js";
import {
  exitCodeMessage,
  FALLBACK_MODE_BY_EXIT_CODE,
  FALLBACK_VERDICT,
  RULE_LIB_VERSION,
  type FallbackExitCode,
} from "./types.js";

/**
 * 7.2 占位话术：traceable=false 时替换 reason 原文（03 §1.2）。
 * 分类信息（role/classification 等）保留，仅不可追溯的**原因原文**强制替换。
 */
export const UNTRACEABLE_REASON = "该错误无法由规则引擎自动追溯，请结合学生作答过程人工核对";

/** 组装上下文：result_id 哈希输入 + 节点文本查找 + 解题空间截断标记 */
export type AssembleContext = {
  questionText: string;
  studentStepsText: string;
  /** DAG 节点 id → 展示文本（recommended_path / path_completion 转文本；缺省时透传 id） */
  nodeTextById?: ReadonlyMap<string, string>;
  /** 解题空间被预算截断（01 §5 DEPTH_EXCEEDED/COST_EXCEEDED，D9/D10） */
  spaceTruncation?: SpaceTruncationFlag;
};

/** assembleFallback 附加项：已判定步数（DEPTH/COST 的 N）与附加步骤（如无等号行的 INVALID_EXPR） */
export type FallbackOpts = {
  partialSteps?: number;
  steps?: StepResult[];
};

/** 组装产出非法 JSON 时显式抛错（不静默返回未过 schema 的结果） */
export class AssemblyError extends Error {
  constructor(readonly issues: unknown) {
    super(`诊断结果组装未过 contracts schema：${JSON.stringify(issues)}`);
    this.name = "AssemblyError";
  }
}

/* ------------------------------------------------------------------ */
/* 版本与 result_id                                                     */
/* ------------------------------------------------------------------ */

/** 03 §1「IR schema、规则库、模型、模板四项版本」；缺任一项该结果不可用于复核 */
function versionsFor(): ResultVersions {
  return {
    ir_schema_version: IR_SCHEMA_VERSION,
    rule_lib_version: RULE_LIB_VERSION,
    model_version: MODEL_VERSION,
    prompt_template_version: PROMPT_TEMPLATE_VERSION,
  };
}

/** result_id（D3）：`r-` + SHA-256(题面 \n 步骤文本 \n 四项版本连接) 前 12 hex，同输入同输出 */
function computeResultId(
  questionText: string,
  studentStepsText: string,
  versions: ResultVersions,
): string {
  const payload = [
    questionText,
    studentStepsText,
    versions.ir_schema_version,
    versions.rule_lib_version,
    versions.model_version,
    versions.prompt_template_version,
  ].join("\n");
  return `r-${createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 12)}`;
}

/* ------------------------------------------------------------------ */
/* 形状适配                                                             */
/* ------------------------------------------------------------------ */

/** rules StepError → contracts ErrorDetail；7.2：traceable=false 强制替换 reason 原文 */
function mapError(error: StepError): ErrorDetail {
  return {
    role: error.role,
    classification: error.classification,
    ...(error.subtype !== undefined ? { subtype: error.subtype } : {}),
    ...(error.ruleId !== undefined ? { rule_id: error.ruleId } : {}),
    ...(error.location !== undefined ? { location: error.location } : {}),
    reason: error.traceable ? error.reason : UNTRACEABLE_REASON,
    traceable: error.traceable,
  };
}

/** rules StepJudgment → contracts StepResult（index 1 起；cost 数值化；null 等价级省略） */
function mapStep(judgment: StepJudgment): StepResult {
  const error = judgment.error !== undefined ? mapError(judgment.error) : undefined;
  return {
    index: judgment.index + 1,
    status: judgment.status,
    ...(judgment.equivalenceLevel !== null ? { equivalence_level: judgment.equivalenceLevel } : {}),
    ...(judgment.cost !== null ? { cost: judgment.cost.num / judgment.cost.den } : {}),
    ...(error !== undefined ? { error } : {}),
  };
}

/** rules DiagnosisOutcome.sourceError → contracts sourceError；reason 同受 7.2 约束 */
function mapSourceError(outcome: DiagnosisOutcome): DiagnosisResult["source_error"] {
  const source = outcome.sourceError;
  if (source === null) {
    return null;
  }
  // sourceError.reason 取自源头步 error.reason（align.ts L531），按该步 traceable 决定是否替换
  const traceable = outcome.steps[source.stepIndex]?.error?.traceable ?? true;
  return {
    step_index: source.stepIndex + 1,
    classification: source.classification,
    ...(source.ruleId !== undefined ? { rule_id: source.ruleId } : {}),
    reason: traceable ? source.reason : UNTRACEABLE_REASON,
  };
}

/** teaching（D5，开放 record）：recommended_path 文本序列 + 首个路径建议/补全/提示 */
function buildTeaching(outcome: DiagnosisOutcome, ctx: AssembleContext): Record<string, unknown> {
  const textOf = (id: string): string => ctx.nodeTextById?.get(id) ?? id;
  const teaching: Record<string, unknown> = {
    recommended_path: outcome.recommendedPath.map(textOf),
  };
  for (const step of outcome.steps) {
    if (step.pathSuggestion !== undefined && teaching.path_suggestion === undefined) {
      teaching.path_suggestion = step.pathSuggestion;
    }
    if (step.pathCompletion !== undefined && teaching.path_completion === undefined) {
      teaching.path_completion = step.pathCompletion.map(textOf);
    }
    if (step.note !== undefined && teaching.note === undefined) {
      teaching.note = step.note;
    }
  }
  return teaching;
}

/* ------------------------------------------------------------------ */
/* fallback 与 verdict 映射                                             */
/* ------------------------------------------------------------------ */

/**
 * fallback 退出码取舍：INVALID_EXPR（步骤客观错误，与空间无关）优先；
 * 其次解题空间截断（结构性覆盖不全，D10 单路径回退时 outcome 的 ALIGN_FAILED
 * 多为截断的果）；再次 outcome 自带（ALIGN_FAILED / ANSWER_ONLY）。
 */
function resolveExitCode(
  outcome: DiagnosisOutcome,
  ctx: AssembleContext,
): FallbackExitCode | undefined {
  if (outcome.fallback?.exitCode === "INVALID_EXPR") {
    return "INVALID_EXPR";
  }
  if (ctx.spaceTruncation !== undefined) {
    return ctx.spaceTruncation;
  }
  return outcome.fallback?.exitCode;
}

/** judged count = 已判定步骤数（03 §1.3；inherited 计已判定，not_judged 不计） */
function countJudged(steps: readonly StepResult[]): number {
  return steps.filter((step) => step.status !== "not_judged").length;
}

function buildFallback(
  exitCode: FallbackExitCode,
  partialSteps: number,
  messageSteps?: number,
): DiagnosisResult["fallback"] {
  return {
    mode: FALLBACK_MODE_BY_EXIT_CODE[exitCode],
    exit_code: exitCode,
    user_message: exitCodeMessage(exitCode, messageSteps ?? partialSteps),
    partial_steps: partialSteps,
  };
}

function parseResult(result: DiagnosisResult): DiagnosisResult {
  const parsed = diagnosisResultSchema.safeParse(result);
  if (!parsed.success) {
    throw new AssemblyError(parsed.error.issues);
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 正常诊断 outcome → 03 §1 结果 JSON（verdict 三值照搬，D4；
 * 空间截断使 verdict=correct 升级为 partial——覆盖不全不得给出整题判对信号）。
 */
export function assembleResult(outcome: DiagnosisOutcome, ctx: AssembleContext): DiagnosisResult {
  const versions = versionsFor();
  const steps = outcome.steps.map(mapStep);
  const exitCode = resolveExitCode(outcome, ctx);
  const truncated = exitCode === "DEPTH_EXCEEDED" || exitCode === "COST_EXCEEDED";
  const verdict =
    outcome.verdict === "correct" && truncated ? "partial" : outcome.verdict;

  return parseResult({
    schema_version: RESULT_SCHEMA_VERSION,
    result_id: computeResultId(ctx.questionText, ctx.studentStepsText, versions),
    versions,
    verdict,
    steps,
    source_error: mapSourceError(outcome),
    ...(exitCode !== undefined
      ? {
          // D9：DEPTH/COST 话术 N 取学生提交步骤数（截断时已判定步不可知，部分性由 PARTIAL_NOTICE 兜底）
          fallback: buildFallback(exitCode, countJudged(steps), truncated ? steps.length : undefined),
        }
      : {}),
    teaching: buildTeaching(outcome, ctx),
    knowledge_points: [],
  });
}

/** 纯 fallback 组装（无 steps 判定场景：ANSWER_ONLY / DAG_NO_PATH / MODEL_FAILED / UNPARSABLE_INPUT 等） */
export function assembleFallback(
  exitCode: FallbackExitCode,
  ctx: AssembleContext,
  opts: FallbackOpts = {},
): DiagnosisResult {
  const versions = versionsFor();
  const steps = opts.steps ?? [];
  const partialSteps = opts.partialSteps ?? countJudged(steps);

  return parseResult({
    schema_version: RESULT_SCHEMA_VERSION,
    result_id: computeResultId(ctx.questionText, ctx.studentStepsText, versions),
    versions,
    verdict: FALLBACK_VERDICT[exitCode],
    steps,
    source_error: null,
    fallback: buildFallback(exitCode, partialSteps),
    knowledge_points: [],
  });
}
