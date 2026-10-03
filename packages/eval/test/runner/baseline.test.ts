/**
 * 回归门禁守卫（Task 9.4：跌 2 个百分点阻断；基线读/写/对比）。
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BASELINE_METRIC_KEYS,
  buildBaseline,
  compareToBaseline,
  loadBaseline,
  REGRESSION_THRESHOLD,
  saveBaseline,
} from "../../src/runner/baseline.js";
import type { MetricReport } from "../../src/runner/metrics.js";

function reportWith(rates: { modelingSuccessRate: number; m1Rate: number; m2Rate: number; m3bRate: number }): MetricReport {
  return {
    total: 100,
    modelingSuccess: { numerator: 1, denominator: 1, rate: rates.modelingSuccessRate },
    m1: { numerator: 1, denominator: 1, rate: rates.m1Rate, excludedSteps: 0 },
    m2: { numerator: 1, denominator: 1, rate: rates.m2Rate, overJudgedSteps: 0 },
    m3b: { numerator: 1, denominator: 1, rate: rates.m3bRate },
    excludedCases: 0,
    modelFailedCases: 0,
    mismatches: [],
  };
}

const FULL = {
  modelingSuccessRate: 1,
  m1Rate: 0.95,
  m2Rate: 0.9,
  m3bRate: 0.95,
};

describe("BASELINE 跌幅判定", () => {
  it("门限为 2 个百分点", () => {
    expect(REGRESSION_THRESHOLD).toBe(0.02);
  });

  it("跌幅 -0.03 判 fail", () => {
    const baseline = buildBaseline(reportWith(FULL));
    const result = compareToBaseline(baseline, reportWith({ ...FULL, m1Rate: FULL.m1Rate - 0.03 }));
    expect(result.ok).toBe(false);
    expect(result.comparisons.find((comparison) => comparison.metric === "m1Rate")?.regressed).toBe(true);
  });

  it("跌幅 -0.01 与正增长均 pass", () => {
    const baseline = buildBaseline(reportWith(FULL));
    const smallDrop = compareToBaseline(baseline, reportWith({ ...FULL, m1Rate: FULL.m1Rate - 0.01 }));
    expect(smallDrop.ok).toBe(true);
    const growth = compareToBaseline(baseline, reportWith({ ...FULL, m1Rate: 1 }));
    expect(growth.ok).toBe(true);
  });

  it("四指标各自独立判定：仅一项跌超限即 fail", () => {
    const baseline = buildBaseline(reportWith(FULL));
    for (const metric of BASELINE_METRIC_KEYS) {
      const dropped = reportWith({ ...FULL, [metric]: FULL[metric] - 0.05 });
      const result = compareToBaseline(baseline, dropped);
      expect(result.ok).toBe(false);
      expect(result.comparisons.filter((comparison) => comparison.regressed)).toHaveLength(1);
    }
  });
});

describe("BASELINE 读写", () => {
  it("落盘后可读回且指标一致（round-trip）", () => {
    const dir = mkdtempSync(join(tmpdir(), "stepbuddy-baseline-"));
    try {
      const baseline = buildBaseline(reportWith(FULL));
      const path = join(dir, "baseline.json");
      saveBaseline(baseline, path);
      expect(loadBaseline(path)).toEqual(baseline);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("基线不含随机/时间字段（rm -rf 后重跑可复现对比）", () => {
    const first = buildBaseline(reportWith(FULL));
    const second = buildBaseline(reportWith(FULL));
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
});
