/**
 * 解方程元规则（Task 4：4 条 MVP 规则，ALG 域）。
 *
 * 标识遵循 02 §131 `DOMAIN.FAMILY.VARIANT`，取 ALG 域（02 §3.1 解方程行口径；
 * 属 A6 元规则库，不占 02 §5「应用题 4–8 条」的 REL.MODEL 计数——D3）。
 * 格式遵循归档 v2-full-scope PRD §4.3.1「前提条件 + 变换模式」。
 *
 * 每条规则为纯函数 `(sides) => sides[]`（0/1/2 个后继）：
 * - MERGE / EVAL 逐侧适用，两侧均适用时产 2 个后继（一步一变换，01 §3.4 INV-1）；
 * - MOVE / ISOLATE 只作用特定侧，产 1 个后继。
 *
 * 终止性论证（BFS 无环的机械依据）：每条规则严格递减自然测度，状态空间有限——
 * - MERGE：同侧合并后项数严格减少（≥2 同类项 → 1 项）；
 * - MOVE：变量侧的常数项数严格减少至 0（之后不再适用）；
 * - EVAL：非常数字段常量子树数严格减少（整棵折叠为一个 num，不产生新常量子树）；
 * - ISOLATE：变量侧系数自 c≠1 变为 1（之后不再适用）。
 * 复合应用不会回到先前状态（测度总和单调递减），故无环；BFS + 预算双保险。
 */

import { collectVariables, type Expr } from "../ast.js";
import { evaluate } from "../evaluate.js";
import { Rational } from "../rational.js";
import type { EquationSides } from "./equation.js";

/** 元规则统一形状（对齐 Task 3 ModelRule 的纯函数风格） */
export type EquationTransform = {
  id: string;
  apply: (sides: EquationSides) => EquationSides[];
};

/** 带符号加法项：expr 恒为正形，符号单独记录（`80-10` → [{+,80},{-,10}]） */
type AdditiveTerm = { sign: 1 | -1; expr: Expr };

/** 单侧是否含变量 */
function hasVariable(expr: Expr): boolean {
  return collectVariables(expr).size > 0;
}

/** 展平顶层加减链（左结合递归；一元负号翻入符号位） */
function flattenAdditive(expr: Expr): AdditiveTerm[] {
  if (expr.kind === "binary" && (expr.op === "+" || expr.op === "-")) {
    const left = flattenAdditive(expr.left);
    const right = expr.op === "-" ? flattenAdditive(expr.right).map(flipSign) : flattenAdditive(expr.right);
    return [...left, ...right];
  }
  if (expr.kind === "unary" && expr.op === "-") {
    return flattenAdditive(expr.operand).map(flipSign);
  }
  return [{ sign: 1, expr }];
}

function flipSign(term: AdditiveTerm): AdditiveTerm {
  return { sign: term.sign === 1 ? -1 : 1, expr: term.expr };
}

/** 带符号项列表 → 左结合加减 AST（首项负号走 unary） */
function rebuildAdditive(terms: AdditiveTerm[]): Expr {
  const [first, ...rest] = terms;
  let result: Expr = first.sign === 1 ? first.expr : { kind: "unary", op: "-", operand: first.expr };
  for (const term of rest) {
    result = { kind: "binary", op: term.sign === 1 ? "+" : "-", left: result, right: term.expr };
  }
  return result;
}

/** 展平顶层乘法链（`*` 满足结合律，`a*(b*c)` 与 `a*b*c` 同形） */
function flattenMultiplicative(expr: Expr): Expr[] {
  if (expr.kind === "binary" && expr.op === "*") {
    return [...flattenMultiplicative(expr.left), ...flattenMultiplicative(expr.right)];
  }
  return [expr];
}

/** 无变量子树的精确值；含变量 / 除零 / 非值求值一律 null（保守判不适用） */
function constantValueOf(expr: Expr): Rational | null {
  if (hasVariable(expr)) {
    return null;
  }
  const result = evaluate(expr);
  return result.status === "value" ? result.value : null;
}

