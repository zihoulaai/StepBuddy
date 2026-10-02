import { describe, expect, it } from "vitest";
import type { Expr } from "../../src/ast.js";
import { evaluate } from "../../src/evaluate.js";
import { Rational } from "../../src/rational.js";
import { renderEquation } from "../../src/space/equation.js";
import {
  equationKey,
  isEquationParseFailure,
  parseEquation,
  type EquationSides,
} from "../../src/space/index.js";
import { EQ_EVAL, EQ_ISOLATE, EQ_MERGE, EQ_MOVE, type EquationTransform } from "../../src/space/index.js";

/**
 * 4 条 ALG.EQ.* 元规则测试（Task 4 TR 系列）。
 *
 * 断言口径：变换输出断精确 canonical 文本（机械化，无浮点）；
 * 保等价用「线性方程解不变」探针验证——把 x 代入两个精确点重建
 * left−right 的一次函数，比较解值（解集保持的机械判据，禁浮点）。
 */

function sides(text: string): EquationSides {
  const parsed = parseEquation(text);
  if (isEquationParseFailure(parsed)) {
    throw new Error(`测试输入应可解析：${parsed.reason}`);
  }
  return parsed;
}

/** 规则作用于方程的全部后继文本 */
function textsOf(rule: EquationTransform, text: string): string[] {
  return rule.apply(sides(text)).map(renderEquation);
}

/** 把变量替换为给定精确值（仅测试用） */
function substitute(expr: Expr, value: Rational): Expr {
  switch (expr.kind) {
    case "num":
      return expr;
    case "var":
      return { kind: "num", value };
    case "unary":
      return { kind: "unary", op: "-", operand: substitute(expr.operand, value) };
    case "percent":
      return { kind: "percent", operand: substitute(expr.operand, value) };
    case "withUnit":
      return { kind: "withUnit", operand: substitute(expr.operand, value), unit: expr.unit };
    case "binary":
      return {
        kind: "binary",
        op: expr.op,
        left: substitute(expr.left, value),
        right: substitute(expr.right, value),
      };
  }
}

/** 方程在 x=probe 处的差值 left−right（精确有理数） */
function differenceAt(equation: EquationSides, probe: Rational): Rational {
  const left = evaluate(substitute(equation.left, probe));
  const right = evaluate(substitute(equation.right, probe));
  if (left.status !== "value" || right.status !== "value") {
    throw new Error("探针求值失败（方程应可代入）");
  }
  return left.value.sub(right.value);
}

/** 线性方程解（两点定一次函数 mx+c，解为 −c/m）；斜率为 0 返 null */
function solutionOf(equation: EquationSides): Rational | null {
  const f0 = differenceAt(equation, Rational.fromInteger(0n));
  const f1 = differenceAt(equation, Rational.fromInteger(1n));
  const slope = f1.sub(f0);
  if (slope.equals(Rational.fromInteger(0n))) {
    return null;
  }
  return f0.div(slope).neg();
}

describe("ALG.EQ.MERGE 合并同类项", () => {
  it("TR-01 只合并同侧同类项：变量项并系数、常数项求和", () => {
    expect(textsOf(EQ_MERGE, "(x+10)+x=80")).toEqual(["2*x+10=80"]);
    expect(textsOf(EQ_MERGE, "x=20+10")).toEqual(["x=30"]);
    expect(textsOf(EQ_MERGE, "x=50-10")).toEqual(["x=40"]);
  });

  it("TR-02 逐侧生效：两侧均适用产 2 个后继（一步一变换）", () => {
    expect(textsOf(EQ_MERGE, "x+x=20+10")).toEqual(["2*x=20+10", "x+x=30"]);
  });

  it("TR-03 不适用：单条变量项 + 单条常数项", () => {
    expect(textsOf(EQ_MERGE, "2*x+10=80")).toEqual([]);
    expect(textsOf(EQ_MERGE, "x=80")).toEqual([]);
  });
});

describe("ALG.EQ.MOVE 移项", () => {
  it("TR-04 常数项整组变号、不折算（保留中间态）", () => {
    expect(textsOf(EQ_MOVE, "2*x+10=80")).toEqual(["2*x=80-10"]);
    expect(textsOf(EQ_MOVE, "2*x-10=80")).toEqual(["2*x=80+10"]);
    expect(textsOf(EQ_MOVE, "(x+10)+x=80")).toEqual(["x+x=80-10"]);
  });

  it("TR-05 不适用：变量侧无常数项 / 两侧均含变量", () => {
    expect(textsOf(EQ_MOVE, "2*x=70")).toEqual([]);
    expect(textsOf(EQ_MOVE, "x+10=x+5")).toEqual([]);
  });
});

describe("ALG.EQ.EVAL 数值化简", () => {
  it("TR-06 折叠最大常量子树（整条常量链一次折完）", () => {
    expect(textsOf(EQ_EVAL, "x=3×20")).toEqual(["x=60"]);
    expect(textsOf(EQ_EVAL, "x=(45÷3)×5")).toEqual(["x=75"]);
    expect(textsOf(EQ_EVAL, "x=80÷2")).toEqual(["x=40"]);
  });

  it("TR-07 只折叠含常量链的子树，变量子树不动", () => {
    expect(textsOf(EQ_EVAL, "2*x+(3+4)=80")).toEqual(["2*x+7=80"]);
  });

  it("TR-08 除零子表达式不参与（invalid 保守跳过）", () => {
    expect(textsOf(EQ_EVAL, "x=80÷0")).toEqual([]);
  });
});

describe("ALG.EQ.ISOLATE 系数化为 1", () => {
  it("TR-09 整数系数：2*x=70 → x=70/2（保留中间态）", () => {
    expect(textsOf(EQ_ISOLATE, "2*x=70")).toEqual(["x=70/2"]);
  });

  it("TR-10 分数系数：9/4*x=80 → x=80/(9/4)", () => {
    expect(textsOf(EQ_ISOLATE, "9/4*x=80")).toEqual(["x=80/(9/4)"]);
  });

  it("TR-11 不适用：系数 1（已是解形）与系数 0（无解/无穷解）", () => {
    expect(textsOf(EQ_ISOLATE, "x=80")).toEqual([]);
    expect(textsOf(EQ_ISOLATE, "0*x=5")).toEqual([]);
  });
});

describe("不变式：解集保持 + 一步一变换", () => {
  const CASES: Array<{ rule: EquationTransform; text: string }> = [
    { rule: EQ_MERGE, text: "(x+10)+x=80" },
    { rule: EQ_MERGE, text: "x=20+10" },
    { rule: EQ_MOVE, text: "2*x+10=80" },
    { rule: EQ_EVAL, text: "x=(45÷3)×5" },
    { rule: EQ_ISOLATE, text: "2*x=70" },
    { rule: EQ_ISOLATE, text: "9/4*x=80" },
  ];

  it("TR-12 变换前后方程解相同（解集保持）", () => {
    for (const { rule, text } of CASES) {
      const before = sides(text);
      const after = rule.apply(before)[0];
      expect(after, `${rule.id} 应有后继`).toBeDefined();
      expect(solutionOf(before)).not.toBeNull();
      expect(solutionOf(after)).toEqual(solutionOf(before));
    }
  });

  it("TR-13 后继不与输入同 key（严格推进，无自环）", () => {
    for (const { rule, text } of CASES) {
      const before = sides(text);
      for (const after of rule.apply(before)) {
        expect(equationKey(after)).not.toBe(equationKey(before));
      }
    }
  });
});
