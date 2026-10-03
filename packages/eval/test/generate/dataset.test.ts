/**
 * 评测集装配守卫（Task 9.1/9.2：150 题、两族 75/75、错误解法 ≥40%、配额区间）。
 *
 * 口径：MVP 文档「验证方式」+ 04 §2 配比。数据集由 buildDataset 确定性产出，
 * data/dataset.json 与其 deepEqual 固化——手改 JSON 必红（变更必须走模板/种子）。
 */

import { describe, expect, it } from "vitest";
import { deepStrictEqual } from "node:assert";
import { buildDataset } from "../../src/generate/dataset.js";
import { loadCasesFrom } from "../../src/cases/index.js";

const cases = buildDataset();
const seeds = cases.filter((entry) => entry.id.startsWith("seed-"));

/** 错误解法题（含错误分类/建模拟败/排除项）——MVP 加强口径 ≥40% */
const errorCases = cases.filter(
  (entry) => entry.annotation.error !== undefined || entry.annotation.modeling === "model_failed" || entry.excluded !== undefined,
);
const countBy = <T extends string>(pick: (entry: (typeof cases)[number]) => T | undefined): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const entry of cases) {
    const key = pick(entry);
    if (key === undefined) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

describe("DATASET 规模与配比", () => {
  it("总数 150 且 id 唯一", () => {
    expect(cases).toHaveLength(150);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(150);
  });

  it("应用题两族各 75（和差倍 / 归一归总）", () => {
    const group = countBy((entry) => entry.group);
    expect(group).toEqual({ sumdiff_group: 75, normalize_group: 75 });
  });

  it("难度比 60/68/22（≈40/45/15）", () => {
    expect(countBy((entry) => entry.difficulty)).toEqual({ easy: 60, medium: 68, hard: 22 });
  });

  it("错误解法题 ≥60（实际 90 = 60%）", () => {
    expect(errorCases.length).toBeGreaterThanOrEqual(60);
    expect(errorCases.length).toBe(90);
  });

  it("错误类型配额区间（知识性 40/行为性 30/规范性 6/建模拟败 8/排除 6，±2 浮动）", () => {
    const error = countBy((entry) => entry.annotation.error?.classification);
    expect(error.knowledge ?? 0).toBeGreaterThanOrEqual(38);
    expect(error.knowledge ?? 0).toBeLessThanOrEqual(42);
    expect(error.behavioral ?? 0).toBeGreaterThanOrEqual(28);
    expect(error.behavioral ?? 0).toBeLessThanOrEqual(32);
    expect(error.normative ?? 0).toBeGreaterThanOrEqual(4);
    expect(error.normative ?? 0).toBeLessThanOrEqual(8);
    expect(countBy((entry) => (entry.annotation.modeling === "model_failed" ? "model_failed" : undefined)).model_failed ?? 0).toBeGreaterThanOrEqual(6);
    expect(countBy((entry) => (entry.annotation.modeling === "model_failed" ? "model_failed" : undefined)).model_failed ?? 0).toBeLessThanOrEqual(10);
    expect(countBy((entry) => entry.excluded).invalid_expr ?? 0).toBeGreaterThanOrEqual(4);
    expect(countBy((entry) => entry.excluded).invalid_expr ?? 0).toBeLessThanOrEqual(8);
  });

  it("40 道人工种子 id 唯一且全在集中", () => {
    expect(seeds).toHaveLength(40);
    expect(new Set(seeds.map((entry) => entry.id)).size).toBe(40);
  });
});

describe("DATASET 确定性与数据源", () => {
  it("两次 buildDataset deepEqual（禁随机源）", () => {
    deepStrictEqual(buildDataset(), cases);
  });

  it("data/dataset.json 与 buildDataset deepEqual（禁手改 JSON）", () => {
    const loaded = loadCasesFrom();
    expect(loaded).toHaveLength(150);
    deepStrictEqual(loaded, cases);
  });
});
