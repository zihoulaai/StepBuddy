/**
 * 指标口径守卫（Task 9.3：四项指标 + 排除项/多判披露，口径写死）。
 *
 * 用构造数据断言精确值（不依赖评测集实跑）：分母剔除（excluded / not_judged /
 * 无 error / 无 expected_model）、M-2 一致判定（classification+subtype+rule_id）、
 * M-3b 视图对拍、建模成功率双向命中。
 */

import { describe, expect, it } from "vitest";
import { caseSchema, type Case } from "../../src/cases/index.js";
import { computeMetrics } from "../../src/runner/metrics.js";
import type { CaseOutcome } from "../../src/runner/harness.js";

function makeCase(overrides: Partial<Case> & Pick<Case, "id">): Case {
  return caseSchema.parse({
    family: "sumdiff",
    group: "sumdiff_group",
    difficulty: "easy",
    question_text: "甲和乙一共80个，甲比乙多10个，求甲和乙",
    student_steps: ["x+(x+10)=80"],
    source: "photo",
    annotation: { modeling: "ok", steps: [{ index: 1, status: "correct" }] },
    ...overrides,
  });
}

function makeOutcome(overrides: Partial<CaseOutcome> & Pick<CaseOutcome, "caseId">): CaseOutcome {
  return { modeling: "ok", verdict: "correct", steps: [], ...overrides };
}

const MODEL_VIEW: NonNullable<CaseOutcome["model"]> = {
  entities: ["乙|known|35/1|个", "甲|unknown|-|-"],
  relations: ["甲 diff 乙 - 10"],
  targets: ["乙", "甲"],
};

const EXPECTED_MODEL: NonNullable<Case["annotation"]["expected_model"]> = {
  entities: [
    { name: "甲", role: "unknown" },
    { name: "乙", role: "known", value: { num: 35, den: 1 }, unit: "个" },
  ],
  relations: [{ subject: "甲", reference: "乙", predicate: "diff", operator: "-", target: "10" }],
  targets: ["甲", "乙"],
};

describe("METRICS 全命中口径", () => {
  it("完美一致：四项指标全 1，无失败案例", () => {
    const cases = [
      makeCase({
        id: "eval-001",
        student_steps: ["x+(x+10)=80", "2x=70"],
        annotation: {
          modeling: "ok",
          expected_model: EXPECTED_MODEL,
          steps: [
            { index: 1, status: "correct" },
            { index: 2, status: "correct" },
          ],
        },
      }),
      makeCase({
        id: "eval-002",
        student_steps: ["x+(x+10)=80", "2x=70", "2x=71"],
        annotation: {
          modeling: "ok",
          expected_model: EXPECTED_MODEL,
          steps: [
            { index: 1, status: "correct" },
            { index: 2, status: "incorrect" },
            { index: 3, status: "incorrect" },
          ],
          error: { step_index: 2, classification: "knowledge", rule_id: "ALG.EQ.MOVE" },
        },
      }),
      makeCase({ id: "eval-003", question_text: "甲有铅笔，乙有尺子，求甲和乙", student_steps: [], annotation: { modeling: "model_failed", steps: [] } }),
    ];
    const outcomes = [
      makeOutcome({
        caseId: "eval-001",
        steps: [
          { index: 1, status: "correct" },
          { index: 2, status: "correct" },
        ],
        model: MODEL_VIEW,
      }),
      makeOutcome({
        caseId: "eval-002",
        verdict: "incorrect",
        steps: [
          { index: 1, status: "correct" },
          { index: 2, status: "incorrect", error: { classification: "knowledge", ruleId: "ALG.EQ.MOVE" } },
          { index: 3, status: "incorrect" },
        ],
        model: MODEL_VIEW,
      }),
      makeOutcome({ caseId: "eval-003", modeling: "failed", exitCode: "MODEL_FAILED" }),
    ];
    const report = computeMetrics(cases, outcomes);
    expect(report.modelingSuccess).toEqual({ numerator: 3, denominator: 3, rate: 1 });
    expect(report.m1).toMatchObject({ numerator: 5, denominator: 5, rate: 1, excludedSteps: 0 });
    expect(report.m2).toMatchObject({ numerator: 1, denominator: 1, rate: 1 });
    expect(report.m3b).toEqual({ numerator: 2, denominator: 2, rate: 1 });
    expect(report.mismatches).toEqual([]);
  });
});

