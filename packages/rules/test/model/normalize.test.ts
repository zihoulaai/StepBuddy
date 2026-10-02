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
 * NORM-01…：归一/归总——先由「已知总量 ÷ 已知份数」得每份量（单位「1」），
 * 再按所求方向组合（02 §3.2 G4、单位「1」的选取缺失项）。
 * 三方向：求每份 / 求总量 / 求份数。
 */
describe("REL.MODEL.NORMALIZE.UNIT（归一归总）", () => {
  it("NORM-01 求每份：3小时行120千米，每小时行多少千米 → x=120÷3", () => {
    const result = model("3小时行120千米，每小时行多少千米");
    expect(result.appliedRules).toEqual(["REL.MODEL.NORMALIZE.UNIT"]);
    expect(result.equation).toBe("x=120÷3");
    expect(result.targets).toEqual(["每份量"]);
    expect(result.relations).toEqual([
      { id: "r1", predicate: "share", subject: "每份量", reference: "已知总量", target: "已知份数", operator: "÷" },
    ]);
    expect(result.entities).toContainEqual({ id: "已知总量", role: "known", name: "已知总量", value: { num: 120, den: 1 }, unit: "千米", dimension: "千米" });
    expect(result.entities).toContainEqual({ id: "已知份数", role: "known", name: "已知份数", value: { num: 3, den: 1 } });
  });

  it("NORM-02 求总量（先归一再归总）：3箱重45千克，5箱重多少千克 → x=(45÷3)×5", () => {
    const result = model("3箱重45千克，5箱重多少千克");
    expect(result.equation).toBe("x=(45÷3)×5");
    expect(result.targets).toEqual(["总量"]);
    expect(result.relations).toEqual([
      { id: "r1", predicate: "share", subject: "每份量", reference: "已知总量", target: "已知份数", operator: "÷" },
      { id: "r2", predicate: "share", subject: "总量", reference: "每份量", target: "份数", operator: "×" },
    ]);
    expect(result.entities).toContainEqual({ id: "份数", role: "known", name: "份数", value: { num: 5, den: 1 } });
    expect(result.entities).toContainEqual({ id: "总量", role: "unknown", name: "总量" });
  });

  it("NORM-03 求份数（每份量已知）：3箱重45千克，每箱15千克，求几箱 → x=45÷15", () => {
    const result = model("3箱重45千克，每箱15千克，求几箱");
    expect(result.equation).toBe("x=45÷15");
    expect(result.targets).toEqual(["份数"]);
    expect(result.relations).toEqual([
      { id: "r1", predicate: "share", subject: "份数", reference: "已知总量", target: "每份量", operator: "÷" },
    ]);
    expect(result.entities).toContainEqual({ id: "每份量", role: "known", name: "每份量", value: { num: 15, den: 1 }, unit: "千克", dimension: "千克" });
  });

  it("NORM-04 单位与量纲串：3秒行15米，每秒行多少米 → x=15÷3", () => {
    const result = model("3秒行15米，每秒行多少米");
    expect(result.equation).toBe("x=15÷3");
    expect(result.entities).toContainEqual({ id: "已知总量", role: "known", name: "已知总量", value: { num: 15, den: 1 }, unit: "米", dimension: "米" });
  });

  it("NORM-05 反例：无问句（3箱重45千克）→ MODEL_FAILED", () => {
    expectFailed("3箱重45千克");
  });

  it("NORM-06 反例：缺已知总量（每箱15千克，能装几箱）→ MODEL_FAILED", () => {
    expectFailed("每箱15千克，能装几箱");
  });
});
