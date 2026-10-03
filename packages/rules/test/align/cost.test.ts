import { describe, expect, it } from "vitest";
import { parse } from "../../src/parse.js";
import { isEquationParseFailure, parseEquation, type EquationSides } from "../../src/space/equation.js";
import {
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
  type StepCostOptions,
} from "../../src/align/cost.js";
import { Rational } from "../../src/rational.js";
import type { Tolerance } from "../../src/align/types.js";

/**
 * 五分量代价函数与阈值分档测试（Task 5.1：01 §4.2、归档 03 §3.2/§3.3）。
 *
 * C = 0.15·D_str + 0.35·D_edit + 0.40·D_eq + D_skip + D_beyond
 * strict 短路（D8）：level=strict → cost = D_skip + D_beyond。
 * 全程 Rational 精确比较；断言值为手算期望（{num,den} 换算见 toSolutionValue）。
 */

function sides(text: string): EquationSides {
  const parsed = parseEquation(text);
  if (isEquationParseFailure(parsed)) {
    throw new Error(`测试输入应可解析：${parsed.reason}`);
  }
  return parsed;
}

/** node 侧 AST：canonical 文本经 parse 重建（D9，与 align.ts 同口径） */
function nodeSides(left: string, right: string): EquationSides {
  return { left: parse(left), right: parse(right) };
}

const X_EQ_35 = nodeSides("x", "35");

describe("strict 短路与 D_skip", () => {
  it("CST-01 strict 短路：完全匹配 cost=0，D_str/D_edit 不计", () => {
    const result = stepCost(sides("x=35"), X_EQ_35, { skipped: 0 });
    expect(result.level).toBe("strict");
    expect(result.cost.equals(Rational.fromInteger(0n))).toBe(true);
    expect(result.dStr.equals(Rational.fromInteger(0n))).toBe(true);
    expect(result.dEdit.equals(Rational.fromInteger(0n))).toBe(true);
  });

  it("CST-02 skip 累加：strict + 跳过 3 次变换 → cost=3/20", () => {
    const result = stepCost(sides("x=35"), X_EQ_35, { skipped: 3 });
    expect(result.cost.equals(Rational.of(3n, 20n))).toBe(true);
  });

  it("CST-03 skip 封顶：跳过 4 次 → 0.20；skipPenalty 直接验证封顶逻辑", () => {
    const result = stepCost(sides("x=35"), X_EQ_35, { skipped: 4 });
    expect(result.cost.equals(Rational.of(1n, 5n))).toBe(true);
    expect(skipPenalty(0).equals(Rational.fromInteger(0n))).toBe(true);
    expect(skipPenalty(4).equals(SKIP_PENALTY_CAP)).toBe(true);
    expect(skipPenalty(9).equals(SKIP_PENALTY_CAP)).toBe(true);
    expect(SKIP_PENALTY_PER_SKIP.equals(Rational.of(1n, 20n))).toBe(true);
  });

  it("CST-04 D_beyond：超纲规则命中 → +0.15（strict + beyond）", () => {
    const options: StepCostOptions = { skipped: 0, beyondRules: ["ALG.EQ.BEYOND"] };
    const result = stepCost(sides("x=35"), X_EQ_35, options);
    expect(result.cost.equals(BEYOND_PENALTY)).toBe(true);
    const withoutBeyond = stepCost(sides("x=35"), X_EQ_35, { skipped: 0 });
    expect(withoutBeyond.cost.equals(Rational.fromInteger(0n))).toBe(true);
  });
});

