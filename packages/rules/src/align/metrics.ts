/**
 * 对齐度量（Task 5.1：D_str 结构差异、D_edit 编辑距离、笔误字符对）。
 *
 * - structuralDiff（D12）：递归并行走查。节点结构相容 = kind 相同且
 *   （num 与任意 num 相容——数值差异归 D_eq；var 同名；op 相同；unit 相同）；
 *   不相容处计 min(子树规模)。D_str = (diffL+diffR)/(maxSizeL+maxSizeR)
 *   （按等价配对逐侧计算、方程整体一个 D_str）。
 * - editDistance：标准 Levenshtein DP（整数无浮点）；D_edit = 距离和/长度和，
 *   作用于配对侧 canonical 串（中缀，运算符与数字同权重，归档 03 §3.3）。
 * - CONFUSABLE_DIGIT_PAIRS：封闭集合（含归档 03 §5.3 正例的 7/8；
 *   扩展点文档化——新增须回到 03 §5.3 改规格）。
 */

import type { Expr } from "../ast.js";
import { canonicalizeAst } from "../normalize.js";
import { Rational } from "../rational.js";

export type StructuralDiff = { diff: number; size: number };

/** AST 节点规模（节点计数） */
export function exprSize(expr: Expr): number {
  switch (expr.kind) {
    case "num":
    case "var":
      return 1;
    case "unary":
    case "percent":
      return 1 + exprSize(expr.operand);
    case "withUnit":
      return 1 + exprSize(expr.operand);
    case "binary":
      return 1 + exprSize(expr.left) + exprSize(expr.right);
  }
}

/** 结构差异：diff=不相容处 min(规模) 之和；size=max(size(a), size(b)) */
export function structuralDiff(a: Expr, b: Expr): StructuralDiff {
  return { diff: diffOf(a, b), size: Math.max(exprSize(a), exprSize(b)) };
}

function diffOf(a: Expr, b: Expr): number {
  const incompatible = Math.min(exprSize(a), exprSize(b));
  if (a.kind === "num" && b.kind === "num") {
    return 0; // 数值差异归 D_eq，结构相容
  }
  if (a.kind === "var" && b.kind === "var") {
    return a.name === b.name ? 0 : incompatible;
  }
  if (a.kind === "unary" && b.kind === "unary") {
    return a.op === b.op ? diffOf(a.operand, b.operand) : incompatible;
  }
  if (a.kind === "percent" && b.kind === "percent") {
    return diffOf(a.operand, b.operand);
  }
  if (a.kind === "withUnit" && b.kind === "withUnit") {
    return a.unit === b.unit ? diffOf(a.operand, b.operand) : incompatible;
  }
  if (a.kind === "binary" && b.kind === "binary") {
    return a.op === b.op ? diffOf(a.left, b.left) + diffOf(a.right, b.right) : incompatible;
  }
  return incompatible;
}

/** Levenshtein 编辑距离（整数 DP） */
export function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 易混淆数字对（封闭集合；归档 03 §5.3） */
export const CONFUSABLE_DIGIT_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 6],
  [0, 8],
  [6, 8],
  [1, 7],
  [3, 8],
  [5, 6],
  [7, 8],
];

export function isConfusablePair(x: number, y: number): boolean {
  return CONFUSABLE_DIGIT_PAIRS.some(([a, b]) => (a === x && b === y) || (a === y && b === x));
}

/** 两串是否恰差一个易混淆数字替换（同位单字符） */
export function singleConfusableSubstitution(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let pos = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (pos >= 0) {
        return false;
      }
      pos = i;
    }
  }
  if (pos < 0) {
    return false;
  }
  const x = Number(a[pos]);
  const y = Number(b[pos]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return false;
  }
  return isConfusablePair(x, y);
}

/**
 * 数值相对偏差 |a−b| / max(|a|,|b|)（Rational 精确；双方为 0 记 0）。
 * B-2 的 ≤50% 判据用；分母取 max 保证对称且除零安全。
 */
export function relativeDeviation(a: Rational, b: Rational): Rational {
  const diff = a.sub(b).abs();
  const scale = a.abs().compare(b.abs()) >= 0 ? a.abs() : b.abs();
  if (scale.equals(Rational.fromInteger(0n))) {
    return Rational.fromInteger(0n);
  }
  return diff.div(scale);
}

/** canonical 串编辑距离（便捷导出，供 D_edit 与笔误复用） */
export function canonicalEditDistance(a: Expr, b: Expr): number {
  return editDistance(canonicalizeAst(a), canonicalizeAst(b));
}
