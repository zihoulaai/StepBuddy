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
 * TOTAL-01…：归总（总量 = 每份量 × 份数；02 §3.2 G3）。
 * 覆盖求总量各写法与单位一致性守卫。
 */
describe("REL.MODEL.TOTAL.TOTAL（归总）", () => {
  it("TOTAL-01 每盒5个，8盒一共多少个 → x=5×8", () => {
    const result = model("每盒5个，8盒一共多少个");
    expect(result.appliedRules).toEqual(["REL.MODEL.TOTAL.TOTAL"]);
    expect(result.equation).toBe("x=5×8");
    expect(result.targets).toEqual(["总量"]);
    expect(result.relations).toEqual([
      { id: "r1", predicate: "share", subject: "总量", reference: "每份量", target: "份数", operator: "×" },
    ]);
    expect(result.entities).toContainEqual({ id: "每份量", role: "known", name: "每份量", value: { num: 5, den: 1 }, unit: "个", dimension: "个" });
    expect(result.entities).toContainEqual({ id: "份数", role: "known", name: "份数", value: { num: 8, den: 1 } });
    expect(result.entities).toContainEqual({ id: "总量", role: "unknown", name: "总量" });
  });

  it("TOTAL-02 每小时行40千米，3小时行多少千米 → x=40×3", () => {
    const result = model("每小时行40千米，3小时行多少千米");
    expect(result.equation).toBe("x=40×3");
    expect(result.relations[0]).toMatchObject({ predicate: "share", subject: "总量", reference: "每份量", target: "份数", operator: "×" });
  });

  it("TOTAL-03 小数每份量（禁浮点）：每千克3.5元，4千克一共多少元 → x=7/2×4", () => {
    const result = model("每千克3.5元，4千克一共多少元");
    // 3.5 以 Rational 7/2 精确参与，equation 显示规范分数而非浮点
    expect(result.equation).toBe("x=7/2×4");
    expect(result.entities).toContainEqual({ id: "每份量", role: "known", name: "每份量", value: { num: 7, den: 2 }, unit: "元", dimension: "元" });
  });

  it("TOTAL-04 重量单位：每箱15千克，4箱一共多少千克 → x=15×4", () => {
    const result = model("每箱15千克，4箱一共多少千克");
    expect(result.equation).toBe("x=15×4");
  });

  it("TOTAL-05 反例：无问句（每盒5个，8盒）→ MODEL_FAILED", () => {
    expectFailed("每盒5个，8盒");
  });

  it("TOTAL-06 反例：单位不一致（每盒5个，8盒一共多少千克）→ MODEL_FAILED", () => {
    expectFailed("每盒5个，8盒一共多少千克");
  });
});
