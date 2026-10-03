/**
 * 评测 CLI（Task 9.4：回归门禁入口）。
 *
 * 用法：
 *   npm run eval --workspace @stepbuddy/eval                        # 全量 → 报告 → 基线对比（跌 2pp 阻断）
 *   npm run eval --workspace @stepbuddy/eval -- --update-baseline   # 人工审后覆写基线
 *   npm run eval --workspace @stepbuddy/eval -- --sample 30         # 人工抽检题卡
 *   npm run eval --workspace @stepbuddy/eval -- --out report.json   # 报告落盘（含失败案例明细）
 *   npm run eval --workspace @stepbuddy/eval -- --filter family=sumdiff  # 子集试跑（不对比基线）
 *
 * 零缓存（PRD L205）：无任何落盘中间态，每次全量重算；M-6 双跑守卫见 harness。
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadCasesFrom, type Case } from "./cases/index.js";
import { runAllCases } from "./runner/harness.js";
import { computeMetrics } from "./runner/metrics.js";
import { selectSample, samplePassRate } from "./runner/sample.js";
import { buildBaseline, compareToBaseline, loadBaseline, saveBaseline } from "./runner/baseline.js";
import { renderReport, serializeReport, type EvalReport } from "./runner/report.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data");

type CliArgs = {
  updateBaseline: boolean;
  sample?: number;
  out?: string;
  filterFamily?: string;
};

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { updateBaseline: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "--update-baseline":
        args.updateBaseline = true;
        break;
      case "--sample": {
        const value = argv[++i];
        if (value === undefined || !/^\d+$/.test(value)) throw new Error("--sample 需跟正整数（题数）");
        args.sample = Number(value);
        break;
      }
      case "--out": {
        const value = argv[++i];
        if (value === undefined) throw new Error("--out 需跟输出路径");
        args.out = value;
        break;
      }
      case "--filter": {
        const value = argv[++i];
        if (value === undefined || !value.startsWith("family=")) throw new Error("--filter 仅支持 family=<sumdiff|multiple|total|normalize>");
        args.filterFamily = value.slice("family=".length);
        break;
      }
      default:
        throw new Error(`未知参数：${arg}（支持 --update-baseline/--sample N/--out path/--filter family=）`);
    }
  }
  return args;
}

/** 抽检题卡默认落盘（人读复核产物；文件名带本地日期，不进回归对比） */
function sampleOutPath(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return resolve(DATA_DIR, `sample-review-${stamp}.json`);
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv);

  const allCases: Case[] = loadCasesFrom();
  const cases = args.filterFamily !== undefined ? allCases.filter((entry) => entry.family === args.filterFamily) : allCases;
  if (cases.length === 0) {
    throw new Error(args.filterFamily !== undefined ? `--filter family=${args.filterFamily} 过滤后 0 题` : "评测集为空");
  }

  // M-6 双跑守卫：每例连跑两次 deepEqual（零缓存，天然全量重算）
  const { outcomes, determinismFailures } = runAllCases(cases);

  // --sample：人工抽检题卡（标注 + 系统输出 + 逐项一致），不对比基线
  if (args.sample !== undefined) {
    const cards = selectSample(cases, outcomes, args.sample);
    const pass = samplePassRate(cards);
    const path = args.out ?? sampleOutPath();
    writeFileSync(path, `${JSON.stringify({ sampled: cards.length, passRate: pass, cards }, null, 2)}\n`, "utf8");
    console.log(`抽检 ${cards.length} 题：一致 ${pass.consistent} 题，复核通过率 ${(pass.rate * 100).toFixed(2)}%（门槛 ≥90%）`);
    console.log(`题卡已写出 → ${path}`);
    return;
  }

  const metrics = computeMetrics(cases, outcomes);
  const report: EvalReport = { total: cases.length, metrics, determinismFailures };

  if (args.updateBaseline) {
    if (args.filterFamily !== undefined) {
      throw new Error("--update-baseline 必须全量运行（不支持 --filter）");
    }
    saveBaseline(buildBaseline(metrics));
    console.log(renderReport(report));
    console.log("基线已更新 → data/baseline.json（人工审后使用；禁手改）");
    return;
  }

  let baseline;
  try {
    baseline = loadBaseline();
  } catch {
    console.error("未找到基线 data/baseline.json：请先执行 npm run eval --workspace @stepbuddy/eval -- --update-baseline");
    process.exitCode = 1;
    return;
  }
  if (args.filterFamily !== undefined) {
    // 子集指标与全量基线不可比：只出报告，不判回归
    console.log(`注意：--filter family=${args.filterFamily} 子集运行（${cases.length}/${allCases.length} 题），跳过基线对比`);
  } else {
    report.baseline = compareToBaseline(baseline, metrics);
  }

  console.log(renderReport(report));
  if (args.out !== undefined) {
    writeFileSync(resolve(process.cwd(), args.out), serializeReport(report, outcomes), "utf8");
    console.log(`报告已写出 → ${args.out}`);
  }

  if (determinismFailures.length > 0 || (report.baseline !== undefined && !report.baseline.ok)) {
    process.exitCode = 1;
  }
}

main(process.argv.slice(2));
