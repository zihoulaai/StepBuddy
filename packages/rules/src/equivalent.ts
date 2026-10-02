/**
 * 最小等价判定（strict 级，Task 2 决策）。
 *
 * 口径：
 * - 双方可定值：Rational 值相等且量纲相等（单位参与判定——
 *   `5厘米/厘米` 与 `5` 不等价，§3.3 约束第 4 条）；
 * - 任一方含变量：比较规范化 canonical 字符串（结构相等）；
 * - 解析失败或求值 invalid（如除零）：返回 invalid，不判等价，
 *   交由上层按 01 §5 退化模式处理。
 *
 * 明确**不含**（属 Task 5 代价函数范围）：§4.3 的近似容差、
 * equivalence_level 分级（strict/formal/approximate）、阈值 τ=0.25 校准。
 */

import { dimensionEquals } from "./dimension.js";
import type { Expr } from "./ast.js";
import { evaluate } from "./evaluate.js";
import { canonicalizeAst } from "./normalize.js";
import { parse } from "./parse.js";

export type EquivalentResult =
  | { status: "equivalent" }
  | { status: "not_equivalent"; reason: string }
  | { status: "invalid"; reason: string };

/** AST × AST 的等价判定 */
export function equivalentAst(before: Expr, after: Expr): EquivalentResult {
  const left = evaluate(before);
  if (left.status === "invalid") {
    return { status: "invalid", reason: left.reason };
  }
  const right = evaluate(after);
  if (right.status === "invalid") {
    return { status: "invalid", reason: right.reason };
  }

  if (left.status === "value" && right.status === "value") {
    if (!left.value.equals(right.value)) {
      return { status: "not_equivalent", reason: "数值不相等" };
    }
    if (!dimensionEquals(left.dimension, right.dimension)) {
      return { status: "not_equivalent", reason: "量纲不一致（单位参与等价判定，01 §3.3）" };
    }
    return { status: "equivalent" };
  }

  // 任一方 symbolic：结构比较（canonical 字符串）
  const leftKey = canonicalizeAst(before);
  const rightKey = canonicalizeAst(after);
  if (leftKey === rightKey) {
    return { status: "equivalent" };
  }
  return { status: "not_equivalent", reason: "含变量的表达式结构不一致" };
}

/** 源码字符串 × 源码字符串的等价判定；解析失败返回 invalid */
export function equivalent(before: string, after: string): EquivalentResult {
  let beforeAst: Expr;
  let afterAst: Expr;
  try {
    beforeAst = parse(before);
    afterAst = parse(after);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "invalid", reason };
  }
  return equivalentAst(beforeAst, afterAst);
}
