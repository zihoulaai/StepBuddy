import { describe, expect, it } from "vitest";
import { modelQuestion } from "../../src/model/index.js";
import type { RelationModel } from "../../src/model/types.js";

function model(text: string): RelationModel {
  const result = modelQuestion(text);
  if ("code" in result) {
    throw new Error(`期望建模成功，实际 ${result.code}：${result.reason}｜题面：${text}`);
  }
  return result;
}

function expectFailed(text: string): void {
  const result = modelQuestion(text);
  expect("code" in result && result.code).toBe("MODEL_FAILED");
}

/**
 * TIMES-01…：整数倍（是n倍 / 比…多n倍 / 比…的n倍多/少M）。
 * RATIO-01…：分数倍（是p/q / 比…多p/q / 比…少p/q；系数为 Rational，禁浮点）。
 *
 * 单位「1」恒为被比者（reference）：有和句时设 B 为 x（关系折叠为单变量）；
 * 已知量直给时设未知一方为 x。方向写法全覆盖（02 §3.2 缺失项）。
 */
describe("REL.MODEL.MULTIPLE.TIMES（整数倍）", () => {
  it("TIMES-01 是n倍+和句：甲是乙的3倍，甲和乙一共80个，求甲乙 → 3x+x=80", () => {
    const result = model("甲是乙的3倍，甲和乙一共80个，求甲乙");
    expect(result.appliedRules).toEqual(["REL.MODEL.MULTIPLE.TIMES"]);
    expect(result.equation).toBe("3x+x=80");
    expect(result.targets).toEqual(["甲", "乙"]);
    expect(result.relations).toEqual([
      { id: "r1", predicate: "times", subject: "甲", reference: "乙", target: "倍数", operator: "×" },
      { id: "r2", predicate: "sum", subject: "甲", reference: "乙", target: "总量", operator: "+" },
    ]);
    expect(result.entities).toContainEqual({ id: "倍数", role: "known", name: "倍数", value: { num: 3, den: 1 } });
  });

  it("TIMES-02 比…多n倍 = ×(n+1)：甲比乙多3倍，甲乙一共80个，求甲乙 → 4x+x=80", () => {
    const result = model("甲比乙多3倍，甲乙一共80个，求甲乙");
    expect(result.equation).toBe("4x+x=80");
    // 与「是3倍」区分：倍数实体为 4，原句记入 confusable_terms
    expect(result.entities).toContainEqual({ id: "倍数", role: "known", name: "倍数", value: { num: 4, den: 1 } });
    expect(result.relations[0].confusable_terms).toEqual(["甲比乙多3倍"]);
  });

  it("TIMES-03 是n倍+已知量（单位「1」已知）：甲是乙的3倍，乙有20个，求甲 → x=3×20", () => {
    const result = model("甲是乙的3倍，乙有20个，求甲");
    expect(result.equation).toBe("x=3×20");
    expect(result.targets).toEqual(["甲"]);
  });

  it("TIMES-04 是n倍+已知量（主体已知）：甲有60个，甲是乙的3倍，求乙 → x=60÷3", () => {
    const result = model("甲有60个，甲是乙的3倍，求乙");
    expect(result.equation).toBe("x=60÷3");
  });

  it("TIMES-05 角色互换：乙是甲的3倍，甲和乙一共80个，求甲乙 → 单位「1」=甲（被比者）", () => {
    const result = model("乙是甲的3倍，甲和乙一共80个，求甲乙");
    expect(result.equation).toBe("3x+x=80");
    expect(result.relations[0]).toMatchObject({ predicate: "times", subject: "乙", reference: "甲", target: "倍数", operator: "×" });
  });

  it("TIMES-06 组合句（比…的n倍少M）：甲比乙的3倍少5个，甲乙一共80个，求甲乙 → (3x-5)+x=80，叠加 times+diff", () => {
    const result = model("甲比乙的3倍少5个，甲乙一共80个，求甲乙");
    expect(result.equation).toBe("(3x-5)+x=80");
    expect(result.relations).toEqual([
      { id: "r1", predicate: "times", subject: "甲", reference: "乙", target: "倍数", operator: "×", confusable_terms: ["甲比乙的3倍少5个"] },
      { id: "r2", predicate: "diff", subject: "乙的3倍", reference: "甲", target: "差量", operator: "-", confusable_terms: ["甲比乙的3倍少5个"] },
      // 和句同样产出 sum 关系（与 TIMES-01 一致：关系数 = times + diff + sum）
      { id: "r3", predicate: "sum", subject: "甲", reference: "乙", target: "总量", operator: "+" },
    ]);
    // 派生量「乙的3倍」为中间未知实体（先求乙的3倍，学生常见路径）
    expect(result.entities).toContainEqual({ id: "乙的3倍", role: "unknown", name: "乙的3倍" });
    expect(result.entities).toContainEqual({ id: "差量", role: "known", name: "差量", value: { num: 5, den: 1 }, unit: "个", dimension: "个" });
  });

  it("TIMES-07 组合句+已知量（多M）：甲比乙的3倍多5个，乙有20个，求甲 → x=3×20+5", () => {
    const result = model("甲比乙的3倍多5个，乙有20个，求甲");
    expect(result.equation).toBe("x=3×20+5");
  });

  it("TIMES-08 反例：是n倍但无和句/已知量（甲是乙的3倍）→ MODEL_FAILED", () => {
    expectFailed("甲是乙的3倍");
  });
});

