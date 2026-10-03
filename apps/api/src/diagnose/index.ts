/**
 * 诊断编排桶出（Task 7：tasks.md 7.1 单题诊断入口 / 7.2 不可追溯原因守卫）。
 *
 * 依赖方向：diagnose → llm（structureQuestion 端口）/ rules（applyRules 已由 llm 承担，
 * 本层只见 diagnoseSolution / generateSolutionSpace）/ contracts（结果 schema）。
 * contracts/rules/web 零改动。
 */

export {
  assembleFallback,
  assembleResult,
  AssemblyError,
  UNTRACEABLE_REASON,
  type AssembleContext,
  type FallbackOpts,
} from "./assemble.js";

export { DependencyError, diagnoseSubmission } from "./orchestrate.js";

export { splitStudentSteps, UnparseableStepError } from "./steps.js";

export {
  EXIT_CODE_MESSAGES,
  exitCodeMessage,
  FALLBACK_MODE_BY_EXIT_CODE,
  FALLBACK_VERDICT,
  PARTIAL_EXIT_CODES,
  PARTIAL_NOTICE,
  RULE_LIB_VERSION,
  type DiagnoseSubmission,
  type FallbackExitCode,
} from "./types.js";
