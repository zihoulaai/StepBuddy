/**
 * 报告（Task 9.3：输出三项指标 + MVP 文档「分析失败案例」明细）。
 *
 * JSON 报告（stdout + --out 落盘）含：四项指标分子分母、排除项披露、
 * M-6 双跑结果、基线对比、失败案例明细。零缓存（PRD L205）：每次全量重算，
 * 无任何落盘中间态。
 */

import type { CaseOutcome } from "./harness.js";
import type { MetricReport } from "./metrics.js";
import type { MetricComparison } from "./baseline.js";

export type EvalReport = {
  total: number;
  metrics: MetricReport;
  /** M-6 双跑不一致的题（确定性问题；非空即门禁失败） */
  determinismFailures: string[];
  /** 基线对比（--update-baseline 或无基线时为 undefined） */
  baseline?: { ok: boolean; comparisons: MetricComparison[] };
};

const pct = (rate: number): string => `${(rate * 100).toFixed(2)}%`;

/** 人读摘要（stdout） */
export function renderReport(report: EvalReport): string {
  const { metrics } = report;
  const lines: string[] = [];
  lines.push(`=== StepBuddy 评测报告（${report.total} 题）===`);
  lines.push(
    `建模成功率: ${metrics.modelingSuccess.numerator}/${metrics.modelingSuccess.denominator} = ${pct(metrics.modelingSuccess.rate)}（MVP ≥80%）`,
  );
  lines.push(`M-1 步骤判定: ${metrics.m1.numerator}/${metrics.m1.denominator} = ${pct(metrics.m1.rate)}（MVP ≥90%）`);
  lines.push(`M-2 错误归因: ${metrics.m2.numerator}/${metrics.m2.denominator} = ${pct(metrics.m2.rate)}（MVP ≥85%）`);
  lines.push(`M-3b 关系角色: ${metrics.m3b.numerator}/${metrics.m3b.denominator} = ${pct(metrics.m3b.rate)}（MVP ≥92%）`);
  lines.push(`披露: 排除项 ${metrics.excludedCases} 题（剔除 ${metrics.m1.excludedSteps} 步）；标注建模拟败 ${metrics.modelFailedCases} 题；系统多判错误步 ${metrics.m2.overJudgedSteps}`);
  lines.push(`M-6 双跑: ${report.total - report.determinismFailures.length}/${report.total} 一致${report.determinismFailures.length > 0 ? `（失败: ${report.determinismFailures.join(",")}）` : ""}`);
  if (report.baseline !== undefined) {
    lines.push(report.baseline.ok ? "基线对比: 通过（无指标跌幅超 2 个百分点）" : "基线对比: 未通过（存在跌幅超 2 个百分点）");
    for (const comparison of report.baseline.comparisons) {
      const sign = comparison.delta >= 0 ? "+" : "";
      lines.push(
        `  ${comparison.metric}: 基线 ${pct(comparison.baseline)} → 当前 ${pct(comparison.current)}（${sign}${(comparison.delta * 100).toFixed(2)}pp）${comparison.regressed ? " ← 跌幅超限" : ""}`,
      );
    }
  }
  if (metrics.mismatches.length > 0) {
    lines.push(`失败案例（${metrics.mismatches.length} 项）:`);
    for (const mismatch of metrics.mismatches) {
      lines.push(`  [${mismatch.metric}] ${mismatch.caseId}: ${mismatch.detail}`);
    }
  } else {
    lines.push("失败案例: 无");
  }
  return lines.join("\n");
}

/** JSON 序列化（--out 落盘；含 outcomes 明细供人工分析） */
export function serializeReport(report: EvalReport, outcomes: readonly CaseOutcome[]): string {
  return `${JSON.stringify({ ...report, outcomes }, null, 2)}\n`;
}
