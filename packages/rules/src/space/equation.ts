/**
 * 方程渲染串 ↔ AST 适配器（Task 4 解题空间的 DSL 边界）。
 *
 * 背景：Task 3 的 RelationModel.equation 是**展示串**，含隐式乘法（`3x+x=80`、
 * `(3/4)x+x=80`），而 src/parse.ts 严格拒绝隐式乘法（01 §3.3：`2x`、`1/2 2/3`
 * 判非法、不补乘号）。本适配器在规则引擎自有方程的**生成侧**补显式 `*`，
 * 不动 DSL 严格性——学生表达式仍走 parse.ts 零改动的严格路径（Task 5/6 同边界）。
 *
 * 补 `*` 仅两种邻接位置：number→ident（`3x`）与 rparen→ident（`(3/4)x`）；
 * 空格类邻接（`1/2 2/3`）保持原样由 parser 拒绝，不补乘号。
 */

import { collectVariables, type Expr } from "../ast.js";
import { canonicalizeAst } from "../normalize.js";
import { parse } from "../parse.js";
import { tokenize, type Token } from "../token.js";

/** 方程两侧 AST（有序；等价判定与展示归一由本模块负责，变换规则不依赖左右次序） */
export type EquationSides = { left: Expr; right: Expr };

/** 方程解析失败（调用方映射为 01 §5 DAG_NO_PATH，不静默错判） */
export type EquationParseFailure = { code: "EQUATION_PARSE_FAILED"; reason: string };

export type ParseEquationResult = EquationSides | EquationParseFailure;

export function isEquationParseFailure(result: ParseEquationResult): result is EquationParseFailure {
  return "code" in result;
}

/** token 在源码中的结束位置（多字符 token 按 text 长度，单字符按 1） */
function tokenEnd(token: Token): number {
  if (token.type === "number" || token.type === "unit" || token.type === "ident") {
    return token.pos + token.text.length;
  }
  if (token.type === "eof") {
    return token.pos;
  }
  return token.pos + 1;
}

/** 前一个 token 是否可与后一个 ident 发生隐式乘法（仅 number/rparen 两种） */
function needsImplicitMul(prev: Token, next: Token): boolean {
  return (prev.type === "number" || prev.type === "rparen") && next.type === "ident";
}

/**
 * 在 token 邻接处补显式 `*`；保留原空白（`1/2 2/3` 类空格邻接原样输出，
 * 交由 parser 按隐式乘法拒绝）。`=` 已在切分两侧前移除，tokenize 不会遇它。
 */
function insertExplicitMul(source: string): string {
  const tokens = tokenize(source).filter((token) => token.type !== "eof");
  let out = "";
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const end = tokenEnd(token);
    if (i > 0 && needsImplicitMul(tokens[i - 1], token)) {
      out += `${source.slice(cursor, token.pos)}*${source.slice(token.pos, end)}`;
    } else {
      out += source.slice(cursor, end);
    }
    cursor = end;
  }
  return out;
}

/** 括号计数定位顶层 `=`：恰一个；0 个或多个均为解析失败 */
function splitTopLevelEquals(text: string): { left: string; right: string } | EquationParseFailure {
  let depth = 0;
  let found = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "=" && depth === 0) {
      if (found >= 0) {
        return { code: "EQUATION_PARSE_FAILED", reason: `方程存在多个顶层等号（位置 ${found} 与 ${i}）` };
      }
      found = i;
    }
  }
  if (found < 0) {
    return { code: "EQUATION_PARSE_FAILED", reason: "方程缺少顶层等号" };
  }
  return { left: text.slice(0, found), right: text.slice(found + 1) };
}

/**
 * 方程展示串 → 两侧 AST。解析失败（多等号/缺等号/DSL 非法）返回
 * EQUATION_PARSE_FAILED，由调用方显式处理，不抛异常穿层。
 */
export function parseEquation(text: string): ParseEquationResult {
  const split = splitTopLevelEquals(text);
  if ("code" in split) {
    return split;
  }
  try {
    return { left: parse(insertExplicitMul(split.left)), right: parse(insertExplicitMul(split.right)) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { code: "EQUATION_PARSE_FAILED", reason: `方程两侧无法解析：${reason}` };
  }
}

/**
 * 展示归一：恰一侧含变量时变量侧置左（`35=x` → `x=35`；`80=2*x+10` → `2*x+10=80`）。
 * 两侧均含变量或均不含时保持原次序（单变量方程不会出现，保守不猜测）。
 */
export function normalizeSides(sides: EquationSides): EquationSides {
  const leftHasVar = collectVariables(sides.left).size > 0;
  const rightHasVar = collectVariables(sides.right).size > 0;
  if (leftHasVar !== rightHasVar && rightHasVar) {
    return { left: sides.right, right: sides.left };
  }
  return sides;
}

/** 两侧 → canonical 展示串（先归一变量侧置左，再 canonicalizeAst） */
export function renderEquation(sides: EquationSides): string {
  const normalized = normalizeSides(sides);
  return `${canonicalizeAst(normalized.left)}=${canonicalizeAst(normalized.right)}`;
}

/**
 * 等价节点合并的机械依据：两侧 canonical 串排序后拼接——
 * `A=B` 与 `B=A` 同 key（等式对称性）；canonical 串相同 = 同一棵语法树。
 */
export function equationKey(sides: EquationSides): string {
  const left = canonicalizeAst(sides.left);
  const right = canonicalizeAst(sides.right);
  return left <= right ? `${left}|${right}` : `${right}|${left}`;
}
