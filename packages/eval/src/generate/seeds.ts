/**
 * 人工种子集（Task 9.1/9.2：40 题「人工味」覆盖——rules 18 题正确样本同题参数化
 * + 14 条手写边界题：大数、分数解、长句式）。
 *
 * 种子保证「人工标注」成色：题面与期望模型取自 templates.ts 句式 builder 的显式参量
 * （与 MODELED 18 题逐字一致或同句型变体，合成即标注，不取系统输出）；
 * 步骤链由规则引擎推荐路径生成（元变换已验收，非循环标注）。
 * 注入意图显式声明（错误种子复用同题题面）；合成题配比见 templates.ts QUOTAS。
 *
 * 边界样本说明：seed-010/011/012（MODELED 原题即分数解）、seed-020/030/031
 * （手写大数/分数解）为 fraction 边界，验证 Rational 链路。
 */

import type { TemplateSpec } from "./templates.js";
import {
  comboSpec,
  diffKnownSpec,
  normalizeCountSpec,
  normalizeScaleSpec,
  normalizeUnitSpec,
  ratioBothSpec,
  ratioKnownSpec,
  ratioMoreSpec,
  sumBothSpec,
  sumKnownSpec,
  timesBothSpec,
  timesKnownSpec,
  timesMoreSpec,
  totalCountSpec,
  totalSpeedSpec,
} from "./templates.js";
import type { InjectionId } from "./errors.js";

/** 种子题：题面/期望模型/family/group/difficulty 全部来自模板 builder */
export type SeedSpec = {
  id: string;
  spec: TemplateSpec;
  injection: InjectionId;
};

const JIA_YI = { a: "甲", b: "乙", unit: "个" };
const APPLE = { a: "苹果", b: "橘子", unit: "个" };
const FOOTBALL = { a: "足球", b: "篮球", unit: "个" };

