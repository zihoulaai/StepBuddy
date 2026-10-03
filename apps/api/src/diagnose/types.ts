/**
 * 诊断编排的类型与话术表（Task 7.1：01 §5 九类退出码教师可见话术）。
 *
 * 规格依据：
 * - docs/specs/01 §5 退出码表与尾注（话术逐条照录，含应用题专属 MODEL_FAILED）；
 * - docs/specs/03 §1.3 退化标记（mode / exit_code / user_message / partial_steps）；
 * - 决策 D7/D8/D9/D11（source 缺省 manual；RULE_LIB_VERSION 本地常量；
 *   DEPTH/COST 话术 N 取学生提交步骤数；GEOMETRY_NO_PARSE MVP 不产生但话术保留）。
 */

import { FALLBACK_EXIT_CODES } from "@stepbuddy/contracts";
import type { DiagnosisResult } from "@stepbuddy/contracts";

/** 01 §5 九类退出码（contracts 枚举的同名联合；本模块不依赖 contracts 命名类型） */
export type FallbackExitCode = (typeof FALLBACK_EXIT_CODES)[number];

/** 单题诊断提交（02 §4.1 diagnose 的进程内入参；source 缺省 manual——D7） */
export type DiagnoseSubmission = {
  questionText: string;
  studentStepsText: string;
  /** 01 §3.2；笔误判定仅 photo 可判（归档 03 §5.3），缺省 manual */
  source?: "photo" | "manual";
};

/**
 * 01 §5 九类退出码 → 教师可见话术（表内「教师可见行为」列原文照录）。
 * DEPTH_EXCEEDED / COST_EXCEEDED 的 N 由 partial_steps 注入（D9），见 exitCodeMessage。
 */
export const EXIT_CODE_MESSAGES: Record<FallbackExitCode, string> = {
  ANSWER_ONLY: "学生只写答案未写过程，本题无法进行步骤诊断",
  DAG_NO_PATH: "该题暂无标准解过程",
  DEPTH_EXCEEDED: "步骤较多，已按前 N 步诊断",
  COST_EXCEEDED: "步骤较多，已按前 N 步诊断",
  ALIGN_FAILED: "该步骤无法匹配标准解法，已标出，请人工核对",
  INVALID_EXPR: "算式本身写错，请检查除数是否为零",
  GEOMETRY_NO_PARSE: "图形部分未识别，相关步骤未校验",
  UNPARSABLE_INPUT: "识别三次仍失败，请转人工输入",
  MODEL_FAILED: "该题题意无法解析，建议人工批改",
};

/** 01 §5 尾注：部分结果必须明确告知「未覆盖的部分未校验」，不得让教师误以为整题已批改 */
export const PARTIAL_NOTICE = "（部分结果：未覆盖的部分未校验）";

/** 部分结果类退出码（01 §5「可继续=是（部分结果）」）：话术统一追加 PARTIAL_NOTICE */
export const PARTIAL_EXIT_CODES: ReadonlySet<FallbackExitCode> = new Set<FallbackExitCode>([
  "DEPTH_EXCEEDED",
  "COST_EXCEEDED",
  "ALIGN_FAILED",
  "GEOMETRY_NO_PARSE",
]);

/**
 * 按退出码取教师可见话术；DEPTH_EXCEEDED/COST_EXCEEDED 注入 N（D9：学生提交步骤数）。
 * 部分结果类追加 01 §5 尾注。
 */
export function exitCodeMessage(code: FallbackExitCode, partialSteps?: number): string {
  const base =
    partialSteps === undefined
      ? EXIT_CODE_MESSAGES[code]
      : EXIT_CODE_MESSAGES[code].replace("N", String(partialSteps));
  return PARTIAL_EXIT_CODES.has(code) ? `${base}${PARTIAL_NOTICE}` : base;
}

/** 03 §1.3 fallback.mode（DEPTH/COST 合并为 space_truncated； contracts mode 为开放字符串） */
export const FALLBACK_MODE_BY_EXIT_CODE: Record<FallbackExitCode, string> = {
  ANSWER_ONLY: "answer_only",
  DAG_NO_PATH: "dag_no_path",
  DEPTH_EXCEEDED: "space_truncated",
  COST_EXCEEDED: "space_truncated",
  ALIGN_FAILED: "align_failed",
  INVALID_EXPR: "invalid_expr",
  GEOMETRY_NO_PARSE: "geometry_no_parse",
  UNPARSABLE_INPUT: "unparsable_input",
  MODEL_FAILED: "model_failed",
};

/**
 * assembleFallback（全题无 steps 判定）的 verdict 映射（D4）：
 * 无判定类 → unknown；有部分判定类 → partial。
 */
export const FALLBACK_VERDICT: Record<FallbackExitCode, DiagnosisResult["verdict"]> = {
  ANSWER_ONLY: "unknown",
  DAG_NO_PATH: "unknown",
  DEPTH_EXCEEDED: "partial",
  COST_EXCEEDED: "partial",
  ALIGN_FAILED: "partial",
  INVALID_EXPR: "unknown",
  GEOMETRY_NO_PARSE: "partial",
  UNPARSABLE_INPUT: "unknown",
  MODEL_FAILED: "unknown",
};

/** 规则库版本（D8：rules 无版本导出，MVP 本地常量；Task 19 发布流程后改为注入） */
export const RULE_LIB_VERSION = "0.1.0";
