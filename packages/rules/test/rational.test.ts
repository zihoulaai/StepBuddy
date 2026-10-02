import { describe, expect, it } from "vitest";
import { InvalidRationalError, Rational } from "../src/rational.js";

describe("Rational", () => {
  it("构造即约分，符号统一在分子", () => {
    expect(Rational.of(2n, 4n).toString()).toBe("1/2");
    expect(Rational.of(6n, 3n).toString()).toBe("2");
    expect(Rational.of(1n, -2n).toString()).toBe("-1/2");
    expect(Rational.of(-1n, -2n).toString()).toBe("1/2");
    expect(Rational.of(0n, 5n).toString()).toBe("0");
  });

  it("分母为 0 抛 InvalidRationalError（01 §3.3：除数为 0 进无效状态）", () => {
    expect(() => Rational.of(1n, 0n)).toThrow(InvalidRationalError);
    expect(() => Rational.of(1n, 2n).div(Rational.fromInteger(0n))).toThrow(InvalidRationalError);
  });

  it("加减乘除全程精确（float 会翻车的用例）", () => {
    expect(Rational.of(1n, 10n).add(Rational.of(2n, 10n)).toString()).toBe("3/10");
    expect(Rational.of(1n, 3n).add(Rational.of(1n, 6n)).toString()).toBe("1/2");
    expect(Rational.of(1n, 3n).sub(Rational.of(1n, 6n)).toString()).toBe("1/6");
    expect(Rational.of(2n, 3n).mul(Rational.of(3n, 4n)).toString()).toBe("1/2");
    expect(Rational.of(1n, 2n).div(Rational.of(1n, 4n)).toString()).toBe("2");
  });

  it("大数运算不溢出（10^30 量级）", () => {
    const big = 10n ** 30n + 1n;
    expect(Rational.of(big, 1n).sub(Rational.fromInteger(1n)).toString()).toBe("1000000000000000000000000000000");
    expect(Rational.of(1n, 10n ** 30n).mul(Rational.fromInteger(10n ** 30n)).toString()).toBe("1");
  });

  it("比较与相等（不经过浮点）", () => {
    expect(Rational.of(1n, 2n).compare(Rational.of(2n, 4n))).toBe(0);
    expect(Rational.of(1n, 3n).compare(Rational.of(1n, 2n))).toBe(-1);
    expect(Rational.of(2n, 3n).compare(Rational.of(1n, 2n))).toBe(1);
    expect(Rational.of(1n, 2n).equals(Rational.of(2n, 4n))).toBe(true);
    expect(Rational.of(1n, 2n).equals(Rational.of(2n, 3n))).toBe(false);
  });

  it("幂、取负、绝对值", () => {
    expect(Rational.of(2n, 3n).pow(2n).toString()).toBe("4/9");
    expect(Rational.of(2n, 3n).pow(-1n).toString()).toBe("3/2");
    expect(Rational.of(1n, 2n).neg().toString()).toBe("-1/2");
    expect(Rational.of(-3n, 4n).abs().toString()).toBe("3/4");
    expect(Rational.of(4n, 2n).isInteger()).toBe(true);
    expect(Rational.of(1n, 2n).isInteger()).toBe(false);
  });
});