describe("REL.MODEL.MULTIPLE.RATIO（分数倍，Rational 精确）", () => {
  it("RATIO-01 是p/q：甲是乙的3/4，甲乙一共80个，求甲乙 → (3/4)x+x=80", () => {
    const result = model("甲是乙的3/4，甲乙一共80个，求甲乙");
    expect(result.appliedRules).toEqual(["REL.MODEL.MULTIPLE.RATIO"]);
    expect(result.equation).toBe("(3/4)x+x=80");
    expect(result.entities).toContainEqual({ id: "倍数", role: "known", name: "倍数", value: { num: 3, den: 4 } });
    expect(result.target.answerForm).toBe("fraction");
  });

  it("RATIO-02 比…多p/q = ×(1+p/q)：甲比乙多1/4，甲乙一共80个，求甲乙 → (5/4)x+x=80", () => {
    const result = model("甲比乙多1/4，甲乙一共80个，求甲乙");
    expect(result.equation).toBe("(5/4)x+x=80");
    expect(result.entities).toContainEqual({ id: "倍数", role: "known", name: "倍数", value: { num: 5, den: 4 } });
  });

  it("RATIO-03 比…少p/q = ×(1−p/q)：甲比乙少1/4，甲乙一共80个，求甲乙 → (3/4)x+x=80", () => {
    const result = model("甲比乙少1/4，甲乙一共80个，求甲乙");
    expect(result.equation).toBe("(3/4)x+x=80");
    expect(result.relations[0].confusable_terms).toEqual(["甲比乙少1/4"]);
  });

  it("RATIO-04 是p/q+已知量：甲是乙的2/5，乙有30个，求甲 → x=(2/5)×30", () => {
    const result = model("甲是乙的2/5，乙有30个，求甲");
    expect(result.equation).toBe("x=(2/5)×30");
  });

  it("RATIO-05 是p/q+已知量（主体已知）：甲有30个，甲是乙的2/5，求乙 → x=30÷(2/5)", () => {
    const result = model("甲有30个，甲是乙的2/5，求乙");
    expect(result.equation).toBe("x=30÷(2/5)");
  });

  it("RATIO-06 反例：比…多p/q 但无和句/已知量（甲比乙多1/4）→ MODEL_FAILED", () => {
    expectFailed("甲比乙多1/4");
  });
});
