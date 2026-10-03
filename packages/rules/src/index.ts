export { InvalidRationalError, Rational } from "./rational.js";

// 词法与 AST
export { tokenize, ParseError, type Token } from "./token.js";
export { collectVariables, type BinaryOp, type Expr } from "./ast.js";

// 解析（01 §3.3 文法）
export { parse } from "./parse.js";

// 量纲与求值
export {
  BARE,
  dimensionEquals,
  dimensionExponentsEqual,
  dimensionPow,
  divideDimensions,
  multiplyDimensions,
  unitDimension,
  type Dimension,
} from "./dimension.js";
export { evaluate, isSymbolic, type EvalResult } from "./evaluate.js";

// 规范化与等价判定
export { canonicalize, canonicalizeAst } from "./normalize.js";
export { equivalent, equivalentAst, type EquivalentResult } from "./equivalent.js";

// 原子步不变量检查（01 §3.4）
export {
  checkStepInvariants,
  type InvariantFailure,
  type InvariantName,
  type StepInvariantResult,
  type StepLike,
} from "./invariants.js";

// 关系层建模（Task 3：01 §3.1/§4.0/§4.4/§5、02 §3.2/§5/§129；
// 中间结构 Extraction 即 Task 6 LLM 结构化的交换格式，LLM 产出同构结构后走同一 applyRules）
export {
  ALL_MODEL_RULES,
  applyRules,
  extract,
  modelQuestion,
  synthesize,
  COMPARISON_RELATIONS,
  MULTIPLE_RATIO,
  MULTIPLE_TIMES,
  NORMALIZE_UNIT,
  SUMDIFF_DIFF,
  SUMDIFF_SUM,
  TOTAL_TOTAL,
  VARIABLE_NAME,
  type ComparisonClause,
  type ComparisonRelation,
  type ExtractedEntity,
  type ExtractedQuantity,
  type Extraction,
  type ModelEntity,
  type ModelRelation,
  type ModelResult,
  type ModelRule,
  type ModelingError,
  type RelationModel,
  type RuleDraft,
} from "./model/index.js";

// 解题空间生成（Task 4：01 §4.0/§5、spec.md §2.1 M4；
// 方程适配器只消费规则引擎生成的规范方程，学生表达式仍走严格 parse）
export {
  BUDGET_TIERS,
  budgetFor,
  DEFAULT_SPACE_BUDGET,
  EQ_EVAL,
  EQ_ISOLATE,
  EQ_MERGE,
  EQ_MOVE,
  EQ_TRANSFORMS,
  equationKey,
  generateSolutionSpace,
  isEquationParseFailure,
  normalizeSides,
  parseEquation,
  renderEquation,
  type BudgetTierId,
  type EquationParseFailure,
  type EquationSides,
  type EquationTransform,
  type ParseEquationResult,
  type SolutionEdge,
  type SolutionNode,
  type SolutionSpace,
  type SolutionSpaceResult,
  type SolutionValue,
  type SpaceBudget,
  type SpaceTruncation,
  type SpaceTruncationFlag,
} from "./space/index.js";

// 前向对齐、溯源与错误分类（Task 5：01 §4.1–§4.6/§5；
// 归档 v2-full-scope 03 §2.2 对齐算法、§3.2 代价五分量、§5.1 provenance、§6.1 三类错误；
// τ=0.25 等阈值为初始值，评测集校准后才上线）
export {
  BEYOND_PENALTY,
  COST_BANDS,
  COST_WEIGHTS,
  CONFUSABLE_DIGIT_PAIRS,
  EQUIV_COST,
  MAX_HOPS,
  SKIP_PENALTY_CAP,
  SKIP_PENALTY_PER_SKIP,
  canonicalEditDistance,
  checkB1,
  checkB2,
  classifyError,
  classifyTypoPatterns,
  costBand,
  diagnoseSolution,
  editDistance,
  equationEquivalence,
  equationEquivalenceDetailed,
  isConfusablePair,
  recommendedPathIds,
  relativeDeviation,
  signedTermKeys,
  singleConfusableSubstitution,
  skipPenalty,
  stepCost,
  structuralDiff,
  toSolutionValue,
  typoSignature,
  type AlignmentInput,
  type ClassifyContext,
  type CostBand,
  type DiagnosisOutcome,
  type EquationEquivalence,
  type EquationEquivalenceResult,
  type ErrorClassification,
  type ErrorRole,
  type ErrorSubtype,
  type SidePairing,
  type StepCostOptions,
  type StepCostResult,
  type StepError,
  type StepJudgment,
  type StepStatus,
  type StructuralDiff,
  type StudentEquationStep,
  type Tolerance,
} from "./align/index.js";
