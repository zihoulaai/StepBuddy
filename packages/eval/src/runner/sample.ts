/**
 * 人工抽检（Task 9.4 抽样复核 ≥90%，MVP L74 内部口径）。
 *
 * --sample N：固定 seed 的 LCG 确定性抽样（禁 Math.random/Date.now，保证
 * 同一题集同一 N 抽同一批题，复核可复现）；输出题卡（人工标注 + 系统输出 +
 * 逐项一致/不一致）写 data/sample-review-YYYYMMDD.json 供人工核对。
 * 复核通过率 = 全项一致题数 / N（门槛 ≥90%，记入完成记录）。
 */

import type { Case } from "../cases/index.js";
import type { CaseOutcome } from "./harness.js";
import { compareCase, type CaseCompare } from "./metrics.js";

/** 单题抽检题卡 */
export type SampleCard = {
  case: Case;
  outcome: CaseOutcome;
  compare: CaseCompare;
  /** 全项一致（建模 + M-1 + M-2（有则）+ M-3b（有则）） */
  consistent: boolean;
};

/** 裸 LCG（数值常量同 java.util.Random；确定性，无外部依赖） */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** 确定性抽样：Fisher-Yates（seed 固定）后取前 N，按 caseId 排序输出 */
export function selectSample(cases: readonly Case[], outcomes: readonly CaseOutcome[], n: number, seed = 20260930): SampleCard[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--sample 需为正整数：${n}`);
  }
  if (n > cases.length) {
    throw new Error(`--sample ${n} 超过题数 ${cases.length}`);
  }
  const random = lcg(seed);
  const order = cases.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const byId = new Map(outcomes.map((outcome) => [outcome.caseId, outcome]));
  return order
    .slice(0, n)
    .map((index) => {
      const entry = cases[index]!;
      const outcome = byId.get(entry.id);
      if (outcome === undefined) throw new Error(`缺少系统输出：${entry.id}`);
      const compare = compareCase(entry, outcome);
      const consistent =
        compare.modelingHit &&
        compare.m1.numerator === compare.m1.denominator &&
        (compare.m2.hit === null || compare.m2.hit) &&
        (compare.m3b.hit === null || compare.m3b.hit);
      return { case: entry, outcome, compare, consistent };
    })
    .sort((a, b) => a.case.id.localeCompare(b.case.id));
}

/** 复核通过率（一致题数 / N） */
export function samplePassRate(cards: readonly SampleCard[]): { consistent: number; total: number; rate: number } {
  const consistent = cards.filter((card) => card.consistent).length;
  return { consistent, total: cards.length, rate: cards.length === 0 ? 1 : consistent / cards.length };
}
