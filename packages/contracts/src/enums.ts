/**
 * 共享枚举与字面量联合类型。枚举值来源：
 * - QUESTION_TYPES: docs/specs/02 §1 题型枚举（IR question_type 唯一来源）
 * - FALLBACK_EXIT_CODES: docs/specs/01 §5 退出码九类（含应用题专属 MODEL_FAILED）
 * - 其余: docs/specs/01 §3.2、docs/specs/03 §1 / §1.1 / §1.2 / §1.3
 */

export const QUESTION_TYPES = [
  "int_arith",
  "decimal_arith",
  "fraction_arith",
  "simplify_calc",
  "equation",
  "column_calc",
  "word_problem",
  "geometry_calc",
  "percent_ratio",
  "new_operator",
] as const;

export const GRADE_BANDS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;

/** 01 §3.2 source */
export const STEP_SOURCES = ["photo", "manual"] as const;

/** 03 §1 verdict */
export const VERDICTS = ["correct", "incorrect", "partial", "unknown"] as const;

/** 03 §1.1 status */
export const STEP_STATUSES = [
  "correct",
  "incorrect",
  "inherited",
  "not_judged",
] as const;

/** 03 §1.1「严格 / 形式 / 近似」；§1.4 示例仅出现 strict */
export const EQUIVALENCE_LEVELS = ["strict", "formal", "approximate"] as const;

/** 03 §1.2 error.role */
export const ERROR_ROLES = ["source", "concurrent", "inherited"] as const;

/** 03 §1.2 classification */
export const ERROR_CLASSIFICATIONS = ["knowledge", "behavioral", "normative"] as const;

/** 03 §1.2 行为性下位 subtype */
export const ERROR_SUBTYPES = ["slip", "miscalc"] as const;

/** 01 §5 退出码九类：表中八类 + 应用题专属 MODEL_FAILED */
export const FALLBACK_EXIT_CODES = [
  "ANSWER_ONLY",
  "DAG_NO_PATH",
  "DEPTH_EXCEEDED",
  "COST_EXCEEDED",
  "ALIGN_FAILED",
  "INVALID_EXPR",
  "GEOMETRY_NO_PARSE",
  "UNPARSABLE_INPUT",
  "MODEL_FAILED",
] as const;
