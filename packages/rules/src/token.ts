/**
 * 表达式 DSL 词法分析（docs/specs/01 §3.3）。
 *
 * 分词判定（对 EBNF 的最小扩展，计划决策 3）：
 * - CJK 序列（含 ℃）视为**单位符号**——§3.3「单位参与判定」示例 `5厘米/厘米`
 *   要求裸单位可出现在任意操作数位；若统一为 ident，除号右侧的裸 `厘米`
 *   只能解析为变量，违背示例意图；
 * - 拉丁字母序列视为**变量标识**（应用题关系层不使用符号变量，无碰撞）；
 * - `×`/`÷` 在词法层归一为 `*`/`/`（§4.1 运算符规范化）。
 *
 * 带分数（如 `1又1/2`）不在文法内：`又` 会作为单位符号切出，
 * 其后跟数字构成隐式乘法，由 parser 报错（计划决策 4）。
 */

/** 单位符号字符：CJK 基本/扩展A/兼容表意文字与 ℃ */
const UNIT_CHAR = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u2103]/;

export type Token =
  | { type: "number"; text: string; pos: number }
  | { type: "percent"; pos: number }
  | { type: "op"; op: "+" | "-" | "*" | "/" | "^"; pos: number }
  | { type: "lparen"; pos: number }
  | { type: "rparen"; pos: number }
  | { type: "unit"; text: string; pos: number }
  | { type: "ident"; text: string; pos: number }
  | { type: "eof"; pos: number };

/** 词法/解析统一错误类型，position 为源码字符偏移 */
export class ParseError extends Error {
  constructor(
    public readonly reason: string,
    public readonly position: number,
  ) {
    super(`${reason}（位置 ${position}）`);
    this.name = "ParseError";
  }
}

/** 数字字面量：十进制（Digit+ ('.' Digit+)?）或分数（Digit+ '/' Digit+） */
function matchNumber(source: string, start: number): { text: string; end: number } {
  const fraction = /^\d+\/\d+/.exec(source.slice(start));
  if (fraction) {
    const denominator = fraction[0].slice(fraction[0].indexOf("/") + 1);
    if (BigInt(denominator) === 0n) {
      throw new ParseError("除数为 0 的表达式进入无效状态（01 §3.3）", start);
    }
    return { text: fraction[0], end: start + fraction[0].length };
  }
  const decimal = /^\d+(\.\d+)?/.exec(source.slice(start));
  if (!decimal) {
    throw new ParseError("期望数字", start);
  }
  return { text: decimal[0], end: start + decimal[0].length };
}

/**
 * 切分 token 序列；无法识别的字符抛 ParseError（含位置）。
 * 空白跳过；`%` 单独成 token（§3.3 Percent）。
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const { text, end } = matchNumber(source, i);
      tokens.push({ type: "number", text, pos: i });
      i = end;
      continue;
    }
    if (ch === "%") {
      tokens.push({ type: "percent", pos: i });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "^") {
      tokens.push({ type: "op", op: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === "*" || ch === "×") {
      tokens.push({ type: "op", op: "*", pos: i });
      i += 1;
      continue;
    }
    if (ch === "/" || ch === "÷") {
      tokens.push({ type: "op", op: "/", pos: i });
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", pos: i });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", pos: i });
      i += 1;
      continue;
    }
    if (UNIT_CHAR.test(ch)) {
      let text = "";
      while (i < source.length && UNIT_CHAR.test(source[i])) {
        text += source[i];
        i += 1;
      }
      tokens.push({ type: "unit", text, pos: i - text.length });
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
      let text = "";
      while (i < source.length && ((source[i] >= "a" && source[i] <= "z") || (source[i] >= "A" && source[i] <= "Z"))) {
        text += source[i];
        i += 1;
      }
      tokens.push({ type: "ident", text, pos: i - text.length });
      continue;
    }
    throw new ParseError(`无法识别的字符「${ch}」`, i);
  }
  tokens.push({ type: "eof", pos: i });
  return tokens;
}
