/**
 * 原子步不变量检查（docs/specs/01 §3.4）。
 *
 * 四项不变量与机械化口径：
 * - single_transform 一步一变换：rawText 按顶层 `=` 切分须恰为 2 段
 *   （多于 1 个 `=` 即多变换，对应 §3.5 示例第 2 步）；且 exprBefore/exprAfter
 *   均能 parse（解析失败记入本项）；
 * - unit_consistency 单位一致：前后量纲完全相等（bare 与指数表）；
 * - quantity_conservation 量守恒：按量纲守恒落地（Task 2 决策）——
 *   指数表相等，允许 bare 差异（如 `5厘米/厘米 → 5` 量纲守恒但单位不一致）；
 * - variable_monotonicity 变量集合单调：vars(after) ⊆ vars(before)。
 *
 * 任一失败 → splitChecked=false，对应 §3.4「按多变换处理且不参与等价判定」。
 * 是否把该值写入 IR 的 split_checked 字段由 Task 7 诊断编排负责，本模块只做纯函数。
 *
 * 已知取舍（Task 2 决策 7）：跨进制单位换算步（`5元 → 50角`）在无规则支撑下
 * 记 unit_consistency 失败 → 保守标 split_checked=false 转人工/多变换处理，
 * 不出错判；规则语义版的量守恒留待 Task 4/5。
 */

import { collectVariables, type Expr } from "./ast.js";
import { dimensionEquals, dimensionExponentsEqual } from "./dimension.js";
import { evaluate } from "./evaluate.js";
import { parse } from "./parse.js";

export type InvariantName =
  | "single_transform"
  | "unit_consistency"
  | "quantity_conservation"
  | "variable_monotonicity";

export type InvariantFailure = { invariant: InvariantName; detail: string };

export type StepInvariantResult = {
  splitChecked: boolean;
  failures: InvariantFailure[];
};

export type StepLike = {
  /** 学生原始书写（01 §3.2 raw_text） */
  rawText: string;
  /** 规范化前的表达式（01 §3.2 expr_before） */
  exprBefore: string;
  /** 规范化后的表达式（01 §3.2 expr_after） */
  exprAfter: string;
};

/** 按顶层 `=` 切分（学生书写不会在括号内写等号，无需配对跳过） */
function countEquals(rawText: string): number {
  let count = 0;
  for (const ch of rawText) {
    if (ch === "=") {
      count += 1;
    }
  }
  return count;
}

function tryParse(source: string): { ok: true; ast: Expr } | { ok: false; reason: string } {
  try {
    return { ok: true, ast: parse(source) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function checkStepInvariants(step: StepLike): StepInvariantResult {
  const failures: InvariantFailure[] = [];

  // 1. single_transform：rawText 恰一个 `=`，且前后表达式均可解析
  const equals = countEquals(step.rawText);
  if (equals !== 1) {
    failures.push({
      invariant: "single_transform",
      detail: equals === 0 ? "步骤缺少等号" : `步骤包含 ${equals} 个等号，属多变换步（01 §3.4）`,
    });
  }
  const before = tryParse(step.exprBefore);
  const after = tryParse(step.exprAfter);
  if (!before.ok) {
    failures.push({ invariant: "single_transform", detail: `expr_before 无法解析：${before.reason}` });
  }
  if (!after.ok) {
    failures.push({ invariant: "single_transform", detail: `expr_after 无法解析：${after.reason}` });
  }

  // 前后均可解析时才做语义类检查
  if (before.ok && after.ok) {
    const beforeEval = evaluate(before.ast);
    const afterEval = evaluate(after.ast);

    // 2/3. 单位一致与量纲守恒（依赖求值携带的量纲；invalid 表达式退出后续检查）
    if (beforeEval.status !== "invalid" && afterEval.status !== "invalid") {
      const beforeDim = beforeEval.dimension;
      const afterDim = afterEval.dimension;
      if (!dimensionEquals(beforeDim, afterDim)) {
        failures.push({ invariant: "unit_consistency", detail: "变换前后量纲不一致（01 §3.4）" });
      }
      if (!dimensionExponentsEqual(beforeDim, afterDim)) {
        failures.push({ invariant: "quantity_conservation", detail: "变换前后量纲指数不守恒（01 §3.4）" });
      }
    } else {
      const reason = beforeEval.status === "invalid" ? beforeEval.reason : afterEval.status === "invalid" ? afterEval.reason : "";
      failures.push({ invariant: "unit_consistency", detail: `表达式无效，无法核查单位：${reason}` });
    }

    // 4. 变量集合单调
    const beforeVars = collectVariables(before.ast);
    const afterVars = collectVariables(after.ast);
    const newVars = [...afterVars].filter((name) => !beforeVars.has(name));
    if (newVars.length > 0) {
      failures.push({
        invariant: "variable_monotonicity",
        detail: `变换引入新变量：${newVars.join("、")}（01 §3.4）`,
      });
    }
  }

  return { splitChecked: failures.length === 0, failures };
}
