import { describe, expect, it } from "vitest";
import { checkStepInvariants } from "../src/invariants.js";

/**
 * 原子步不变量检查（01 §3.4），基准用例取自 §3.5 示例的两步：
 * - 第 1 步 split_checked=true（干净的单变换步）；
 * - 第 2 步 split_checked=false（raw_text 含两个等号=多变换）。
 */
describe("01 §3.5 示例逐步核对", () => {
  it("第 1 步：1/2 x 2/3 = 2/3（单变换，量纲守恒，无变量）→ 通过", () => {
    const result = checkStepInvariants({
      rawText: "1/2 x 2/3 = 2/3",
      exprBefore: "1/2 * 2/3",
      exprAfter: "2/3",
    });
    expect(result.splitChecked).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("第 2 步：raw 含两个等号 = 多变换 → 不通过且记 single_transform", () => {
    const result = checkStepInvariants({
      rawText: "3/4 + 2/3 = 9/12 + 8/12 = 17/12",
      exprBefore: "3/4 + 2/3",
      exprAfter: "17/12",
    });
    expect(result.splitChecked).toBe(false);
    expect(result.failures.map((f) => f.invariant)).toContain("single_transform");
  });
});

describe("单位一致（unit_consistency）", () => {
  it("2米 → 3：单位被丢弃 → 不通过", () => {
    const result = checkStepInvariants({ rawText: "2米 = 3", exprBefore: "2米", exprAfter: "3" });
    expect(result.splitChecked).toBe(false);
    const names = result.failures.map((f) => f.invariant);
    expect(names).toContain("unit_consistency");
  });

  it("5厘米/厘米 → 5：量纲守恒但单位不一致 → 仅 unit_consistency 失败", () => {
    const result = checkStepInvariants({ rawText: "5厘米/厘米 = 5", exprBefore: "5厘米/厘米", exprAfter: "5" });
    expect(result.splitChecked).toBe(false);
    const names = result.failures.map((f) => f.invariant);
    expect(names).toContain("unit_consistency");
    expect(names).not.toContain("quantity_conservation");
  });

  it("同单位运算：2米+3米 → 5米 → 通过", () => {
    const result = checkStepInvariants({ rawText: "2米+3米 = 5米", exprBefore: "2米+3米", exprAfter: "5米" });
    expect(result.splitChecked).toBe(true);
  });

  it("单位换算步（5元 → 50角）无规则支撑：保守记不通过（Task 2 决策 7）", () => {
    const result = checkStepInvariants({ rawText: "5元 = 50角", exprBefore: "5元", exprAfter: "50角" });
    expect(result.splitChecked).toBe(false);
    expect(result.failures.map((f) => f.invariant)).toContain("unit_consistency");
  });
});

describe("变量集合单调（variable_monotonicity）", () => {
  it("变换引入新变量：x → x+y → 不通过", () => {
    const result = checkStepInvariants({ rawText: "x = x + y", exprBefore: "x", exprAfter: "x+y" });
    expect(result.splitChecked).toBe(false);
    expect(result.failures.map((f) => f.invariant)).toContain("variable_monotonicity");
  });

  it("变量减少（求解消元方向）：x+y → x → 通过", () => {
    const result = checkStepInvariants({ rawText: "x+y = x", exprBefore: "x+y", exprAfter: "x" });
    expect(result.splitChecked).toBe(true);
  });

  it("变量不变：2*x → 2*x+1 → 通过", () => {
    const result = checkStepInvariants({ rawText: "2*x = 2*x+1", exprBefore: "2*x", exprAfter: "2*x+1" });
    expect(result.splitChecked).toBe(true);
  });
});

describe("异常输入", () => {
  it("expr 无法解析（隐式乘法）→ 不通过", () => {
    const result = checkStepInvariants({ rawText: "1/2 2/3 = 2/3", exprBefore: "1/2 2/3", exprAfter: "2/3" });
    expect(result.splitChecked).toBe(false);
    expect(result.failures[0].invariant).toBe("single_transform");
  });

  it("除零表达式：单位核查记失败，不通过", () => {
    const result = checkStepInvariants({ rawText: "1/0 = 1", exprBefore: "1/0", exprAfter: "1" });
    expect(result.splitChecked).toBe(false);
  });

  it("raw 缺等号（只写答案）→ 不通过", () => {
    const result = checkStepInvariants({ rawText: "2/3", exprBefore: "1/2*2/3", exprAfter: "2/3" });
    expect(result.splitChecked).toBe(false);
  });
});