/** 系数 × 变量名（`2*x`→2、`x`→1、`-x`→-1、`(3/4)*x`→3/4） */
type Coefficient = { coefficient: Rational; varName: string };

/**
 * 提取「c × 单一变量」形状的系数：乘法链中恰一个 var 因子、其余因子均为
 * 可求值常数；形状不符（如 `x+5`、`x/(2*3)`）返回 null——保守判不适用。
 */
function extractCoefficient(expr: Expr): Coefficient | null {
  if (expr.kind === "unary" && expr.op === "-") {
    const inner = extractCoefficient(expr.operand);
    return inner === null ? null : { coefficient: inner.coefficient.neg(), varName: inner.varName };
  }
  const factors = flattenMultiplicative(expr);
  let varName: string | null = null;
  let coefficient = Rational.fromInteger(1n);
  for (const factor of factors) {
    if (factor.kind === "var") {
      if (varName !== null && varName !== factor.name) {
        return null;
      }
      varName = factor.name;
      continue;
    }
    const value = constantValueOf(factor);
    if (value === null) {
      return null;
    }
    coefficient = coefficient.mul(value);
  }
  return varName === null ? null : { coefficient, varName };
}

/** 带符号项的系数（提取失败返回 null；变量名不一致返回 null） */
function signedCoefficient(term: AdditiveTerm): Coefficient | null {
  const extracted = extractCoefficient(term.expr);
  if (extracted === null) {
    return null;
  }
  return {
    coefficient: extracted.coefficient.mul(Rational.fromInteger(BigInt(term.sign))),
    varName: extracted.varName,
  };
}

/** 合并变量项为一个 `c*x`（c=1 时裸变量；c 可为负/零——零系数由无解路径自然收敛） */
function mergedVariableTerm(terms: AdditiveTerm[]): Expr | null {
  const firstName = extractCoefficient(terms[0].expr)?.varName;
  if (firstName === undefined) {
    return null;
  }
  let sum = Rational.fromInteger(0n);
  for (const term of terms) {
    const signed = signedCoefficient(term);
    if (signed === null || signed.varName !== firstName) {
      return null;
    }
    sum = sum.add(signed.coefficient);
  }
  if (sum.equals(Rational.fromInteger(1n))) {
    return { kind: "var", name: firstName };
  }
  return { kind: "binary", op: "*", left: { kind: "num", value: sum }, right: { kind: "var", name: firstName } };
}

/** 合并常数项为一个 num（精确求和，禁浮点） */
function mergedConstantTerm(terms: AdditiveTerm[]): Expr | null {
  let sum = Rational.fromInteger(0n);
  for (const term of terms) {
    const value = constantValueOf(term.expr);
    if (value === null) {
      return null;
    }
    sum = sum.add(value.mul(Rational.fromInteger(BigInt(term.sign))));
  }
  return { kind: "num", value: sum };
}

/* ------------------------------------------------------------------ */
/* ALG.EQ.MERGE 合并同类项                                              */
/* ------------------------------------------------------------------ */

/**
 * 前提条件：某侧存在 ≥2 个同类项（变量项按系数合并、常数项合并）。
 * 变换模式：整侧合并为一个后继——变量项并为单个 `c*x`，常数项并为单个 num；
 * 单条变量项 + 单条常数项不适用。逐侧生效，两侧均适用时产 2 个后继。
 */
