/**
 * 学生步骤文本切分（Task 7.1：多行文本 → 方程状态序列；决策 D7）。
 *
 * 规格依据：
 * - 01 §3.2 / 归档 03 D3：学生步骤 = 方程状态序列，每行一个方程；
 * - 01 §5 INVALID_EXPR：算式本身写错（含结构不是等式）显式退出，不猜；
 * - 归档 03 §5.3：笔误判定仅 photo 来源可判，故每步携带 source。
 *
 * 纯函数（M-6）：同文本同输出；非方程行不静默丢弃——抛 UnparseableStepError
 * 交由编排层转 INVALID_EXPR（user_message 仍取 01 §5 话术表）。
 */

import type { StudentEquationStep } from "@stepbuddy/rules";

/** 非方程行（缺少「=」）：lineIndex 0 起（与 rules StepJudgment.index 对齐） */
export class UnparseableStepError extends Error {
  constructor(
    readonly lineIndex: number,
    readonly line: string,
  ) {
    super(`第 ${lineIndex + 1} 行不是等式（缺少「=」）：${line}`);
    this.name = "UnparseableStepError";
  }
}

/**
 * 按行切分 → trim → 丢空行；每行必须含 `=`（方程序列的机械判据）。
 * 空结果返回 []（编排层走 ANSWER_ONLY：只写答案未写过程）。
 */
export function splitStudentSteps(
  text: string,
  source: "photo" | "manual" = "manual",
): StudentEquationStep[] {
  const steps: StudentEquationStep[] = [];
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (line.length === 0) {
      continue;
    }
    if (!line.includes("=")) {
      throw new UnparseableStepError(lineIndex, line);
    }
    steps.push({ equation: line, source });
  }
  return steps;
}
