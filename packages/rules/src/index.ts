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