function mergeSide(side: Expr): Expr | null {
  const terms = flattenAdditive(side);
  const variableTerms = terms.filter((term) => hasVariable(term.expr));
  const constantTerms = terms.filter((term) => !hasVariable(term.expr));
  const canMergeVariables = variableTerms.length >= 2 && mergedVariableTerm(variableTerms) !== null;
  const canMergeConstants = constantTerms.length >= 2 && mergedConstantTerm(constantTerms) !== null;
  if (!canMergeVariables && !canMergeConstants) {
    return null;
  }
  const rebuilt: AdditiveTerm[] = [];
  if (variableTerms.length >= 1) {
    if (canMergeVariables) {
      rebuilt.push({ sign: 1, expr: mergedVariableTerm(variableTerms)! });
    } else {
      rebuilt.push(...variableTerms); // 保守：形状不支持合并时原样保留
    }
  }
  if (constantTerms.length >= 1) {
    if (canMergeConstants) {
      rebuilt.push({ sign: 1, expr: mergedConstantTerm(constantTerms)! });
    } else {
      rebuilt.push(...constantTerms);
    }
  }
  return rebuildAdditive(rebuilt);
}

function applyMerge(sides: EquationSides): EquationSides[] {
  const successors: EquationSides[] = [];
  const left = mergeSide(sides.left);
  if (left !== null) {
    successors.push({ left, right: sides.right });
  }
  const right = mergeSide(sides.right);
  if (right !== null) {
    successors.push({ left: sides.left, right });
  }
  return successors;
}

/* ------------------------------------------------------------------ */
/* ALG.EQ.MOVE 移项                                                     */
/* ------------------------------------------------------------------ */

/**
 * 前提条件：恰一侧含变量，且该侧含常数项（两侧均含变量时不适用——无法定哪侧移）。
 * 变换模式：常数项整组变号移到另一侧、不折算（`2*x+10=80` → `2*x=80-10`，
 * 保留 `80-10` 中间态供 Task 5 步骤对齐）。非常数项原序保留。
 */
function applyMove(sides: EquationSides): EquationSides[] {
  const leftHasVar = hasVariable(sides.left);
  const rightHasVar = hasVariable(sides.right);
  if (leftHasVar === rightHasVar) {
    return [];
  }
  const variableSide = leftHasVar ? sides.left : sides.right;
  const otherSide = leftHasVar ? sides.right : sides.left;
  const terms = flattenAdditive(variableSide);
  const constantTerms = terms.filter((term) => !hasVariable(term.expr));
  const variableTerms = terms.filter((term) => hasVariable(term.expr));
  if (constantTerms.length === 0 || variableTerms.length === 0) {
    return [];
  }
  const moved = constantTerms.map(flipSign);
  const newOther = rebuildAdditive([...flattenAdditive(otherSide), ...moved]);
  const newVariable = rebuildAdditive(variableTerms);
  return leftHasVar ? [{ left: newVariable, right: newOther }] : [{ left: newOther, right: newVariable }];
}

/* ------------------------------------------------------------------ */
/* ALG.EQ.EVAL 数值化简                                                  */
/* ------------------------------------------------------------------ */

/**
 * 折叠**最大**常量子树（整条常量链一次折完，D4）：`x=80÷(9/4)` 若只折内层
 * 会渲染成 `80/9/4` 的括号歧义（num 节点折叠后 canonical 渲染丢分组），
 * 故优先折叠整棵无变量子树。手写中间态（`x=15×5`）无对应节点，
 * 由 Task 5 跳步成本处理。
 * 逐侧生效，两侧均适用时产 2 个后继。
 */
function foldMaxConstant(expr: Expr): Expr | null {
  if (!hasVariable(expr)) {
    if (expr.kind === "num") {
      return null; // 单数字无折叠空间（避免自环后继）
    }
    const value = constantValueOf(expr);
    return value === null ? null : { kind: "num", value };
  }
  switch (expr.kind) {
    case "binary": {
      const left = foldMaxConstant(expr.left);
      if (left !== null) {
        return { ...expr, left };
      }
      const right = foldMaxConstant(expr.right);
      if (right !== null) {
        return { ...expr, right };
      }
      return null;
    }
    case "unary":
    case "percent":
    case "withUnit": {
      const operand = foldMaxConstant(expr.operand);
      return operand === null ? null : { ...expr, operand };
    }
    default:
      return null;
  }
}

