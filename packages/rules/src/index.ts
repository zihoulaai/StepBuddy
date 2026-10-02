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
