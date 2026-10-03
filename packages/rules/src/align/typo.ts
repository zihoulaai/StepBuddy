/**
 * 笔误三条件 B-1/B-2（Task 5.4：01 §4.5、归档 03 §5.3）。
 *
 * B-1 誊写型步骤：学生方程与期望节点结构同构（structuralDiff 双侧归 0）——
 *    归档原文「expr_before 与上一步 expr_after 相同」在方程态的等效口径（D14）。
 * B-2 易混淆字符对或单字符编辑距离 ≤1，且数值相对偏差 ≤50%（Rational 精确）。
 * B-3 后续步骤在「假设取标准值」下全部可对齐：在 align.ts 内执行（上下文裁决，
 *    parameterize alignFrom 复用主循环）。
 *
 * 附加约束（归档 03 §5.3）：仅 photo 来源可判笔误；同题同类（同签名）≥2
 * 升级知识性（01 §4.5）——偶然重复出现不再是 slip，是概念问题的信号。
 */

import { evaluate } from "../evaluate.js";
import { canonicalizeAst } from "../normalize.js";
import type { Expr } from "../ast.js";
import { Rational } from "../rational.js";
import type { EquationSides } from "../space/equation.js";
import { editDistance, relativeDeviation, singleConfusableSubstitution, structuralDiff } from "./metrics.js";
import type { StepError, StepJudgment } from "./types.js";

/** B-2 数值相对偏差上限（50%） */
const TYPO_RELATIVE_LIMIT = Rational.of(1n, 2n);

/** B-1：学生方程与期望节点结构同构（誊写型，不含结构/关系变化） */
export function checkB1(student: EquationSides, expected: EquationSides): boolean {
  return (
    structuralDiff(student.left, expected.left).diff === 0 &&
    structuralDiff(student.right, expected.right).diff === 0
  );
}

/** B-2：配对侧 canonical 串单字符级差异 + 数值相对偏差 ≤50% */
export function checkB2(student: EquationSides, expected: EquationSides): boolean {
  return sideTypo(student.left, expected.left) && sideTypo(student.right, expected.right);
}

function sideTypo(a: Expr, b: Expr): boolean {
  const textA = canonicalizeAst(a);
  const textB = canonicalizeAst(b);
  if (textA === textB) {
    return true;
  }
  const structural = singleConfusableSubstitution(textA, textB) || editDistance(textA, textB) <= 1;
  if (!structural) {
    return false;
  }
  const valueA = evaluate(a);
  const valueB = evaluate(b);
  if (valueA.status !== "value" || valueB.status !== "value") {
    // 含变量侧无法定值：结构单字符差异已限定改动幅度，无数值偏差可算
    return true;
  }
  return relativeDeviation(valueA.value, valueB.value).compare(TYPO_RELATIVE_LIMIT) <= 0;
}

/** 笔误签名：同 ruleId + location.span 视为同类（01 §4.5 附加条） */
export function typoSignature(error: StepError): string {
  return `${error.ruleId ?? ""}|${error.location?.span ?? ""}`;
}

/**
 * 同类笔误 ≥2 升级知识性（01 §4.5）：原地升级 slip 步的 classification，
 * 返回被升级的步号列表（subtype 保留 slip 留痕）。纯函数式调用点：align 完成后一次。
 */
export function classifyTypoPatterns(steps: StepJudgment[]): number[] {
  const counts = new Map<string, number>();
  for (const step of steps) {
    if (step.error?.subtype === "slip") {
      const signature = typoSignature(step.error);
      counts.set(signature, (counts.get(signature) ?? 0) + 1);
    }
  }
  const upgraded: number[] = [];
  for (const step of steps) {
    const error = step.error;
    if (error?.subtype !== "slip") {
      continue;
    }
    if ((counts.get(typoSignature(error)) ?? 0) >= 2) {
      error.classification = "knowledge";
      upgraded.push(step.index);
    }
  }
  return upgraded;
}
