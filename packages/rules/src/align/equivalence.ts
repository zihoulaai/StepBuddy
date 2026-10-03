/**
 * 分级等价判定（Task 5：D_eq 的等级源，01 §4.2/§4.3、归档 03 §4.3）。
 *
 * 四级：
 * - strict：侧向成对等价（允许跨侧配对），eq 用 Task 2 equivalentAst
 *   （双方可定值比 Rational+量纲；含变量比 canonical 串）；
 * - formal：交换/结合律归一后相等——每侧「带符号加法项展平」得项多重集，
 *   项内「乘法链展平」后 canonical 文本作键，排序比较多重视点；
 *   **不含分配律**（`2*(x+10) ≢ 2x+20`，分配律是知识点不是形式等价——D7）；
 * - approximate：启用容差且配对侧相容——数值侧双方可定值、量纲相等且 |Δ| ≤ 界
 *   （01 §4.3 量化：decimalPlaces=N → |Δ| ≤ 0.5×10⁻ᴺ；estimation → ≤0.5）；
 *   含变量侧不容忍数值差，须严格等价（近似只覆盖精度差异，不含结构差异）；
 *   MVP 应用题终态通常精确命中，此等级主消费者是 Task 17（D1 范围外）；
 * - none：以上皆非。
 *
 * 严格性递降：任一级命中即返回（strict 优先）。
 */

import type { Expr } from "../ast.js";
import { dimensionEquals } from "../dimension.js";
import { evaluate } from "../evaluate.js";
import { equivalentAst } from "../equivalent.js";
import { canonicalizeAst } from "../normalize.js";
import { Rational } from "../rational.js";
import type { EquationSides } from "../space/equation.js";
import type { Tolerance } from "./types.js";

export type EquationEquivalence = "strict" | "formal" | "approximate" | "none";
export type SidePairing = "straight" | "crossed";

export type EquationEquivalenceResult = {
  level: EquationEquivalence;
  pairing: SidePairing | null; // strict/formal/approximate 命中的配对；none 为 null
};

export function equationEquivalence(a: EquationSides, b: EquationSides, tolerance?: Tolerance): EquationEquivalence {
  return equationEquivalenceDetailed(a, b, tolerance).level;
}

/** 分级判定 + 命中配对（cost 复用配对逐侧计算 D_str/D_edit） */
export function equationEquivalenceDetailed(
  a: EquationSides,
  b: EquationSides,
  tolerance?: Tolerance,
): EquationEquivalenceResult {
  // strict：侧向优先，跨侧兜底（`80=2x+10` ↔ `2*x+10=80`）
  if (sideEquivalent(a.left, b.left) && sideEquivalent(a.right, b.right)) {
    return { level: "strict", pairing: "straight" };
  }
  if (sideEquivalent(a.left, b.right) && sideEquivalent(a.right, b.left)) {
    return { level: "strict", pairing: "crossed" };
  }
  // formal
  if (formalSidesEqual(a.left, b.left) && formalSidesEqual(a.right, b.right)) {
    return { level: "formal", pairing: "straight" };
  }
  if (formalSidesEqual(a.left, b.right) && formalSidesEqual(a.right, b.left)) {
    return { level: "formal", pairing: "crossed" };
  }
  // approximate（需显式容差；无约束不启用，避免把真错判成近似对）
  if (tolerance !== undefined) {
    const bound = toleranceBound(tolerance);
    if (bound !== null) {
      if (approxSide(a.left, b.left, bound) && approxSide(a.right, b.right, bound)) {
        return { level: "approximate", pairing: "straight" };
      }
      if (approxSide(a.left, b.right, bound) && approxSide(a.right, b.left, bound)) {
        return { level: "approximate", pairing: "crossed" };
      }
    }
  }
  return { level: "none", pairing: null };
}

/** strict 单侧判定：equivalentAst 等价即真；invalid（除零等）视为不等价，由上层退化处理 */
function sideEquivalent(x: Expr, y: Expr): boolean {
  return equivalentAst(x, y).status === "equivalent";
}

/* ------------------------------------------------------------------ */
/* formal：带符号加法项多重集                                           */
/* ------------------------------------------------------------------ */

/**
 * 带符号项键列表（排序后）：项 = 符号 + 乘法链展平排序的 canonical 文本。
 * `a-(b+c)` → [-b,-c,a]；一元负号翻入符号位；`3*20` 与 `20*3` 同键。
 */
export function signedTermKeys(expr: Expr): string[] {
  const terms: Array<{ sign: 1 | -1; key: string }> = [];
  flattenAdditive(expr, 1, terms);
  return terms.map((term) => (term.sign === 1 ? "+" : "-") + term.key).sort();
}

function flipSign(sign: 1 | -1): 1 | -1 {
  return sign === 1 ? -1 : 1;
}

function flattenAdditive(expr: Expr, sign: 1 | -1, out: Array<{ sign: 1 | -1; key: string }>): void {
  if (expr.kind === "binary" && expr.op === "+") {
    flattenAdditive(expr.left, sign, out);
    flattenAdditive(expr.right, sign, out);
    return;
  }
  if (expr.kind === "binary" && expr.op === "-") {
    flattenAdditive(expr.left, sign, out);
    flattenAdditive(expr.right, flipSign(sign), out);
    return;
  }
  if (expr.kind === "unary" && expr.op === "-") {
    flattenAdditive(expr.operand, flipSign(sign), out);
    return;
  }
  out.push({ sign, key: termKey(expr) });
}

/** 项内乘法链展平（`*` 结合律）后 canonical 文本排序拼接；`/` 不展平 */
function termKey(expr: Expr): string {
  const factors = flattenMultiplicative(expr);
  return factors
    .map(canonicalizeAst)
    .sort()
    .join("*");
}

function flattenMultiplicative(expr: Expr): Expr[] {
  if (expr.kind === "binary" && expr.op === "*") {
    return [...flattenMultiplicative(expr.left), ...flattenMultiplicative(expr.right)];
  }
  return [expr];
}

function formalSidesEqual(x: Expr, y: Expr): boolean {
  const a = signedTermKeys(x);
  const b = signedTermKeys(y);
  if (a.length !== b.length) {
    return false;
  }
  return a.every((key, i) => key === b[i]);
}

/* ------------------------------------------------------------------ */
/* approximate：量化容差                                                */
/* ------------------------------------------------------------------ */

/** 容差界（Rational 精确）：decimalPlaces 与 estimation 同时存在时取更紧者 */
function toleranceBound(tolerance: Tolerance): Rational | null {
  let bound: Rational | null = null;
  if (tolerance.decimalPlaces !== undefined && tolerance.decimalPlaces >= 0) {
    bound = Rational.of(1n, 2n * 10n ** BigInt(tolerance.decimalPlaces));
  }
  if (tolerance.estimation) {
    const half = Rational.of(1n, 2n);
    if (bound === null || half.compare(bound) < 0) {
      bound = half;
    }
  }
  return bound;
}

/** 配对侧近似相容：数值侧比容差；含变量侧须严格等价（容差不适用于变量结构） */
function approxSide(x: Expr, y: Expr, bound: Rational): boolean {
  const left = evaluate(x);
  const right = evaluate(y);
  if (left.status !== "value" || right.status !== "value") {
    return equivalentAst(x, y).status === "equivalent";
  }
  if (!dimensionEquals(left.dimension, right.dimension)) {
    return false;
  }
  return left.value.sub(right.value).abs().compare(bound) <= 0;
}
