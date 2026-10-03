import { describe, expect, it } from "vitest";
import { parse } from "../../src/parse.js";
import { isEquationParseFailure, parseEquation, type EquationSides } from "../../src/space/equation.js";
import {
  equationEquivalence,
  equationEquivalenceDetailed,
  signedTermKeys,
} from "../../src/align/equivalence.js";
import { Rational } from "../../src/rational.js";
import type { Tolerance } from "../../src/align/types.js";

/**
 * 分级等价判定测试（Task 5：D_eq 的等级源；01 §4.2/§4.3、归档 03 §4.3）。
 *
 * 四级：strict（侧向成对，允许跨侧）→ formal（交换/结合律，不含分配律）
 * → approximate（容差量化，仅数值差）→ none。
 */

function sides(text: string): EquationSides {
  const parsed = parseEquation(text);
  if (isEquationParseFailure(parsed)) {
    throw new Error(`测试输入应可解析：${parsed.reason}`);
  }
  return parsed;
}

const DP1: Tolerance = { decimalPlaces: 1 };
const ESTIMATE: Tolerance = { estimation: true };

describe("strict 等级（侧向成对，允许跨侧配对）", () => {
  it("EQL-01 同式：两侧分别相等 → strict/straight", () => {
    expect(equationEquivalenceDetailed(sides("2*x+10=80"), sides("2*x+10=80"))).toEqual({
      level: "strict",
      pairing: "straight",
    });
  });

  it("EQL-02 跨侧反写：80=2*x+10 与 2*x+10=80 → strict/crossed（等式对称性）", () => {
    expect(equationEquivalenceDetailed(sides("80=2*x+10"), sides("2*x+10=80"))).toEqual({
      level: "strict",
      pairing: "crossed",
    });
  });

  it("EQL-03 数值侧值等价：0.5 与 1/2 → strict（精确有理数，无浮点）", () => {
    expect(equationEquivalence(sides("x=0.5"), sides("x=1/2"))).toBe("strict");
    expect(equationEquivalence(sides("x=70/2"), sides("x=35"))).toBe("strict");
  });
});

describe("formal 等级（交换/结合律归一，不含分配律）", () => {
  it("EQL-04 加法换序：x+x+10 与 x+10+x → formal", () => {
    expect(equationEquivalence(sides("x+x+10=80"), sides("x+10+x=80"))).toBe("formal");
  });

  it("EQL-05 减法展平：x-(10-x) 与 x+x-10 → formal（一元负号翻入符号位）", () => {
    expect(equationEquivalence(sides("x-(10-x)=80"), sides("x+x-10=80"))).toBe("formal");
  });

  it("EQL-06 乘法交换：x=2*x 与 x=x*2 → formal（乘法链展平排序；常量 3*20 对 20*3 数值相等走 strict）", () => {
    expect(equationEquivalence(sides("2*x=80"), sides("x*2=80"))).toBe("formal");
    expect(equationEquivalence(sides("x=3*20"), sides("x=20*3"))).toBe("strict");
  });

  it("EQL-07 符号方向错：+10 与 -10 → none（符号不同不算同项）", () => {
    expect(equationEquivalence(sides("x=80+10"), sides("x=80-10"))).toBe("none");
  });

  it("EQL-08 分配律不展开：2*(x+10) 与 2*x+20 → none（D7：分配律是知识点不是形式等价）", () => {
    expect(equationEquivalence(sides("2*(x+10)=80"), sides("2*x+20=80"))).toBe("none");
  });
});

describe("approximate 等级（容差量化，仅数值差；含变量侧须严格相等）", () => {
  it("EQL-09 容差内：decimalPlaces=1 时 x=35.03 对 x=35（|Δ|=0.03 ≤ 0.05）", () => {
    expect(equationEquivalence(sides("x=35.03"), sides("x=35"), DP1)).toBe("approximate");
  });

  it("EQL-10 容差外：decimalPlaces=1 时 x=35.3 对 x=35（|Δ|=0.3 > 0.05）→ none", () => {
    expect(equationEquivalence(sides("x=35.3"), sides("x=35"), DP1)).toBe("none");
  });

  it("EQL-11 无精度要求不启用近似：x=35.03 对 x=35 无容差 → none", () => {
    expect(equationEquivalence(sides("x=35.03"), sides("x=35"))).toBe("none");
  });

  it("EQL-12 估算容差：estimation 时 x=35.4 对 x=35 近似；x=35.6 超界", () => {
    expect(equationEquivalence(sides("x=35.4"), sides("x=35"), ESTIMATE)).toBe("approximate");
    expect(equationEquivalence(sides("x=35.6"), sides("x=35"), ESTIMATE)).toBe("none");
  });
});

describe("signedTermKeys（formal 的归一中间表示）", () => {
  it("EQL-13 括号减法展平 + 排序：x-(10+x) → [+x, -10, -x]", () => {
    expect(signedTermKeys(parse("x-(10+x)"))).toEqual(["+x", "-10", "-x"]);
  });

  it("EQL-14 乘法链展平后 canonical 排序：3*20 与 20*3 同键 +20*3", () => {
    expect(signedTermKeys(parse("3*20"))).toEqual(["+20*3"]);
    expect(signedTermKeys(parse("20*3"))).toEqual(["+20*3"]);
  });

  it("EQL-15 容差界为精确有理数：0.5×10⁻¹ = 1/20，|35.03−35| = 3/100 在界内", () => {
    // decimalPlaces=1 → bound 1/20；|35.03−35| = 3/100 ≤ 1/20
    const deviation = Rational.of(3503n, 100n).sub(Rational.fromInteger(35n)).abs();
    expect(deviation.compare(Rational.of(1n, 20n))).toBe(-1);
  });
});
