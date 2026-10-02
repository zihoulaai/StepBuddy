import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/normalize.js";

/**
 * 规范化（01 §4.1：单位、尾随零、百分数、运算符统一等价写法）。
 * canonical 相同的两种写法即「统一后的同一形式」；变换（1/2*2/3 → 2/3）
 * 不属规范化范畴，canonical 必须不同。
 */
describe("规范化 canonical", () => {
  it("尾随零：0.5 与 1/2 同形，3.50 与 3.5 同形", () => {
    expect(canonicalize("0.5")).toBe("1/2");
    expect(canonicalize("0.5")).toBe(canonicalize("1/2"));
    expect(canonicalize("3.50")).toBe(canonicalize("3.5"));
    expect(canonicalize("3.5")).toBe("7/2");
  });

  it("约分：2/4 与 1/2 同形", () => {
    expect(canonicalize("2/4")).toBe("1/2");
  });

  it("运算符：×/÷ 归一为 * /", () => {
    expect(canonicalize("1/2×2/3")).toBe(canonicalize("1/2*2/3"));
    // ÷ 归一为 /；注意 ASCII 连写 6/4 按文法（Fraction 产生式）是分数字面量、
    // 约简为 3/2，与运算符除法 6÷4 是两棵 AST——值等价由 equivalent 判定
    expect(canonicalize("6÷4")).toBe("6/4");
  });

  it("百分数化为真分数（§4.1 明列）：50% 与 1/2 同形", () => {
    expect(canonicalize("50%")).toBe("1/2");
    expect(canonicalize("50%")).toBe(canonicalize("1/2"));
  });

  it("单位后缀形式：1厘米 与 厘米 同形；5*厘米/厘米 写作 5厘米/厘米", () => {
    expect(canonicalize("1厘米")).toBe("厘米");
    expect(canonicalize("5*厘米/厘米")).toBe("5厘米/厘米");
    expect(canonicalize("5厘米/1厘米")).toBe("5厘米/厘米");
  });

  it("最小括号：左结合不退化，优先级低的子节点加括号", () => {
    expect(canonicalize("1+2+3")).toBe("1+2+3");
    expect(canonicalize("(1+2)*3")).toBe("(1+2)*3");
    expect(canonicalize("1-(2-3)")).toBe("1-(2-3)");
    expect(canonicalize("2*3+4")).toBe("2*3+4");
    expect(canonicalize("-(1+2)")).toBe("-(1+2)");
    expect(canonicalize("2^3")).toBe("2^3");
  });

  it("不折叠常量：(1+2)*3 与 3*3 canonical 不同（改写属规则引擎变换范畴）", () => {
    expect(canonicalize("(1+2)*3")).toBe("(1+2)*3");
    expect(canonicalize("(1+2)*3")).not.toBe(canonicalize("3*3"));
  });

  it("变换与规范化的区别：canonical 不折叠常量，1/2*2/3 与 2/3 canonical 不同", () => {
    expect(canonicalize("1/2*2/3")).toBe("1/2*2/3");
    expect(canonicalize("1/2*2/3")).not.toBe(canonicalize("2/3"));
  });
});
