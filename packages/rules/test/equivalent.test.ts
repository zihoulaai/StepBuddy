import { describe, expect, it } from "vitest";
import { equivalent } from "../src/equivalent.js";

/**
 * 最小等价判定（strict 级，Task 2 决策）。
 * 单位参与判定是 §3.3 约束第 4 条的核心用例。
 */
describe("等价判定：数值", () => {
  it("求值后相等：1/2+1/3 与 5/6", () => {
    expect(equivalent("1/2+1/3", "5/6")).toEqual({ status: "equivalent" });
  });

  it("写法不同值相同：0.5 与 1/2、50% 与 1/2", () => {
    expect(equivalent("0.5", "1/2")).toEqual({ status: "equivalent" });
    expect(equivalent("50%", "1/2")).toEqual({ status: "equivalent" });
  });

  it("值不同：不等价", () => {
    const result = equivalent("1/2", "2/3");
    expect(result.status).toBe("not_equivalent");
  });

  it("精确判定不经浮点：1/3+1/6 与 1/2（float 会有误差的方向）", () => {
    expect(equivalent("1/3+1/6", "1/2")).toEqual({ status: "equivalent" });
  });
});

describe("单位参与等价判定（01 §3.3 约束第 4 条、§4.3 判例）", () => {
  it("5厘米/厘米 与 5 不等价（量纲抵消但单位出现过）", () => {
    const result = equivalent("5厘米/厘米", "5");
    expect(result.status).toBe("not_equivalent");
    if (result.status === "not_equivalent") {
      expect(result.reason).toContain("量纲");
    }
  });

  it("2米 与 200 不等价", () => {
    expect(equivalent("2米", "200")).toEqual({
      status: "not_equivalent",
      reason: expect.stringContaining("数值"),
    });
  });

  it("同值同量纲：2*3米 与 6米 等价", () => {
    expect(equivalent("2*3米", "6米")).toEqual({ status: "equivalent" });
  });
});

describe("无效表达式：除零进无效态，不判等价", () => {
  it("字面量除零：invalid", () => {
    const result = equivalent("1/0", "1");
    expect(result.status).toBe("invalid");
  });

  it("计算除零：1/(2-2) invalid", () => {
    const result = equivalent("1/(2-2)", "0");
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.reason).toContain("除数为 0");
    }
  });

  it("解析失败（隐式乘法）：invalid", () => {
    const result = equivalent("1/2 2/3", "1/3");
    expect(result.status).toBe("invalid");
  });
});

describe("含变量表达式：结构比较（canonical）", () => {
  it("2*x 与 2*x 等价", () => {
    expect(equivalent("2*x", "2*x")).toEqual({ status: "equivalent" });
  });

  it("2*x 与 3*x 不等价", () => {
    const result = equivalent("2*x", "3*x");
    expect(result.status).toBe("not_equivalent");
  });

  it("x 与 5 不等价（一方 symbolic 一方定值）", () => {
    expect(equivalent("x", "5").status).toBe("not_equivalent");
  });

  it("x*2 与 2*x 不等价（canonical 结构不同，交换律归 Task 5 变换）", () => {
    expect(equivalent("x*2", "2*x").status).toBe("not_equivalent");
  });
});
