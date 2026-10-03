/**
 * 评测 harness（Task 9.3：系统跑评测集——规则层直链，零 LLM）。
 *
 * 规格依据：
 * - 用户决策 ①：评测链路 = rules `modelQuestion→generateSolutionSpace→diagnoseSolution`
 *   直链（与 apps/api 编排层的规则段同构，LLM 结构化环节不纳入 MVP 评测——
 *   04 §1 归完整版金标/交叉验证）；
 * - 03 §1.1：step index 1 起、cost 数值化（harness 只取判定字段，cost 不进对拍）；
 * - 01 §5：建模失败必须显式（MODEL_FAILED / DAG_NO_PATH），不静默错判；
 * - 决策 D3（M-6 双跑整包 deepEqual）：每例连跑两次，不等记 harness 失败。
 *
 * 归一化 CaseOutcome：只保留三项标注对拍所需字段（逐步 status、源头错误
 * 分类/定位、模型四角色视图），其余 align 细节（cost/relationLocation 等）
 * 不影响指标，避免报告噪声。
 */

import { deepStrictEqual } from "node:assert";
import {
  diagnoseSolution,
  generateSolutionSpace,
  modelQuestion,
  type ErrorClassification,
  type ErrorSubtype,
  type RelationModel,
  type StepStatus,
} from "@stepbuddy/rules";
import type { Case } from "../cases/index.js";

/** 单步归一化判定（index 1 起，与 annotation.steps 对齐；error 仅留 M-2 对拍字段） */
export type OutcomeStep = {
  index: number;
  status: StepStatus;
  error?: {
    classification: ErrorClassification;
    subtype?: ErrorSubtype;
    ruleId?: string;
  };
};

/** 系统模型视图（M-3b 对拍用：RelationModel 的可序列化简镜像——id/维度/confusable_terms 不入对拍） */
export type ModelView = {
  entities: string[]; // "name|role|num/den|unit"（value/unit 缺省记 "-"）
  relations: string[]; // "subject predicate reference operator target"
  targets: string[]; // 排序后
};

/** 单题系统输出（归一化） */
export type CaseOutcome = {
  caseId: string;
  /** 建模分支：ok=规则链跑通；failed=modelQuestion/解题空间显式失败（01 §5 不静默错判） */
  modeling: "ok" | "failed";
  /** 建模拟败退出码（modeling=failed 时有值） */
  exitCode?: "MODEL_FAILED" | "DAG_NO_PATH";
  /** 整题判定（modeling=ok 时有值） */
  verdict?: "correct" | "incorrect" | "partial";
  /** 退化退出码（INVALID_EXPR 等；无 fallback 时缺省） */
  fallbackExitCode?: "ALIGN_FAILED" | "INVALID_EXPR" | "ANSWER_ONLY";
  /** 逐步判定（modeling=ok 时有值；与学生步骤一一对应） */
  steps: OutcomeStep[];
  /** 模型四角色视图（modeling=ok 时有值；M-3b 对拍） */
  model?: ModelView;
};

/** RelationModel → ModelView（排序集合，deepEqual 即可对拍） */
function modelView(model: RelationModel): ModelView {
  const entities = model.entities
    .map(
      (entity) =>
        `${entity.name}|${entity.role}|${entity.value !== undefined ? `${entity.value.num}/${entity.value.den}` : "-"}|${entity.unit ?? "-"}`,
    )
    .sort();
  const relations = model.relations
    .map((relation) => `${relation.subject} ${relation.predicate} ${relation.reference} ${relation.operator} ${relation.target}`)
    .sort();
  return { entities, relations, targets: [...model.targets].sort() };
}

/**
 * 跑单题：modelQuestion 失败 → 建模拟败分支；成功 → 解题空间（no_path 同归
 * 建模拟败）→ 前向对齐诊断 → 归一化 CaseOutcome。
 */
export function runCase(entry: Case): CaseOutcome {
  const model = modelQuestion(entry.question_text);
  if ("code" in model) {
    return { caseId: entry.id, modeling: "failed", exitCode: "MODEL_FAILED", steps: [] };
  }
  const spaceResult = generateSolutionSpace(model);
  if (spaceResult.status === "no_path") {
    return { caseId: entry.id, modeling: "failed", exitCode: "DAG_NO_PATH", steps: [] };
  }
  const outcome = diagnoseSolution({
    space: spaceResult.space,
    model,
    steps: entry.student_steps.map((equation) => ({ equation, source: entry.source })),
  });
  return {
    caseId: entry.id,
    modeling: "ok",
    verdict: outcome.verdict,
    ...(outcome.fallback !== undefined ? { fallbackExitCode: outcome.fallback.exitCode } : {}),
    steps: outcome.steps.map((step) => ({
      index: step.index + 1,
      status: step.status,
      ...(step.error !== undefined
        ? {
            error: {
              classification: step.error.classification,
              ...(step.error.subtype !== undefined ? { subtype: step.error.subtype } : {}),
              ...(step.error.ruleId !== undefined ? { ruleId: step.error.ruleId } : {}),
            },
          }
        : {}),
    })),
    model: modelView(model),
  };
}

/** M-6 双跑守卫（D3 同款）：每例连跑两次 deepEqual；不等记 harness 失败（确定性问题，禁放行） */
export function runAllCases(cases: readonly Case[]): {
  outcomes: CaseOutcome[];
  determinismFailures: string[];
} {
  const outcomes: CaseOutcome[] = [];
  const determinismFailures: string[] = [];
  for (const entry of cases) {
    const first = runCase(entry);
    const second = runCase(entry);
    try {
      deepStrictEqual(first, second);
    } catch {
      determinismFailures.push(entry.id);
    }
    outcomes.push(first);
  }
  return { outcomes, determinismFailures };
}