export const SEEDS: SeedSpec[] = [
  /* ---- 正确解法种子 32 条 ---- */
  { id: "seed-001", spec: sumBothSpec({ b: 35, d: 10, pair: JIA_YI, less: false, difficulty: "easy" }), injection: "none" },
  { id: "seed-002", spec: sumBothSpec({ b: 35, d: 10, pair: JIA_YI, less: true, difficulty: "easy" }), injection: "none" },
  { id: "seed-003", spec: sumBothSpec({ b: 13, d: 4, pair: APPLE, less: false, difficulty: "easy" }), injection: "none" },
  { id: "seed-004", spec: sumKnownSpec({ known: "b", value: 30, total: 100, pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-005", spec: diffKnownSpec({ known: "b", value: 20, d: 10, bigger: "a", textSubject: "a", pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-006", spec: diffKnownSpec({ known: "a", value: 50, d: 10, bigger: "a", textSubject: "b", pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-007", spec: timesBothSpec({ b: 20, k: 3, pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-008", spec: timesMoreSpec({ b: 16, k: 3, pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-009", spec: timesKnownSpec({ b: 20, k: 3, pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-010", spec: comboSpec({ b: 21.25, k: 3, d: 5, pair: JIA_YI, difficulty: "medium" }), injection: "none" },
  { id: "seed-011", spec: ratioBothSpec({ b: 320 / 7, p: 3, q: 4, pair: JIA_YI, difficulty: "medium" }), injection: "none" },
  { id: "seed-012", spec: ratioMoreSpec({ b: 320 / 9, p: 1, q: 4, pair: JIA_YI, difficulty: "medium" }), injection: "none" },
  { id: "seed-013", spec: ratioKnownSpec({ a: 30, p: 2, q: 5, pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-014", spec: totalCountSpec({ k: 5, m: 8, box: { box: "盒", unit: "个", verb: "" }, difficulty: "easy" }), injection: "none" },
  { id: "seed-015", spec: totalSpeedSpec({ v: 40, t: 3, difficulty: "easy" }), injection: "none" },
  { id: "seed-016", spec: normalizeUnitSpec({ total: 120, t: 3, difficulty: "easy" }), injection: "none" },
  { id: "seed-017", spec: normalizeScaleSpec({ m: 3, n: 5, p: 15, box: "箱", unit: "千克", difficulty: "medium" }), injection: "none" },
  { id: "seed-018", spec: normalizeCountSpec({ m: 3, p: 15, box: "箱", unit: "千克", difficulty: "medium" }), injection: "none" },
  { id: "seed-019", spec: sumBothSpec({ b: 42, d: 36, pair: JIA_YI, less: false, difficulty: "medium" }), injection: "none" },
  { id: "seed-020", spec: sumBothSpec({ b: 93.5, d: 18, pair: JIA_YI, less: true, difficulty: "hard" }), injection: "none" },
  { id: "seed-021", spec: sumBothSpec({ b: 26, d: 44, pair: FOOTBALL, less: false, difficulty: "medium" }), injection: "none" },
  { id: "seed-022", spec: timesBothSpec({ b: 12, k: 4, pair: JIA_YI, difficulty: "easy" }), injection: "none" },
  { id: "seed-023", spec: ratioBothSpec({ b: 32, p: 5, q: 8, pair: JIA_YI, difficulty: "hard" }), injection: "none" },
  { id: "seed-024", spec: ratioKnownSpec({ a: 24, p: 7, q: 8, pair: APPLE, difficulty: "medium" }), injection: "none" },
  { id: "seed-025", spec: totalCountSpec({ k: 15, m: 7, box: { box: "箱", unit: "个", verb: "" }, difficulty: "easy" }), injection: "none" },
  { id: "seed-026", spec: totalSpeedSpec({ v: 75, t: 9, difficulty: "medium" }), injection: "none" },
  { id: "seed-027", spec: normalizeUnitSpec({ total: 450, t: 5, difficulty: "medium" }), injection: "none" },
  { id: "seed-028", spec: normalizeScaleSpec({ m: 6, n: 11, p: 17, box: "袋", unit: "千克", difficulty: "medium" }), injection: "none" },
  { id: "seed-029", spec: normalizeCountSpec({ m: 8, p: 20, box: "筐", unit: "千克", difficulty: "medium" }), injection: "none" },
  { id: "seed-030", spec: comboSpec({ b: 56 / 3, k: 2, d: 6, pair: JIA_YI, difficulty: "medium" }), injection: "none" },
  { id: "seed-031", spec: comboSpec({ b: 115 / 6, k: 5, d: 7, pair: JIA_YI, difficulty: "hard" }), injection: "none" },
  { id: "seed-032", spec: totalCountSpec({ k: 5, m: 8, box: { box: "辆车", unit: "吨", verb: "" }, difficulty: "hard" }), injection: "none" },

  /* ---- 错误解法种子 8 条（复用同题题面，声明注入意图） ---- */
  { id: "seed-033", spec: sumBothSpec({ b: 35, d: 10, pair: JIA_YI, less: false, difficulty: "easy" }), injection: "move" },
  { id: "seed-034", spec: sumBothSpec({ b: 13, d: 4, pair: APPLE, less: false, difficulty: "easy" }), injection: "direction" },
  { id: "seed-035", spec: sumKnownSpec({ known: "b", value: 30, total: 100, pair: JIA_YI, difficulty: "easy" }), injection: "miscalc" },
  { id: "seed-036", spec: sumKnownSpec({ known: "b", value: 30, total: 100, pair: JIA_YI, difficulty: "easy" }), injection: "slip" },
  { id: "seed-037", spec: normalizeScaleSpec({ m: 3, n: 5, p: 15, box: "箱", unit: "千克", difficulty: "easy" }), injection: "normative" },
  { id: "seed-038", spec: sumKnownSpec({ known: "b", value: 30, total: 100, pair: JIA_YI, difficulty: "easy" }), injection: "div_zero" },
  { id: "seed-039", spec: sumBothSpec({ b: 35, d: 10, pair: JIA_YI, less: false, difficulty: "easy" }), injection: "malformed" },
  { id: "seed-040", spec: sumKnownSpec({ known: "b", value: 30, total: 100, pair: JIA_YI, difficulty: "easy" }), injection: "typo_b3" },
];
