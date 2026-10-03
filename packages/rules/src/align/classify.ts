/**
 * 错误分类与规则级定位（Task 5.4：01 §4.4/§4.5、归档 03 §5.1）。
 *
 * 分类阶梯（D13，按序判定、首个命中）：
 * 1. 建模错误（第 1 步列式不匹配）→ 知识性 + 关系层定位（01 §4.4）；
 * 2. 单位/量纲不一致 → 规范性（漏单位/答句类依赖步骤文本，归 Task 7——已知边界）；
 * 3. 移项未变号（恰一个带符号项符号翻转）→ 知识性/规则误用，ruleId=ALG.EQ.MOVE；
 * 4. 计算失误（结构同构、数值不等）→ 行为性 miscalc（随后过笔误复核，命中改判 slip）；
 * 5. 其余（无法用元规则解释）→ 知识性，reason=「无法用已支持规则解释该步」、
 *    traceable=false（01 §4.4：不得让模型补理由；M-7 100% 可追溯）。
 *
 * 规则级定位（归档 03 §5.1）：只能由规则引擎逆向推导最小合法元规则集合——
 * 「应走而未走」= 上一匹配节点到期望节点的边规则序列（由 align.ts 写入
 * judgment.transforms）；无法解释时显式 traceable=false，不静默错判。
 */

import { canonicalizeAst } from "../normalize.js";
import { dimensionEquals } from "../dimension.js";
import { evaluate } from "../evaluate.js";
import type { Expr } from "../ast.js";
import type { RelationModel } from "../model/types.js";
import { Rational } from "../rational.js";
import type { EquationSides } from "../space/equation.js";
import { renderEquation } from "../space/equation.js";
import { EQ_MOVE } from "../space/transforms.js";
import { signedTermKeys } from "./equivalence.js";
import { structuralDiff } from "./metrics.js";
import type { ErrorRole, StepError } from "./types.js";

export type ClassifyContext = {
  student: EquationSides; // 学生本步方程（parseEquation 结果）
  expected: EquationSides; // 期望节点方程（最小代价候选，canonical 文本 parse 重建）
  expectedNodeId: string;
  /** 上一匹配节点 → 期望节点的边规则序列（最短路径；「应走而未走」的 transforms） */
  violatedRules?: readonly string[];
  /** 第 1 步列式不匹配 → 建模错误分支 */
  isModelingStep: boolean;
  model?: RelationModel; // 建模错误的关系层定位（01 §4.4）
  source: "photo" | "manual";
  role: ErrorRole;
};

const MISSING = "（漏写）";
const ABSENT = "（无此项）";

const PREDICATE_DESC: Readonly<Record<string, string>> = {
  sum: "和关系",
  diff: "相差关系",
  times: "倍数关系",
  share: "归总/归一关系",
};

/** 建模/关系匹配的谓词优先序（差量 → 倍数 → 归总 → 和；差量最常被写反方向） */
const RELATION_PREFERENCE: Readonly<Record<string, number>> = { diff: 0, times: 1, share: 2, sum: 3 };

export function classifyError(context: ClassifyContext): StepError {
  const { student, expected } = context;
  if (context.isModelingStep) {
    return modelingError(context);
  }
  const unit = unitMismatch(student, expected, context);
  if (unit !== null) {
    return unit;
  }
  const flip = signFlipError(student, expected, context);
  if (flip !== null) {
    return flip;
  }
  if (structuralDiff(student.left, expected.left).diff === 0 && structuralDiff(student.right, expected.right).diff === 0) {
    return miscalcError(student, expected, context);
  }
  return unexplainedError(context);
}

/* ------------------------------------------------------------------ */
/* 1. 建模错误（第 1 步）                                               */
/* ------------------------------------------------------------------ */

function modelingError(context: ClassifyContext): StepError {
  const { student, expected, model } = context;
  const base = {
    role: context.role,
    classification: "knowledge" as const,
    location: { span: renderEquation(student), hint: `应为 ${renderEquation(expected)}` },
  };
  if (model === undefined) {
    return { ...base, reason: "无法用已支持规则解释该步", traceable: false };
  }
  const diff = sideTermDiff(student.left, expected.left, expected.right, student.right);
  if (diff === null) {
    return { ...base, reason: "无法用已支持规则解释该步", traceable: false };
  }
  const relation = locateRelation(diff.expectedTerm, model);
  if (relation === null) {
    return { ...base, reason: "无法用已支持规则解释该步", traceable: false };
  }
  return {
    ...base,
    ruleId: undefined,
    relationLocation: {
      predicate: relation.predicate,
      subject: relation.subject,
      reference: relation.reference,
      expected: diff.expectedTerm,
      actual: diff.actualTerm,
    },
    reason: `列式与题意不符：「${relation.subject} 与 ${relation.reference} 的${PREDICATE_DESC[relation.predicate] ?? relation.predicate}」方向/运算写反（应为 ${diff.expectedTerm}，学生写成 ${diff.actualTerm}）`,
    traceable: true,
  };
}

type TermDiff = { expectedTerm: string; actualTerm: string };