describe("formal / none 分量手算", () => {
  it("CST-05 formal：x=2*x 对 x=x*2 → D_str=1/2、D_edit=1/2，cost=29/100（suspect）", () => {
    const result = stepCost(sides("x=2*x"), nodeSides("x", "x*2"), { skipped: 0 });
    expect(result.level).toBe("formal");
    // D_str：右子 2 与 x 两处不相容计 min(1,1)×2 → (0+2)/(1+3)=1/2
    expect(result.dStr.equals(Rational.of(1n, 2n))).toBe(true);
    // D_edit：L(2*x, x*2)=2，分母两侧 max 长度和 1+3=4 → 1/2
    expect(result.dEdit.equals(Rational.of(1n, 2n))).toBe(true);
    // 0.15×1/2 + 0.35×1/2 + 0.40×0.1 = 3/40 + 7/40 + 1/25 = 29/100
    expect(result.cost.equals(Rational.of(29n, 100n))).toBe(true);
    expect(costBand(result.cost)).toBe("suspect");
  });

  it("CST-06 none：x=80+10 对 x=80-10 → D_eq=1.0 主导，cost=137/240（error）", () => {
    const result = stepCost(sides("x=80+10"), nodeSides("x", "80-10"), { skipped: 0 });
    expect(result.level).toBe("none");
    // D_str：右子 op 不同计 min(3,3)=3 → (0+3)/(1+3)=3/4
    expect(result.dStr.equals(Rational.of(3n, 4n))).toBe(true);
    // D_edit：L(80+10, 80-10)=1，分母两侧 max 长度和 1+5=6 → 1/6
    expect(result.dEdit.equals(Rational.of(1n, 6n))).toBe(true);
    // cost = 0.15×3/4 + 0.35×1/6 + 0.40×1 = 9/80 + 7/120 + 2/5 = 27/240 + 14/240 + 96/240 = 137/240
    expect(result.cost.equals(Rational.of(137n, 240n))).toBe(true);
    expect(costBand(result.cost)).toBe("error");
  });
});

describe("approximate 分量", () => {
  it("CST-07 approximate：x=35.03 对 x=35（dp=1）→ D_eq=0.3，cost=53/150（suspect）", () => {
    const tolerance: Tolerance = { decimalPlaces: 1 };
    const result = stepCost(sides("x=35.03"), X_EQ_35, { skipped: 0, tolerance });
    expect(result.level).toBe("approximate");
    expect(result.dStr.equals(Rational.fromInteger(0n))).toBe(true);
    // D_edit：L(3503/100, 35)=6，分母两侧 max 长度和 1+8=9 → 2/3；0.35×2/3 = 7/30
    expect(result.dEdit.equals(Rational.of(2n, 3n))).toBe(true);
    // 0.40×0.3 + 7/30 = 3/25 + 7/30 = 18/150 + 35/150 = 53/150
    expect(result.cost.equals(Rational.of(53n, 150n))).toBe(true);
    expect(costBand(result.cost)).toBe("suspect");
  });
});

describe("阈值分档与常量精确性", () => {
  it("CST-08 四档边界：0.15 判对、0.25 可接受、0.40 可疑、0.41 判错", () => {
    expect(costBand(Rational.fromInteger(0n))).toBe("correct");
    expect(costBand(Rational.of(15n, 100n))).toBe("correct");
    expect(costBand(Rational.of(151n, 1000n))).toBe("correct_with_suggestion");
    expect(costBand(Rational.of(25n, 100n))).toBe("correct_with_suggestion");
    expect(costBand(Rational.of(251n, 1000n))).toBe("suspect");
    expect(costBand(Rational.of(40n, 100n))).toBe("suspect");
    expect(costBand(Rational.of(41n, 100n))).toBe("error");
  });

  it("CST-09 权重与等级代价为精确 Rational（无浮点中间态）", () => {
    expect(COST_WEIGHTS.str.equals(Rational.of(15n, 100n))).toBe(true);
    expect(COST_WEIGHTS.edit.equals(Rational.of(35n, 100n))).toBe(true);
    expect(COST_WEIGHTS.eq.equals(Rational.of(40n, 100n))).toBe(true);
    expect(EQUIV_COST.strict.equals(Rational.fromInteger(0n))).toBe(true);
    expect(EQUIV_COST.formal.equals(Rational.of(1n, 10n))).toBe(true);
    expect(EQUIV_COST.approximate.equals(Rational.of(3n, 10n))).toBe(true);
    expect(EQUIV_COST.none.equals(Rational.fromInteger(1n))).toBe(true);
    expect(COST_BANDS.fullMatch.equals(Rational.of(15n, 100n))).toBe(true);
    expect(COST_BANDS.accept.equals(Rational.of(25n, 100n))).toBe(true); // τ=0.25（待评测集校准）
    expect(COST_BANDS.suspect.equals(Rational.of(40n, 100n))).toBe(true);
  });

  it("CST-10 toSolutionValue：Rational → {num,den} JSON 安全换算", () => {
    expect(toSolutionValue(Rational.fromInteger(0n))).toEqual({ num: 0, den: 1 });
    expect(toSolutionValue(Rational.of(6n, 25n))).toEqual({ num: 6, den: 25 });
    expect(toSolutionValue(Rational.of(1n, 5n))).toEqual({ num: 1, den: 5 });
  });
});
