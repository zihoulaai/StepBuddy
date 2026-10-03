/**
 * harness 守卫（Task 9.3：规则层直链 + M-6 双跑 + 注入命中有效性）。
 *
 * 注入命中守卫的意义：若模板/句式或 rules 规则库漂移，注入的错误不再被系统
 * 识别为预期分类，本测试即红——评测指标失去意义前先发现（防「指标虚高」）。
 */

import { describe, expect, it } from "vitest";
import { buildDataset } from "../../src/generate/dataset.js";
import { runCase, runAllCases } from "../../src/runner/harness.js";
import { caseSchema, type Case } from "../../src/cases/index.js";

const dataset = buildDataset();
const byId = (id: string): Case => {
  const found = dataset.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`评测集中不存在 ${id}`);
  return found;
};

const MINI_IDS = ["seed-001", "seed-033", "seed-034", "seed-035", "seed-036", "seed-037", "seed-038", "eval-143"];
const mini = MINI_IDS.map(byId);

/** 系统步查找（1 起 index） */
const stepAt = (outcome: ReturnType<typeof runCase>, index: number) => outcome.steps.find((step) => step.index === index);

describe("HARNESS 规则层直链", () => {
  it("无错题：verdict=correct 且逐步全 correct", () => {
    const outcome = runCase(byId("seed-001"));
    expect(outcome.modeling).toBe("ok");
    expect(outcome.verdict).toBe("correct");
    expect(outcome.fallbackExitCode).toBeUndefined();
    for (const step of outcome.steps) {
      expect(step.status).toBe("correct");
      expect(step.error).toBeUndefined();
    }
  });

  it("move 注入：判错步为知识性 + ALG.EQ.MOVE 规则定位", () => {
    const entry = byId("seed-033");
    const outcome = runCase(entry);
    const annotation = entry.annotation.error!;
    expect(outcome.verdict).toBe("incorrect");
    const step = stepAt(outcome, annotation.step_index)!;
    expect(step.status).toBe("incorrect");
    expect(step.error?.classification).toBe("knowledge");
    expect(step.error?.ruleId).toBe("ALG.EQ.MOVE");
  });

  it("direction 注入：首步判错为知识性且无规则定位（建模列式分支）", () => {
    const entry = byId("seed-034");
    const outcome = runCase(entry);
    const annotation = entry.annotation.error!;
    expect(stepAt(outcome, annotation.step_index)?.status).toBe("incorrect");
    expect(stepAt(outcome, annotation.step_index)?.error?.classification).toBe("knowledge");
    expect(stepAt(outcome, annotation.step_index)?.error?.ruleId).toBeUndefined();
  });

  it("miscalc 注入：末步判错为行为性 miscalc", () => {
    const entry = byId("seed-035");
    const outcome = runCase(entry);
    const annotation = entry.annotation.error!;
    const step = stepAt(outcome, annotation.step_index)!;
    expect(step.status).toBe("incorrect");
    expect(step.error?.classification).toBe("behavioral");
    expect(step.error?.subtype).toBe("miscalc");
  });

  it("slip 注入：末步判错为行为性 slip（photo 笔误三条件）", () => {
    const entry = byId("seed-036");
    const outcome = runCase(entry);
    const annotation = entry.annotation.error!;
    const step = stepAt(outcome, annotation.step_index)!;
    expect(step.error?.classification).toBe("behavioral");
    expect(step.error?.subtype).toBe("slip");
  });

  it("normative 注入：末步判错为规范性（带单位已求值步）", () => {
    const entry = byId("seed-037");
    const outcome = runCase(entry);
    const annotation = entry.annotation.error!;
    const step = stepAt(outcome, annotation.step_index)!;
    expect(step.status).toBe("incorrect");
    expect(step.error?.classification).toBe("normative");
  });

  it("div_zero 注入：末步 not_judged + INVALID_EXPR 退出码 + verdict=partial", () => {
    const entry = byId("seed-038");
    const outcome = runCase(entry);
    expect(outcome.verdict).toBe("partial");
    expect(outcome.fallbackExitCode).toBe("INVALID_EXPR");
    const last = outcome.steps[outcome.steps.length - 1]!;
    expect(last.status).toBe("not_judged");
  });

  it("建模拟败标注题：系统 MODEL_FAILED 显式失败（不静默错判）", () => {
    const outcome = runCase(byId("eval-143"));
    expect(outcome.modeling).toBe("failed");
    expect(outcome.exitCode).toBe("MODEL_FAILED");
    expect(outcome.steps).toEqual([]);
  });

  it("空 steps（只写答案）：ANSWER_ONLY 显式退出，不抛错（rules D16 契约固化）", () => {
    // diagnoseSolution 对空 steps 有显式分支（align.ts L510-518：partial + ANSWER_ONLY）；
    // harness 透传该退出码而非自行防御——此处固化契约，rules 若改为抛错则本测试红
    const entry = caseSchema.parse({
      id: "eval-900",
      family: "sumdiff",
      group: "sumdiff_group",
      difficulty: "easy",
      question_text: "甲和乙一共80个，甲比乙多10个，求甲和乙",
      student_steps: [],
      source: "manual",
      annotation: { modeling: "ok", steps: [] },
    });
    const outcome = runCase(entry);
    expect(outcome.modeling).toBe("ok");
    expect(outcome.verdict).toBe("partial");
    expect(outcome.fallbackExitCode).toBe("ANSWER_ONLY");
    expect(outcome.steps).toEqual([]);
  });
});

describe("HARNESS M-6 双跑守卫", () => {
  it("mini 集每例连跑两次 deepEqual（无确定性失败）", () => {
    const { outcomes, determinismFailures } = runAllCases(mini);
    expect(outcomes).toHaveLength(MINI_IDS.length);
    expect(determinismFailures).toEqual([]);
  });
});