describe("METRICS 分母剔除口径", () => {
  it("excluded 题整题不进 M-1 分母（系统判错也不计入）", () => {
    const cases = [
      makeCase({
        id: "eval-001",
        student_steps: ["x=(80-10)/2", "x=35÷0"],
        annotation: {
          modeling: "ok",
          steps: [
            { index: 1, status: "correct" },
            { index: 2, status: "not_judged" },
          ],
        },
        excluded: "invalid_expr",
      }),
    ];
    const outcomes = [
      makeOutcome({
        caseId: "eval-001",
        verdict: "partial",
        fallbackExitCode: "INVALID_EXPR",
        steps: [
          { index: 1, status: "incorrect" },
          { index: 2, status: "not_judged" },
        ],
      }),
    ];
    const report = computeMetrics(cases, outcomes);
    expect(report.m1).toMatchObject({ numerator: 0, denominator: 0, rate: 1 });
    expect(report.m1.excludedSteps).toBe(2);
    expect(report.excludedCases).toBe(1);
  });

  it("M-1 部分一致：一致步/可判定步精确计数", () => {
    const cases = [
      makeCase({
        id: "eval-001",
        student_steps: ["a", "b", "c"],
        annotation: {
          modeling: "ok",
          steps: [
            { index: 1, status: "correct" },
            { index: 2, status: "incorrect" },
            { index: 3, status: "correct" },
          ],
        },
      }),
    ];
    const outcomes = [
      makeOutcome({
        caseId: "eval-001",
        verdict: "incorrect",
        steps: [
          { index: 1, status: "correct" },
          { index: 2, status: "correct" },
          { index: 3, status: "correct" },
        ],
      }),
    ];
    const report = computeMetrics(cases, outcomes);
    expect(report.m1).toMatchObject({ numerator: 2, denominator: 3 });
    expect(report.m1.rate).toBeCloseTo(2 / 3, 10);
    expect(report.mismatches).toEqual([{ caseId: "eval-001", metric: "m1", detail: "步2 标注incorrect/系统correct" }]);
  });
});

describe("METRICS M-2/M-3b 判定口径", () => {
  it("分类不一致不计分子；系统多判步只披露不进分母", () => {
    const cases = [
      makeCase({
        id: "eval-001",
        student_steps: ["a", "b"],
        annotation: {
          modeling: "ok",
          steps: [
            { index: 1, status: "correct" },
            { index: 2, status: "incorrect" },
          ],
          error: { step_index: 2, classification: "knowledge" },
        },
      }),
    ];
    const outcomes = [
      makeOutcome({
        caseId: "eval-001",
        verdict: "incorrect",
        steps: [
          { index: 1, status: "correct", error: { classification: "knowledge" } },
          { index: 2, status: "incorrect", error: { classification: "behavioral", subtype: "miscalc" } },
        ],
      }),
    ];
    const report = computeMetrics(cases, outcomes);
    expect(report.m2).toMatchObject({ numerator: 0, denominator: 1, rate: 0, overJudgedSteps: 1 });
  });

  it("subtype/rule_id 标注有则必须全等（缺 rule_id 标注不要求系统有）", () => {
    const base = {
      student_steps: ["a", "b"],
      annotation: {
        modeling: "ok" as const,
        steps: [
          { index: 1, status: "correct" as const },
          { index: 2, status: "incorrect" as const },
        ],
        error: { step_index: 2, classification: "knowledge" as const },
      },
    };
    const outcomeFor = (error: CaseOutcome["steps"][number]["error"]): CaseOutcome =>
      makeOutcome({
        caseId: "eval-001",
        verdict: "incorrect",
        steps: [
          { index: 1, status: "correct" },
          { index: 2, status: "incorrect", ...(error !== undefined ? { error } : {}) },
        ],
      });
    // 系统多给 rule_id：标注无 rule_id，不算不一致
    expect(computeMetrics([makeCase({ id: "eval-001", ...base })], [outcomeFor({ classification: "knowledge", ruleId: "ALG.EQ.MOVE" })]).m2).toMatchObject({ numerator: 1, denominator: 1, rate: 1 });
    const withRule = computeMetrics(
      [makeCase({ id: "eval-001", ...base, annotation: { ...base.annotation, error: { step_index: 2, classification: "knowledge", rule_id: "ALG.EQ.MOVE" } } })],
      [outcomeFor({ classification: "knowledge", ruleId: "ALG.EQ.MOVE" })],
    );
    expect(withRule.m2).toMatchObject({ numerator: 1, denominator: 1, rate: 1 });
  });

  it("M-3b 视图不一致计 0 且进失败案例", () => {
    const cases = [makeCase({ id: "eval-001", student_steps: ["a"], annotation: { modeling: "ok", expected_model: EXPECTED_MODEL, steps: [{ index: 1, status: "correct" }] } })];
    const outcomes = [makeOutcome({ caseId: "eval-001", steps: [{ index: 1, status: "correct" }], model: { entities: ["甲|unknown|-|-"], relations: [], targets: ["甲", "乙"] } })];
    const report = computeMetrics(cases, outcomes);
    expect(report.m3b).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(report.mismatches.map((mismatch) => mismatch.metric)).toContain("m3b");
  });
});

describe("METRICS 建模成功率", () => {
  it("双向命中：ok 题系统失败 / model_failed 题系统成功均计未命中", () => {
    const cases = [
      makeCase({ id: "eval-001", annotation: { modeling: "ok", steps: [] } }),
      makeCase({ id: "eval-002", student_steps: [], annotation: { modeling: "model_failed", steps: [] } }),
      makeCase({ id: "eval-003", student_steps: [], annotation: { modeling: "model_failed", steps: [] } }),
    ];
    const outcomes = [
      makeOutcome({ caseId: "eval-001", modeling: "failed", exitCode: "MODEL_FAILED" }),
      makeOutcome({ caseId: "eval-002", modeling: "ok" }),
      makeOutcome({ caseId: "eval-003", modeling: "failed", exitCode: "MODEL_FAILED" }),
    ];
    const report = computeMetrics(cases, outcomes);
    expect(report.modelingSuccess).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(report.mismatches.filter((mismatch) => mismatch.metric === "modeling")).toHaveLength(2);
  });
});
