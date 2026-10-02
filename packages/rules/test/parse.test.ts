import { describe, expect, it } from "vitest";
import { collectVariables, type Expr } from "../src/ast.js";
import { evaluate } from "../src/evaluate.js";
import { canonicalizeAst } from "../src/normalize.js";
import { parse } from "../src/parse.js";
import { Rational } from "../src/rational.js";
import { ParseError } from "../src/token.js";

/** 解析并求值，要求为可定值结果，返回 Rational 字符串 */
function evalToRationalString(source: string): string {
  const result = evaluate(parse(source));
  if (result.status !== "value") {
    throw new Error(`期望可求值，得到 ${result.status}：${source}`);
  }
  return result.value.toString();
}

describe("文法覆盖（01 §3.3 产生式逐条）", () => {
  it("Number：整数与十进制", () => {
    expect(evalToRationalString("3")).toBe("3");
    expect(evalToRationalString("0.5")).toBe("1/2");
    expect(evalToRationalString("3.14")).toBe("157/50");
  });

  it("Fraction：分子/分母字面量", () => {
    expect(evalToRationalString("1/2")).toBe("1/2");
    expect(evalToRationalString("6/4")).toBe("3/2");
  });

  it("Percent：Number '%'", () => {
    expect(evalToRationalString("50%")).toBe("1/2");
    expect(evalToRationalString("1/2%")).toBe("1/200");
  });

  it("括号与优先级：Expr/Term/Factor 分层，左结合", () => {
    expect(evalToRationalString("2+3*4")).toBe("14");
    expect(evalToRationalString("(2+3)*4")).toBe("20");
    expect(evalToRationalString("1-2-3")).toBe("-4");
    expect(evalToRationalString("8/4*2")).toBe("4");
    expect(evalToRationalString("1/2/3")).toBe("1/6");
  });

  it("Unary：前导负号（仅允许一个）", () => {
    expect(evalToRationalString("-3+5")).toBe("2");
    expect(evalToRationalString("-(1+2)")).toBe("-3");
    expect(evalToRationalString("-2*3")).toBe("-6");
  });

  it("Factor：幂（指数为 Unary，允许负指数）", () => {
    expect(evalToRationalString("2^3")).toBe("8");
    expect(evalToRationalString("2^-2")).toBe("1/4");
    expect(evalToRationalString("(1/2)^2")).toBe("1/4");
  });

  it("Postfix：单位后缀", () => {
    expect(parse("5厘米")).toEqual({
      kind: "withUnit",
      operand: { kind: "num", value: Rational.fromInteger(5n) },
      unit: "厘米",
    });
  });

  it("裸单位=数值 1 带单位（5厘米/厘米 的分位）", () => {
    const result = evaluate(parse("5厘米/厘米"));
    expect(result.status).toBe("value");
    if (result.status === "value") {
      expect(result.value.toString()).toBe("5");
      expect(result.dimension.bare).toBe(false);
      expect(result.dimension.exponents.size).toBe(0);
    }
  });

  it("Ident：变量", () => {
    expect(parse("x")).toEqual({ kind: "var", name: "x" });
  });

  it("×/÷ 归一为 * /", () => {
    expect(canonicalizeAst(parse("3×4"))).toBe(canonicalizeAst(parse("3*4")));
    expect(canonicalizeAst(parse("6÷4"))).toBe("6/4");
  });

  it("AST 结构：括号不入树，优先级已消化", () => {
    const ast: Expr = parse("1+2*3");
    expect(ast.kind).toBe("binary");
    if (ast.kind === "binary") {
      expect(ast.op).toBe("+");
      expect(ast.right.kind).toBe("binary");
    }
    const grouped: Expr = parse("(1+2)");
    expect(grouped.kind).toBe("binary");
    if (grouped.kind === "binary") {
      expect(grouped.op).toBe("+");
      expect(grouped.left.kind).toBe("num");
      expect(grouped.right.kind).toBe("num");
    }
  });

  it("collectVariables 只取 var 节点", () => {
    expect([...collectVariables(parse("2*x + y*3"))].sort()).toEqual(["x", "y"]);
  });

  it("百分号只紧跟数字（(1/2)% 非法）", () => {
    expect(() => parse("(1/2)%")).toThrow(ParseError);
  });
});

describe("硬约束：不允许隐式乘法（01 §3.3，判非法而非补乘号）", () => {
  const cases = ["1/2 2/3", "2x", "(1+2)(3+4)", "x y", "2(3+4)"];
  for (const source of cases) {
    it(`「${source}」报 ParseError`, () => {
      expect(() => parse(source)).toThrow(ParseError);
      try {
        parse(source);
      } catch (error) {
        expect((error as ParseError).reason).toContain("不允许隐式乘法");
        expect(typeof (error as ParseError).position).toBe("number");
      }
    });
  }

  it("显式乘号合法", () => {
    expect(canonicalizeAst(parse("2*x"))).toBe("2*x");
    expect(evalToRationalString("(1+2)*(3+4)")).toBe("21");
  });
});

describe("硬约束：加减运算要求完整量纲相等（含 bare，01 §3.3 单位参与判定）", () => {
  it("5 + 5厘米/厘米：单位出现过与纯数不可加 → invalid", () => {
    expect(evaluate(parse("5 + 5厘米/厘米")).status).toBe("invalid");
  });

  it("x + 5厘米/厘米：symbolic 同样按 bare 差异判 invalid", () => {
    expect(evaluate(parse("x + 5厘米/厘米")).status).toBe("invalid");
  });

  it("完整量纲一致要放行（含结果量纲）", () => {
    expect(evalToRationalString("5+3")).toBe("8");
    expect(evalToRationalString("5厘米+3厘米")).toBe("8");
    expect(evalToRationalString("5厘米/厘米+3厘米/厘米")).toBe("8");
    const withUnit = evaluate(parse("5厘米+3厘米"));
    expect(withUnit.status).toBe("value");
    if (withUnit.status === "value") {
      expect(withUnit.dimension.bare).toBe(false);
      expect([...withUnit.dimension.exponents]).toEqual([["厘米", 1n]]);
    }
  });

  it("5厘米 + 3：指数不同 → invalid（原有口径不变）", () => {
    expect(evaluate(parse("5厘米 + 3")).status).toBe("invalid");
  });
});

describe("其他非法输入", () => {
  it("2^3^2：文法未定义幂的连续运算", () => {
    expect(() => parse("2^3^2")).toThrow(ParseError);
  });

  it("不完整表达式", () => {
    for (const source of ["3 +", "+ 3", "(1+2", "1+", "1++2"]) {
      expect(() => parse(source), source).toThrow(ParseError);
    }
  });

  it("无法识别的字符", () => {
    expect(() => parse("1 @ 2")).toThrow(/无法识别的字符/);
  });

  it("分数除数为 0 在词法期即拒绝", () => {
    expect(() => parse("1/0")).toThrow(/除数为 0/);
  });

  it("带分数（1又1/2）不支持：「又」被切为单位，构成隐式乘法报错", () => {
    expect(() => parse("1又1/2")).toThrow(ParseError);
  });
});
