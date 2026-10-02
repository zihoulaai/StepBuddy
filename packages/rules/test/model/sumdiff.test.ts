import { describe, expect, it } from "vitest";
import { modelQuestion } from "../../src/model/index.js";
import type { RelationModel } from "../../src/model/types.js";

/** 取成功模型（失败即测试不通过，带原因） */
function model(text: string): RelationModel {
  const result = modelQuestion(text);
  if ("code" in result) {
    throw new Error(`期望建模成功，实际 ${result.code}：${result.reason}｜题面：${text}`);
  }
  return result;
}

/** 期望 MODEL_FAILED（01 §5：关系无法建模，显式退出） */
function expectFailed(text: string): void {
  const result = modelQuestion(text);
  expect("code" in result && result.code).toBe("MODEL_FAILED");
}

/**
 * SUM-01…：和句 + 差句（分支 A）——(x+M)+x=N。
 * DIFF-01…：差句 + 已知量——x=K±M。
 *
 * 方向写法矩阵（02 §3.2「基准量与比较量方向的判定」缺失项的全部写法）：
 * A比B多N / A比B少N / B比A多N / B比A少N / 带单位 / 分数差量 / 反例。
 * 归一化规范方向：diff 关系恒为大者在前（subject−reference=差量），
 * 方程按原句方向列，confusable_terms 锚定原句供 Task 5 定位。
 */
describe("REL.MODEL.SUMDIFF.SUM（和差：和句+差句/已知量）", () => {
  it("SUM-01 A比B多N：甲和乙一共80个，甲比乙多10个，求甲和乙", () => {
    const result = model("甲和乙一共80个，甲比乙多10个，求甲和乙");
    expect(result.appliedRules).toEqual(["REL.MODEL.SUMDIFF.SUM"]);
    expect(result.equation).toBe("(x+10)+x=80");
    expect(result.targets).toEqual(["甲", "乙"]);
    expect(result.relations).toEqual([
      { id: "r1", predicate: "sum", subject: "甲", reference: "乙", target: "总量", operator: "+" },
      {
        id: "r2",
        predicate: "diff",
        subject: "甲",
        reference: "乙",
        target: "差量",
        operator: "-",
        confusable_terms: ["甲比乙多10个"],
      },
    ]);
    // 总量/差量为已知规范量；甲乙未知
    expect(result.entities).toContainEqual({ id: "总量", role: "known", name: "总量", value: { num: 80, den: 1 }, unit: "个", dimension: "个" });
    expect(result.entities).toContainEqual({ id: "差量", role: "known", name: "差量", value: { num: 10, den: 1 }, unit: "个", dimension: "个" });
  });

  it("SUM-02 A比B少N：差句归一为大者在前（diff(乙,甲)），方程不变式 (x+10)+x=80", () => {
    const result = model("甲和乙一共80个，甲比乙少10个，求甲和乙");
    expect(result.equation).toBe("(x+10)+x=80");
    expect(result.relations[1]).toMatchObject({ predicate: "diff", subject: "乙", reference: "甲", target: "差量", operator: "-" });
  });

  it("SUM-03 多字实体名：苹果和橘子一共30个，苹果比橘子多4个，求苹果和橘子", () => {
    const result = model("苹果和橘子一共30个，苹果比橘子多4个，求苹果和橘子");
    expect(result.equation).toBe("(x+4)+x=30");
    expect(result.targets).toEqual(["苹果", "橘子"]);
    expect(result.relations[1]).toMatchObject({ subject: "苹果", reference: "橘子", target: "差量" });
  });

  it("SUM-04 分支 B（和+已知量直给）：甲和乙一共100个，乙有30个，求甲 → x+30=100", () => {
    const result = model("甲和乙一共100个，乙有30个，求甲");
    expect(result.appliedRules).toEqual(["REL.MODEL.SUMDIFF.SUM"]);
    expect(result.equation).toBe("x+30=100");
    expect(result.targets).toEqual(["甲"]);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toMatchObject({ predicate: "sum", subject: "甲", reference: "乙", target: "总量", operator: "+" });
  });
});

describe("REL.MODEL.SUMDIFF.DIFF（差句+已知量，方向矩阵）", () => {
  it("DIFF-01 A比B多N：乙有20个，甲比乙多10个，求甲 → x=20+10", () => {
    const result = model("乙有20个，甲比乙多10个，求甲");
    expect(result.appliedRules).toEqual(["REL.MODEL.SUMDIFF.DIFF"]);
    expect(result.equation).toBe("x=20+10");
    expect(result.relations[0]).toMatchObject({ predicate: "diff", subject: "甲", reference: "乙", target: "差量", operator: "-", confusable_terms: ["甲比乙多10个"] });
  });

  it("DIFF-02 A比B少N：乙有20个，甲比乙少5个，求甲 → x=20-5", () => {
    const result = model("乙有20个，甲比乙少5个，求甲");
    expect(result.equation).toBe("x=20-5");
    // 归一化：乙为大者在前，甲为基准（单位「1」）
    expect(result.relations[0]).toMatchObject({ subject: "乙", reference: "甲", target: "差量" });
  });

  it("DIFF-03 B比A多N：甲有50个，乙比甲多10个，求乙 → x=50+10", () => {
    const result = model("甲有50个，乙比甲多10个，求乙");
    expect(result.equation).toBe("x=50+10");
    expect(result.relations[0]).toMatchObject({ subject: "乙", reference: "甲", target: "差量" });
  });

  it("DIFF-04 B比A少N：甲有50个，乙比甲少10个，求乙 → x=50-10", () => {
    const result = model("甲有50个，乙比甲少10个，求乙");
    expect(result.equation).toBe("x=50-10");
    expect(result.relations[0]).toMatchObject({ subject: "甲", reference: "乙", target: "差量" });
  });

  it("DIFF-05 带单位：乙有20千克，甲比乙多10千克，求甲 → 差量带单位与量纲", () => {
    const result = model("乙有20千克，甲比乙多10千克，求甲");
    expect(result.equation).toBe("x=20+10");
    expect(result.entities).toContainEqual({ id: "差量", role: "known", name: "差量", value: { num: 10, den: 1 }, unit: "千克", dimension: "千克" });
  });

  it("DIFF-06 分数差量（Rational 精确，禁浮点）：乙有3/4吨，甲比乙多1/4吨，求甲 → x=3/4+1/4", () => {
    const result = model("乙有3/4吨，甲比乙多1/4吨，求甲");
    expect(result.equation).toBe("x=3/4+1/4");
    expect(result.entities).toContainEqual({ id: "差量", role: "known", name: "差量", value: { num: 1, den: 4 }, unit: "吨", dimension: "吨" });
  });

  it("DIFF-07 反例：差句无已知量（甲比乙多10个）→ MODEL_FAILED", () => {
    expectFailed("甲比乙多10个");
  });

  it("DIFF-08 反例：差句实体对不上已知量（乙有20个，比乙多10个，求甲）→ MODEL_FAILED", () => {
    expectFailed("乙有20个，比乙多10个，求甲");
  });
});
