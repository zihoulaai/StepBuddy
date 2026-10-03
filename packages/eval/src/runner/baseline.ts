/**
 * 回归基线（Task 9.4：规则/话术/提示词变更触发全量回归，跌 2 个百分点阻断）。
 *
 * 规格依据：04 §2 L64（跌破基线 2pp 阻断）+ PRD L205（回归禁用缓存）。
 * 基线文件 data/baseline.json 由 `--update-baseline` 产出，git 纳入但禁手改
 * （口径变更必须走代码 + 人工审后的 --update-baseline）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { MetricReport } from "./metrics.js";

export const BASELINE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/baseline.json");

/** 回归门禁：任一指标跌幅超过 2 个百分点判 fail（04 §2 L64） */
export const REGRESSION_THRESHOLD = 0.02;

/** 参与回归对比的四项指标（MVP 验收口径） */
export const BASELINE_METRIC_KEYS = ["modelingSuccessRate", "m1Rate", "m2Rate", "m3bRate"] as const;
export type BaselineMetricKey = (typeof BASELINE_METRIC_KEYS)[number];

export type Baseline = {
  /** 基线结构版本（口径变更时升版） */
  version: 1;
  /** 生成时的题数（题集变更后基线需重新 --update-baseline，防跨题集对比） */
  total: number;
  metrics: Record<BaselineMetricKey, number>;
  note: string;
};

export type MetricComparison = {
  metric: BaselineMetricKey;
  baseline: number;
  current: number;
  delta: number;
  regressed: boolean;
};

/** MetricReport → 基线指标快照 */
export function baselineMetricsFrom(report: MetricReport): Record<BaselineMetricKey, number> {
  return {
    modelingSuccessRate: report.modelingSuccess.rate,
    m1Rate: report.m1.rate,
    m2Rate: report.m2.rate,
    m3bRate: report.m3b.rate,
  };
}

export function buildBaseline(report: MetricReport): Baseline {
  return {
    version: 1,
    total: report.total,
    metrics: baselineMetricsFrom(report),
    note: "由 npm run eval --workspace @stepbuddy/eval -- --update-baseline 生成；禁手改",
  };
}

export function loadBaseline(path: string = BASELINE_PATH): Baseline {
  return JSON.parse(readFileSync(path, "utf8")) as Baseline;
}

export function saveBaseline(baseline: Baseline, path: string = BASELINE_PATH): void {
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

/** 逐指标对比：跌幅 > 2pp（含 epsilon 容差）判 regressed */
export function compareToBaseline(baseline: Baseline, report: MetricReport): { ok: boolean; comparisons: MetricComparison[] } {
  const current = baselineMetricsFrom(report);
  const comparisons = BASELINE_METRIC_KEYS.map((metric) => {
    const delta = current[metric] - baseline.metrics[metric];
    return { metric, baseline: baseline.metrics[metric], current: current[metric], delta, regressed: delta < -REGRESSION_THRESHOLD - 1e-9 };
  });
  return { ok: comparisons.every((comparison) => !comparison.regressed), comparisons };
}
