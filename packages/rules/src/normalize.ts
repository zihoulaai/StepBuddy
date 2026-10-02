/**
 * 规范化（docs/specs/01 §4.1：统一等价写法——单位、尾随零、百分数、运算符）。
 *
 * canonical 字符串规则：
 * - 整数不带分母，分数约分后输出 a/b（尾随零由 Rational 构造自然消除，3.50 → 7/2）；
 * - 运算符统一 ASCII：+ - * / ^（×/÷ 已在词法层归一）；
 * - 百分数化为真分数（50% → 1/2，§4.1 明列）；
 * - 单位以后缀形式附着：数值 1 的单位省略系数（`1厘米` → `厘米`，
 *   `5*厘米/厘米` → `5厘米/厘米`）；
 * - 按运算符优先级最小加括号（不折叠常量：(1+2)*3 保持原样，
 *   常量折叠与改写属规则引擎的变换范畴）。
 *
 * canonical 相同的含义仅限「同一棵语法树」；值等价（如 1/2+1/3 与 5/6）
 * 由 equivalent.ts 的求值判定承担。
 */

import type { BinaryOp, Expr } from "./ast.js";
import { parse } from "./parse.js";
import { Rational } from "./rational.js";

/** 优先级：加减 1，乘除 2，幂 3 */
function precedenceOf(op: BinaryOp): 1 | 2 | 3 {
  if (op === "+" || op === "-") {
    return 1;
  }
  if (op === "*" || op === "/") {
    return 2;
  }
  return 3;
}

/** binary 子节点是否需要括号（右子节点同优先级需括号，保证左结合语义不回退） */
function childNeedsParens(child: Expr, parentOp: BinaryOp, isRight: boolean): boolean {
  if (child.kind !== "binary") {
    return false;
  }
  const parent = precedenceOf(parentOp);
  const childPrec = precedenceOf(child.op);
  if (isRight) {
    return childPrec <= parent;
  }
  return childPrec < parent;
}

/** 表达式是否含单位标记（用于「裸单位折叠」守卫，避免 5厘米*厘米 误折叠） */
function hasUnit(expr: Expr): boolean {
  switch (expr.kind) {
    case "withUnit":
      return true;
    case "num":
    case "var":
      return false;
    case "unary":
    case "percent":
      return hasUnit(expr.operand);
    case "binary":
      return hasUnit(expr.left) || hasUnit(expr.right);
  }
}

/** 裸单位节点？withUnit(num 1, unit) */
function bareUnit(expr: Expr): string | null {
  if (
    expr.kind === "withUnit" &&
    expr.operand.kind === "num" &&
    expr.operand.value.equals(Rational.fromInteger(1n))
  ) {
    return expr.unit;
  }
  return null;
}

function formatNode(expr: Expr): string {
  switch (expr.kind) {
    case "num":
      return expr.value.toString();
    case "var":
      return expr.name;
    case "percent": {
      // 百分数在 canonical 中落地为真分数（operand 恒为 number，见 parse）
      if (expr.operand.kind !== "num") {
        return `${formatNode(expr.operand)}/100`;
      }
      return expr.operand.value.div(Rational.fromInteger(100n)).toString();
    }
    case "unary": {
      const inner = expr.operand;
      const innerText = inner.kind === "binary" ? `(${formatNode(inner)})` : formatNode(inner);
      return `-${innerText}`;
    }
    case "withUnit": {
      const inner = expr.operand;
      // 数值 1 的单位省略系数：1厘米 → 厘米
      if (inner.kind === "num" && inner.value.equals(Rational.fromInteger(1n))) {
        return expr.unit;
      }
      const innerText = inner.kind === "binary" ? `(${formatNode(inner)})` : formatNode(inner);
      return `${innerText}${expr.unit}`;
    }
    case "binary": {
      // 裸单位折叠：`5*厘米` → `5厘米`（等价写法统一，§4.1 单位）；
      // 仅当左侧本身不带单位时折叠，避免 `5厘米*厘米` 误折叠为歧义串
      const unit = bareUnit(expr.right);
      if (expr.op === "*" && unit !== null && !hasUnit(expr.left)) {
        const leftText = expr.left.kind === "binary" ? `(${formatNode(expr.left)})` : formatNode(expr.left);
        return `${leftText}${unit}`;
      }
      const leftText = childNeedsParens(expr.left, expr.op, false)
        ? `(${formatNode(expr.left)})`
        : formatNode(expr.left);
      const rightText = childNeedsParens(expr.right, expr.op, true)
        ? `(${formatNode(expr.right)})`
        : formatNode(expr.right);
      return `${leftText}${expr.op}${rightText}`;
    }
  }
}

/** AST → canonical 字符串 */
export function canonicalizeAst(expr: Expr): string {
  return formatNode(expr);
}

/** 源码 → canonical 字符串；解析失败抛 ParseError */
export function canonicalize(source: string): string {
  return formatNode(parse(source));
}
