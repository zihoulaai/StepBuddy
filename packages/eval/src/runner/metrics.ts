/**
 * 指标计算（Task 9.3：逐项对比标注，输出 MVP 验收三项 + 建模成功率）。
 *
 * 口径（04 §1 + MVP 文档 L67-72，写死不改）：
 * - 建模成功率 = (标注 ok 且系统跑通 + 标注 model_failed 且系统 MODEL_FAILED/DAG_NO_PATH) / 总题数；
 * - M-1 步骤级判定 = 判定一致步 / 标注可判定步（excluded 题整题不进分母；
 *   标注 not_judged 步不进分母；剔除数单独披露）；
 * - M-2 错误归因 = 分类与定位一致步 / 标注 error 步（一致 = classification +
 *   subtype(标注有则) + rule_id(标注有则) 全等；系统多判步只披露不进分母）；
 * - M-3b 关系角色 = 四角色全对题 / 标注 ok 题（expected_model 视图 deepEqual）。
 *
 * M-3b 视图口径与生成期试跑一致（142 题 0 DIFF 已由全量评测固化）：
 * 实体 name→role（含 value/unit）+ 关系五元组 + targets，排序集合比较。
 */

import type { Case } from "../cases/index.js";
import type { CaseOutcome } from "./harness.js";

/** 单题逐项对比结果（metrics 聚合与 sample 抽检共用，保证口径单一来源） */
export type CaseCompare = {
  caseId: string;
  modelingHit: boolean;
  /** M-1：分子/分母（excluded 题分母 0） */
  m1: { numerator: number; denominator: number };
  /** M-2：null=该题无标注 error（不进分母）；overJudged=系统多判错误步数（只披露） */
  m2: { hit: boolean | null; overJudged: number };
  /** M-3b：null=该题无 expected_model（不进分母） */
  m3b: { hit: boolean | null };
};

/** expected_model → ModelView 同构视图（与 harness.modelView 对拍） */
function expectedModelView(expected: NonNullable<Case["annotation"]["expected_model"]>): NonNullable<CaseOutcome["model"]> {
  return {
    entities: expected.entities
      .map((entity) => `${entity.name}|${entity.role}|${entity.value !== undefined ? `${entity.value.num}/${entity.value.den}` : "-"}|${entity.unit ?? "-"}`)
      .sort(),
    relations: expected.relations
      .map((relation) => `${relation.subject} ${relation.predicate} ${relation.reference} ${relation.operator} ${relation.target}`)
      .sort(),
    targets: [...expected.targets].sort(),
  };
}

