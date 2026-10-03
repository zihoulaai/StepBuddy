/**
 * 五分量代价函数与阈值分档（Task 5.1：01 §4.2、归档 03 §3.2/§3.3）。
 *
 * C(s,n) = 0.15·D_str + 0.35·D_edit + 0.40·D_eq + D_skip + D_beyond
 * - D_eq 分级（EQUIV_COST）：strict=0 / formal=0.1 / approximate=0.3 / none=1.0；
 * - D_skip：每跳过一次合法变换 +0.05，封顶 0.20（hops−1 计）；
 * - D_beyond：0.15（超纲规则集 MVP 为空 → 恒 0，参数预留）；
 * - strict 短路（D8）：level=strict → cost = 0 + D_skip + D_beyond，不算 D_str/D_edit。
 *
 * 四档阈值（costBand）：≤0.15 完全匹配判对；(0.15,0.25] 可接受变体判对+路径建议；
 * (0.25,0.40] 可疑（上下文裁决）；>0.40 判错进分类。τ=0.25 等数值为初始值，
 * **须评测集校准后才上线**（01 §4.2/归档 03 §3.2：不校准直接上线等于拍脑袋——D15）。
 *
 * 全程 Rational（BigInt），阈值比较不走浮点；{num,den} 换算是输出层的事。
 */

import type { Expr } from "../ast.js";
import { canonicalizeAst } from "../normalize.js";
import { Rational } from "../rational.js";
import type { EquationSides } from "../space/equation.js";
import type { SolutionValue } from "../space/types.js";
import { equationEquivalenceDetailed, type EquationEquivalence, type SidePairing } from "./equivalence.js";
import { editDistance, structuralDiff } from "./metrics.js";
import type { Tolerance } from "./types.js";

const ZERO = Rational.fromInteger(0n);

export const COST_WEIGHTS = {
  str: Rational.of(15n, 100n),
  edit: Rational.of(35n, 100n),
  eq: Rational.of(40n, 100n),
} as const;

export const SKIP_PENALTY_PER_SKIP = Rational.of(1n, 20n); // 0.05
export const SKIP_PENALTY_CAP = Rational.of(1n, 5n); // 0.20
export const BEYOND_PENALTY = Rational.of(15n, 100n); // 0.15

export const EQUIV_COST: Readonly<Record<EquationEquivalence, Rational>> = {
  strict: ZERO,
  formal: Rational.of(1n, 10n),
  approximate: Rational.of(3n, 10n),
  none: Rational.fromInteger(1n),
};

export const COST_BANDS = {
  fullMatch: Rational.of(15n, 100n), // τ 下界：完全匹配
  accept: Rational.of(25n, 100n), // τ=0.25：可接受变体
  suspect: Rational.of(40n, 100n), // 可疑区间上界
} as const;

export type CostBand = "correct" | "correct_with_suggestion" | "suspect" | "error";

export type StepCostResult = {
  cost: Rational;
  level: EquationEquivalence;
  pairing: SidePairing | null;
  dStr: Rational;
  dEdit: Rational;
  skipped: number;
};

export type StepCostOptions = {
  skipped: number; // 跳过的合法变换数（hops−1）
  beyondRules?: readonly string[]; // 超纲规则集（MVP 为空，恒 0）
  tolerance?: Tolerance;
};

/** 单步对齐代价（纯函数，M-6） */
export function stepCost(student: EquationSides, node: EquationSides, options: StepCostOptions): StepCostResult {
  const { level, pairing } = equationEquivalenceDetailed(student, node, options.tolerance);
  const skip = skipPenalty(options.skipped);
  const beyond =
    options.beyondRules !== undefined && options.beyondRules.length > 0 ? BEYOND_PENALTY : ZERO;

  if (level === "strict") {
    // strict 短路（归档 03 §3.3 明文）：D_str/D_edit 不计
    return { cost: skip.add(beyond), level, pairing, dStr: ZERO, dEdit: ZERO, skipped: options.skipped };
  }

  const pairs: Array<[Expr, Expr]> =
    pairing === "crossed"
      ? [
          [student.left, node.right],
          [student.right, node.left],
        ]
      : [
          [student.left, node.left],
          [student.right, node.right],
        ];
  let diffSum = 0n;
  let sizeSum = 0n;
  let distSum = 0n;
  let lenSum = 0n;
  for (const [a, b] of pairs) {
    const structure = structuralDiff(a, b);
    diffSum += BigInt(structure.diff);
    sizeSum += BigInt(structure.size);
    const textA = canonicalizeAst(a);
    const textB = canonicalizeAst(b);
    distSum += BigInt(editDistance(textA, textB));
    lenSum += BigInt(Math.max(textA.length, textB.length));
  }
  const dStr = sizeSum === 0n ? ZERO : Rational.of(diffSum, sizeSum);
  const dEdit = lenSum === 0n ? ZERO : Rational.of(distSum, lenSum);
  const dEq = EQUIV_COST[level];
  const cost = COST_WEIGHTS.str
    .mul(dStr)
    .add(COST_WEIGHTS.edit.mul(dEdit))
    .add(COST_WEIGHTS.eq.mul(dEq))
    .add(skip)
    .add(beyond);
  return { cost, level, pairing, dStr, dEdit, skipped: options.skipped };
}

/** D_skip = 0.05×skipped，封顶 0.20 */
export function skipPenalty(skipped: number): Rational {
  if (skipped <= 0) {
    return ZERO;
  }
  const raw = SKIP_PENALTY_PER_SKIP.mul(Rational.fromInteger(BigInt(skipped)));
  return raw.compare(SKIP_PENALTY_CAP) > 0 ? SKIP_PENALTY_CAP : raw;
}

export function costBand(cost: Rational): CostBand {
  if (cost.compare(COST_BANDS.fullMatch) <= 0) {
    return "correct";
  }
  if (cost.compare(COST_BANDS.accept) <= 0) {
    return "correct_with_suggestion";
  }
  if (cost.compare(COST_BANDS.suspect) <= 0) {
    return "suspect";
  }
  return "error";
}

/** Rational → {num,den} JSON 安全换算（SolutionValue 形状；MVP 量级内 Number 对 bigint 无损） */
export function toSolutionValue(value: Rational): SolutionValue {
  return { num: Number(value.num), den: Number(value.den) };
}
