/**
 * 递归下降解析器——严格实现 docs/specs/01 §3.3 EBNF：
 *
 *   Expr     ::= Term (('+' | '-') Term)*
 *   Term     ::= Factor (('×' | '÷') Factor)*
 *   Factor   ::= Unary ('^' Unary)?
 *   Unary    ::= ('-')? Postfix
 *   Postfix  ::= Primary Unit?
 *   Primary  ::= Number | Fraction | Percent | '(' Expr ')' | Ident
 *
 * 硬约束（§3.3）：
 * - 不允许隐式乘法：primary 后紧跟 primary（`1/2 2/3`、`2x`、`(1+2)(3+4)`）
 *   判为非法，不补乘号；
 * - Factor 只允许一次 `^`（文法未定义幂的右结合，`2^3^2` 报错）；
 * - `×`/`÷` 已在词法层归一为 `*`/`/`；`1/2/3` 按 Term 左结合除法。
 */

import type { Expr } from "./ast.js";
import { Rational } from "./rational.js";
import { ParseError, tokenize, type Token } from "./token.js";

/**
 * 数字 token 文本转 Rational（十进制/分数均在 primary 内落地为精确值）。
 * model 抽取层共用同一实现（小数禁浮点的单一出处）。
 */
export function numberToRational(text: string, pos = 0): Rational {
  if (text.includes("/")) {
    const [num, den] = text.split("/");
    try {
      return Rational.of(BigInt(num), BigInt(den));
    } catch {
      throw new ParseError("除数为 0 的表达式进入无效状态（01 §3.3）", pos);
    }
  }
  if (text.includes(".")) {
    const [intPart, fracPart] = text.split(".");
    const digits = intPart + fracPart;
    return Rational.of(BigInt(digits), 10n ** BigInt(fracPart.length));
  }
  return Rational.fromInteger(BigInt(text));
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  /** 顶层 Expr；本方法开头调用，约束到 Expr 产生式 */
  parseExpr(): Expr {
    const expr = this.exprRule();
    const rest = this.peek();
    if (rest.type !== "eof") {
      if (this.startsValue(rest)) {
        throw new ParseError("不允许隐式乘法（01 §3.3）", rest.pos);
      }
      throw new ParseError("表达式存在无法解析的多余内容", rest.pos);
    }
    return expr;
  }

  /** 可作为 primary 起始的 token 类型（用于隐式乘法判定报错） */
  private startsValue(token: Token): boolean {
    return token.type === "number" || token.type === "lparen" || token.type === "ident" || token.type === "unit";
  }

  /** Expr ::= Term (('+' | '-') Term)*（左结合） */
  private exprRule(): Expr {
    let left = this.termRule();
    for (;;) {
      const token = this.peek();
      if (token.type === "op" && (token.op === "+" || token.op === "-")) {
        this.next();
        left = { kind: "binary", op: token.op, left, right: this.termRule() };
        continue;
      }
      return left;
    }
  }

  /** Term ::= Factor (('×' | '÷') Factor)*（左结合） */
  private termRule(): Expr {
    let left = this.factorRule();
    for (;;) {
      const token = this.peek();
      if (token.type === "op" && (token.op === "*" || token.op === "/")) {
        this.next();
        left = { kind: "binary", op: token.op, left, right: this.factorRule() };
        continue;
      }
      return left;
    }
  }

  /** Factor ::= Unary ('^' Unary)?——只允许一次 ^ */
  private factorRule(): Expr {
    const base = this.unaryRule();
    const token = this.peek();
    if (token.type === "op" && token.op === "^") {
      this.next();
      const exponent = this.unaryRule();
      if (this.peek().type === "op" && (this.peek() as { op: string }).op === "^") {
        const extra = this.peek();
        throw new ParseError("文法未定义幂的连续运算（Factor 仅允许一次 ^）", extra.pos);
      }
      return { kind: "binary", op: "^", left: base, right: exponent };
    }
    return base;
  }

  /** Unary ::= ('-')? Postfix——仅允许一个前导负号 */
  private unaryRule(): Expr {
    const token = this.peek();
    if (token.type === "op" && token.op === "-") {
      this.next();
      return { kind: "unary", op: "-", operand: this.postfixRule() };
    }
    return this.postfixRule();
  }

  /** Postfix ::= Primary Unit?——至多一个单位后缀 */
  private postfixRule(): Expr {
    const primary = this.primaryRule();
    const token = this.peek();
    if (token.type === "unit") {
      this.next();
      return { kind: "withUnit", operand: primary, unit: token.text };
    }
    return primary;
  }

  /** Primary ::= Number | Fraction | Percent | '(' Expr ')' | Ident（含裸单位） */
  private primaryRule(): Expr {
    const token = this.next();
    switch (token.type) {
      case "number": {
        const value = numberToRational(token.text, token.pos);
        const after = this.peek();
        if (after.type === "percent") {
          this.next();
          return { kind: "percent", operand: { kind: "num", value } };
        }
        return { kind: "num", value };
      }
      case "lparen": {
        const inner = this.exprRule();
        const closing = this.peek();
        if (closing.type !== "rparen") {
          if (this.startsValue(closing)) {
            throw new ParseError("不允许隐式乘法（01 §3.3）", closing.pos);
          }
          throw new ParseError("括号表达式缺少右括号", closing.pos);
        }
        this.next();
        return inner;
      }
      case "ident":
        return { kind: "var", name: token.text };
      case "unit":
        // 裸单位 = 数值 1 带该单位（如 `5厘米/厘米` 中的分母 `厘米`）
        return { kind: "withUnit", operand: { kind: "num", value: Rational.fromInteger(1n) }, unit: token.text };
      default:
        throw new ParseError("表达式不完整或存在意外的符号", token.pos);
    }
  }
}

/**
 * 解析表达式为 AST。词法错误、隐式乘法、不完整表达式等均抛 ParseError（含位置）。
 */
export function parse(source: string): Expr {
  return new Parser(tokenize(source)).parseExpr();
}
