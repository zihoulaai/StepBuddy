/**
 * 精确求值：AST →（值 + 量纲）（docs/specs/01 §3.3 硬约束）。
 *
 * - 全程 Rational（bigint），无任何浮点路径；
 * - 除数为 0 不抛给调用方：捕获 InvalidRationalError 转为 invalid 结果，
 *   对应「除数为 0 的表达式进入无效状态，不参与等价判定」；
 * - 含变量的表达式无法求值，返回 symbolic（仅携带量纲），
 *   其相等性由规范化 canonical 字符串承担（见 normalize/equivalent）。
 */

import { collectVariables, type BinaryOp, type Expr } from "./ast.js";
import {
  BARE,
  dimensionEquals,
  dimensionPow,
  divideDimensions,
  multiplyDimensions,
  unitDimension,
  type Dimension,
} from "./dimension.js";
import { InvalidRationalError, Rational } from "./rational.js";

export type EvalResult =
  | { status: "invalid"; reason: string }
  | { status: "value"; value: Rational; dimension: Dimension }
  | { status: "symbolic"; dimension: Dimension };

const INVALID_DIV_ZERO = "除数为 0 的表达式进入无效状态，不参与等价判定（01 §3.3）";

export function evaluate(expr: Expr): EvalResult {
  switch (expr.kind) {
    case "num":
      return { status: "value", value: expr.value, dimension: BARE };

    case "var":
      return { status: "symbolic", dimension: BARE };

    case "percent": {
      // 50% = 50/100（§4.1 百分数规范化）
      const inner = evaluate(expr.operand);
      if (inner.status === "invalid") {
        return inner;
      }
      const dimension = inner.dimension;
      if (inner.status === "symbolic") {
        return { status: "symbolic", dimension };
      }
      return { status: "value", value: inner.value.div(Rational.fromInteger(100n)), dimension };
    }

    case "unary": {
      const inner = evaluate(expr.operand);
      if (inner.status === "invalid") {
        return inner;
      }
      if (inner.status === "symbolic") {
        return inner;
      }
      return { status: "value", value: inner.value.neg(), dimension: inner.dimension };
    }

    case "withUnit": {
      const inner = evaluate(expr.operand);
      if (inner.status === "invalid") {
        return inner;
      }
      const dimension = multiplyDimensions(unitDimension(expr.unit), inner.dimension);
      if (inner.status === "symbolic") {
        return { status: "symbolic", dimension };
      }
      return { status: "value", value: inner.value, dimension };
    }

    case "binary":
      return evalBinary(expr.op, expr.left, expr.right);
  }
}

function evalBinary(op: BinaryOp, leftExpr: Expr, rightExpr: Expr): EvalResult {
  const left = evaluate(leftExpr);
  if (left.status === "invalid") {
    return left;
  }
  const right = evaluate(rightExpr);
  if (right.status === "invalid") {
    return right;
  }

  switch (op) {
    case "+":
    case "-": {
      // 完整量纲相等（含 bare）：`5` 与 `5厘米/厘米` 不可加（§3.3 单位参与判定）
      if (!dimensionEquals(left.dimension, right.dimension)) {
        return { status: "invalid", reason: "加减运算两侧量纲不一致" };
      }
      if (left.status === "symbolic" || right.status === "symbolic") {
        return { status: "symbolic", dimension: left.dimension };
      }
      const value = op === "+" ? left.value.add(right.value) : left.value.sub(right.value);
      return { status: "value", value, dimension: left.dimension };
    }

    case "*": {
      const dimension = multiplyDimensions(left.dimension, right.dimension);
      if (left.status === "symbolic" || right.status === "symbolic") {
        return { status: "symbolic", dimension };
      }
      return { status: "value", value: left.value.mul(right.value), dimension };
    }

    case "/": {
      if (right.status === "value" && right.value.num === 0n) {
        return { status: "invalid", reason: INVALID_DIV_ZERO };
      }
      const dimension = divideDimensions(left.dimension, right.dimension);
      if (left.status === "symbolic" || right.status === "symbolic") {
        return { status: "symbolic", dimension };
      }
      try {
        return { status: "value", value: left.value.div(right.value), dimension };
      } catch (error) {
        if (error instanceof InvalidRationalError) {
          return { status: "invalid", reason: INVALID_DIV_ZERO };
        }
        throw error;
      }
    }

    case "^": {
      if (right.status !== "value" || !right.value.isInteger()) {
        return { status: "invalid", reason: "指数必须为整数（精确有理数不支持非整数次幂）" };
      }
      if (left.status === "symbolic") {
        return { status: "symbolic", dimension: dimensionPow(left.dimension, right.value.num) };
      }
      try {
        return {
          status: "value",
          value: left.value.pow(right.value.num),
          dimension: dimensionPow(left.dimension, right.value.num),
        };
      } catch (error) {
        if (error instanceof InvalidRationalError) {
          return { status: "invalid", reason: INVALID_DIV_ZERO };
        }
        throw error;
      }
    }
  }
}

/** 表达式是否含变量（无法定值） */
export function isSymbolic(expr: Expr): boolean {
  return collectVariables(expr).size > 0;
}