/**
 * 列式差项：恰一侧存在单一差项（翻转/改写/漏写/多写），另一侧项多重集相等；
 * 返回 null 表示差异形态不支持机械化定位（不在已有关系维度）。
 */
function sideTermDiff(studentLeft: Expr, expectedLeft: Expr, expectedRight: Expr, studentRight: Expr): TermDiff | null {
  const leftDiff = termDiff(signedTermKeys(studentLeft), signedTermKeys(expectedLeft));
  const rightEqual = sameMultiset(signedTermKeys(studentRight), signedTermKeys(expectedRight));
  if (leftDiff !== null && rightEqual) {
    return leftDiff;
  }
  const rightDiff = termDiff(signedTermKeys(studentRight), signedTermKeys(expectedRight));
  const leftEqual = sameMultiset(signedTermKeys(studentLeft), signedTermKeys(expectedLeft));
  if (rightDiff !== null && leftEqual) {
    return rightDiff;
  }
  return null;
}

/** 单侧项多重集差：翻转/改写/漏写/多写四种形态 → {期望项, 学生项} */
function termDiff(studentKeys: string[], expectedKeys: string[]): TermDiff | null {
  const extra = multisetDiff(studentKeys, expectedKeys); // 学生多出
  const lacking = multisetDiff(expectedKeys, studentKeys); // 期望多出（学生缺）
  if (extra.length === 1 && lacking.length === 1) {
    // 符号翻转（-10 ↔ +10）与改写（+11 ↔ +10）同形处理：期望项/学生项恒取
    // lacking/extra——locateRelation 仅用期望项，两种形态定位结果一致，
    // 「翻转+内容不同」（如 -11 vs +10）同样可定位。勿拆翻转分支：二者返回值
    // 本就相同，拆出只会产生「翻转被漏判」的误解（本函数历史修正留痕）。
    return { expectedTerm: lacking[0], actualTerm: extra[0] };
  }
  if (extra.length === 0 && lacking.length === 1) {
    return { expectedTerm: lacking[0], actualTerm: MISSING }; // 漏写
  }
  if (extra.length === 1 && lacking.length === 0) {
    return { expectedTerm: ABSENT, actualTerm: extra[0] }; // 多写
  }
  return null;
}

/**
 * 多重集相等：计数比较（键序无关、重复计入）。
 * 契约不依赖调用方传入有序数组——勿退回逐索引比较（classify.ts 历史 bug）。
 */
export function sameMultiset(a: string[], b: string[]): boolean {
  return a.length === b.length && multisetDiff(a, b).length === 0;
}

/** 多重集差 a−b（保留重复；键已排序） */
function multisetDiff(a: string[], b: string[]): string[] {
  const counts = new Map<string, number>();
  for (const key of a) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const key of b) {
    counts.set(key, (counts.get(key) ?? 0) - 1);
  }
  const out: string[] = [];
  for (const key of [...counts.keys()].sort()) {
    const count = counts.get(key) ?? 0;
    for (let i = 0; i < count; i++) {
      out.push(key);
    }
  }
  return out;
}

/**
 * 关系层定位（01 §4.4）：差项 → 关系。机械化匹配——
 * 常数项取实体值与差项相等的已知实体所引用关系；含变量项优先倍数关系；
 * 多数字项取首个整数字面量匹配实体值。谓词优先 diff → times → share → sum，
 * 同级按模型关系声明序（确定性，M-6）。
 */
function locateRelation(term: string, model: RelationModel): ModelRelationView | null {
  if (term === ABSENT || term === MISSING) {
    return pickRelation(model, () => true);
  }
  const body = term.slice(1); // 去符号
  if (!body.includes("x")) {
    const constant = parseLeadingConstant(body);
    if (constant !== null) {
      const matched = pickRelation(model, (relation) =>
        referencedValue(relation, model).some((value) => value.equals(constant)),
      );
      if (matched !== null) {
        return matched;
      }
    }
  }
  return pickRelation(model, (relation) => relation.predicate !== "sum");
}

type ModelRelationView = Pick<RelationModel["relations"][number], "predicate" | "subject" | "reference">;

function pickRelation(
  model: RelationModel,
  accept: (relation: RelationModel["relations"][number]) => boolean,
): ModelRelationView | null {
  const candidates = model.relations.filter(accept);
  if (candidates.length === 0) {
    return null;
  }
  const sorted = candidates
    .map((relation, index) => ({ relation, index }))
    .sort(
      (a, b) =>
        (RELATION_PREFERENCE[a.relation.predicate] ?? 99) - (RELATION_PREFERENCE[b.relation.predicate] ?? 99) ||
        a.index - b.index,
    );
  const best = sorted[0].relation;
  return { predicate: best.predicate, subject: best.subject, reference: best.reference };
}

/** 关系引用实体（subject/reference/target）的已知值列表 */
function referencedValue(relation: RelationModel["relations"][number], model: RelationModel): Rational[] {
  const ids = new Set([relation.subject, relation.reference, relation.target]);
  const values: Rational[] = [];
  for (const entity of model.entities) {
    if (!ids.has(entity.id) || entity.value === undefined) {
      continue;
    }
    values.push(entityValue(entity));
  }
  return values;
}