function applyEval(sides: EquationSides): EquationSides[] {
  const successors: EquationSides[] = [];
  const left = foldMaxConstant(sides.left);
  if (left !== null) {
    successors.push({ left, right: sides.right });
  }
  const right = foldMaxConstant(sides.right);
  if (right !== null) {
    successors.push({ left: sides.left, right });
  }
  return successors;
}

/* ------------------------------------------------------------------ */
/* ALG.EQ.ISOLATE 系数化为 1                                            */
/* ------------------------------------------------------------------ */

/**
 * 前提条件：恰一侧为 `c*x` 形状（c≠0 且 c≠1 的常数），另一侧无变量。
 * 变换模式：生成 `x = 另一侧 ÷ c`（`2*x=70` → `x=70/2`；`9/4*x=80` → `x=80/(9/4)`）。
 * c=0 时方程无解/无穷解，不生成伪路径。
 *
 * 除数的渲染安全性：分数系数必须落为 `n/d` 二叉树而非单个 num——num 的
 * canonical 文本 `9/4` 作 `/` 右子树会渲染成 `80/9/4`，重解析时
 * （80/9）/4 ≠ 80/(9/4)（normalize 对同优先级右子加括号，但 num 不是
 * binary 节点拿不到括号）。分解后渲染 `80/(9/4)`，取值 round-trip 不变。
 */
function coefficientDivisor(coefficient: Rational): Expr {
  if (coefficient.den === 1n) {
    return { kind: "num", value: coefficient };
  }
  return {
    kind: "binary",
    op: "/",
    left: { kind: "num", value: Rational.of(coefficient.num, 1n) },
    right: { kind: "num", value: Rational.of(coefficient.den, 1n) },
  };
}

function applyIsolate(sides: EquationSides): EquationSides[] {
  const leftVarFree = !hasVariable(sides.left);
  const rightVarFree = !hasVariable(sides.right);
  const leftCoefficient = rightVarFree ? extractCoefficient(sides.left) : null;
  const rightCoefficient = leftVarFree ? extractCoefficient(sides.right) : null;
  const isolated = leftCoefficient ?? rightCoefficient;
  if (isolated === null) {
    return [];
  }
  const { coefficient, varName } = isolated;
  if (coefficient.equals(Rational.fromInteger(0n)) || coefficient.equals(Rational.fromInteger(1n))) {
    return [];
  }
  const otherSide = leftCoefficient === null ? sides.left : sides.right;
  return [
    {
      left: { kind: "var", name: varName },
      right: { kind: "binary", op: "/", left: otherSide, right: coefficientDivisor(coefficient) },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 规则表                                                               */
/* ------------------------------------------------------------------ */

/** ALG.EQ.MERGE——合并同类项 */
export const EQ_MERGE: EquationTransform = { id: "ALG.EQ.MERGE", apply: applyMerge };

/** ALG.EQ.MOVE——移项 */
export const EQ_MOVE: EquationTransform = { id: "ALG.EQ.MOVE", apply: applyMove };

/** ALG.EQ.EVAL——数值化简（最大常量子树折叠） */
export const EQ_EVAL: EquationTransform = { id: "ALG.EQ.EVAL", apply: applyEval };

/** ALG.EQ.ISOLATE——系数化为 1 */
export const EQ_ISOLATE: EquationTransform = { id: "ALG.EQ.ISOLATE", apply: applyIsolate };

/**
 * 优先级序（spec.md §8 单路径回退取首个适用规则的首个子嗣）：
 * 合并同类项 → 移项 → 数值化简 → 系数化为 1（教学常规次序）。
 */
export const EQ_TRANSFORMS: readonly EquationTransform[] = [EQ_MERGE, EQ_MOVE, EQ_EVAL, EQ_ISOLATE];
