import { describe, expect, it } from "vitest";
import type { Expr } from "../../src/ast.js";
import { evaluate } from "../../src/evaluate.js";
import { canonicalizeAst } from "../../src/normalize.js";
import { parse } from "../../src/parse.js";
import {
  equationKey,
  isEquationParseFailure,
  parseEquation,
  renderEquation,
  type EquationSides,
} from "../../src/space/index.js";

/**
 * 方程渲染串 ↔ AST 适配器测试（Task 4 EQ 系列）。
 *
 * 边界：本适配器只消费规则引擎生成的规范方程（隐式乘法两种位置补 `*`）；
 * DSL 严格性不变——学生表达式仍走 parse.ts，`1/2 2/3` 依旧拒绝。
 */

/** 解析方程，失败即测试失败（用例输入均为合法规范方程） */
function sides(text: string): EquationSides {
  const parsed = parseEquation(text);
  if (isEquationParseFailure(parsed)) {
    throw new Error(`测试输入应可解析：${parsed.reason}`);
  }
  return parsed;
}

describe("parseEquation：规范方程 → 两侧 AST", () => {
  it("EQ-01 整数系数隐式乘法：3x+x=80", () => {
    expect(parseEquation("3x+x=80")).toEqual({ left: parse("3*x+x"), right: parse("80") });
  });

  it("EQ-02 括号分数系数：(3/4)x+x=80", () => {
    expect(parseEquation("(3/4)x+x=80")).toEqual({ left: parse("(3/4)*x+x"), right: parse("80") });
  });

  it("EQ-03 括号和差项：(x+10)+x=80", () => {
    expect(parseEquation("(x+10)+x=80")).toEqual({ left: parse("(x+10)+x"), right: parse("80") });
  });

  it("EQ-04 组合直算：x=(45÷3)×5（÷× 归一为运算符；ASCII `45/3` 词法层是单一分数字面量，结构不同故按 canonical 文本 + 取值断言）", () => {
    const parsed = sides("x=(45÷3)×5");
    expect(parsed.left).toEqual(parse("x"));
    expect(canonicalizeAst(parsed.right)).toBe("45/3*5");
    const value = evaluate(parsed.right);
    expect(value.status).toBe("value");
    if (value.status === "value") {
      expect(value.value.toString()).toBe("75");
    }
  });

  it("EQ-05 直算：x=3×20", () => {
    expect(parseEquation("x=3×20")).toEqual({ left: parse("x"), right: parse("3*20") });
  });
});

describe("renderEquation / equationKey：展示归一与等价合并依据", () => {
  it("EQ-06 变量侧置左：35=x → x=35；x=35 与 35=x 同 key", () => {
    expect(renderEquation(sides("35=x"))).toBe("x=35");
    expect(equationKey(sides("35=x"))).toBe(equationKey(sides("x=35")));
  });

  it("EQ-07 变量侧置左：80=2x+10 → 2*x+10=80", () => {
    expect(renderEquation(sides("80=2x+10"))).toBe("2*x+10=80");
  });

  it("EQ-08 不同方程 key 不同（合并不误伤）", () => {
    expect(equationKey(sides("x=35"))).not.toBe(equationKey(sides("x=36")));
    expect(equationKey(sides("2*x=70"))).not.toBe(equationKey(sides("2*x=80-10")));
  });

  it("EQ-09 渲染串 round-trip：重解析后两侧取值守恒（key 断结构；ASCII 分数字面量折叠使结构不可 round-trip、取值可）", () => {
    for (const text of ["3x+x=80", "(x+10)+x=80", "x=3×20", "x=(45÷3)×5", "x+10=80+5"]) {
      const original = sides(text);
      const reparsed = sides(renderEquation(original));
      expect(sideValueText(reparsed.left)).toBe(sideValueText(original.left));
      expect(sideValueText(reparsed.right)).toBe(sideValueText(original.right));
    }
  });
});

/** 单侧取值文本：常量侧为值文本，含变量侧记 symbolic（round-trip 只断取值，不断语法树结构） */
function sideValueText(expr: Expr): string {
  const result = evaluate(expr);
  return result.status === "value" ? result.value.toString() : result.status;
}

describe("DSL 严格性：适配器不放松 parse.ts 边界", () => {
  it("EQ-10 隐式乘法空格邻接仍被拒绝（1/2 2/3）", () => {
    expect(() => parse("1/2 2/3")).toThrow(/不允许隐式乘法/);
    const parsed = parseEquation("1/2 2/3=x");
    expect(isEquationParseFailure(parsed)).toBe(true);
  });

  it("EQ-11 多个顶层等号报错（括号内等号不算）", () => {
    expect(isEquationParseFailure(parseEquation("x=1=y"))).toBe(true);
  });

  it("EQ-12 缺等号报错", () => {
    expect(isEquationParseFailure(parseEquation("3x"))).toBe(true);
  });
});
