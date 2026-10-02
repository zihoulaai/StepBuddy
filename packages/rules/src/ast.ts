/**
 * 表达式 AST（docs/specs/01 §3.3 文法的语法树）。
 * 括号不在 AST 中保留——优先级在 parse 阶段消化；规范化输出时按需重新加括号。
 */

import type { Rational } from "./rational.js";

export type BinaryOp = "+" | "-" | "*" | "/" | "^";

export type Expr =
  | { kind: "num"; value: Rational }
  | { kind: "var"; name: string }
  | { kind: "unary"; op: "-"; operand: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "percent"; operand: Expr }
  | { kind: "withUnit"; operand: Expr; unit: string };

/** 收集表达式中的变量名（仅 var 节点），供 §3.4「变量集合单调」检查 */
export function collectVariables(expr: Expr): Set<string> {
  const vars = new Set<string>();
  const walk = (node: Expr): void => {
    switch (node.kind) {
      case "var":
        vars.add(node.name);
        return;
      case "num":
        return;
      case "unary":
      case "percent":
        walk(node.operand);
        return;
      case "withUnit":
        walk(node.operand);
        return;
      case "binary":
        walk(node.left);
        walk(node.right);
        return;
    }
  };
  walk(expr);
  return vars;
}