/** 视图 deepEqual（JSON 安全形状：分支内键集合固定，字符串化即可判等） */
function viewEquals(a: NonNullable<CaseOutcome["model"]>, b: NonNullable<CaseOutcome["model"]>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 错误分类一致性（M-2）：classification + subtype(标注有则) + rule_id(标注有则) 全等 */
function errorMatches(
  annotation: NonNullable<Case["annotation"]["error"]>,
  system: CaseOutcome["steps"][number]["error"],
): boolean {
  if (system === undefined) return false;
  if (system.classification !== annotation.classification) return false;
  if (annotation.subtype !== undefined && system.subtype !== annotation.subtype) return false;
  if (annotation.rule_id !== undefined && system.ruleId !== annotation.rule_id) return false;
  return true;
}

/** 单题对比（指标聚合与抽检题卡共用） */
export function compareCase(entry: Case, outcome: CaseOutcome): CaseCompare {
  const modelingHit =
    (entry.annotation.modeling === "ok" && outcome.modeling === "ok") ||
    (entry.annotation.modeling === "model_failed" && outcome.modeling === "failed");

  // M-1：excluded 题整题剔除；not_judged 标注步剔除
  let m1Numerator = 0;
  let m1Denominator = 0;
  if (entry.excluded === undefined) {
    for (const annotated of entry.annotation.steps) {
      if (annotated.status === "not_judged") continue;
      m1Denominator += 1;
      const system = outcome.steps.find((step) => step.index === annotated.index);
      if (system !== undefined && system.status === annotated.status) m1Numerator += 1;
    }
  }

  // M-2：分母=标注 error 步（每错题恰 1 步）；系统多判步（错误标在非标注步）只披露
  let m2: CaseCompare["m2"] = { hit: null, overJudged: 0 };
  const annotationError = entry.annotation.error;
  if (annotationError !== undefined) {
    const system = outcome.steps.find((step) => step.index === annotationError.step_index);
    const overJudged = outcome.steps.filter((step) => step.error !== undefined && step.index !== annotationError.step_index).length;
    m2 = { hit: errorMatches(annotationError, system?.error), overJudged };
  }

  // M-3b：分母=标注 ok 且有 expected_model 的题
  let m3b: CaseCompare["m3b"] = { hit: null };
  if (entry.annotation.expected_model !== undefined && outcome.model !== undefined) {
    m3b = { hit: viewEquals(expectedModelView(entry.annotation.expected_model), outcome.model) };
  }

  return { caseId: entry.id, modelingHit, m1: { numerator: m1Numerator, denominator: m1Denominator }, m2, m3b };
}

export type MetricValue = { numerator: number; denominator: number; rate: number };

export type MetricReport = {
  total: number;
  modelingSuccess: MetricValue;
  m1: MetricValue & { excludedSteps: number };
  m2: MetricValue & { overJudgedSteps: number };
  m3b: MetricValue;
  /** 排除项题数（04 §1：披露不阻断） */
  excludedCases: number;
  /** 标注建模拟败题数 */
  modelFailedCases: number;
  /** 失败案例明细（MVP 文档「分析失败案例」） */
  mismatches: Array<{ caseId: string; metric: "modeling" | "m1" | "m2" | "m3b"; detail: string }>;
};

const rate = (numerator: number, denominator: number): number => (denominator === 0 ? 1 : numerator / denominator);

/** 全量指标（cases 与 outcomes 按 caseId 配对；长度不一致直接抛错——禁静默对拍） */
export function computeMetrics(cases: readonly Case[], outcomes: readonly CaseOutcome[]): MetricReport {
  if (cases.length !== outcomes.length) {
    throw new Error(`指标计算入参不匹配：${cases.length} 题 vs ${outcomes.length} 结果`);
  }
  const byId = new Map(outcomes.map((outcome) => [outcome.caseId, outcome]));
  const compares = cases.map((entry) => {
    const outcome = byId.get(entry.id);
    if (outcome === undefined) throw new Error(`缺少系统输出：${entry.id}`);
    return compareCase(entry, outcome);
  });

  const mismatches: MetricReport["mismatches"] = [];
  const modelingNumerator = compares.filter((compare) => compare.modelingHit).length;
  for (const [i, compare] of compares.entries()) {
    if (compare.modelingHit) continue;
    mismatches.push({
      caseId: compare.caseId,
      metric: "modeling",
      detail: `标注 ${cases[i]!.annotation.modeling}，系统 ${outcomes[i]!.modeling}${outcomes[i]!.exitCode !== undefined ? `(${outcomes[i]!.exitCode})` : ""}`,
    });
  }

  const m1Numerator = compares.reduce((sum, compare) => sum + compare.m1.numerator, 0);
  const m1Denominator = compares.reduce((sum, compare) => sum + compare.m1.denominator, 0);
  const excludedSteps = cases.reduce(
    (sum, entry) =>
      sum +
      (entry.excluded !== undefined
        ? entry.annotation.steps.length
        : entry.annotation.steps.filter((step) => step.status === "not_judged").length),
    0,
  );
  for (const [i, compare] of compares.entries()) {
    if (compare.m1.denominator === 0) continue;
    if (compare.m1.numerator < compare.m1.denominator) {
      const details: string[] = [];
      for (const annotated of cases[i]!.annotation.steps) {
        if (annotated.status === "not_judged") continue;
        const system = outcomes[i]!.steps.find((step) => step.index === annotated.index);
        const actual = system?.status ?? "缺失";
        if (actual !== annotated.status) details.push(`步${annotated.index} 标注${annotated.status}/系统${actual}`);
      }
      mismatches.push({ caseId: compare.caseId, metric: "m1", detail: details.join("；") });
    }
  }

  const m2Cases = compares.filter((compare) => compare.m2.hit !== null);
  const m2Numerator = m2Cases.filter((compare) => compare.m2.hit === true).length;
  const overJudgedSteps = compares.reduce((sum, compare) => sum + compare.m2.overJudged, 0);
  for (const compare of m2Cases) {
    if (compare.m2.hit === true) continue;
    const entry = cases.find((item) => item.id === compare.caseId)!;
    const annotation = entry.annotation.error!;
    const system = outcomes.find((item) => item.caseId === compare.caseId)!.steps.find((step) => step.index === annotation.step_index);
    mismatches.push({
      caseId: compare.caseId,
      metric: "m2",
      detail: `步${annotation.step_index} 标注${annotation.classification}/${annotation.subtype ?? "-"}/${annotation.rule_id ?? "-"}，系统${system?.error !== undefined ? `${system.error.classification}/${system.error.subtype ?? "-"}/${system.error.ruleId ?? "-"}` : "无错误"}`,
    });
  }

  const m3bCases = compares.filter((compare) => compare.m3b.hit !== null);
  const m3bNumerator = m3bCases.filter((compare) => compare.m3b.hit === true).length;
  for (const compare of m3bCases) {
    if (compare.m3b.hit === true) continue;
    mismatches.push({ caseId: compare.caseId, metric: "m3b", detail: "四角色视图与 expected_model 不一致" });
  }

  return {
    total: cases.length,
    modelingSuccess: { numerator: modelingNumerator, denominator: cases.length, rate: rate(modelingNumerator, cases.length) },
    m1: { numerator: m1Numerator, denominator: m1Denominator, rate: rate(m1Numerator, m1Denominator), excludedSteps },
    m2: { numerator: m2Numerator, denominator: m2Cases.length, rate: rate(m2Numerator, m2Cases.length), overJudgedSteps },
    m3b: { numerator: m3bNumerator, denominator: m3bCases.length, rate: rate(m3bNumerator, m3bCases.length) },
    excludedCases: cases.filter((entry) => entry.excluded !== undefined).length,
    modelFailedCases: cases.filter((entry) => entry.annotation.modeling === "model_failed").length,
    mismatches,
  };
}
