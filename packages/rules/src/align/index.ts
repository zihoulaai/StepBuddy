/**
 * 前向对齐、溯源与错误分类（Task 5：01 §4.1–§4.6/§5；
 * 归档 v2-full-scope 03 §2.2 对齐、§3.2 代价、§5.1 provenance、§6.1 三类错误）。
 *
 * 顶层入口：diagnoseSolution（Task 7 编排层直接调用）。
 */

export { diagnoseSolution, MAX_HOPS, recommendedPathIds } from "./align.js";
export { classifyError, type ClassifyContext } from "./classify.js";
export {
  BEYOND_PENALTY,
  COST_BANDS,
  COST_WEIGHTS,
  EQUIV_COST,
  SKIP_PENALTY_CAP,
  SKIP_PENALTY_PER_SKIP,
  costBand,
  skipPenalty,
  stepCost,
  toSolutionValue,
  type CostBand,
  type StepCostOptions,
  type StepCostResult,
} from "./cost.js";
export {
  equationEquivalence,
  equationEquivalenceDetailed,
  signedTermKeys,
  type EquationEquivalence,
  type EquationEquivalenceResult,
  type SidePairing,
} from "./equivalence.js";
export {
  canonicalEditDistance,
  CONFUSABLE_DIGIT_PAIRS,
  editDistance,
  exprSize,
  isConfusablePair,
  relativeDeviation,
  singleConfusableSubstitution,
  structuralDiff,
  type StructuralDiff,
} from "./metrics.js";
export { checkB1, checkB2, classifyTypoPatterns, typoSignature } from "./typo.js";
export type {
  AlignmentInput,
  DiagnosisOutcome,
  ErrorClassification,
  ErrorRole,
  ErrorSubtype,
  StepError,
  StepJudgment,
  StepStatus,
  StudentEquationStep,
  Tolerance,
} from "./types.js";