function entityValue(entity: RelationModel["entities"][number]): Rational {
  // ModelEntity.value 为 {num,den} 展示数对；换算回精确 Rational 供比较
  return rationalOfPair(entity.value!);
}

function parseLeadingConstant(body: string): Rational | null {
  const match = /^(\d+(?:\/\d+)?)/.exec(body);
  if (match === null) {
    return null;
  }
  const text = match[1];
  const slash = text.indexOf("/");
  if (slash < 0) {
    return rationalOfPair({ num: Number(text), den: 1 });
  }
  return rationalOfPair({ num: Number(text.slice(0, slash)), den: Number(text.slice(slash + 1)) });
}

/* ------------------------------------------------------------------ */
/* 2. 单位/量纲不一致                                                   */
/* ------------------------------------------------------------------ */

function unitMismatch(student: EquationSides, expected: EquationSides, context: ClassifyContext): StepError | null {
  const pairings: Array<[Expr, Expr]> = [
    [student.left, expected.left],
    [student.right, expected.right],
    [student.left, expected.right],
    [student.right, expected.left],
  ];
  for (const [a, b] of pairings) {
    const valueA = evaluate(a);
    const valueB = evaluate(b);
    if (valueA.status === "value" && valueB.status === "value" && !dimensionEquals(valueA.dimension, valueB.dimension)) {
      return {
        role: context.role,
        classification: "normative",
        location: { span: canonicalizeAst(a), hint: `量纲/单位应为 ${canonicalizeAst(b)}` },
        reason: `单位/量纲不一致：${canonicalizeAst(a)} 应为 ${canonicalizeAst(b)}（01 §3.3 单位参与判定）`,
        traceable: true,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 3. 移项未变号                                                        */
/* ------------------------------------------------------------------ */

function signFlipError(student: EquationSides, expected: EquationSides, context: ClassifyContext): StepError | null {
  const leftFlip = flippedTerm(signedTermKeys(student.left), signedTermKeys(expected.left));
  const rightEqual = sameMultiset(signedTermKeys(student.right), signedTermKeys(expected.right));
  if (leftFlip !== null && rightEqual) {
    return flipError(student.left, expected.left, context);
  }
  const rightFlip = flippedTerm(signedTermKeys(student.right), signedTermKeys(expected.right));
  const leftEqual = sameMultiset(signedTermKeys(student.left), signedTermKeys(expected.left));
  if (rightFlip !== null && leftEqual) {
    return flipError(student.right, expected.right, context);
  }
  return null;
}

/** 学生侧与期望侧项多重集恰差一个符号翻转项 → 该项文本（去符号）；否则 null */
function flippedTerm(studentKeys: string[], expectedKeys: string[]): string | null {
  const extra = multisetDiff(studentKeys, expectedKeys);
  const lacking = multisetDiff(expectedKeys, studentKeys);
  if (extra.length === 1 && lacking.length === 1) {
    const a = extra[0];
    const b = lacking[0];
    if (a.length > 1 && b.length > 1 && a[0] !== b[0] && a.slice(1) === b.slice(1)) {
      return a.slice(1);
    }
  }
  return null;
}

function flipError(studentSide: Expr, expectedSide: Expr, context: ClassifyContext): StepError {
  // 规则级定位（归档 03 §5.1）：符号翻转形态唯一对应移项规则
  return {
    role: context.role,
    classification: "knowledge",
    ruleId: EQ_MOVE.id,
    location: { span: canonicalizeAst(studentSide), hint: `移项应变号：${canonicalizeAst(expectedSide)}` },
    reason: `移项没有变号：${canonicalizeAst(studentSide)} 应为 ${canonicalizeAst(expectedSide)}（${EQ_MOVE.id} 规则误用）`,
    traceable: true,
  };
}

/* ------------------------------------------------------------------ */
/* 4. 计算失误 / 5. 无法解释                                            */
/* ------------------------------------------------------------------ */

function miscalcError(student: EquationSides, expected: EquationSides, context: ClassifyContext): StepError {
  return {
    role: context.role,
    classification: "behavioral",
    subtype: "miscalc",
    location: { span: renderEquation(student), hint: `应为 ${renderEquation(expected)}` },
    reason: `计算结果不正确：应为 ${renderEquation(expected)}，学生写成 ${renderEquation(student)}`,
    traceable: true,
  };
}

function unexplainedError(context: ClassifyContext): StepError {
  return {
    role: context.role,
    classification: "knowledge",
    location: { span: renderEquation(context.student), hint: `应为 ${renderEquation(context.expected)}` },
    reason: "无法用已支持规则解释该步",
    traceable: false,
  };
}

/* ------------------------------------------------------------------ */
/* 精确数对工具（ModelEntity.value {num,den} ↔ Rational）                 */
/* ------------------------------------------------------------------ */

function rationalOfPair(pair: { num: number; den: number }): Rational {
  return Rational.of(BigInt(pair.num), BigInt(pair.den));
}
